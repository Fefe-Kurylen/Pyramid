# Pyramid PDF — éditeur PDF de Félix

Logiciel de lecture et modification de PDF : Windows et Mac (Electron), iPhone et Android (Capacitor), plus une version web.
Félix parle français : répondre en français, avec beaucoup d'emojis, réponses visuelles et structurées
(titres avec emoji, listes à cocher, tableaux seulement si utiles), sans conseils non demandés.

## 📁 Structure
Dossier du projet sur le PC : `C:\Users\felix\Desktop\Claude\Pyramid` (code dans `Pyramid-code`, installateur à côté).

- `web/index.html` — **source principale** (≈3 100 lignes, tout dans un seul fichier : CSS + HTML + une IIFE JS).
  C'est le seul fichier à modifier pour l'interface et les fonctions.
- `windows/` — l'appli Electron 33
  - `main.js` — processus principal (fenêtre, titleBarOverlay, IPC : save, open-file, titlebar, ready, html2pdf, printers, print, tsa, update-state/check/install, scan-start/stop)
  - `ocr/fra.traineddata.gz` — modèle Tesseract français (OCR hors ligne)
  - `scan.html` — page du téléphone pour « Scanner avec le téléphone » (photo, détection des bords, redressement, filtres Document/Couleur/Gris, envoi)
  - `preload.js` — expose `window.native` (save, onOpenFile, setTitleBar, ready, html2pdf, print, printers, tsa, onUpdate, updateState, checkUpdate, installUpdate, scanStart, scanStop, onScan, platform)
  - `make-app.py` — transforme `web/index.html` en `windows/app/index.html` (retire les CDN, ajoute CSP + fonts.css, chemins locaux des libs)
  - `make-fonts.py` — génère `app/fonts.css` + `app/fonts/` (woff2 latin + latin-ext) depuis les paquets @fontsource
  - `afterPack.js` — met l'icône et les infos de version dans l'exe (resedit)
  - `app/lib/` — pdf.js 3.11.174 (+ worker), pdf-lib 1.17.1, node-forge 1.3.1, mammoth, xlsx, pako, UTIF
  - `build/icon.png`, `build/icon.ico` — icône **pleine taille, sans marge** (sinon elle paraît plus petite que les autres dans la barre des tâches) ; ICO 16→256 px ; mêmes réglages pour `build/appx/Square44x44Logo*` et `StoreLogo*`
- `mobile/` — appli iPhone + Android (Capacitor 8)
  - `make-mobile.py` — construit `www/` à partir de `windows/app` (libs et polices locales) + `native-bridge.js`
  - `native-bridge.js` — définit `window.native` sur mobile : save (fichier + feuille de partage), printPdf, tsa, onOpenFile, version, `sub` (iPhone : status, buy, restore, manage, onChange)
  - `android/` — projet Android (module natif `PyramidNativePlugin.java` : impression, horodatage, « Ouvrir avec » / « Partager vers ») ; signature de publication via `keystore.properties` + `pyramid-upload.jks` (**jamais sur GitHub**, gardés dans `Clés-Android` sur le PC)
  - `ios/` — projet Xcode (Swift Package Manager ; `App/PyramidNative.swift` : impression AirPrint, horodatage, lecture des fichiers ouverts, abonnement StoreKit 2)
