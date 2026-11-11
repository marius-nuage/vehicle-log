/**
 * Daily Vehicle Log - écrans administrateur.
 * Tout passe par le script en direct : aucune donnée d'administration n'est gardée sur le téléphone,
 * ni dans IndexedDB ni dans le cache. Les listes ne vivent qu'en mémoire, le temps de l'écran.
 */

let vueActive = 'saisie';
let adminConducteurs = [];
let adminVehicules = [];

const navAdmin = $('navAdmin');
const vueAdmin = $('vueAdmin');
const modaleAdmin = $('modaleAdmin');
const contenuModaleAdmin = $('modaleAdminContenu');

const icone = (nom) => '<svg class="ic"><use href="#' + nom + '"/></svg>';

function echapper(texte) {
  const div = document.createElement('div');
  div.textContent = texte == null ? '' : String(texte);
  return div.innerHTML;
}

// ---------- Navigation ----------

// Appelée à chaque synchronisation : elle ne recharge pas l'écran admin ouvert, elle ajuste seulement ce qui est visible.
function mettreAJourNavigation() {
  const estAdmin = !!session && session.role === 'admin';
  navAdmin.classList.toggle('hidden', !estAdmin);
  if (!estAdmin && vueActive !== 'saisie') {
    afficherVue('saisie');
    return;
  }
  ecranSaisie.classList.toggle('hidden', !session || vueActive !== 'saisie');
  vueAdmin.classList.toggle('hidden', !session || vueActive === 'saisie');
}

function afficherVue(vue) {
  vueActive = vue;
  navAdmin.querySelectorAll('button').forEach((b) => b.classList.toggle('actif', b.dataset.vue === vue));
  ecranSaisie.classList.toggle('hidden', !session || vue !== 'saisie');
  vueAdmin.classList.toggle('hidden', !session || vue === 'saisie');
  rafraichirAffichage();

  // Les listes d'une visite précédente ne sont jamais réaffichées : on repart du serveur.
  adminConducteurs = [];
  adminVehicules = [];
  vueAdmin.innerHTML = '';
  if (vue === 'conducteurs') ouvrirConducteurs();
  if (vue === 'vehicules') ouvrirVehicules();
  if (vue === 'donnees') ouvrirDonnees();
  window.scrollTo({ top: 0 });
}

navAdmin.addEventListener('click', (e) => {
  const bouton = e.target.closest('button[data-vue]');
  if (bouton) afficherVue(bouton.dataset.vue);
});

window.addEventListener('online', () => { if (vueActive !== 'saisie') afficherVue(vueActive); });
window.addEventListener('offline', () => { if (vueActive !== 'saisie') afficherVue(vueActive); });

// ---------- Appels au script ----------

async function appelAdmin(action, donnees = {}) {
  const reponse = await appelerScript({
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...donnees, action: action, code: session.code })
  });
  if (!reponse.ok) throw new Error(reponse.erreur || 'Erreur du serveur.');
  return reponse;
}

function afficherHorsLigne() {
  vueAdmin.innerHTML =
    '<div class="carte etat-vide">' + icone('i-cloud-off') +
    '<h2>Connexion Internet requise</h2>' +
    "<p class=\"aide\">Les écrans d'administration lisent et modifient les données en direct. " +
    "Ils s'ouvriront dès que le téléphone sera connecté.</p></div>";
}

function afficherChargement() {
  vueAdmin.innerHTML = '<div class="carte etat-vide"><div class="chargement"></div><p class="aide">Chargement...</p></div>';
}

function afficherErreurChargement(err, relancer) {
  vueAdmin.innerHTML =
    '<div class="carte etat-vide">' + icone('i-alert') +
    '<h2>Chargement impossible</h2><p class="aide">' + echapper(err.message) + '</p>' +
    '<button type="button" class="bouton-principal" id="btnRelancer">Réessayer</button></div>';
  $('btnRelancer').onclick = relancer;
}

async function chargerReferentiels() {
  const reponse = await appelAdmin('admin.referentiels');
  adminConducteurs = reponse.conducteurs;
  adminVehicules = reponse.vehicules;
}

// ---------- Fenêtre de formulaire ----------

function ouvrirModaleAdmin(html) {
  contenuModaleAdmin.innerHTML = html;
  modaleAdmin.classList.remove('hidden');
  const premier = contenuModaleAdmin.querySelector('input, select');
  if (premier) premier.focus();
}

