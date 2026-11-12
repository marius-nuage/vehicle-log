// Classeur Excel des saisies, construit sur le téléphone de l'admin : rien ne reste stocké ailleurs.
// Chargé seulement au moment de l'export, avec ExcelJS (environ 1 Mo), pour ne pas alourdir l'application.

const COULEURS_EXCEL = {
  bleuFonce: 'FF2B5CAD',
  bleu: 'FF3A78D6',
  bleuClair: 'FFE8F0FB',
  ligneAlternee: 'FFF6F9FD',
  bordure: 'FFD3E0F0',
  texte: 'FF1F2A3D',
  texteDoux: 'FF5D6B82',
  vertClair: 'FFE6F4EA',
  vert: 'FF1E7B34',
  orangeClair: 'FFFDF1DF',
  orange: 'FFC77700',
  blanc: 'FFFFFFFF'
};

const POLICE_EXCEL = 'Calibri';

function remplissage(couleur) {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: couleur } };
}

function bordureFine(couleur = COULEURS_EXCEL.bordure) {
  const trait = { style: 'thin', color: { argb: couleur } };
  return { top: trait, left: trait, bottom: trait, right: trait };
}

// Le script envoie « AAAA-MM-JJ HH:MM:SS » à l'heure de Bangui. ExcelJS écrit les dates en UTC :
// passer par Date.UTC garde l'heure affichée identique à celle de la feuille.
function dateExcel(texte) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(texte || '');
  return m ? new Date(Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0))) : null;
}

function dateFrancaise(texte) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(texte || '');
  return m ? m[3] + '/' + m[2] + '/' + m[1] : '';
}

function decrireFiltres(criteres) {
  const morceaux = [];
  if (criteres.vehicule) morceaux.push('véhicule ' + criteres.vehicule);
  if (criteres.conducteur) morceaux.push('conducteur ' + criteres.conducteur);
  if (criteres.typeTrajet) morceaux.push(criteres.typeTrajet.toLowerCase());
  if (criteres.recherche) morceaux.push('recherche « ' + criteres.recherche + ' »');
  return morceaux.length ? morceaux.join(', ') : 'aucun';
}

function decrirePeriode(criteres, saisies) {
  const dates = saisies.map((s) => s.dateSaisie).filter(Boolean).sort();
  const debut = criteres.du || (dates[0] || '').slice(0, 10);
  const fin = criteres.au || (dates[dates.length - 1] || '').slice(0, 10);
  if (!debut && !fin) return 'aucune saisie';
  if (debut === fin) return 'le ' + dateFrancaise(debut);
  return 'du ' + dateFrancaise(debut) + ' au ' + dateFrancaise(fin);
}

// Bandeau de titre commun aux deux feuilles : nom de l'application, titre de la feuille, contexte de l'export.
function ecrireBandeau(feuille, nbColonnes, titre, contexte) {
  const lignes = [
    ['UNOPS Bangui · Daily Vehicle Log', { size: 16, bold: true, color: { argb: COULEURS_EXCEL.blanc } }, COULEURS_EXCEL.bleuFonce, 30],
    [titre, { size: 12, bold: true, color: { argb: COULEURS_EXCEL.bleuFonce } }, COULEURS_EXCEL.bleuClair, 22],
    [contexte, { size: 9, italic: true, color: { argb: COULEURS_EXCEL.texteDoux } }, null, 18]
  ];
  lignes.forEach(([texte, police, fond, hauteur], i) => {
    const numero = i + 1;
    feuille.mergeCells(numero, 1, numero, nbColonnes);
    const cellule = feuille.getCell(numero, 1);
    cellule.value = texte;
    cellule.font = { name: POLICE_EXCEL, ...police };
    cellule.alignment = { vertical: 'middle', indent: 1 };
    if (fond) cellule.fill = remplissage(fond);
    feuille.getRow(numero).height = hauteur;
  });
  feuille.getRow(4).height = 8;
}

function styliserEntete(ligne) {
  ligne.height = 30;
  ligne.eachCell((cellule) => {
    cellule.font = { name: POLICE_EXCEL, bold: true, size: 10, color: { argb: COULEURS_EXCEL.blanc } };
    cellule.fill = remplissage(COULEURS_EXCEL.bleu);
    cellule.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cellule.border = bordureFine(COULEURS_EXCEL.bleu);
  });
}

