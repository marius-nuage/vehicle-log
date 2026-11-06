# Daily Vehicle Log - UNOPS Bangui

Application web installable (PWA) qui permet aux conducteurs du bureau UNOPS de Bangui d'enregistrer le suivi quotidien des véhicules sans connexion. Les saisies sont gardées sur le téléphone et envoyées à une feuille Google Sheets (via un script Apps Script) dès que le réseau revient.

## Installation

Aucune dépendance. Les fichiers sont publiés tels quels par GitHub Pages.

## Lancement

Ouvrir https://marius-nuage.github.io/vehicle-log/ dans Chrome sur Android, puis menu > « Installer l'application ».

Après chaque modification d'un fichier, augmenter `VERSION_CACHE` dans `sw.js` pour que les téléphones chargent la nouvelle version.
