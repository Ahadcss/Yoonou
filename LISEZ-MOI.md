# Applications Yoonou (iPhone) — guide

Contenu du dossier :
- `demarrage.html` : les écrans de départ (position, puis notifications), commun aux deux applications.
- `client-...` et `pro-...` : la configuration et l'icône 1024 de chaque application.
- `preparer.sh` : crée les dossiers `app-client` et `app-pro` et copie ton site dedans. `ios-permissions.sh` : ajoute les textes d'autorisation d'Apple.
- `auth.html` (à la racine du dépôt, pas dans ce dossier) : ta page de connexion mise à jour.

IMPORTANT : je n'ai pas pu compiler ni tester sur iPhone depuis ici. Le script de copie et le code des écrans sont vérifiés, mais le premier test sur un vrai iPhone peut demander des petites corrections. On les fera ensemble.

## Étape 1 — Mettre à jour le site (GitHub)
1. Envoie `auth.html` (il remplace l'ancien) et le dossier `yoonou-apps` en un seul envoi sur GitHub.
2. Teste que la connexion marche toujours sur yoonou.com.

## Étape 2 — Compte Apple Developer
Inscris-toi sur developer.apple.com/programs (environ 99 $ par an, à vérifier). Un compte « particulier » suffit pour commencer. L'inscription peut prendre plusieurs jours : fais-la en premier.

## Étape 3 — Compiler (deux possibilités)
**A. Tu as un Mac** (avec Xcode et Node.js), dans le dossier du dépôt :
```
bash yoonou-apps/preparer.sh client
cd yoonou-apps/app-client
npm install @capacitor/core @capacitor/cli @capacitor/ios @capacitor/geolocation @capacitor/push-notifications @capacitor/assets
npx cap add ios
bash ../ios-permissions.sh client
npx @capacitor/assets generate --ios
npx cap sync ios
npx cap open ios
```
Puis dans Xcode : choisis ton compte Apple, branche l'iPhone et clique sur Lancer.
Pour Yoonou Pro, même chose avec `pro` à la place de `client` et le dossier `app-pro`.

**B. Pas de Mac** : on utilise un service de compilation en ligne (Codemagic). Je te guiderai pas à pas quand ton compte Apple sera prêt.

## Choix à garder en tête
- Les identifiants `com.yoonou.app` (client) et `com.yoonou.pro` (chauffeur) ne pourront plus être changés une fois créés chez Apple. Dis-moi si tu veux d'autres noms avant l'étape 3.
- Les notifications push (envoi réel) demandent ensuite une clé Apple + Firebase : prochaine étape après la première compilation.
- Position du chauffeur en arrière-plan : un plugin supplémentaire sera ajouté à Yoonou Pro après le premier test.
- Pour Apple, il faudra aussi : suppression du compte depuis l'application, compte de test pour les examinateurs, captures d'écran.
