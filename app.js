/**
 * Daily Vehicle Log - PWA hors ligne (UNOPS Bangui)
 * Les saisies sont gardées dans IndexedDB puis envoyées au script Apps Script.
 */

const URL_SCRIPT = 'https://script.google.com/macros/s/AKfycbyUiukVp9mAXkE0MZWZ2jYi0QSnAUTpwmsU7RDQYB3u2kNacq2tDM_f2DdGH3KeMHPWHQ/exec';

const INTERVALLE_SYNCHRO_MS = 60 * 1000;
// Sur un réseau 2G/3G instable, une requête peut rester bloquée sans jamais échouer.
const DELAI_MAX_REQUETE_MS = 45 * 1000;
const TAILLE_MAX_PHOTO_PX = 1280;
const NB_SAISIES_HISTORIQUE = 10;

const STATUT = { EN_ATTENTE: 'en_attente', ENVOYEE: 'envoyee', REFUSEE: 'refusee' };

// ---------- IndexedDB ----------

const NOM_BASE = 'vehicle_log';
let base = null;

function ouvrirBase() {
  return new Promise((resolve, reject) => {
    const requete = indexedDB.open(NOM_BASE, 1);
    requete.onupgradeneeded = () => {
      const bd = requete.result;
      bd.createObjectStore('saisies', { keyPath: 'id' });
      // Permet de se reconnecter hors ligne avec un code déjà validé sur ce téléphone.
      bd.createObjectStore('conducteurs', { keyPath: 'code' });
    };
    requete.onsuccess = () => { base = requete.result; resolve(); };
    requete.onerror = () => reject(requete.error);
  });
}

function operation(magasin, mode, action) {
  return new Promise((resolve, reject) => {
    const transaction = base.transaction(magasin, mode);
    const requete = action(transaction.objectStore(magasin));
    transaction.oncomplete = () => resolve(requete ? requete.result : undefined);
    transaction.onerror = () => reject(transaction.error);
  });
}

const enregistrerSaisie = (saisie) => operation('saisies', 'readwrite', (m) => m.put(saisie));
const supprimerSaisie = (id) => operation('saisies', 'readwrite', (m) => m.delete(id));
const lireSaisies = () => operation('saisies', 'readonly', (m) => m.getAll());
const enregistrerConducteur = (c) => operation('conducteurs', 'readwrite', (m) => m.put(c));
const lireConducteur = (code) => operation('conducteurs', 'readonly', (m) => m.get(code));

// ---------- Session ----------

// La session est petite (code, nom, véhicules) : localStorage suffit.
function lireSession() {
  try {
    return JSON.parse(localStorage.getItem('session_conducteur'));
  } catch (_) {
    return null;
  }
}

function ecrireSession(session) {
  if (session) localStorage.setItem('session_conducteur', JSON.stringify(session));
  else localStorage.removeItem('session_conducteur');
}

let session = null;
let photoCompressee = '';
let synchroEnCours = false;

// ---------- Éléments de l'écran ----------

const $ = (id) => document.getElementById(id);
const etatReseau = $('networkStatus');
const compteurAttente = $('pendingCount');
const derniereSynchro = $('lastSync');
const boutonSynchro = $('btnSyncNow');
const zoneMessage = $('alertBox');
const ecranCode = $('loginScreen');
const ecranSaisie = $('formScreen');
const ecranHistorique = $('historyScreen');
const listeHistorique = $('historyList');
const formulaireCode = $('loginForm');
const champCode = $('driverCodeInput');
const nomConducteur = $('displayDriverName');
const boutonChangerConducteur = $('btnLogout');
const listeVehicules = $('vehiculeSelect');
const formulaireSaisie = $('logForm');
const champKilometrage = $('kilometrageInput');
const champDestination = $('destinationInput');
const champCommentaire = $('commentaireInput');
const champPhoto = $('photoInput');
const apercuPhoto = $('photoPreview');
const boutonEnregistrer = $('btnSubmit');

// ---------- Démarrage ----------