function styliserLigne(ligne, alternee) {
  ligne.eachCell({ includeEmpty: true }, (cellule) => {
    cellule.font = { name: POLICE_EXCEL, size: 10, color: { argb: COULEURS_EXCEL.texte }, ...(cellule.font || {}) };
    cellule.border = bordureFine();
    if (alternee && !cellule.fill) cellule.fill = remplissage(COULEURS_EXCEL.ligneAlternee);
    // Un retrait d'un caractère évite que les textes et les nombres collent aux bordures.
    const alignement = cellule.alignment || {};
    const retrait = alignement.horizontal === 'center' ? {} : { indent: 1 };
    cellule.alignment = { vertical: 'middle', wrapText: true, ...retrait, ...alignement };
  });
}

function styliserTotal(ligne) {
  ligne.height = 22;
  ligne.eachCell({ includeEmpty: true }, (cellule) => {
    cellule.font = { name: POLICE_EXCEL, bold: true, size: 10, color: { argb: COULEURS_EXCEL.bleuFonce } };
    cellule.fill = remplissage(COULEURS_EXCEL.bleuClair);
    cellule.border = { ...bordureFine(), top: { style: 'medium', color: { argb: COULEURS_EXCEL.bleuFonce } } };
    cellule.alignment = { vertical: 'middle', ...(cellule.alignment || {}) };
  });
}

// Sans ligne d'en-tête à répéter, la feuille tient sur une seule page (cas de la synthèse).
function miseEnPage(feuille, ligneEntete) {
  feuille.pageSetup = {
    paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: ligneEntete ? 0 : 1,
    horizontalCentered: true, ...(ligneEntete ? { printTitlesRow: ligneEntete + ':' + ligneEntete } : {}),
    margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 }
  };
  feuille.headerFooter = {
    oddHeader: '&L&8UNOPS Bangui · Daily Vehicle Log&R&8&A',
    oddFooter: '&L&8Document interne&R&8Page &P / &N'
  };
}

// ---------- Feuille « Saisies » ----------

