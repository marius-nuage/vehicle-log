/**
 * Daily Vehicle Log - écrans administrateur.
 * Tout passe par le script en direct : aucune donnée d'administration n'est gardée sur le téléphone,
 * ni dans IndexedDB ni dans le cache. Les listes ne vivent qu'en mémoire, le temps de l'écran.
 */

let vueActive = 'saisie';
let adminConducteurs = [];
let adminVehicules = [];
let adminEmailsAlerte = [];

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
  adminEmailsAlerte = reponse.emailsAlerte || [];
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
    '</div><div class="actions-codes">' +
    '<button type="button" class="bouton-secondaire" id="btnImprimerCodes">' + icone('i-printer') + '<span>Imprimer les codes</span></button>' +
    '<button type="button" class="bouton-secondaire bouton-alerte" id="btnChangerCodes">' + icone('i-lock') + '<span>Changer tous les codes</span></button>' +
    '</div><button type="button" class="reglage-email" id="btnEmailsAlerte"></button>' +
    '<p class="aide compteur-liste" id="compteurConducteurs"></p><ul class="liste-admin" id="listeConducteursAdmin"></ul>';
  $('rechercheConducteur').addEventListener('input', dessinerConducteurs);
  $('btnImprimerCodes').onclick = afficherListeCodes;
  $('btnChangerCodes').onclick = confirmerChangementCodes;
  $('btnEmailsAlerte').onclick = formulaireEmailsAlerte;
  dessinerEmailsAlerte();
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

// ---------- Codes : passage à 8 chiffres et liste imprimable ----------

function confirmerChangementCodes() {
  confirmer(
    'Changer les ' + adminConducteurs.length + ' codes ?',
    'À utiliser si quelqu\'un essaie de deviner des codes. Tout le monde reçoit un nouveau code, vous compris ; ' +
    'votre téléphone garde votre connexion. Les autres devront entrer leur nouveau code, et les saisies pas encore ' +
    'envoyées avec l\'ancien code seront refusées. Demandez si possible aux conducteurs de synchroniser avant. ' +
    'Imprimez ensuite la liste pour remettre les codes.',
    'Changer tous les codes',
    async () => {
      const reponse = await appelAdmin('admin.codes.regenerer');
      if (reponse.nouveauCodeAdmin) {
        // Sans cette mise à jour, l'admin serait déconnecté par son propre changement de codes.
        const ancienCode = session.code;
        session.code = reponse.nouveauCodeAdmin;
        ecrireSession(session);
        await oublierConducteur(ancienCode);
        await enregistrerConducteur(session);
      }
      adminConducteurs = reponse.conducteurs;
      dessinerConducteurs();
      afficherMessage(reponse.nombre + ' codes changés. Votre nouveau code : ' + session.code + '.', 'success', 0);
      afficherListeCodes();
    }
  );
  contenuModaleAdmin.querySelector('.modale-icone').innerHTML = icone('i-lock');
}