window.addEventListener('DOMContentLoaded', async () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(console.error);
  }
  // Sans cette demande, Android peut vider IndexedDB quand le téléphone manque d'espace.
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist();
  }

  try {
    await ouvrirBase();
  } catch (err) {
    afficherMessage("Stockage du téléphone indisponible. Libérez de l'espace puis rouvrez l'application.", 'error', 0);
    return;
  }

  session = lireSession();
  if (session) afficherEcranSaisie();

  afficherEtatReseau();
  afficherDerniereSynchro();
  await rafraichirAffichage();

  window.addEventListener('online', () => { afficherEtatReseau(); synchroniser(true); });
  window.addEventListener('offline', afficherEtatReseau);
  setInterval(() => { if (navigator.onLine) synchroniser(true); }, INTERVALLE_SYNCHRO_MS);

  // Des saisies peuvent attendre depuis la dernière ouverture.
  if (navigator.onLine) synchroniser(true);
});

// ---------- Affichage ----------

function afficherEtatReseau() {
  const enLigne = navigator.onLine;
  etatReseau.textContent = enLigne ? 'En ligne' : 'Hors ligne';
  etatReseau.className = 'status-badge ' + (enLigne ? 'status-online' : 'status-offline');
}

function afficherDerniereSynchro() {
  const date = localStorage.getItem('derniere_synchro');
  derniereSynchro.textContent = date
    ? 'Dernier envoi : ' + new Date(date).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
    : 'Aucun envoi pour le moment';
}

function afficherMessage(texte, type = 'error', dureeMs = 5000) {
  zoneMessage.textContent = texte;
  zoneMessage.className = 'notification ' + type;
  clearTimeout(afficherMessage.minuterie);
  if (dureeMs) afficherMessage.minuterie = setTimeout(() => zoneMessage.classList.add('hidden'), dureeMs);
}

async function rafraichirAffichage() {
  const saisies = await lireSaisies();
  const enAttente = saisies.filter((s) => s.statut === STATUT.EN_ATTENTE).length;
  const refusees = saisies.filter((s) => s.statut === STATUT.REFUSEE).length;
  compteurAttente.textContent = enAttente + ' saisie(s) en attente' + (refusees ? ' · ' + refusees + ' refusée(s)' : '');

  const recentes = saisies
    .sort((a, b) => b.dateSaisie.localeCompare(a.dateSaisie))
    .slice(0, NB_SAISIES_HISTORIQUE);

  listeHistorique.innerHTML = '';
  for (const saisie of recentes) {
    const ligne = document.createElement('li');
    ligne.className = 'history-item ' + saisie.statut;
    const quand = new Date(saisie.dateSaisie).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
    const libelleStatut = { en_attente: 'En attente', envoyee: 'Envoyée', refusee: 'Refusée' }[saisie.statut];
    ligne.textContent = quand + ' · ' + saisie.vehicule + ' · ' + saisie.kilometrage + ' km · ' + libelleStatut;
    if (saisie.erreur) {
      const detail = document.createElement('small');
      detail.textContent = saisie.erreur;
      ligne.appendChild(detail);
    }
    listeHistorique.appendChild(ligne);
  }
  ecranHistorique.classList.toggle('hidden', recentes.length === 0);
}

function afficherEcranSaisie() {
  nomConducteur.textContent = session.nom;
  const choixActuel = listeVehicules.value;
  listeVehicules.innerHTML = '<option value="">-- Sélectionnez le véhicule --</option>';
  for (const vehicule of session.vehicules) {
    const option = document.createElement('option');
    option.value = vehicule;
    option.textContent = vehicule;
    listeVehicules.appendChild(option);
  }
  listeVehicules.value = session.vehicules.includes(choixActuel) ? choixActuel : '';
  ecranCode.classList.add('hidden');
  ecranSaisie.classList.remove('hidden');
}

// ---------- Réseau ----------

async function appelerScript(options, parametres = '') {
  const abandon = new AbortController();
  const minuterie = setTimeout(() => abandon.abort(), DELAI_MAX_REQUETE_MS);
  try {
    const reponse = await fetch(URL_SCRIPT + parametres, { ...options, signal: abandon.signal });
    return await reponse.json();
  } finally {
    clearTimeout(minuterie);
  }
}