function feuilleSaisies(classeur, saisies, contexte) {
  const colonnes = [
    { titre: 'N°', largeur: 6 },
    { titre: 'Date', largeur: 12 },
    { titre: 'Heure', largeur: 8 },
    { titre: 'Type de trajet', largeur: 15 },
    { titre: 'Véhicule', largeur: 28 },
    { titre: 'Conducteur', largeur: 24 },
    { titre: 'Kilométrage (km)', largeur: 13 },
    { titre: 'Destination', largeur: 26 },
    { titre: 'Carburant', largeur: 12 },
    { titre: 'Commentaire', largeur: 34 },
    { titre: 'Photo', largeur: 11 },
    { titre: 'Reçu le', largeur: 16 },
    { titre: 'ID saisie', largeur: 14 }
  ];
  const feuille = classeur.addWorksheet('Saisies', {
    views: [{ state: 'frozen', ySplit: 5, showGridLines: false }],
    properties: { tabColor: { argb: COULEURS_EXCEL.bleu } }
  });
  colonnes.forEach((c, i) => { feuille.getColumn(i + 1).width = c.largeur; });
  ecrireBandeau(feuille, colonnes.length, 'Journal des déplacements', contexte);

  const entete = feuille.getRow(5);
  colonnes.forEach((c, i) => { entete.getCell(i + 1).value = c.titre; });
  styliserEntete(entete);

  saisies.forEach((s, i) => {
    const date = dateExcel(s.dateSaisie);
    const ligne = feuille.getRow(6 + i);
    ligne.values = [
      i + 1, date, date, s.typeTrajet, s.vehicule, s.conducteur,
      Number(s.kilometrage) || null, s.destination, s.carburant, s.commentaire,
      s.photo ? { text: 'Voir la photo', hyperlink: s.photo } : '',
      dateExcel(s.dateReception), s.id
    ];
    ligne.getCell(1).alignment = { horizontal: 'center' };
    ligne.getCell(1).font = { color: { argb: COULEURS_EXCEL.texteDoux } };
    ligne.getCell(2).numFmt = 'dd/mm/yyyy';
    ligne.getCell(2).alignment = { horizontal: 'center' };
    ligne.getCell(3).numFmt = 'hh:mm';
    ligne.getCell(3).alignment = { horizontal: 'center' };
    ligne.getCell(7).numFmt = '#,##0';
    ligne.getCell(7).alignment = { horizontal: 'right' };
    ligne.getCell(9).alignment = { horizontal: 'center' };
    ligne.getCell(12).numFmt = 'dd/mm/yyyy hh:mm';
    ligne.getCell(12).alignment = { horizontal: 'center' };
    ligne.getCell(12).font = { color: { argb: COULEURS_EXCEL.texteDoux } };
    ligne.getCell(13).font = { size: 8, color: { argb: COULEURS_EXCEL.texteDoux } };

    const debut = s.typeTrajet === 'Début du trajet';
    const type = ligne.getCell(4);
    type.fill = remplissage(debut ? COULEURS_EXCEL.vertClair : COULEURS_EXCEL.bleuClair);
    type.font = { bold: true, color: { argb: debut ? COULEURS_EXCEL.vert : COULEURS_EXCEL.bleuFonce } };
    type.alignment = { horizontal: 'center' };
    if (s.photo) ligne.getCell(11).font = { underline: true, color: { argb: COULEURS_EXCEL.bleu } };
    ligne.getCell(11).alignment = { horizontal: 'center' };
    styliserLigne(ligne, i % 2 === 1);
  });

  const derniere = 5 + saisies.length;
  const total = feuille.getRow(derniere + 1);
  total.getCell(1).value = 'Total';
  total.getCell(4).value = saisies.length + (saisies.length > 1 ? ' saisies' : ' saisie');
  feuille.mergeCells(derniere + 1, 1, derniere + 1, 3);
  total.getCell(1).alignment = { horizontal: 'center' };
  total.getCell(4).alignment = { horizontal: 'center' };
  for (let c = 1; c <= colonnes.length; c++) total.getCell(c);
  styliserTotal(total);

  if (saisies.length) feuille.autoFilter = { from: { row: 5, column: 1 }, to: { row: derniere, column: colonnes.length } };
  miseEnPage(feuille, 5);
}

// ---------- Feuille « Synthèse » ----------

function regrouper(saisies, cle) {
  const groupes = new Map();
  for (const s of saisies) {
    if (!groupes.has(s[cle])) groupes.set(s[cle], []);
    groupes.get(s[cle]).push(s);
  }
  return [...groupes.entries()].sort((a, b) => a[0].localeCompare(b[0], 'fr'));
}

function ecrireTableau(feuille, ligneDepart, titre, colonnes, lignes, total) {
  const titreCellule = feuille.getCell(ligneDepart, 1);
  titreCellule.value = titre;
  titreCellule.font = { name: POLICE_EXCEL, size: 12, bold: true, color: { argb: COULEURS_EXCEL.bleuFonce } };
  feuille.getRow(ligneDepart).height = 22;

  const entete = feuille.getRow(ligneDepart + 1);
  colonnes.forEach((c, i) => { entete.getCell(i + 1).value = c.titre; });
  styliserEntete(entete);

  lignes.forEach((valeurs, i) => {
    const ligne = feuille.getRow(ligneDepart + 2 + i);
    ligne.values = valeurs;
    colonnes.forEach((c, j) => {
      const cellule = ligne.getCell(j + 1);
      if (c.format) cellule.numFmt = c.format;
      if (c.aligner) cellule.alignment = { horizontal: c.aligner };
    });
    styliserLigne(ligne, i % 2 === 1);
  });

  const numeroTotal = ligneDepart + 2 + lignes.length;
  const ligneTotal = feuille.getRow(numeroTotal);
  ligneTotal.values = total(ligneDepart + 2, numeroTotal - 1);
  colonnes.forEach((c, j) => {
    const cellule = ligneTotal.getCell(j + 1);
    if (c.format) cellule.numFmt = c.format;
    if (c.aligner) cellule.alignment = { horizontal: c.aligner };
  });
  styliserTotal(ligneTotal);
  return numeroTotal;
}