function fermerModaleAdmin() {
  modaleAdmin.classList.add('hidden');
  contenuModaleAdmin.innerHTML = '';
}

modaleAdmin.addEventListener('click', (e) => {
  if (e.target === modaleAdmin || e.target.closest('[data-fermer]')) fermerModaleAdmin();
});

function erreurModale(message) {
  const zone = contenuModaleAdmin.querySelector('.erreur-modale');
  zone.textContent = message;
  zone.classList.toggle('hidden', !message);
}

// Exécute une action d'administration depuis la fenêtre, en bloquant le bouton pendant l'envoi.
async function executerDepuisModale(bouton, action) {
  if (!navigator.onLine) return erreurModale('Pas de connexion Internet.');
  erreurModale('');
  bouton.disabled = true;
  try {
    await action();
  } catch (err) {
    erreurModale(err.message);
  } finally {
    bouton.disabled = false;
  }
}

function confirmer(titre, texte, libelleBouton, action) {
  ouvrirModaleAdmin(
    '<div class="modale-icone">' + icone('i-trash') + '</div>' +
    '<h2>' + echapper(titre) + '</h2><p class="aide">' + echapper(texte) + '</p>' +
    '<p class="erreur-modale hidden"></p>' +
    '<div class="boutons-modale"><button type="button" class="bouton-secondaire" data-fermer>Annuler</button>' +
    '<button type="button" class="bouton-danger" id="btnConfirmer">' + echapper(libelleBouton) + '</button></div>'
  );
  const bouton = $('btnConfirmer');
  bouton.onclick = () => executerDepuisModale(bouton, action);
}

function afficherCode(nom, code) {
  ouvrirModaleAdmin(
    '<div class="modale-icone succes">' + icone('i-lock') + '</div>' +
    '<h2>Code de ' + echapper(nom) + '</h2>' +
    '<p class="code-affiche">' + echapper(code) + '</p>' +
    '<p class="aide">Remettez ce code à la personne. Il lui sert à se connecter à l\'application.</p>' +
    '<button type="button" class="bouton-principal" data-fermer>Terminé</button>'
  );
}

// ---------- Conducteurs ----------

async function ouvrirConducteurs() {
  if (!navigator.onLine) return afficherHorsLigne();
  afficherChargement();
  try {
    await chargerReferentiels();
  } catch (err) {
    return afficherErreurChargement(err, ouvrirConducteurs);
  }
  if (vueActive !== 'conducteurs') return;
  vueAdmin.innerHTML =
    '<div class="barre-admin">' +
    '<div class="recherche">' + icone('i-search') + '<input type="search" id="rechercheConducteur" placeholder="Rechercher un nom"></div>' +
    '<button type="button" class="bouton-ajout" id="btnAjouterConducteur">' + icone('i-plus') + '<span>Ajouter</span></button>' +
    '</div><p class="aide compteur-liste" id="compteurConducteurs"></p><ul class="liste-admin" id="listeConducteursAdmin"></ul>';
  $('rechercheConducteur').addEventListener('input', dessinerConducteurs);
  $('btnAjouterConducteur').onclick = () => formulaireConducteur(null);
  dessinerConducteurs();
}

function dessinerConducteurs() {
  const filtre = ($('rechercheConducteur').value || '').trim().toLowerCase();
  const liste = adminConducteurs
    .filter((c) => c.nom.toLowerCase().includes(filtre))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  const actifs = adminConducteurs.filter((c) => c.actif).length;
  $('compteurConducteurs').textContent = adminConducteurs.length + ' personnes, dont ' + actifs + ' actives';
  $('listeConducteursAdmin').innerHTML = liste.map((c) =>
    '<li><button type="button" class="ligne-admin" data-code="' + echapper(c.code) + '">' +
    '<span class="pastille' + (c.role === 'admin' ? ' admin' : '') + '">' + icone(c.role === 'admin' ? 'i-shield' : 'i-user') + '</span>' +
    '<span class="ligne-texte"><strong>' + echapper(c.nom) + '</strong>' +
    '<small>' + (c.role === 'admin' ? 'Administrateur' : 'Conducteur') + ' · code ' + echapper(c.code) + '</small></span>' +
    '<span class="etat ' + (c.actif ? 'actif' : 'inactif') + '">' + (c.actif ? 'Actif' : 'Inactif') + '</span>' +
    '</button></li>'
  ).join('') || '<li class="aide">Aucun résultat.</li>';
  $('listeConducteursAdmin').querySelectorAll('.ligne-admin').forEach((b) => {
    b.onclick = () => formulaireConducteur(adminConducteurs.find((c) => c.code === b.dataset.code));
  });
}

