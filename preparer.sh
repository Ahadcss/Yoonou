#!/bin/bash
# Usage, depuis le dossier principal du dépôt Yoonou :
#   bash yoonou-apps/preparer.sh client
#   bash yoonou-apps/preparer.sh pro
set -e
APP="$1"
if [ "$APP" != "client" ] && [ "$APP" != "pro" ]; then echo "Utilisation : bash yoonou-apps/preparer.sh client|pro"; exit 1; fi

HERE="$(cd "$(dirname "$0")" && pwd)"
SITE="$(cd "$HERE/.." && pwd)"
DEST="$HERE/app-$APP"
OUT="$DEST/www"

# 0. Dossier de l'application : configuration, package et icône
mkdir -p "$DEST/assets"
cp "$HERE/$APP-capacitor.config.json" "$DEST/capacitor.config.json"
cp "$HERE/$APP-package.json" "$DEST/package.json"
cp "$HERE/$APP-icone-1024.png" "$DEST/assets/icon-only.png"

rm -rf "$OUT" && mkdir -p "$OUT"

# 1. Copie des pages du site, sans les pages d'administration
for f in "$SITE"/*.html "$SITE"/*.js "$SITE"/*.png "$SITE"/*.jpg; do
  [ -e "$f" ] || continue
  b="$(basename "$f")"
  case "$b" in admin-*|sw.js|"lang (1).js") continue;; esac
  cp "$f" "$OUT/$b"
done

# 2. L'accueil du site devient une page à part ; l'accueil de l'application = écrans de démarrage
mv "$OUT/index.html" "$OUT/site-accueil.html"
cp "$HERE/demarrage.html" "$OUT/index.html"

# 3. Quelle application est-ce ?
echo "window.YOONOU_APP = '$APP';" > "$OUT/app-config.js"

echo "OK : $DEST est prêt pour l'application $APP."