function afficherListeCodes() {
  const liste = adminConducteurs
    .filter((c) => c.actif)
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  ouvrirModaleAdmin(
    '<div class="fiche-entete"><h2>Codes des conducteurs</h2>' +
    '<button type="button" class="bouton-fermer" data-fermer aria-label="Fermer">' + icone('i-x') + '</button></div>' +
    '<div id="feuilleCodes" class="feuille-codes">' +
    '<p class="aide">Daily Vehicle Log, UNOPS Bangui · liste du ' + new Date().toLocaleDateString('fr-FR') +
    ' · document confidentiel, à remettre en main propre.</p>' +
    '<table><thead><tr><th>Nom</th><th>Rôle</th><th>Code</th></tr></thead><tbody>' +
    liste.map((c) => '<tr><td>' + echapper(c.nom) + '</td><td>' + (c.role === 'admin' ? 'Admin' : 'Conducteur') +
      '</td><td class="code">' + echapper(c.code) + '</td></tr>').join('') +
    '</tbody></table></div>' +
    '<div class="boutons-modale"><button type="button" class="bouton-secondaire" data-fermer>Fermer</button>' +
    '<button type="button" class="bouton-principal" id="btnLancerImpression">' + icone('i-printer') + ' Imprimer</button></div>'
  );
  $('btnLancerImpression').onclick = () => {
    // Seule la feuille des codes est imprimée : le reste de la page est masqué par la feuille de style d'impression.
    document.body.classList.add('impression-codes');
    window.print();
    document.body.classList.remove('impression-codes');
  };
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

function dessinerEmailsAlerte() {
  $('btnEmailsAlerte').innerHTML = icone('i-alert') +
    '<span class="ligne-texte"><strong>Alerte de blocage des codes</strong>' +
    '<small>' + echapper(adminEmailsAlerte.join(', ') || 'Aucune adresse') + '</small></span>' + icone('i-edit');
}

function formulaireEmailsAlerte() {
  ouvrirModaleAdmin(
    "<h2>Email d'alerte</h2>" +
    '<p class="aide">Après 10 codes faux en 10 minutes, les connexions sont suspendues 10 minutes et un email part à ces adresses.</p>' +
    '<label class="etiquette requis" for="admEmailsAlerte">Adresses (séparées par une virgule, 5 au maximum)</label>' +
    '<input type="text" id="admEmailsAlerte" inputmode="email" autocomplete="off" value="' + echapper(adminEmailsAlerte.join(', ')) + '">' +
    '<label class="case"><input type="checkbox" id="admEmailTest" checked> Envoyer un email de test</label>' +
    '<p class="erreur-modale hidden"></p>' +
    '<div class="boutons-modale">' +
    '<button type="button" class="bouton-secondaire" data-fermer>Annuler</button>' +
    '<button type="button" class="bouton-principal" id="admEnregistrerEmails">Enregistrer</button></div>'
  );
  const bouton = $('admEnregistrerEmails');
  bouton.onclick = () => executerDepuisModale(bouton, async () => {
    const emails = $('admEmailsAlerte').value.trim();
    if (!emails) return erreurModale('Indiquez au moins une adresse.');
    const test = $('admEmailTest').checked;
    const reponse = await appelAdmin('admin.emails.alerte', { emails: emails, test: test });
    adminEmailsAlerte = reponse.emailsAlerte;
    if ($('btnEmailsAlerte')) dessinerEmailsAlerte();
    fermerModaleAdmin();
    if (reponse.avertissement) return afficherMessage('Adresses enregistrées. ' + reponse.avertissement);
    afficherMessage('Adresses enregistrées.' + (test ? ' Un email de test est parti.' : ''), 'success');
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
let pageDonnees = 1;
let minuterieRecherche = null;

const LIBELLES_TUILE = {
  aujourdhui: "Saisies d'aujourd'hui",
  enRoute: 'Véhicules en route',
  tous: 'Toutes les saisies',
  filtre: 'Résultats du filtre'
};

function dateDuJour(decalageJours = 0) {
  const date = new Date();
  date.setDate(date.getDate() + decalageJours);
  // Le format sv-SE donne directement AAAA-MM-JJ, à l'heure du téléphone (Bangui).
  return date.toLocaleDateString('sv-SE');
}

function libelleJour(jour) {
  if (jour === dateDuJour()) return "Aujourd'hui";
  if (jour === dateDuJour(-1)) return 'Hier';
  const texte = new Date(jour + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return texte.charAt(0).toUpperCase() + texte.slice(1);
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
  pageDonnees = 1;
  const options = (valeurs) => valeurs.map((v) => '<option>' + echapper(v) + '</option>').join('');
  vueAdmin.innerHTML =
    '<div class="indicateurs">' +
    '<button type="button" class="indicateur" data-tuile="aujourdhui"><small>Saisies aujourd\'hui</small><strong id="indAujourdhui">-</strong></button>' +
    '<button type="button" class="indicateur" data-tuile="enRoute"><small>Véhicules en route</small><strong id="indEnRoute">-</strong><em id="indAlerte" class="hidden"></em></button>' +
    '<button type="button" class="indicateur" data-tuile="tous"><small>Toutes les saisies</small><strong id="indTotal">-</strong></button>' +
    '</div>' +
    '<div class="outils-donnees">' +
    '<div class="recherche">' + icone('i-search') + '<input type="search" id="fRecherche" placeholder="Véhicule, conducteur, destination..."></div>' +
    '<select id="fOrdre" aria-label="Ordre"><option value="recent">Plus récentes</option><option value="ancien">Plus anciennes</option></select>' +
    '</div>' +
    '<details class="carte filtres"><summary>' + icone('i-chart') + 'Filtres avancés<span id="nbFiltres" class="pastille-nombre hidden"></span></summary>' +
    '<div class="grille-filtres">' +
    '<label>Du<input type="date" id="fDu"></label><label>Au<input type="date" id="fAu"></label>' +
    '<label>Véhicule<select id="fVehicule"><option value="">Tous</option>' + options(adminVehicules.map((v) => v.nom)) + '</select></label>' +
    '<label>Conducteur<select id="fConducteur"><option value="">Tous</option>' + options(adminConducteurs.map((c) => c.nom).sort((a, b) => a.localeCompare(b, 'fr'))) + '</select></label>' +
    '<label>Type<select id="fType"><option value="">Tous</option><option>Début du trajet</option><option>Fin du trajet</option></select></label>' +
    '<label>Par page<select id="fParPage"><option>10</option><option>20</option><option>50</option></select></label>' +
    '</div><div class="boutons-modale"><button type="button" class="bouton-secondaire" id="btnReinitialiser">Réinitialiser</button>' +
    '<button type="button" class="bouton-principal" id="btnFiltrer">Appliquer</button></div></details>' +
    '<div class="bandeau-filtre" id="bandeauFiltre"></div>' +
    '<div id="listeSaisiesAdmin"></div>' +
    '<nav class="pagination hidden" id="paginationDonnees" aria-label="Pages"></nav>' +
    '<button type="button" class="bouton-export" id="btnExporter">' + icone('i-list') + '<span>Exporter en Excel</span></button>';

  vueAdmin.querySelectorAll('[data-tuile]').forEach((tuile) => {
    tuile.onclick = () => choisirTuile(tuile.dataset.tuile);
  });
  $('btnFiltrer').onclick = () => {
    filtreTuile = 'filtre';
    vueAdmin.querySelector('.filtres').open = false;
    rechargerDepuisPage1();
  };
  $('btnReinitialiser').onclick = () => {
    viderFiltres();
    choisirTuile('tous');
  };
  $('fOrdre').onchange = rechargerDepuisPage1;
  $('fParPage').onchange = rechargerDepuisPage1;
  // La recherche part 600 ms après la dernière touche, pour ne pas appeler le serveur à chaque lettre.
  $('fRecherche').oninput = () => {
    clearTimeout(minuterieRecherche);
    minuterieRecherche = setTimeout(() => {
      if (filtreTuile === 'enRoute') filtreTuile = 'tous';
      rechargerDepuisPage1();
    }, 600);
  };
  $('btnExporter').onclick = exporterExcel;
  chargerSaisies();
}

function viderFiltres() {
  ['fDu', 'fAu', 'fVehicule', 'fConducteur', 'fType', 'fRecherche'].forEach((id) => { $(id).value = ''; });
}

function rechargerDepuisPage1() {
  pageDonnees = 1;
  chargerSaisies();
}

function choisirTuile(tuile) {
  filtreTuile = tuile;
  pageDonnees = 1;
  if (tuile === 'enRoute' && derniereReponseDonnees) {
    dessinerSaisies();
    return;
  }
  viderFiltres();
  if (tuile === 'aujourdhui') {
    $('fDu').value = dateDuJour();
    $('fAu').value = dateDuJour();
  }
  chargerSaisies();
}

function criteresDonnees() {
  return {
    du: $('fDu').value, au: $('fAu').value, vehicule: $('fVehicule').value,
    conducteur: $('fConducteur').value, typeTrajet: $('fType').value,
    recherche: $('fRecherche').value.trim(), ordre: $('fOrdre').value
  };
}

function compterFiltres() {
  const nombre = ['fDu', 'fAu', 'fVehicule', 'fConducteur', 'fType'].filter((id) => $(id).value).length;
  $('nbFiltres').textContent = nombre;
  $('nbFiltres').classList.toggle('hidden', nombre === 0);
}

async function chargerSaisies() {
  if (!navigator.onLine) return afficherHorsLigne();
  compterFiltres();
  const liste = $('listeSaisiesAdmin');
  liste.innerHTML = '<div class="carte etat-vide"><div class="chargement"></div></div>';
  $('paginationDonnees').classList.add('hidden');
  let reponse;
  try {
    reponse = await appelAdmin('admin.saisies', { ...criteresDonnees(), page: pageDonnees, parPage: Number($('fParPage').value) });
  } catch (err) {
    liste.innerHTML = '<div class="carte etat-vide">' + icone('i-alert') + '<p class="aide">' + echapper(err.message) + '</p></div>';
    return;
  }
  if (vueActive !== 'donnees') return;

  derniereReponseDonnees = reponse;
  derniereReponseDonnees.seuilAlerteHeures = reponse.seuilAlerteHeures || 12;
  pageDonnees = reponse.page;
  $('indAujourdhui').textContent = reponse.aujourdhui;
  $('indEnRoute').textContent = reponse.enRoute.length;
  afficherAlerteTuile();
  if (filtreTuile === 'tous' && !$('fRecherche').value) $('indTotal').textContent = reponse.total;
  dessinerSaisies();
}

function dessinerSaisies() {
  const reponse = derniereReponseDonnees;
  if ($('reglageSeuil')) $('reglageSeuil').remove();
  const enRoute = filtreTuile === 'enRoute';
  // Les départs les plus anciens d'abord : ce sont les fins de trajet probablement oubliées.
  const saisies = enRoute
    ? reponse.enRoute.slice().sort((a, b) => a.dateSaisie.localeCompare(b.dateSaisie))
    : reponse.saisies;
  const total = enRoute ? saisies.length : reponse.total;

  vueAdmin.querySelectorAll('[data-tuile]').forEach((t) => t.classList.toggle('actif', t.dataset.tuile === filtreTuile));
  const debut = enRoute || !total ? 1 : (reponse.page - 1) * reponse.parPage + 1;
  const fin = enRoute ? total : debut + saisies.length - 1;
  $('bandeauFiltre').innerHTML =
    '<span>' + icone('i-list') + echapper(LIBELLES_TUILE[filtreTuile]) +
    (total ? ' · <strong>' + debut + '-' + fin + '</strong> sur <strong>' + total + '</strong>' : '') + '</span>' +
    (filtreTuile === 'tous' && !$('fRecherche').value ? '' : '<button type="button" id="btnEffacerFiltre">Tout afficher</button>');
  if ($('btnEffacerFiltre')) $('btnEffacerFiltre').onclick = () => choisirTuile('tous');
  if (enRoute) afficherReglageSeuil();

  // Les saisies d'une même journée sont regroupées sous un titre de date.
  const groupes = [];
  for (const s of saisies) {
    const jour = s.dateSaisie.slice(0, 10);
    if (!groupes.length || groupes[groupes.length - 1].jour !== jour) groupes.push({ jour, saisies: [] });
    groupes[groupes.length - 1].saisies.push(s);
  }
  const liste = $('listeSaisiesAdmin');
  liste.innerHTML = groupes.map((g) =>
    '<section class="groupe-jour"><h3>' + echapper(libelleJour(g.jour)) + '<span>' + g.saisies.length + '</span></h3>' +
    '<ul class="liste-saisies">' + g.saisies.map((s) => carteSaisie(s, saisies.indexOf(s))).join('') + '</ul></section>'
  ).join('') || '<div class="carte etat-vide">' + icone('i-search') + '<p class="aide">Aucune saisie ne correspond.</p></div>';

  liste.querySelectorAll('.saisie-admin').forEach((carte) => {
    carte.onclick = () => ouvrirFicheSaisie(saisies[Number(carte.dataset.index)]);
  });
  dessinerPagination(enRoute ? 1 : reponse.pages);
  $('btnExporter').classList.toggle('hidden', enRoute || !total);
  observerMiniatures();
}

function carteSaisie(s, index) {
  const fin = s.typeTrajet === 'Fin du trajet';
  return '<li><button type="button" class="carte saisie-admin" data-index="' + index + '">' +
    '<span class="miniature"' + (s.photoId ? ' data-photo="' + echapper(s.photoId) + '"' : '') + '>' +
    (s.photoId ? icone('i-camera') : '<small>Sans photo</small>') + '</span>' +
    '<span class="saisie-corps">' +
    '<span class="saisie-entete"><span class="badge ' + (fin ? 'fin' : 'debut') + '">' + icone(fin ? 'i-flag' : 'i-start') + echapper(fin ? 'Fin' : s.typeTrajet ? 'Début' : 'Sans type') + '</span>' +
    '<small class="heure">' + echapper(s.dateSaisie.slice(11, 16)) + '</small></span>' +
    '<strong>' + echapper(s.vehicule) + '</strong>' +
    '<span class="ligne-info">' + icone('i-user') + echapper(s.conducteur) + '</span>' +
    '<span class="ligne-info">' + icone('i-pin') + echapper(s.destination) + '</span>' +
    '<span class="puces"><span class="puce">' + icone('i-gauge') + echapper(Number(s.kilometrage).toLocaleString('fr-FR')) + ' km</span>' +
    '<span class="puce">' + icone('i-fuel') + echapper(s.carburant) + '</span>' +
    (s.commentaire ? '<span class="puce alerte">' + icone('i-alert') + 'Commentaire</span>' : '') + '</span>' +
    (estEnRoute(s) ? puceDuree(s) : '') +
    '</span></button></li>';
}

function dessinerPagination(pages) {
  const nav = $('paginationDonnees');
  if (pages <= 1) {
    nav.classList.add('hidden');
    return;
  }
  // Pages affichées : la première, la dernière, et deux de chaque côté de la page courante.
  const numeros = [];
  for (let p = 1; p <= pages; p++) {
    if (p === 1 || p === pages || Math.abs(p - pageDonnees) <= 2) numeros.push(p);
    else if (numeros[numeros.length - 1] !== '…') numeros.push('…');
  }
  nav.innerHTML =
    '<button type="button" data-page="' + (pageDonnees - 1) + '"' + (pageDonnees === 1 ? ' disabled' : '') + ' aria-label="Page précédente">‹</button>' +
    numeros.map((p) => p === '…'
      ? '<span>…</span>'
      : '<button type="button" data-page="' + p + '"' + (p === pageDonnees ? ' class="actif" aria-current="page"' : '') + '>' + p + '</button>').join('') +
    '<button type="button" data-page="' + (pageDonnees + 1) + '"' + (pageDonnees === pages ? ' disabled' : '') + ' aria-label="Page suivante">›</button>';
  nav.classList.remove('hidden');
  nav.querySelectorAll('button[data-page]').forEach((b) => {
    b.onclick = () => {
      pageDonnees = Number(b.dataset.page);
      chargerSaisies();
      vueAdmin.scrollIntoView({ behavior: 'smooth' });
    };
  });
}

// ExcelJS pèse environ 1 Mo : il n'est téléchargé qu'au premier export, jamais pour les conducteurs.
let chargementExcel = null;

function chargerScript(adresse) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = adresse;
    script.onload = resolve;
    script.onerror = () => reject(new Error('module Excel introuvable, vérifiez la connexion'));
    document.head.appendChild(script);
  });
}

function chargerModuleExcel() {
  if (!chargementExcel) {
    chargementExcel = chargerScript('lib/exceljs.min.js').then(() => chargerScript('export-excel.js'));
    chargementExcel.catch(() => { chargementExcel = null; });
  }
  return chargementExcel;
}

async function exporterExcel() {
  if (!navigator.onLine) return afficherMessage("Pas de connexion Internet : l'export est impossible.");
  const bouton = $('btnExporter');
  bouton.disabled = true;
  changerTexteBouton(bouton, 'Préparation du fichier Excel...');
  try {
    const criteres = criteresDonnees();
    const [reponse] = await Promise.all([
      appelAdmin('admin.saisies', { ...criteres, export: true }),
      chargerModuleExcel()
    ]);
    const contenu = await construireClasseurExcel(reponse.saisies, criteres, session.nom);
    const lien = document.createElement('a');
    lien.href = URL.createObjectURL(new Blob([contenu], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    lien.download = 'daily-vehicle-log_' + dateDuJour() + '.xlsx';
    lien.click();
    setTimeout(() => URL.revokeObjectURL(lien.href), 5000);
    afficherMessage(reponse.saisies.length + ' saisie(s) exportée(s) dans le fichier Excel.', 'success');
  } catch (err) {
    afficherMessage('Export impossible : ' + err.message);
  } finally {
    bouton.disabled = false;
    changerTexteBouton(bouton, 'Exporter en Excel');
  }
}

// ---------- Alerte : véhicules en route depuis trop longtemps ----------

function minutesDepuis(dateSaisie) {
  // Sans heure serveur (script pas encore à jour), l'heure du téléphone sert de repli.
  const maintenant = derniereReponseDonnees.maintenant;
  const reference = maintenant ? new Date(maintenant.replace(' ', 'T')) : new Date();
  return Math.max(0, Math.round((reference - new Date(dateSaisie.replace(' ', 'T'))) / 60000));
}

function libelleDuree(minutes) {
  if (minutes < 60) return minutes + ' min';
  const heures = Math.floor(minutes / 60);
  if (heures < 48) return heures + ' h ' + String(minutes % 60).padStart(2, '0');
  return Math.floor(heures / 24) + ' j ' + (heures % 24) + ' h';
}

function estEnRoute(s) {
  return !!derniereReponseDonnees && derniereReponseDonnees.enRoute.some((e) => e.id === s.id);
}

function enAlerte(s) {
  return estEnRoute(s) && minutesDepuis(s.dateSaisie) >= derniereReponseDonnees.seuilAlerteHeures * 60;
}

function puceDuree(s) {
  const alerte = enAlerte(s);
  return '<span class="duree-route' + (alerte ? ' alerte' : '') + '">' + icone(alerte ? 'i-alert' : 'i-clock') +
    'En route depuis ' + libelleDuree(minutesDepuis(s.dateSaisie)) +
    (alerte ? ' · fin de trajet oubliée ?' : '') + '</span>';
}

function afficherAlerteTuile() {
  const nombre = derniereReponseDonnees.enRoute.filter(enAlerte).length;
  const tuile = vueAdmin.querySelector('[data-tuile="enRoute"]');
  tuile.classList.toggle('alerte', nombre > 0);
  $('indAlerte').innerHTML = nombre
    ? icone('i-alert') + nombre + ' depuis + de ' + derniereReponseDonnees.seuilAlerteHeures + ' h'
    : '';
  $('indAlerte').classList.toggle('hidden', nombre === 0);
}

function afficherReglageSeuil() {
  const seuil = derniereReponseDonnees.seuilAlerteHeures;
  const choix = [4, 6, 8, 12, 24, 48, 72];
  if (!choix.includes(seuil)) choix.push(seuil);
  $('bandeauFiltre').insertAdjacentHTML('afterend',
    '<div class="reglage-seuil" id="reglageSeuil">' + icone('i-alert') +
    '<label for="selectSeuil">Alerte orange après</label>' +
    '<select id="selectSeuil">' + choix.sort((a, b) => a - b).map((h) =>
      '<option value="' + h + '"' + (h === seuil ? ' selected' : '') + '>' + h + ' h</option>').join('') + '</select></div>');
  $('selectSeuil').onchange = async () => {
    const select = $('selectSeuil');
    select.disabled = true;
    try {
      const reponse = await appelAdmin('admin.seuil', { heures: Number(select.value) });
      derniereReponseDonnees.seuilAlerteHeures = reponse.seuilAlerteHeures;
      afficherAlerteTuile();
      dessinerSaisies();
      afficherMessage("Seuil d'alerte réglé sur " + reponse.seuilAlerteHeures + ' h pour tous les admins.', 'success');
    } catch (err) {
      afficherMessage('Réglage impossible : ' + err.message);
      select.value = String(derniereReponseDonnees.seuilAlerteHeures);
    } finally {
      if ($('selectSeuil')) $('selectSeuil').disabled = false;
    }
  };
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
    (estEnRoute(s) ? ligne('En route depuis', libelleDuree(minutesDepuis(s.dateSaisie)) + (enAlerte(s) ? ' (fin de trajet probablement oubliée)' : '')) : '') +
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