function formulaireConducteur(conducteur) {
  const nouveau = !conducteur;
  const estMoi = !nouveau && conducteur.code === session.code;
  ouvrirModaleAdmin(
    '<h2>' + (nouveau ? 'Ajouter une personne' : 'Modifier ' + echapper(conducteur.nom)) + '</h2>' +
    '<label class="etiquette requis" for="admNom">Nom complet</label>' +
    '<input type="text" id="admNom" value="' + (nouveau ? '' : echapper(conducteur.nom)) + '">' +
    '<label class="etiquette" for="admRole">Rôle</label>' +
    '<select id="admRole"' + (estMoi ? ' disabled' : '') + '>' +
    '<option value="conducteur">Conducteur (formulaire seulement)</option>' +
    '<option value="admin">Administrateur (formulaire et gestion)</option></select>' +
    (nouveau ? '' :
      '<label class="case"><input type="checkbox" id="admActif"' + (conducteur.actif ? ' checked' : '') + (estMoi ? ' disabled' : '') + '> Compte actif</label>' +
      '<label class="case"><input type="checkbox" id="admNouveauCode"> Générer un nouveau code (l\'ancien ne marchera plus)</label>') +
    '<p class="aide">' + (nouveau ? 'Le code est créé automatiquement : 6 chiffres pour un conducteur, 8 pour un administrateur.' : 'Code actuel : ' + echapper(conducteur.code)) + '</p>' +
    '<p class="erreur-modale hidden"></p>' +
    '<div class="boutons-modale">' +
    (nouveau || estMoi ? '' : '<button type="button" class="bouton-danger-discret" id="admSupprimer">' + icone('i-trash') + '</button>') +
    '<button type="button" class="bouton-secondaire" data-fermer>Annuler</button>' +
    '<button type="button" class="bouton-principal" id="admEnregistrer">Enregistrer</button></div>'
  );
  $('admRole').value = nouveau ? 'conducteur' : conducteur.role;

  const boutonEnregistrer = $('admEnregistrer');
  boutonEnregistrer.onclick = () => executerDepuisModale(boutonEnregistrer, async () => {
    const nom = $('admNom').value.trim();
    if (!nom) return erreurModale('Le nom est obligatoire.');
    const role = $('admRole').value;
    let reponse;
    if (nouveau) {
      reponse = await appelAdmin('admin.conducteur.creer', { nom: nom, role: role });
    } else {
      reponse = await appelAdmin('admin.conducteur.modifier', {
        codeCible: conducteur.code,
        nom: nom,
        role: role,
        actif: $('admActif').checked,
        nouveauCode: $('admNouveauCode').checked
      });
    }
    const resultat = reponse.conducteur;
    adminConducteurs = adminConducteurs.filter((c) => nouveau || c.code !== conducteur.code).concat(resultat);
    dessinerConducteurs();
    if (nouveau || resultat.code !== conducteur.code) afficherCode(resultat.nom, resultat.code);
    else fermerModaleAdmin();
    afficherMessage(nouveau ? resultat.nom + ' ajouté(e).' : resultat.nom + ' modifié(e).', 'success');
  });

  if ($('admSupprimer')) {
    $('admSupprimer').onclick = () => confirmer(
      'Supprimer ' + conducteur.nom + ' ?',
      'Son code ne marchera plus. Ses saisies déjà envoyées restent dans la feuille. Pour un départ temporaire, préférez « Compte actif » décoché.',
      'Supprimer',
      async () => {
        await appelAdmin('admin.conducteur.supprimer', { codeCible: conducteur.code });
        adminConducteurs = adminConducteurs.filter((c) => c.code !== conducteur.code);
        dessinerConducteurs();
        fermerModaleAdmin();
        afficherMessage(conducteur.nom + ' supprimé(e).', 'success');
      }
    );
  }
}

// ---------- Véhicules ----------