function demanderReferentiel(code) {
  return appelerScript({ method: 'GET' }, '?action=referentiel&code=' + encodeURIComponent(code));
}

// ---------- Code conducteur ----------

formulaireCode.addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = champCode.value.trim();
  if (!/^\d{6}$/.test(code)) {
    afficherMessage('Le code doit comporter exactement 6 chiffres.');
    return;
  }

  if (navigator.onLine) {
    afficherMessage('Vérification du code...', 'success', 0);
    try {
      const reponse = await demanderReferentiel(code);
      if (!reponse.ok) {
        afficherMessage(reponse.erreur || 'Code non reconnu.');
        return;
      }
      session = { code: code, nom: reponse.conducteur, vehicules: reponse.vehicules };
      await enregistrerConducteur(session);
      ouvrirSession();
      return;
    } catch (_) {
      // Réseau annoncé mais inutilisable : on tente le code déjà connu sur ce téléphone.
    }
  }

  const connu = await lireConducteur(code);
  if (connu) {
    session = connu;
    ouvrirSession();
  } else {
    afficherMessage("Pas de réseau et ce code n'a jamais été utilisé sur ce téléphone. Une première connexion avec réseau est nécessaire.", 'error', 0);
  }
});

function ouvrirSession() {
  ecrireSession(session);
  zoneMessage.classList.add('hidden');
  champCode.value = '';
  afficherEcranSaisie();
}

// Chaque saisie garde son propre code : changer de conducteur ne bloque pas les envois en attente.
boutonChangerConducteur.addEventListener('click', () => {
  ecrireSession(null);
  session = null;
  ecranSaisie.classList.add('hidden');
  ecranCode.classList.remove('hidden');
});

// ---------- Photo ----------

champPhoto.addEventListener('change', async () => {
  const fichier = champPhoto.files[0];
  photoCompressee = '';
  apercuPhoto.style.display = 'none';
  if (!fichier) return;

  // Empêche d'enregistrer avant la fin de la compression, sinon la photo serait perdue.
  boutonEnregistrer.disabled = true;
  boutonEnregistrer.textContent = 'Préparation de la photo...';
  try {
    photoCompressee = await compresserPhoto(fichier);
    apercuPhoto.src = photoCompressee;
    apercuPhoto.style.display = 'block';
  } catch (_) {
    champPhoto.value = '';
    afficherMessage('Impossible de lire cette photo. Reprenez-la.');
  } finally {
    boutonEnregistrer.disabled = false;
    boutonEnregistrer.textContent = 'Enregistrer la saisie';
  }
});

async function compresserPhoto(fichier) {
  const adresse = URL.createObjectURL(fichier);
  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = adresse;
    });
    const echelle = Math.min(1, TAILLE_MAX_PHOTO_PX / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.width * echelle);
    canvas.height = Math.round(image.height * echelle);
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.7);
  } finally {
    URL.revokeObjectURL(adresse);
  }
}

// ---------- Enregistrement d'une saisie ----------

formulaireSaisie.addEventListener('submit', async (e) => {
  e.preventDefault();
  const vehicule = listeVehicules.value;
  const kilometrage = Number(champKilometrage.value);
  const destination = champDestination.value.trim();
  const carburant = document.querySelector('input[name="carburant"]:checked');

  if (!vehicule) return afficherMessage('Sélectionnez un véhicule.');
  if (!Number.isInteger(kilometrage) || kilometrage <= 0) return afficherMessage('Kilométrage invalide.');
  if (!destination) return afficherMessage('Indiquez la destination.');
  if (!carburant) return afficherMessage('Indiquez le niveau de carburant.');

  const saisies = await lireSaisies();
  const dernierReleve = Math.max(0, ...saisies.filter((s) => s.vehicule === vehicule).map((s) => s.kilometrage));
  if (kilometrage < dernierReleve &&
      !confirm('Le dernier relevé de ' + vehicule + ' sur ce téléphone est ' + dernierReleve + ' km. Confirmer ' + kilometrage + ' km ?')) {
    return;
  }

  try {
    await enregistrerSaisie({
      id: crypto.randomUUID(),
      code: session.code,
      dateSaisie: new Date().toISOString(),
      vehicule: vehicule,
      kilometrage: kilometrage,
      destination: destination,
      carburant: carburant.value,
      commentaire: champCommentaire.value.trim(),
      photoBase64: photoCompressee,
      statut: STATUT.EN_ATTENTE
    });
  } catch (_) {
    afficherMessage("La saisie n'a pas pu être enregistrée : mémoire du téléphone pleine ?", 'error', 0);
    return;
  }

  formulaireSaisie.reset();
  listeVehicules.value = vehicule;
  photoCompressee = '';
  apercuPhoto.style.display = 'none';
  afficherMessage('Saisie enregistrée sur le téléphone.', 'success');
  await rafraichirAffichage();
  if (navigator.onLine) synchroniser(true);
});