- `.github/workflows/ios.yml` — vérifie sur un Mac de GitHub que l'appli iPhone se compile et fabrique `Pyramid-PDF-iPhone-X.Y.Z.ipa` non signé (artifacts), à signer avec un identifiant Apple (Sideloadly / AltStore) ou le compte Apple Developer
- `.github/workflows/apple.yml` — Mac de GitHub : iPhone/iPad signé (signature automatique, clé App Store Connect) et envoyé sur App Store Connect ; Mac signé Developer ID + notarisé, ajouté à la publication GitHub. Secrets : `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8`, `APPLE_TEAM_ID`, `MAC_CERT_P12`, `MAC_CERT_PASSWORD`
- `.github/workflows/release.yml` — publie chaque nouvelle version sur GitHub (Releases) pour le bouton « Mise à jour », puis l'essaie (0.0.1 → nouvelle version)
- `.github/workflows/windows-store.yml` — fabrique le paquet Microsoft Store (`.appx`) sur un Windows de GitHub, le signe en test, l'installe, le lance, le désinstalle et passe la certification WACK (résultat PASS) ; le paquet est téléchargeable dans les « artifacts » du run
- `store/` — fiche Microsoft Store prête à copier (`FICHE-STORE.md`), captures 1920×1080, rapport WACK ; `store/apple/` : fiche App Store (`FICHE-APPSTORE.md`), captures iPhone 6,9" et iPad 13" (`captures.py`)
- `PRIVACY.md` — politique de confidentialité publique (URL demandée par le Store)
- `tests/` — `mobile.py` (37 tests, dont l'abonnement iPhone en écran de téléphone : Chromium Android + WebKit iPhone, faux Capacitor), `full.py` (59 tests web, Playwright Python), `e6.js` (détection du texte dans Electron),
  `e7.js` / `e9.js` (molette + impression), `e16.js` (bouton Mise à jour), `e19.js` + `scanner-node.js` (numériser depuis une imprimante), `e17.js` + `e17_phone.py` (scanner avec le téléphone : Android + iPhone), `e18.js` (OCR des pages scannées), `tstart.js` (temps de démarrage), `docs/` (PDF de test).
  Les chemins dans les tests pointent encore vers l'ancien espace Linux (`/home/claude/...`, `/tmp/t/...`) : à adapter.

## 🔁 Synchronisation
- Le dossier `Pyramid-code` du PC et le dépôt GitHub **Fefe-Kurylen/Pyramid** contiennent les mêmes fichiers : toute modification est faite aux deux endroits en même temps, et les fichiers obsolètes sont supprimés des deux côtés.
- GitHub stocke le code et publie les mises à jour (Releases).

## 🔨 Construire / installer
```
cd windows
npm install
python make-fonts.py      # une seule fois (polices)
python make-app.py        # après chaque modification de web/index.html
npm run dist              # → dist/Pyramid-PDF-Installation-X.Y.Z.exe + Pyramid-PDF-Portable-X.Y.Z.exe
```
Mac (depuis n'importe quel système) : `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npx electron-builder --mac`, puis signature ad hoc `rcodesign sign "dist/mac-arm64/Pyramid PDF.app"` (sans signature, macOS refuse de lancer l'appli sur Apple Silicon) ; publication : certificat Developer ID + notarisation (compte Apple Developer).

Mobile :
```
cd mobile
npm install
python make-mobile.py && npx cap sync
cd android && ./gradlew assembleRelease bundleRelease   # APK (installation directe) + AAB (Play Store)
# iPhone : ouvrir ios/App/App.xcodeproj dans Xcode sur un Mac (ou service en ligne type Codemagic), signer avec le compte Apple Developer
```

Installation actuelle sur le PC : `C:\Users\felix\AppData\Local\Programs\Pyramid`
(mise à jour rapide : remplacer `resources\app.asar` par `dist\win-unpacked\resources\app.asar`, Pyramid fermé).

## 🔄 Mises à jour
- **Bouton « Mise à jour » dans l'appli (GitHub)** depuis la 1.4.0 : `main.js` (electron-updater, dépôt public `Fefe-Kurylen/Pyramid`).
  - Version installée (Setup) : recherche 8 s après le lancement, toutes les 30 min et au retour sur la fenêtre (≥ 10 min) ; téléchargement en arrière-plan, puis bouton **« Mettre à jour (x.y.z) »** en haut (`#updBtn`) → redémarre et installe. Pendant le téléchargement : « Mise à jour x.y.z · 42 % ».
  - Portable et Mac : la nouvelle version est signalée (API GitHub), le bouton ouvre la page de téléchargement.
  - Version Microsoft Store (`process.windowsStore`) : rien, le Store s'en charge.
  - Réglages → « 🔄 Mises à jour » : version, état, « Rechercher maintenant ».
- **Publier une nouvelle version** : augmenter `version` dans `windows/package.json` et pousser sur `main`. Le workflow `.github/workflows/release.yml` fabrique Setup + portable + `latest.yml` et les publie sous l'étiquette `v<version>` (onglet Releases), puis **essaie la vraie chaîne** : une 0.0.1 installée doit trouver, télécharger et installer la nouvelle version. Si la version est déjà publiée, rien n'est refait.
- Les applis installées **avant la 1.4.0** n'ont pas de bouton : installer une fois `Pyramid-PDF-Installation-1.4.0.exe` (ou plus récent).
- Microsoft Store : en parallèle, **version 1.4.3 en ligne** (18/11/2026), **1.4.4 envoyée en certification le 18/11/2026** (soumission 3 ; paquets dans `Microsoft Store\` sur le PC) (fiche en français, runFullTrust justifié, politique de confidentialité = URL GitHub de PRIVACY.md). Identité Store dans `build.appx` de `windows/package.json` : `Kurylen.PyramidPDF`, `CN=B85CD3FF-A422-425E-9A54-A6E74180E94E`, éditeur `Kurylen` ; logos dans `windows/build/appx/`. Paquet `.appx` : artifacts du workflow `windows-store.yml`, puis Partner Center → « Démarrer la mise à jour » → Packages. Envoi sans glisser-déposer : pousser les morceaux du paquet sur une branche temporaire, les récupérer dans la page Packages par `fetch` (raw.githubusercontent.com), créer un `File` et le placer dans `input.fileuploader` (DataTransfer + événement change). Justification runFullTrust : 500 caractères maximum. Envoi sans glisser-déposer : pousser les morceaux du paquet sur une branche temporaire, puis dans la page Packages les récupérer par `fetch` (raw.githubusercontent.com), créer un `File` et le placer dans `input.fileuploader` (DataTransfer + événement change) ; supprimer la branche ensuite.
- Version actuelle : 1.4.4 sur Windows (numériser depuis une imprimante) (scanner avec le téléphone + OCR des pages scannées), 1.4.0 sur iPhone et Android ; 1.3.0 sur Mac. Le dossier de données reste `%APPDATA%\Pyramid` (`app.setPath('userData', …)` dans main.js) pour garder les réglages.

## 🍎 Apple (App Store + Mac)
- Compte Apple Developer actif (Félix = titulaire du compte). Clé App Store Connect « GitHub Pyramid » (Admin), ID de clé `R3CB57DAX3` ; fichier `.p8` gardé dans `Clés-Apple (à garder secret)` sur le PC (**jamais dans le dépôt**), copie chiffrée dans les secrets GitHub.
- **iPhone / iPad : abonnement** — essai gratuit de **2 semaines** puis **0,99 €/mois** (Apple ne propose pas 15 jours). Produit `fr.pyramid.pdf.mensuel`, groupe « Pyramid PDF ». StoreKit 2 dans `PyramidNative.swift` (subStatus / subBuy / subRestore / subManage, événement `subChange`), vérification sur l'appareil, aucun serveur. Sans abonnement actif, l'écran `#paywall` couvre l'appli (textes légaux Apple, Restaurer mes achats) ; réglages → « ⭐ Abonnement » (état + Gérer l'abonnement). Le cœur « Soutenir » est masqué sur iPhone (dons interdits par l'App Store).
- Windows, Mac et Android restent sans abonnement.

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
  recto verso). Réglages mémorisés dans localStorage `pyramid-print`. Impression silencieuse via IPC `print(pages, options)` : 1 page par feuille = taille exacte sans marge ajoutée, pas d'option `dpi` (elle réduisait l'impression), `scaleFactor: 100` ; test `tests/e15.js` (comparaison avec l'original). Aperçu net (canvas rendus selon la taille affichée × devicePixelRatio).
- **Réglages** (`SET`, localStorage `pyramid-settings`) : theme, accent, layout, density, icons (s/m/l/xl → `--uiz`),
  radius, thumbs, wheel. Défauts : Graphite, accent `#c8703f` (orange doux), Classique, Confortable.
- **Disposition Pro** : `placeRail()` déplace `#rbar`, `#tools` et `#pagebar` dans la barre d'icônes verticale `#rail` à gauche (bulles d'aide à droite).
- **Miniatures** : largeur réglable à la souris via `#sideGrip` (double-clic = défaut), mémorisée dans localStorage `pyramid-sidew` ; résolution des miniatures adaptée à la largeur (`thumbPx`).
- **Signature** : bouton `#rSign` dans la barre du mode lecture (à côté de Modifier), plus dans les outils du mode Modifier ; `placeInReader()` affiche un aperçu qui suit la souris et pose la signature à l'endroit cliqué, sans quitter la lecture (Échap pour annuler).
- **Images d'origine** : `getImgs(p)` lit la liste d'opérations pdf.js (save/restore/transform/paintImageXObject…) pour trouver les images de la page (hors images > 85 % de la page, ex. scans) ; contours en pointillés en modes Modifier/Sélection, survol surligné. Au clic ou glisser, `grabImg()` découpe l'image sur le rendu haute résolution, pose un cache `wo` de la couleur du fond (`oimg` = clé de l'image) et une annotation `img` déplaçable / redimensionnable / supprimable (Suppr ou ×). Les caches `wo` liés à une image ne sont pas sélectionnables.
- **Repères d'alignement** : pendant un déplacement (`move`, `tmove`), `snapGuides()` compare les bords et centres de l'élément avec les autres éléments, les lignes de texte (y compris la ligne de base), les images et le centre de la page ; aimantation à 6 px, lignes roses (pointillées pour le centre de page), Alt pour désactiver.
- **Molette** : en lecture elle fait défiler (Ctrl + molette = zoom) ; en mode Modifier elle zoome (ou défile selon le réglage).
- **Scanner avec le téléphone** (ordinateur, depuis la 1.4.1) : bouton `#scanBtn` (icône téléphone, à côté du +) et `#scanBig` sur l'accueil → `scanStart` ouvre un serveur HTTP local (port libre, `0.0.0.0`, code secret aléatoire dans l'adresse, arrêt après 30 min sans activité) et affiche un QR code (paquet `qrcode`). Le téléphone (même Wi-Fi, simple navigateur, aucune appli) ouvre `scan.html` : photo ou galerie, détection automatique de la feuille (Otsu + zone claire), 4 coins ajustables, redressement (homographie), filtres (Document = fond de feuille estimé par zone au 95e centile puis division couleur par couleur, sans seuil : papier blanc, ombres effacées, texte fin et couleurs gardés ; Gris ; Photo d'origine), puis envoi page par page (JPEG, `POST /page`). L'ordinateur assemble les pages en PDF (pdf-lib) et l'ouvre dans un nouvel onglet « Scan JJ-MM-AAAA HHhMM ». Windows peut demander d'autoriser Pyramid PDF dans le pare-feu (réseaux privés) la première fois.
- **Numériser depuis une imprimante** (ordinateur, depuis la 1.4.4) : bouton `#rScan` (icône scanner) juste à côté d'Imprimer dans la barre de lecture → `openDevScan()`. `windows/scanner.js` (chargé par main.js, IPC `scanners`, `scanner-info`, `scanner-add`, `scanner-forget`, `scanner-scan`, `scanner-cancel`, événement `scanner-event`) : imprimantes multifonctions du réseau trouvées en mDNS (`_uscan._tcp` / `_uscans._tcp`, paquet `bonjour-service`) ou ajoutées par adresse IP (mémorisées dans `%APPDATA%\Pyramid\scanners.json`), protocole AirScan / eSCL (ScannerCapabilities → ScanJobs → NextDocument, JPEG ou PDF) ; sous Windows, en plus, tous les scanners installés (WIA via PowerShell : vitre, chargeur, recto verso, conversion JPEG). Réglages : source Vitre / Chargeur / Recto verso (selon l'appareil), Couleur / Gris / N&B, 150 / 300 / 600 ppp, A4 / A5 / Lettre / Légal (mémorisés dans localStorage `pyramid-scanner`). Plusieurs passages possibles (« Numériser la suite »), pages retirables, puis « Ouvrir en PDF » → onglet « Numérisation JJ-MM-AAAA HHhMM » (taille réelle d'après la résolution). Tests : `tests/e19.js` (Electron + faux scanner `tests/fake-escl.js` annoncé en mDNS), `tests/scanner-node.js` + `tests/check-ps.js` (workflow `scanner-windows.yml` sur un vrai Windows).
- **Pages scannées → OCR** (ordinateur, depuis la 1.4.2) : si une page n'a aucun texte PDF, `getLines` appelle `ocrLines()` → rendu 300 dpi → IPC `ocr` → Tesseract.js dans le processus principal (`main.js`, modèle français `windows/ocr/fra.traineddata.gz`, hors ligne ; modules Tesseract dans `asarUnpack`). Les lignes reconnues (police `__ocr<id>`, `fi.raw` = « Texte scanné (OCR) ») se modifient comme du texte normal (cache couleur du fond + police équivalente trouvée par `refineFont`). Test : `tests/e18.js` (aussi sur l'appli empaquetée).
- **Débogage** : variable d'environnement `PYR_DEBUG=1` → `window.__pyr` (S, getLines, cur, TABS, refineFont, hiRes…).