async function ouvrirVehicules() {
  if (!navigator.onLine) return afficherHorsLigne();
  afficherChargement();
  try {
    await chargerReferentiels();
  } catch (err) {
    return afficherErreurChargement(err, ouvrirVehicules);
  }
  if (vueActive !== 'vehicules') return;
  vueAdmin.innerHTML =
    '<div class="barre-admin">' +
    '<div class="recherche">' + icone('i-search') + '<input type="search" id="rechercheVehicule" placeholder="Rechercher un véhicule"></div>' +
    '<button type="button" class="bouton-ajout" id="btnAjouterVehicule">' + icone('i-plus') + '<span>Ajouter</span></button>' +
    '</div><p class="aide compteur-liste" id="compteurVehicules"></p><ul class="liste-admin" id="listeVehiculesAdmin"></ul>';
  $('rechercheVehicule').addEventListener('input', dessinerVehicules);
  $('btnAjouterVehicule').onclick = () => formulaireVehicule(null);
  dessinerVehicules();
}

function dessinerVehicules() {
  const filtre = ($('rechercheVehicule').value || '').trim().toLowerCase();
  const liste = adminVehicules.filter((v) => v.nom.toLowerCase().includes(filtre));
  const actifs = adminVehicules.filter((v) => v.actif).length;
  $('compteurVehicules').textContent = adminVehicules.length + ' véhicules, dont ' + actifs + ' actifs';
  $('listeVehiculesAdmin').innerHTML = liste.map((v) =>
    '<li><button type="button" class="ligne-admin" data-index="' + adminVehicules.indexOf(v) + '">' +
    '<span class="pastille">' + icone('i-car') + '</span>' +
    '<span class="ligne-texte"><strong>' + echapper(v.nom) + '</strong></span>' +
    '<span class="etat ' + (v.actif ? 'actif' : 'inactif') + '">' + (v.actif ? 'Actif' : 'Inactif') + '</span>' +
    '</button></li>'
  ).join('') || '<li class="aide">Aucun résultat.</li>';
  $('listeVehiculesAdmin').querySelectorAll('.ligne-admin').forEach((b) => {
    b.onclick = () => formulaireVehicule(adminVehicules[Number(b.dataset.index)]);
  });
}

function formulaireVehicule(vehicule) {
  const nouveau = !vehicule;
  ouvrirModaleAdmin(
    '<h2>' + (nouveau ? 'Ajouter un véhicule' : 'Modifier le véhicule') + '</h2>' +
    '<label class="etiquette requis" for="admVehicule">Immatriculation et modèle</label>' +
    '<input type="text" id="admVehicule" placeholder="Ex. 250 CD 010 Hilux Double Cabin" value="' + (nouveau ? '' : echapper(vehicule.nom)) + '">' +
    (nouveau ? '' : '<label class="case"><input type="checkbox" id="admVehiculeActif"' + (vehicule.actif ? ' checked' : '') + '> Proposé dans le formulaire</label>') +
    '<p class="erreur-modale hidden"></p>' +
    '<div class="boutons-modale">' +
    (nouveau ? '' : '<button type="button" class="bouton-danger-discret" id="admSupprimerVehicule">' + icone('i-trash') + '</button>') +
    '<button type="button" class="bouton-secondaire" data-fermer>Annuler</button>' +
    '<button type="button" class="bouton-principal" id="admEnregistrerVehicule">Enregistrer</button></div>'
  );

  const bouton = $('admEnregistrerVehicule');
  bouton.onclick = () => executerDepuisModale(bouton, async () => {
    const nom = $('admVehicule').value.trim();
    if (!nom) return erreurModale("L'immatriculation et le modèle sont obligatoires.");
    const reponse = nouveau
      ? await appelAdmin('admin.vehicule.creer', { nom: nom })
      : await appelAdmin('admin.vehicule.modifier', { ancienNom: vehicule.nom, nom: nom, actif: $('admVehiculeActif').checked });
    adminVehicules = nouveau
      ? adminVehicules.concat(reponse.vehicule)
      : adminVehicules.map((v) => (v === vehicule ? reponse.vehicule : v));
    dessinerVehicules();
    fermerModaleAdmin();
    afficherMessage(reponse.vehicule.nom + (nouveau ? ' ajouté.' : ' modifié.'), 'success');
  });

  if ($('admSupprimerVehicule')) {
    $('admSupprimerVehicule').onclick = () => confirmer(
      'Supprimer ce véhicule ?',
      vehicule.nom + ' ne sera plus proposé. Les saisies déjà envoyées restent dans la feuille. Pour un véhicule au garage, préférez de le décocher.',
      'Supprimer',
      async () => {
        await appelAdmin('admin.vehicule.supprimer', { nom: vehicule.nom });
        adminVehicules = adminVehicules.filter((v) => v !== vehicule);
        dessinerVehicules();
        fermerModaleAdmin();
        afficherMessage(vehicule.nom + ' supprimé.', 'success');
      }
    );
  }
}

