#!/bin/bash
# À lancer APRÈS "npx cap add ios", depuis le dossier app-client ou app-pro (sur un Mac, ou sur le Mac distant du service de compilation).
#   bash ../ios-permissions.sh client
#   bash ../ios-permissions.sh pro
set -e
APP="$1"
PLIST="ios/App/App/Info.plist"
PB="/usr/libexec/PlistBuddy"
[ -f "$PLIST" ] || { echo "Info.plist introuvable : lance d'abord npx cap add ios"; exit 1; }

set_str(){ "$PB" -c "Delete :$1" "$PLIST" 2>/dev/null || true; "$PB" -c "Add :$1 string $2" "$PLIST"; }

if [ "$APP" = "pro" ]; then
  set_str NSLocationWhenInUseUsageDescription "Yoonou Pro utilise votre position, même quand l'app est en arrière-plan, pour que les clients vous trouvent et suivent la livraison pendant que vous êtes en ligne."
  set_str NSLocationAlwaysAndWhenInUseUsageDescription "Yoonou Pro utilise votre position, même quand l'app est en arrière-plan, pour que les clients vous trouvent et suivent la livraison pendant que vous êtes en ligne."
  "$PB" -c "Delete :UIBackgroundModes" "$PLIST" 2>/dev/null || true
  "$PB" -c "Add :UIBackgroundModes array" "$PLIST"
  "$PB" -c "Add :UIBackgroundModes:0 string location" "$PLIST"
  "$PB" -c "Add :UIBackgroundModes:1 string remote-notification" "$PLIST"
else
  set_str NSLocationWhenInUseUsageDescription "Yoonou utilise votre position pour proposer votre adresse de départ et trouver des chauffeurs proches."
  "$PB" -c "Delete :UIBackgroundModes" "$PLIST" 2>/dev/null || true
  "$PB" -c "Add :UIBackgroundModes array" "$PLIST"
  "$PB" -c "Add :UIBackgroundModes:0 string remote-notification" "$PLIST"
fi
set_str NSCameraUsageDescription "Yoonou utilise l'appareil photo pour prendre les photos de la marchandise et des documents."
set_str NSPhotoLibraryUsageDescription "Yoonou accède à vos photos pour joindre la marchandise ou vos documents."
echo "Permissions iOS ajoutées pour l'application $APP."