## ✅ État actuel (17/11/2026)
Tout fonctionne : 58 tests web sur 59 OK, 32/32 tests mobiles. Le seul échec attendu : une police inconnue (Lora) reste en mode « emb »
au lieu d'une police équivalente.

## 📝 À faire
- [ ] Ajouter le lien de paiement **Stripe** (choix final de Félix : Payment Link « montant libre », Apple Pay + cartes) dans `SUPPORT_URL` (fenêtre « Soutenir Pyramid PDF ») quand Félix le donnera.
- [ ] Plus tard : système d'**abonnement** via Stripe (Stripe Billing + vérification de l'abonnement dans l'appli).
- [ ] Clarifier sa demande « signature électronique horodatée officielle sans obligatoirement… » (phrase coupée).
- [ ] Vérifier le temps d'ouverture de l'appli sur son PC après les optimisations (fenêtre affichée tout de suite,
      pdf-lib et forge chargés en `defer`, cache V8).
- [ ] Tester l'impression réelle sur son imprimante.
- [ ] Tester les applis sur un vrai téléphone (Android : installer l'APK ; iPhone : compiler sur un Mac / en ligne).
- [ ] Publication : Google Play (compte 25 $), App Store et Mac (compte Apple Developer 99 $/an, signature Developer ID + notarisation).