// ---------- Données ----------

let derniereReponseDonnees = null;
let filtreTuile = 'tous';

const LIBELLES_TUILE = {
  aujourdhui: "Saisies d'aujourd'hui",
  enRoute: 'Véhicules en route',
  tous: 'Toutes les saisies',
  filtre: 'Résultats du filtre'
};

function dateDuJour() {
  // Le format sv-SE donne directement AAAA-MM-JJ, à l'heure du téléphone (Bangui).
  return new Date().toLocaleDateString('sv-SE');
}

async function ouvrirDonnees() {
  if (!navigator.onLine) return afficherHorsLigne();
  afficherChargement();
  try {
    await chargerReferentiels();
  } catch (err) {
    return afficherErreurChargement(err, ouvrirDonnees);
  }
  if (vueActive !== 'donnees') return;
  filtreTuile = 'tous';
  const options = (valeurs) => valeurs.map((v) => '<option>' + echapper(v) + '</option>').join('');
  vueAdmin.innerHTML =
    '<div class="indicateurs">' +
    '<button type="button" class="indicateur" data-tuile="aujourdhui"><small>Saisies aujourd\'hui</small><strong id="indAujourdhui">-</strong></button>' +
    '<button type="button" class="indicateur" data-tuile="enRoute"><small>Véhicules en route</small><strong id="indEnRoute">-</strong></button>' +
    '<button type="button" class="indicateur" data-tuile="tous"><small>Toutes les saisies</small><strong id="indTotal">-</strong></button>' +
    '</div>' +
    '<details class="carte filtres"><summary>' + icone('i-search') + 'Filtrer les saisies</summary>' +
    '<div class="grille-filtres">' +
    '<label>Du<input type="date" id="fDu"></label><label>Au<input type="date" id="fAu"></label>' +
    '<label>Véhicule<select id="fVehicule"><option value="">Tous</option>' + options(adminVehicules.map((v) => v.nom)) + '</select></label>' +
    '<label>Conducteur<select id="fConducteur"><option value="">Tous</option>' + options(adminConducteurs.map((c) => c.nom).sort((a, b) => a.localeCompare(b, 'fr'))) + '</select></label>' +
    '<label>Type<select id="fType"><option value="">Tous</option><option>Début du trajet</option><option>Fin du trajet</option></select></label>' +
    '</div><button type="button" class="bouton-principal" id="btnFiltrer">Appliquer</button></details>' +
    '<div class="bandeau-filtre" id="bandeauFiltre"></div>' +
    '<ul class="liste-saisies" id="listeSaisiesAdmin"></ul>';

  vueAdmin.querySelectorAll('[data-tuile]').forEach((tuile) => {
    tuile.onclick = () => choisirTuile(tuile.dataset.tuile);
  });
  $('btnFiltrer').onclick = () => {
    filtreTuile = 'filtre';
    vueAdmin.querySelector('.filtres').open = false;
    chargerSaisies();
  };
  chargerSaisies();
}

function viderFiltres() {
  ['fDu', 'fAu', 'fVehicule', 'fConducteur', 'fType'].forEach((id) => { $(id).value = ''; });
}

function choisirTuile(tuile) {
  filtreTuile = tuile;
  if (tuile === 'enRoute' && derniereReponseDonnees) {
    dessinerSaisies(derniereReponseDonnees.enRoute);
    return;
  }
  viderFiltres();
  if (tuile === 'aujourdhui') {
    $('fDu').value = dateDuJour();
    $('fAu').value = dateDuJour();
  }
  chargerSaisies();
}