// ---------- Synchronisation ----------

boutonSynchro.addEventListener('click', () => synchroniser(false));

async function synchroniser(automatique) {
  if (synchroEnCours) return;
  if (!navigator.onLine) {
    if (!automatique) afficherMessage('Pas de connexion Internet. Les saisies restent sur le téléphone.');
    return;
  }

  synchroEnCours = true;
  boutonSynchro.disabled = true;
  boutonSynchro.textContent = 'Envoi...';
  let envoyees = 0;
  let coupure = false;

  try {
    const fileAttente = (await lireSaisies())
      .filter((s) => s.statut === STATUT.EN_ATTENTE)
      .sort((a, b) => a.dateSaisie.localeCompare(b.dateSaisie));

    for (const saisie of fileAttente) {
      let reponse;
      try {
        const { statut, erreur, ...contenu } = saisie;
        reponse = await appelerScript({
          method: 'POST',
          // text/plain évite la requête préalable CORS, qu'Apps Script ne sait pas traiter.
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(contenu)
        });
      } catch (_) {
        coupure = true;
        break;
      }

      if (reponse.ok) {
        // La photo est sur Drive : on libère la place sur le téléphone, la ligne reste pour l'historique.
        await enregistrerSaisie({ ...saisie, statut: STATUT.ENVOYEE, photoBase64: '', erreur: '' });
        envoyees++;
      } else if (reponse.temporaire) {
        coupure = true;
        break;
      } else {
        await enregistrerSaisie({ ...saisie, statut: STATUT.REFUSEE, photoBase64: '', erreur: reponse.erreur });
      }
    }

    if (!coupure) {
      localStorage.setItem('derniere_synchro', new Date().toISOString());
      await mettreAJourReferentiel();
    }
    await purgerHistorique();
  } finally {
    synchroEnCours = false;
    boutonSynchro.disabled = false;
    boutonSynchro.textContent = 'Synchroniser';
    afficherDerniereSynchro();
    await rafraichirAffichage();
  }

  if (envoyees) afficherMessage(envoyees + ' saisie(s) envoyée(s).', 'success');
  else if (coupure && !automatique) afficherMessage('Envoi interrompu, nouvel essai automatique dans une minute.');
}

// Un véhicule ajouté dans la feuille apparaît ainsi sans que le conducteur ait à se reconnecter.
async function mettreAJourReferentiel() {
  if (!session) return;
  try {
    const reponse = await demanderReferentiel(session.code);
    if (!reponse.ok) return;
    session = { code: session.code, nom: reponse.conducteur, vehicules: reponse.vehicules };
    ecrireSession(session);
    await enregistrerConducteur(session);
    afficherEcranSaisie();
  } catch (_) {
    // Le référentiel en cache reste valable jusqu'au prochain essai.
  }
}

async function purgerHistorique() {
  const envoyees = (await lireSaisies())
    .filter((s) => s.statut === STATUT.ENVOYEE)
    .sort((a, b) => b.dateSaisie.localeCompare(a.dateSaisie));
  for (const ancienne of envoyees.slice(NB_SAISIES_HISTORIQUE)) {
    await supprimerSaisie(ancienne.id);
  }
}
