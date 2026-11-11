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

async function ouvrirDonnees() {
  if (!navigator.onLine) return afficherHorsLigne();
  afficherChargement();
  try {
    await chargerReferentiels();
  } catch (err) {
    return afficherErreurChargement(err, ouvrirDonnees);
  }
  if (vueActive !== 'donnees') return;
  const options = (valeurs) => valeurs.map((v) => '<option>' + echapper(v) + '</option>').join('');
  vueAdmin.innerHTML =
    '<div class="indicateurs">' +
    '<div class="indicateur"><small>Saisies aujourd\'hui</small><strong id="indAujourdhui">-</strong></div>' +
    '<div class="indicateur"><small>Véhicules en route</small><strong id="indEnRoute">-</strong></div>' +
    '<div class="indicateur"><small>Résultats du filtre</small><strong id="indTotal">-</strong></div>' +
    '</div>' +
    '<div class="carte" id="carteEnRoute"></div>' +
    '<details class="carte filtres"><summary>' + icone('i-search') + 'Filtrer les saisies</summary>' +
    '<div class="grille-filtres">' +
    '<label>Du<input type="date" id="fDu"></label><label>Au<input type="date" id="fAu"></label>' +
    '<label>Véhicule<select id="fVehicule"><option value="">Tous</option>' + options(adminVehicules.map((v) => v.nom)) + '</select></label>' +
    '<label>Conducteur<select id="fConducteur"><option value="">Tous</option>' + options(adminConducteurs.map((c) => c.nom).sort((a, b) => a.localeCompare(b, 'fr'))) + '</select></label>' +
    '<label>Type<select id="fType"><option value="">Tous</option><option>Début du trajet</option><option>Fin du trajet</option></select></label>' +
    '</div><button type="button" class="bouton-principal" id="btnFiltrer">Appliquer</button></details>' +
    '<ul class="liste-saisies" id="listeSaisiesAdmin"></ul>';
  $('btnFiltrer').onclick = chargerSaisies;
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

  $('indAujourdhui').textContent = reponse.aujourdhui;
  $('indEnRoute').textContent = reponse.enRoute.length;
  $('indTotal').textContent = reponse.total;
  $('carteEnRoute').innerHTML =
    '<div class="carte-titre">' + icone('i-start') + '<h2>Véhicules en route</h2></div>' +
    (reponse.enRoute.length
      ? '<ul class="liste-simple">' + reponse.enRoute.map((s) =>
        '<li><strong>' + echapper(s.vehicule) + '</strong><small>' + echapper(s.conducteur) + ' · vers ' + echapper(s.destination) +
        ' · parti le ' + echapper(s.dateSaisie.slice(0, 16)) + ' à ' + echapper(s.kilometrage) + ' km</small></li>').join('') + '</ul>'
      : '<p class="aide">Aucun véhicule en route.</p>');

  liste.innerHTML = reponse.saisies.map((s) =>
    '<li class="carte saisie-admin">' +
    '<div class="saisie-entete"><span class="badge ' + (s.typeTrajet === 'Fin du trajet' ? 'fin' : 'debut') + '">' + echapper(s.typeTrajet || 'Sans type') + '</span>' +
    '<small>' + echapper(s.dateSaisie.slice(0, 16)) + '</small></div>' +
    '<strong>' + echapper(s.vehicule) + '</strong>' +
    '<dl>' +
    '<dt>Conducteur</dt><dd>' + echapper(s.conducteur) + '</dd>' +
    '<dt>Kilométrage</dt><dd>' + echapper(s.kilometrage) + ' km</dd>' +
    '<dt>Destination</dt><dd>' + echapper(s.destination) + '</dd>' +
    '<dt>Carburant</dt><dd>' + echapper(s.carburant) + '</dd>' +
    (s.commentaire ? '<dt>Commentaire</dt><dd>' + echapper(s.commentaire) + '</dd>' : '') +
    '</dl>' +
    (s.photo && s.photo.startsWith('https://') ? '<a class="lien-photo" href="' + echapper(s.photo) + '" target="_blank" rel="noopener">' + icone('i-camera') + 'Voir la photo</a>' : '') +
    '</li>'
  ).join('') || '<li class="carte etat-vide"><p class="aide">Aucune saisie pour ce filtre.</p></li>';
  if (reponse.total > reponse.saisies.length) {
    liste.insertAdjacentHTML('beforeend', '<li class="aide">Les ' + reponse.saisies.length + ' plus récentes sur ' + reponse.total + ' sont affichées. Resserrez le filtre pour voir les autres.</li>');
  }
}