async function chargerSaisies() {
  if (!navigator.onLine) return afficherHorsLigne();
  const liste = $('listeSaisiesAdmin');
  liste.innerHTML = '<li class="carte etat-vide"><div class="chargement"></div></li>';
  let reponse;
  try {
    reponse = await appelAdmin('admin.saisies', {
      du: $('fDu').value, au: $('fAu').value, vehicule: $('fVehicule').value,
      conducteur: $('fConducteur').value, typeTrajet: $('fType').value
    });
  } catch (err) {
    liste.innerHTML = '<li class="carte etat-vide">' + icone('i-alert') + '<p class="aide">' + echapper(err.message) + '</p></li>';
    return;
  }
  if (vueActive !== 'donnees') return;

  derniereReponseDonnees = reponse;
  $('indAujourdhui').textContent = reponse.aujourdhui;
  $('indEnRoute').textContent = reponse.enRoute.length;
  if (filtreTuile === 'tous') $('indTotal').textContent = reponse.total;
  dessinerSaisies(filtreTuile === 'enRoute' ? reponse.enRoute : reponse.saisies, reponse.total);
}

function dessinerSaisies(saisies, total) {
  vueAdmin.querySelectorAll('[data-tuile]').forEach((t) => t.classList.toggle('actif', t.dataset.tuile === filtreTuile));
  const nombre = total == null ? saisies.length : total;
  $('bandeauFiltre').innerHTML =
    '<span>' + icone('i-list') + echapper(LIBELLES_TUILE[filtreTuile]) + ' : <strong>' + nombre + '</strong></span>' +
    (filtreTuile === 'tous' ? '' : '<button type="button" id="btnEffacerFiltre">Tout afficher</button>');
  if ($('btnEffacerFiltre')) $('btnEffacerFiltre').onclick = () => choisirTuile('tous');

  const liste = $('listeSaisiesAdmin');
  liste.innerHTML = saisies.map((s, i) =>
    '<li><button type="button" class="carte saisie-admin" data-index="' + i + '">' +
    '<span class="miniature"' + (s.photoId ? ' data-photo="' + echapper(s.photoId) + '"' : '') + '>' +
    (s.photoId ? icone('i-camera') : '<small>Sans photo</small>') + '</span>' +
    '<span class="saisie-corps">' +
    '<span class="saisie-entete"><span class="badge ' + (s.typeTrajet === 'Fin du trajet' ? 'fin' : 'debut') + '">' + echapper(s.typeTrajet || 'Sans type') + '</span>' +
    '<small>' + echapper(s.dateSaisie.slice(0, 16)) + '</small></span>' +
    '<strong>' + echapper(s.vehicule) + '</strong>' +
    '<small>' + echapper(s.conducteur) + '</small>' +
    '<small>' + echapper(s.kilometrage) + ' km · ' + echapper(s.destination) + ' · carburant ' + echapper(s.carburant) + '</small>' +
    (s.commentaire ? '<small class="commentaire-court">' + icone('i-alert') + echapper(s.commentaire) + '</small>' : '') +
    '</span></button></li>'
  ).join('') || '<li class="carte etat-vide"><p class="aide">Aucune saisie à afficher.</p></li>';

  if (total != null && total > saisies.length) {
    liste.insertAdjacentHTML('beforeend', '<li class="aide">Les ' + saisies.length + ' plus récentes sur ' + total + ' sont affichées. Resserrez le filtre pour voir les autres.</li>');
  }
  liste.querySelectorAll('.saisie-admin').forEach((carte) => {
    carte.onclick = () => ouvrirFicheSaisie(saisies[Number(carte.dataset.index)]);
  });
  observerMiniatures();
}

// ---------- Photos ----------

// Les photos ne passent que par le script : un admin n'a pas besoin d'accès au dossier Drive.
// Elles restent en mémoire le temps de la visite, jamais sur le téléphone.
const photosEnMemoire = new Map();
const fileDePhotos = [];
let photosEnCours = 0;
const PHOTOS_EN_PARALLELE = 2;

function chargerPhoto(photoId, taille) {
  const cle = photoId + ':' + taille;
  if (!photosEnMemoire.has(cle)) {
    photosEnMemoire.set(cle, new Promise((resolve, reject) => {
      fileDePhotos.push({ photoId, taille, resolve, reject });
      lancerPhotos();
    }));
    // Un échec ne doit pas rester en mémoire : un nouvel essai doit être possible.
    photosEnMemoire.get(cle).catch(() => photosEnMemoire.delete(cle));
  }
  return photosEnMemoire.get(cle);
}

