# Pyramid PDF — éditeur PDF de Félix

Logiciel Windows autonome (Electron) + version web, pour lire et modifier des PDF.
Félix parle français : répondre en français, avec beaucoup d'emojis, réponses visuelles et structurées
(titres avec emoji, listes à cocher, tableaux seulement si utiles), sans conseils non demandés.

## 📁 Structure
Dossier du projet sur le PC : `C:\Users\felix\Desktop\Claude\Pyramid` (code dans `Pyramid-code`, installateur à côté).

- `web/index.html` — **source principale** (≈3 100 lignes, tout dans un seul fichier : CSS + HTML + une IIFE JS).
  C'est le seul fichier à modifier pour l'interface et les fonctions.
- `windows/` — l'appli Electron 33
  - `main.js` — processus principal (fenêtre, titleBarOverlay, IPC : save, open-file, titlebar, ready, html2pdf, printers, print, tsa)
  - `preload.js` — expose `window.native` (save, onOpenFile, setTitleBar, ready, html2pdf, print, printers, tsa, platform)
  - `make-app.py` — transforme `web/index.html` en `windows/app/index.html` (retire les CDN, ajoute CSP + fonts.css, chemins locaux des libs)
  - `make-fonts.py` — génère `app/fonts.css` + `app/fonts/` (woff2 latin + latin-ext) depuis les paquets @fontsource
  - `afterPack.js` — met l'icône et les infos de version dans l'exe (resedit)
  - `app/lib/` — pdf.js 3.11.174 (+ worker), pdf-lib 1.17.1, node-forge 1.3.1, mammoth, xlsx, pako, UTIF
  - `build/icon.png`, `build/icon.ico`
- `tests/` — `full.py` (59 tests web, Playwright Python), `e6.js` (détection du texte dans Electron),
  `e7.js` / `e9.js` (molette + impression), `tstart.js` (temps de démarrage), `docs/` (PDF de test).
  Les chemins dans les tests pointent encore vers l'ancien espace Linux (`/home/claude/...`, `/tmp/t/...`) : à adapter.

## 🔁 Synchronisation
- Le dossier `Pyramid-code` du PC et le dépôt GitHub **Fefe-Kurylen/Pyramid** contiennent les mêmes fichiers : toute modification est faite aux deux endroits en même temps, et les fichiers obsolètes sont supprimés des deux côtés.
- GitHub sert uniquement de stockage du code.

## 🔨 Construire / installer
```
cd windows
npm install
python make-fonts.py      # une seule fois (polices)
python make-app.py        # après chaque modification de web/index.html
npm run dist              # → dist/Pyramid-PDF-Installation-X.Y.Z.exe + Pyramid-PDF-Portable-X.Y.Z.exe
```
Installation actuelle sur le PC : `C:\Users\felix\AppData\Local\Programs\Pyramid`
(mise à jour rapide : remplacer `resources\app.asar` par `dist\win-unpacked\resources\app.asar`, Pyramid fermé).

## 🔄 Mises à jour
- Les mises à jour passeront par le **Microsoft Store** (en préparation : compte développeur, réservation du nom « Pyramid PDF », identifiants du paquet à recevoir de Félix, paquet MSIX à fabriquer sur Windows).
- L'ancien système electron-updater / GitHub Releases a été retiré (v1.2.0). GitHub sert uniquement de stockage.
- Version actuelle : 1.2.0. Le dossier de données reste `%APPDATA%\Pyramid` (`app.setPath('userData', …)` dans main.js) pour garder les réglages.

## 🧠 Fonctionnement clé
- **Modes** : `MODE = 'read' | 'edit'` (classe `reading` sur `<html>`). Le PDF s'ouvre en **lecteur** (pages continues,
  calque de texte sélectionnable, recherche) ; le bouton **Modifier** lance la détection et affiche les outils.
- **Onglets** : un état par onglet (pages, annots, cur, zoom, hist, fut, name, sel, lines, linesFor, hover, dirty, psel, rz).
- **Détection du texte** : `getLines` regroupe les items pdf.js en lignes ; cache clé `lkey(p) = p.id + '|' + rotation` ;
  `verifyEmb` (corrélation de pixels, rejette les polices intégrées remappées), `refineFont` / `inkScore` (comparaison
  visuelle avec polices fournies + système), table `EQ` (polices de factures / impôts / fiches de paie), `calcFit` (hs, ws, ls),
  `sampleColorsHi` (couleurs sur rendu haute résolution, délai max 10 s).
- **Annotations `tedit`** : ligne ou paragraphe (para, colW, lh, align), déplacement ox/oy, souligné/barré, mode police
  `fm` = emb | eq | nom de police.
- **Export** : pdf-lib, caches vectoriels (drawSvgPath), fusion AcroForm, option caviardage, signature PKCS#7 détachée
  (node-forge) + horodatage RFC 3161 (FreeTSA / DigiCert / Sectigo via IPC `tsa`).
- **Impression** : `printDoc()` ouvre une fenêtre avec aperçu des feuilles + réglages (imprimante, copies, assembler, pages,
  couleur/N&B, qualité 100/150/300 dpi, A4/A3/A5/Lettre, orientation, 1/2/4 pages par feuille, ajuster/taille réelle,
  recto verso). Réglages mémorisés dans localStorage `pyramid-print`. Impression silencieuse via IPC `print(pages, options)`. Aperçu net (canvas rendus selon la taille affichée × devicePixelRatio).
- **Réglages** (`SET`, localStorage `pyramid-settings`) : theme, accent, layout, density, icons (s/m/l/xl → `--uiz`),
  radius, thumbs, wheel. Défauts : Graphite, accent `#c8703f` (orange doux), Classique, Confortable.
- **Disposition Pro** : `placeRail()` déplace `#rbar`, `#tools` et `#pagebar` dans la barre d'icônes verticale `#rail` à gauche (bulles d'aide à droite).
- **Miniatures** : largeur réglable à la souris via `#sideGrip` (double-clic = défaut), mémorisée dans localStorage `pyramid-sidew` ; résolution des miniatures adaptée à la largeur (`thumbPx`).
- **Molette** : en lecture elle fait défiler (Ctrl + molette = zoom) ; en mode Modifier elle zoome (ou défile selon le réglage).
- **Débogage** : variable d'environnement `PYR_DEBUG=1` → `window.__pyr` (S, getLines, cur, TABS, refineFont, hiRes…).

## ✅ État actuel (17/11/2026)
Tout fonctionne : 58 tests web sur 59 OK. Le seul échec attendu : une police inconnue (Lora) reste en mode « emb »
au lieu d'une police équivalente.

## 📝 À faire
- [ ] Ajouter le lien de paiement **Stripe** (choix final de Félix : Payment Link « montant libre », Apple Pay + cartes) dans `SUPPORT_URL` (fenêtre « Soutenir Pyramid PDF ») quand Félix le donnera.
- [ ] Plus tard : système d'**abonnement** via Stripe (Stripe Billing + vérification de l'abonnement dans l'appli).
- [ ] Clarifier sa demande « signature électronique horodatée officielle sans obligatoirement… » (phrase coupée).
- [ ] Vérifier le temps d'ouverture de l'appli sur son PC après les optimisations (fenêtre affichée tout de suite,
      pdf-lib et forge chargés en `defer`, cache V8).
- [ ] Tester l'impression réelle sur son imprimante.