function feuilleSynthese(classeur, saisies, contexte, periode, idBanniere) {
  const feuille = classeur.addWorksheet('Synthèse', {
    views: [{ showGridLines: false }],
    properties: { tabColor: { argb: COULEURS_EXCEL.bleuFonce } }
  });
  [30, 14, 12, 12, 16, 16, 16, 26, 18].forEach((largeur, i) => { feuille.getColumn(i + 1).width = largeur; });
  ecrireBandeau(feuille, 9, 'Synthèse ' + periode, contexte);

  // Chiffres principaux à gauche, bannière à droite.
  const vehicules = regrouper(saisies, 'vehicule');
  const conducteurs = regrouper(saisies, 'conducteur');
  const chiffres = [
    ['Saisies', saisies.length],
    ['Débuts de trajet', saisies.filter((s) => s.typeTrajet === 'Début du trajet').length],
    ['Fins de trajet', saisies.filter((s) => s.typeTrajet === 'Fin du trajet').length],
    ['Véhicules utilisés', vehicules.length],
    ['Conducteurs', conducteurs.length],
    ['Saisies avec photo', saisies.filter((s) => s.photo).length]
  ];
  chiffres.forEach(([libelle, valeur], i) => {
    const ligne = feuille.getRow(6 + i);
    ligne.height = 20;
    const a = ligne.getCell(1);
    const b = ligne.getCell(2);
    a.value = libelle;
    b.value = valeur;
    a.font = { name: POLICE_EXCEL, size: 10, color: { argb: COULEURS_EXCEL.texteDoux } };
    b.font = { name: POLICE_EXCEL, size: 12, bold: true, color: { argb: COULEURS_EXCEL.bleuFonce } };
    b.alignment = { horizontal: 'right' };
    a.border = { bottom: { style: 'thin', color: { argb: COULEURS_EXCEL.bordure } } };
    b.border = a.border;
  });
  if (idBanniere !== null) {
    feuille.addImage(idBanniere, { tl: { col: 4.2, row: 5.1 }, ext: { width: 400, height: 128 } });
  }

  // Le kilométrage d'un véhicule « Autre » mélange plusieurs véhicules : sa distance n'aurait pas de sens.
  const lignesVehicules = vehicules.map(([vehicule, liste]) => {
    const releves = liste.map((s) => Number(s.kilometrage)).filter((k) => k > 0);
    const derniere = liste.slice().sort((a, b) => b.dateSaisie.localeCompare(a.dateSaisie))[0];
    const autre = vehicule === 'Autre (à préciser en commentaire)' || !releves.length;
    return [
      vehicule, liste.length,
      liste.filter((s) => s.typeTrajet === 'Début du trajet').length,
      liste.filter((s) => s.typeTrajet === 'Fin du trajet').length,
      autre ? null : Math.min(...releves),
      autre ? null : Math.max(...releves),
      null,
      derniere.conducteur,
      dateExcel(derniere.dateSaisie)
    ];
  });
  const colonnesVehicules = [
    { titre: 'Véhicule' },
    { titre: 'Saisies', aligner: 'center' },
    { titre: 'Débuts', aligner: 'center' },
    { titre: 'Fins', aligner: 'center' },
    { titre: 'Premier relevé (km)', format: '#,##0', aligner: 'right' },
    { titre: 'Dernier relevé (km)', format: '#,##0', aligner: 'right' },
    { titre: 'Distance relevée (km)', format: '#,##0', aligner: 'right' },
    { titre: 'Dernier conducteur' },
    { titre: 'Dernière saisie', format: 'dd/mm/yyyy hh:mm', aligner: 'center' }
  ];
  const debutVehicules = 6 + chiffres.length + 2;
  const finVehicules = ecrireTableau(feuille, debutVehicules, 'Par véhicule', colonnesVehicules, lignesVehicules,
    (premiere, derniere) => [
      'Total', { formula: 'SUM(B' + premiere + ':B' + derniere + ')' },
      { formula: 'SUM(C' + premiere + ':C' + derniere + ')' }, { formula: 'SUM(D' + premiere + ':D' + derniere + ')' },
      null, null, { formula: 'SUM(G' + premiere + ':G' + derniere + ')' }, null, null
    ]);
  // La distance est une formule : un admin qui corrige un relevé dans le fichier voit le total suivre.
  lignesVehicules.forEach((valeurs, i) => {
    const numero = debutVehicules + 2 + i;
    if (valeurs[4] !== null) feuille.getCell(numero, 7).value = { formula: 'F' + numero + '-E' + numero };
    else feuille.getCell(numero, 7).value = '—';
  });

  const lignesConducteurs = conducteurs.map(([conducteur, liste]) => {
    const derniere = liste.slice().sort((a, b) => b.dateSaisie.localeCompare(a.dateSaisie))[0];
    const vehiculesUtilises = new Set(liste.map((s) => s.vehicule));
    return [
      conducteur, liste.length,
      liste.filter((s) => s.typeTrajet === 'Début du trajet').length,
      liste.filter((s) => s.typeTrajet === 'Fin du trajet').length,
      vehiculesUtilises.size, null, null,
      [...vehiculesUtilises].sort((a, b) => a.localeCompare(b, 'fr')).join(', '),
      dateExcel(derniere.dateSaisie)
    ];
  });
  const colonnesConducteurs = [
    { titre: 'Conducteur' },
    { titre: 'Saisies', aligner: 'center' },
    { titre: 'Débuts', aligner: 'center' },
    { titre: 'Fins', aligner: 'center' },
    { titre: 'Véhicules', aligner: 'center' },
    { titre: '' },
    { titre: '' },
    { titre: 'Véhicules utilisés' },
    { titre: 'Dernière saisie', format: 'dd/mm/yyyy hh:mm', aligner: 'center' }
  ];
  const debutConducteurs = finVehicules + 3;
  const finConducteurs = ecrireTableau(feuille, debutConducteurs, 'Par conducteur', colonnesConducteurs, lignesConducteurs,
    (premiere, derniere) => [
      'Total', { formula: 'SUM(B' + premiere + ':B' + derniere + ')' },
      { formula: 'SUM(C' + premiere + ':C' + derniere + ')' }, { formula: 'SUM(D' + premiere + ':D' + derniere + ')' },
      null, null, null, null, null
    ]);
  // Les colonnes F et G servent au tableau des véhicules ; ici elles sont fusionnées avec la liste des véhicules.
  for (let n = debutConducteurs + 1; n <= finConducteurs; n++) feuille.mergeCells(n, 6, n, 8);
  feuille.getCell(debutConducteurs + 1, 6).value = 'Véhicules utilisés';
  for (let i = 0; i < lignesConducteurs.length; i++) {
    feuille.getCell(debutConducteurs + 2 + i, 6).value = lignesConducteurs[i][7];
  }

  const note = feuille.getCell(finConducteurs + 2, 1);
  note.value = 'Distance relevée : écart entre le plus petit et le plus grand kilométrage saisis sur la période. ' +
    'Elle n\'est pas calculée pour « Autre », qui regroupe plusieurs véhicules.';
  note.font = { name: POLICE_EXCEL, size: 8, italic: true, color: { argb: COULEURS_EXCEL.texteDoux } };
  feuille.mergeCells(finConducteurs + 2, 1, finConducteurs + 2, 9);
  miseEnPage(feuille, null);
}

async function chargerBanniereExcel(classeur) {
  try {
    const octets = await fetch('banniere-excel.jpg').then((r) => r.arrayBuffer());
    return classeur.addImage({ buffer: octets, extension: 'jpeg' });
  } catch (_) {
    // Sans la bannière, le classeur reste complet : seule l'image manque.
    return null;
  }
}

async function construireClasseurExcel(saisies, criteres, auteur) {
  const classeur = new ExcelJS.Workbook();
  classeur.creator = auteur;
  classeur.company = 'UNOPS Bangui';
  classeur.title = 'Daily Vehicle Log';
  classeur.created = new Date();

  const maintenant = new Date().toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).replace(' ', ' à ');
  const periode = decrirePeriode(criteres, saisies);
  const contexte = 'Période : ' + periode + ' · Filtres : ' + decrireFiltres(criteres) +
    ' · Exporté le ' + maintenant + ' par ' + auteur;

  const idBanniere = await chargerBanniereExcel(classeur);
  feuilleSynthese(classeur, saisies, contexte, periode, idBanniere);
  feuilleSaisies(classeur, saisies, contexte);
  return classeur.xlsx.writeBuffer();
}