function lancerPhotos() {
  while (photosEnCours < PHOTOS_EN_PARALLELE && fileDePhotos.length) {
    const demande = fileDePhotos.shift();
    photosEnCours++;
    appelAdmin('admin.photo', { photoId: demande.photoId, taille: demande.taille })
      .then((r) => demande.resolve(r.image), demande.reject)
      .finally(() => { photosEnCours--; lancerPhotos(); });
  }
}

let observateurMiniatures = null;

function observerMiniatures() {
  if (observateurMiniatures) observateurMiniatures.disconnect();
  observateurMiniatures = new IntersectionObserver((entrees) => {
    for (const entree of entrees) {
      if (!entree.isIntersecting) continue;
      observateurMiniatures.unobserve(entree.target);
      afficherMiniature(entree.target);
    }
  }, { rootMargin: '200px' });
  vueAdmin.querySelectorAll('.miniature[data-photo]').forEach((m) => observateurMiniatures.observe(m));
}

async function afficherMiniature(zone) {
  zone.classList.add('en-chargement');
  try {
    const image = await chargerPhoto(zone.dataset.photo, 'miniature');
    zone.innerHTML = '<img alt="Photo de la saisie" src="' + image + '">';
  } catch (_) {
    zone.innerHTML = '<small>Photo indisponible</small>';
  } finally {
    zone.classList.remove('en-chargement');
  }
}

// ---------- Fiche détaillée d'une saisie ----------

function delaiEnvoi(saisie) {
  const debut = new Date(saisie.dateSaisie.replace(' ', 'T'));
  const fin = new Date(saisie.dateReception.replace(' ', 'T'));
  const minutes = Math.round((fin - debut) / 60000);
  if (isNaN(minutes) || minutes < 1) return 'immédiat';
  if (minutes < 60) return minutes + ' min (saisie hors ligne)';
  const heures = Math.floor(minutes / 60);
  return heures + ' h ' + (minutes % 60) + ' min (saisie hors ligne)';
}

function ouvrirFicheSaisie(s) {
  const ligne = (libelle, valeur) => valeur ? '<dt>' + libelle + '</dt><dd>' + echapper(valeur) + '</dd>' : '';
  ouvrirModaleAdmin(
    '<div class="fiche-entete"><span class="badge ' + (s.typeTrajet === 'Fin du trajet' ? 'fin' : 'debut') + '">' + echapper(s.typeTrajet || 'Sans type') + '</span>' +
    '<button type="button" class="bouton-fermer" data-fermer aria-label="Fermer">' + icone('i-x') + '</button></div>' +
    '<h2>' + echapper(s.vehicule) + '</h2>' +
    (s.photoId
      ? '<div class="photo-fiche en-chargement" id="photoFiche"><div class="chargement"></div><p class="aide">Chargement de la photo...</p></div>'
      : '<div class="photo-fiche vide">' + icone('i-camera') + '<p class="aide">Aucune photo pour cette saisie.</p></div>') +
    '<dl class="fiche">' +
    ligne('Conducteur', s.conducteur) +
    ligne('Kilométrage', s.kilometrage + ' km') +
    ligne('Destination', s.destination) +
    ligne('Carburant', s.carburant) +
    ligne('Commentaire', s.commentaire) +
    ligne('Saisie le', s.dateSaisie) +
    ligne('Reçue le', s.dateReception) +
    ligne("Délai d'envoi", delaiEnvoi(s)) +
    ligne('Identifiant', s.id) +
    '</dl>' +
    (s.photo && s.photo.startsWith('https://')
      ? '<a class="lien-photo" href="' + echapper(s.photo) + '" target="_blank" rel="noopener">' + icone('i-camera') + 'Ouvrir la photo dans Google Drive</a>'
      : '') +
    '<button type="button" class="bouton-principal" data-fermer>Fermer</button>'
  );
  if (!s.photoId) return;
  chargerPhoto(s.photoId, 'complete')
    .then((image) => {
      const zone = $('photoFiche');
      if (!zone) return;
      zone.classList.remove('en-chargement');
      zone.innerHTML = '<img alt="Photo de la saisie" src="' + image + '">';
      // Un appui agrandit la photo à toute la hauteur de l'écran, un second la remet en place.
      zone.onclick = () => zone.classList.toggle('agrandie');
    })
    .catch((err) => {
      const zone = $('photoFiche');
      if (zone) zone.innerHTML = icone('i-alert') + '<p class="aide">Photo indisponible : ' + echapper(err.message) + '</p>';
    });
}
