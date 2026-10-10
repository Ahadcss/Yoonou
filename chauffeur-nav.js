// ============================================================
// Yoonou — Navigation du chauffeur DANS l'application + maintien de la position
//
// Ce fichier fournit :
//  - YoonouNav        : carte plein écran, itinéraire Mapbox, instructions écrites et vocales,
//                       recalcul si le chauffeur s'écarte (n'envoie PAS de position : l'envoi GPS de la page reste inchangé)
//  - YoonouKeepAlive  : empêche l'écran de s'éteindre (Wake Lock) et prévient quand la page
//                       est restée en arrière-plan (position non envoyée)
//
// Limite à connaître : un site web ne peut pas envoyer de position quand le téléphone est
// verrouillé à la main ou quand une autre application est au premier plan. Ce fichier réduit
// fortement le problème (le chauffeur n'a plus de raison de quitter Yoonou), il ne le supprime pas.
// ============================================================

// ---------- Calculs purs (testés hors navigateur) ----------
const YoonouNavCore = (() => {
  function haversineM(lat1, lng1, lat2, lng2){
    const R = 6371000, rad = x => x * Math.PI / 180;
    const dLat = rad(lat2 - lat1), dLng = rad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  // Transforme la réponse Mapbox Directions en modèle utilisable
  function buildRoute(route){
    const coords = route.geometry.coordinates;                  // [lng, lat]
    const cum = [0];
    for (let i = 1; i < coords.length; i++) {
      cum.push(cum[i - 1] + haversineM(coords[i - 1][1], coords[i - 1][0], coords[i][1], coords[i][0]));
    }
    const scale = cum[cum.length - 1] > 0 ? route.distance / cum[cum.length - 1] : 1;
    const steps = [];
    let start = 0;
    ((route.legs && route.legs[0] && route.legs[0].steps) || []).forEach(s => {
      steps.push({
        cumStart: start, distance: s.distance, duration: s.duration,
        maneuver: s.maneuver, name: s.name,
        voice: (s.voiceInstructions || []).slice().sort((a, b) => a.distanceAlongGeometry - b.distanceAlongGeometry),
        banner: (s.bannerInstructions || []).slice().sort((a, b) => a.distanceAlongGeometry - b.distanceAlongGeometry)
      });
      start += s.distance;
    });
    return { coords, cum, scale, steps, distance: route.distance, duration: route.duration };
  }

  // Où est le chauffeur sur l'itinéraire ? Cherche le point le plus proche, en avançant seulement
  function locate(model, lat, lng, fromIdx){
    const n = model.coords.length;
    const from = Math.max(0, Math.min(fromIdx || 0, n - 1));
    const to = Math.min(n - 1, from + 120);
    let best = from, bestD = Infinity;
    for (let i = from; i <= to; i++) {
      const d = haversineM(lat, lng, model.coords[i][1], model.coords[i][0]);
      if (d < bestD) { bestD = d; best = i; }
    }
    // Trop loin de la fenêtre (ex. longue coupure GPS, retour au premier plan) : on cherche plus loin sur l'itinéraire
    if (bestD > 60 && to < n - 1) {
      for (let i = to + 1; i < n; i++) {
        const d = haversineM(lat, lng, model.coords[i][1], model.coords[i][0]);
        if (d < bestD) { bestD = d; best = i; }
      }
    }
    return { idx: best, offRouteM: bestD, progress: Math.min(model.distance, model.cum[best] * model.scale) };
  }

  // Étape en cours + distance restante sur cette étape
  function currentStep(model, progress){
    let i = 0;
    for (let k = 0; k < model.steps.length; k++) {
      if (model.steps[k].cumStart <= progress + 0.5) i = k;
    }
    const step = model.steps[i];
    const remainingOnStep = step ? Math.max(0, step.cumStart + step.distance - progress) : 0;
    return { i, step, remainingOnStep };
  }

  // Parmi les messages d'une étape (triés par distance croissante), celui à afficher/dire maintenant :
  // le plus proche dont le seuil est encore atteint.
  function pickInstruction(list, remaining){
    for (let k = 0; k < list.length; k++) {
      if (remaining <= list[k].distanceAlongGeometry + 0.5) return { item: list[k], index: k };
    }
    return null;
  }

  function arrowFor(maneuver){
    if (!maneuver) return '⬆️';
    if (maneuver.type === 'arrive') return '🏁';
    if (/roundabout|rotary/.test(maneuver.type || '')) return '🔄';
    const map = { 'left': '⬅️', 'right': '➡️', 'slight left': '↖️', 'slight right': '↗️',
                  'sharp left': '↙️', 'sharp right': '↘️', 'uturn': '↩️', 'straight': '⬆️' };
    return map[maneuver.modifier] || '⬆️';
  }

  function formatDistance(m){
    if (m < 1000) return `${Math.max(10, Math.round(m / 10) * 10)} m`;
    return `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
  }

  return { haversineM, buildRoute, locate, currentStep, pickInstruction, arrowFor, formatDistance };
})();

if (typeof module !== 'undefined') module.exports = { YoonouNavCore };

// ---------- Maintien de la page active ----------
const YoonouKeepAlive = (() => {
  let lock = null, wanted = false, hiddenAt = null, onResume = null;

  async function acquire(){
    if (!wanted || !('wakeLock' in navigator)) return false;
    try {
      lock = await navigator.wakeLock.request('screen');
      lock.addEventListener('release', () => { lock = null; });
      return true;
    } catch (e) { lock = null; return false; }
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
      const away = hiddenAt ? Date.now() - hiddenAt : 0;
      hiddenAt = null;
      if (wanted) await acquire();
      if (wanted && away > 45000 && onResume) onResume(away);
    });
  }

  return {
    start(opts){ wanted = true; if (opts && opts.onResume) onResume = opts.onResume; return acquire(); },
    stop(){ wanted = false; if (lock) { lock.release().catch(() => {}); lock = null; } },
    isActive(){ return !!lock; },
    isSupported(){ return typeof navigator !== 'undefined' && 'wakeLock' in navigator; },
    isWanted(){ return wanted; }
  };
})();

// ---------- Navigation plein écran ----------
const YoonouNav = (() => {
  const C = YoonouNavCore;
  let cfg = null, overlay = null, map = null, watchId = null;
  let model = null, dest = null, followMode = true, voiceOn = true;
  let progressIdx = 0, lastReroute = 0, offCount = 0, lastPos = null;
  let spoken = new Set(), arrived = false, markerMe = null, markerDest = null, rerouting = false;

  function init(options){ cfg = options; }   // { sb, userId, token }

  function injectStyle(){
    if (document.getElementById('yoonouNavStyle')) return;
    const st = document.createElement('style');
    st.id = 'yoonouNavStyle';
    st.textContent = `
      #yoonouNav{position:fixed; inset:0; z-index:300; background:#fff; display:none; font-family:'Work Sans',sans-serif;}
      #yoonouNav.open{display:block;}
      #yoonouNavMap{position:absolute; inset:0;}
      #ynBanner{position:absolute; top:0; left:0; right:0; z-index:5; background:#16213E; color:#F3E9D2;
        padding:calc(14px + env(safe-area-inset-top)) 16px 14px; display:flex; align-items:center; gap:14px;
        box-shadow:0 6px 18px rgba(0,0,0,.3);}
      #ynBanner .arrow{font-size:38px; line-height:1; flex:none;}
      #ynBanner .txt{flex:1; min-width:0;}
      #ynBanner .main{font-family:'Space Grotesk',sans-serif; font-weight:700; font-size:19px; line-height:1.2;}
      #ynBanner .dist{font-family:'JetBrains Mono',monospace; font-size:14px; color:#E8A93A; margin-top:3px;}
      #ynBottom{position:absolute; left:0; right:0; bottom:0; z-index:5; background:#fff; border-radius:18px 18px 0 0;
        padding:14px 16px calc(14px + env(safe-area-inset-bottom)); box-shadow:0 -6px 20px rgba(0,0,0,.18);}
      #ynBottom .row{display:flex; align-items:center; justify-content:space-between; gap:10px;}
      #ynBottom .eta{font-family:'Space Grotesk',sans-serif; font-weight:700; font-size:22px;}
      #ynBottom .sub{font-size:13px; color:#6b6455; margin-top:2px;}
      .yn-btn{border:none; border-radius:12px; padding:12px 14px; font-family:'Space Grotesk',sans-serif; font-weight:700; font-size:14px; cursor:pointer; background:#eee; color:#1A1712;}
      .yn-btn.quit{background:#D6362A; color:#fff;}
      #ynRecenter{position:absolute; right:12px; bottom:calc(120px + env(safe-area-inset-bottom)); z-index:6; display:none;
        width:48px; height:48px; border-radius:50%; border:none; background:#fff; box-shadow:0 3px 12px rgba(0,0,0,.25); font-size:22px; cursor:pointer;}
      #ynNote{position:absolute; left:12px; right:12px; top:calc(96px + env(safe-area-inset-top)); z-index:6; display:none;
        background:#fff7e0; border:1px solid #E8A93A; color:#7a5200; border-radius:10px; padding:9px 12px; font-size:13px;}
      .yn-me{width:22px; height:22px; border-radius:50%; background:#2A7FE6; border:3px solid #fff; box-shadow:0 0 0 6px rgba(42,127,230,.25);}
      .yn-dest{font-size:34px; line-height:1; transform:translateY(-14px);}
    `;
    document.head.appendChild(st);
  }

  function buildOverlay(){
    if (overlay) return;
    injectStyle();
    overlay = document.createElement('div');
    overlay.id = 'yoonouNav';
    overlay.innerHTML = `
      <div id="yoonouNavMap"></div>
      <div id="ynBanner"><div class="arrow" id="ynArrow">⬆️</div>
        <div class="txt"><div class="main" id="ynMain">Calcul de l'itinéraire…</div><div class="dist" id="ynDist"></div></div></div>
      <div id="ynNote"></div>
      <button id="ynRecenter" aria-label="Recentrer">◎</button>
      <div id="ynBottom">
        <div class="row">
          <div><div class="eta" id="ynEta">—</div><div class="sub" id="ynSub"></div></div>
          <div style="display:flex; gap:8px;">
            <button class="yn-btn" id="ynVoice" aria-label="Voix">🔊</button>
            <button class="yn-btn quit" id="ynQuit">Quitter</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#ynQuit').addEventListener('click', close);
    overlay.querySelector('#ynVoice').addEventListener('click', () => {
      voiceOn = !voiceOn;
      overlay.querySelector('#ynVoice').textContent = voiceOn ? '🔊' : '🔇';
      if (!voiceOn && window.speechSynthesis) window.speechSynthesis.cancel();
    });
    overlay.querySelector('#ynRecenter').addEventListener('click', () => { followMode = true; overlay.querySelector('#ynRecenter').style.display = 'none'; if (lastPos) follow(lastPos); });
  }

  function note(text){
    const el = overlay.querySelector('#ynNote');
    if (!text) { el.style.display = 'none'; return; }
    el.textContent = text; el.style.display = 'block';
  }

  function speak(text){
    if (!voiceOn || !text || !window.speechSynthesis) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'fr-FR'; u.rate = 1.0;
      window.speechSynthesis.speak(u);
    } catch (e) { /* voix indisponible : l'affichage suffit */ }
  }

  async function fetchRoute(fromLat, fromLng){
    const base = (profile) => `https://api.mapbox.com/directions/v5/mapbox/${profile}/${fromLng},${fromLat};${dest.lng},${dest.lat}`
      + `?geometries=geojson&overview=full&steps=true&language=fr&voice_instructions=true&banner_instructions=true&voice_units=metric&access_token=${cfg.token}`;
    for (const profile of ['driving-traffic', 'driving']) {
      try {
        const res = await fetch(base(profile));
        if (!res.ok) continue;
        const data = await res.json();
        if (data.routes && data.routes[0]) return data.routes[0];
      } catch (e) { /* on essaie le profil suivant */ }
    }
    return null;
  }

  function drawRoute(){
    const geojson = { type: 'Feature', geometry: { type: 'LineString', coordinates: model.coords } };
    if (map.getSource('ynRoute')) { map.getSource('ynRoute').setData(geojson); return; }
    map.addSource('ynRoute', { type: 'geojson', data: geojson });
    map.addLayer({ id: 'ynRouteCasing', type: 'line', source: 'ynRoute', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#0b3d91', 'line-width': 10 } });
    map.addLayer({ id: 'ynRouteLine', type: 'line', source: 'ynRoute', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#3b82f6', 'line-width': 6 } });
  }

  async function loadRoute(lat, lng){
    if (rerouting) return;
    rerouting = true;
    const route = await fetchRoute(lat, lng);
    rerouting = false;
    if (!route) { note("Itinéraire indisponible pour l'instant. Vérifie ta connexion : on réessaie."); return false; }
    note('');
    model = C.buildRoute(route);
    progressIdx = 0; offCount = 0; spoken = new Set(); lastReroute = Date.now();
    drawRoute();
    return true;
  }

  function follow(pos){
    if (!map || !followMode) return;
    const opts = { center: [pos.lng, pos.lat], zoom: 17, pitch: 50, duration: 900 };
    if (pos.heading != null && !isNaN(pos.heading) && (pos.speed || 0) > 1.5) opts.bearing = pos.heading;
    map.easeTo(opts);
  }

  function updateGuidance(pos){
    if (!model || arrived) return;
    const loc = C.locate(model, pos.lat, pos.lng, progressIdx);
    progressIdx = loc.idx;

    // Hors itinéraire ? (plus de 60 m, deux fois de suite) : on recalcule
    if (loc.offRouteM > 60) offCount++; else offCount = 0;
    if (offCount >= 2 && Date.now() - lastReroute > 15000) {
      note('Nouvel itinéraire…');
      loadRoute(pos.lat, pos.lng).then(ok => { if (ok) note(''); });
      return;
    }

    const remaining = Math.max(0, model.distance - loc.progress);
    const cs = C.currentStep(model, loc.progress);
    const nextStep = model.steps[cs.i + 1];

    if (remaining < 30) {
      arrived = true;
      overlay.querySelector('#ynArrow').textContent = '🏁';
      overlay.querySelector('#ynMain').textContent = 'Tu es arrivé';
      overlay.querySelector('#ynDist').textContent = dest.label || '';
      speak('Vous êtes arrivé.');
      overlay.querySelector('#ynEta').textContent = 'Arrivé';
      overlay.querySelector('#ynSub').textContent = 'Ferme la navigation puis confirme ton arrivée dans Yoonou.';
      return;
    }

    // Bandeau : texte de la prochaine manœuvre
    const banner = C.pickInstruction(cs.step ? cs.step.banner : [], cs.remainingOnStep);
    const text = banner && banner.item.primary ? banner.item.primary.text
               : (nextStep && nextStep.maneuver ? nextStep.maneuver.instruction : 'Continue tout droit');
    const maneuver = nextStep ? nextStep.maneuver : (cs.step && cs.step.maneuver);
    overlay.querySelector('#ynArrow').textContent = C.arrowFor(maneuver);
    overlay.querySelector('#ynMain').textContent = text;
    overlay.querySelector('#ynDist').textContent = C.formatDistance(cs.remainingOnStep);

    // Voix : une seule fois par message
    const v = C.pickInstruction(cs.step ? cs.step.voice : [], cs.remainingOnStep);
    if (v) {
      const key = `${cs.i}-${v.index}`;
      if (!spoken.has(key)) { spoken.add(key); speak(v.item.announcement); }
    }

    // Distance et heure d'arrivée
    const minutes = Math.max(1, Math.round((model.duration * (remaining / model.distance)) / 60));
    const arrival = new Date(Date.now() + minutes * 60000);
    overlay.querySelector('#ynEta').textContent = `${C.formatDistance(remaining)} · ${minutes} min`;
    overlay.querySelector('#ynSub').textContent = `Arrivée vers ${arrival.getHours().toString().padStart(2, '0')}:${arrival.getMinutes().toString().padStart(2, '0')}`;
  }

  function onPosition(p){
    const pos = { lat: p.coords.latitude, lng: p.coords.longitude, heading: p.coords.heading, speed: p.coords.speed };
    lastPos = pos;
    if (markerMe) markerMe.setLngLat([pos.lng, pos.lat]);
    follow(pos);
    if (!model && !rerouting) {
      loadRoute(pos.lat, pos.lng).then(ok => { if (ok) updateGuidance(pos); });
    } else {
      updateGuidance(pos);
    }
  }

  function onPositionError(err){
    note(err && err.code === 1
      ? "Autorise la localisation de Yoonou dans les réglages du téléphone pour être guidé."
      : "Signal GPS faible… on continue d'essayer.");
  }

  // options : { lat, lng, label, orderId }
  function open(options){
    if (!cfg) { alert('Navigation indisponible.'); return; }
    if (typeof mapboxgl === 'undefined') { alert('La carte ne s\'est pas chargée. Vérifie ta connexion et réessaie.'); return; }
    if (!navigator.geolocation) { alert('Ce téléphone ne permet pas la localisation.'); return; }

    buildOverlay();
    dest = { lat: Number(options.lat), lng: Number(options.lng), label: options.label || '' };
    cfg.orderId = options.orderId || null;
    model = null; arrived = false; followMode = true; progressIdx = 0; lastPos = null; offCount = 0;
    overlay.querySelector('#ynArrow').textContent = '⬆️';
    overlay.querySelector('#ynMain').textContent = "Calcul de l'itinéraire…";
    overlay.querySelector('#ynDist').textContent = dest.label ? '→ ' + dest.label : '';
    overlay.querySelector('#ynEta').textContent = '—';
    overlay.querySelector('#ynSub').textContent = '';
    overlay.querySelector('#ynRecenter').style.display = 'none';
    note('');
    overlay.classList.add('open');

    YoonouKeepAlive.start();   // l'écran reste allumé pendant la navigation
    speak('Navigation démarrée.'); // débloque aussi la voix sur iPhone (geste de l'utilisateur)

    mapboxgl.accessToken = cfg.token;
    if (map) { map.remove(); map = null; }
    map = new mapboxgl.Map({
      container: 'yoonouNavMap', style: 'mapbox://styles/mapbox/streets-v12',
      center: [dest.lng, dest.lat], zoom: 14, attributionControl: false
    });
    map.on('dragstart', (e) => { if (e.originalEvent) { followMode = false; overlay.querySelector('#ynRecenter').style.display = 'block'; } });

    const meEl = document.createElement('div'); meEl.className = 'yn-me';
    const destEl = document.createElement('div'); destEl.className = 'yn-dest'; destEl.textContent = '📍';
    markerDest = new mapboxgl.Marker({ element: destEl }).setLngLat([dest.lng, dest.lat]).addTo(map);
    markerMe = new mapboxgl.Marker({ element: meEl }).setLngLat([dest.lng, dest.lat]).addTo(map);

    map.on('load', () => {
      if (watchId != null) navigator.geolocation.clearWatch(watchId);
      watchId = navigator.geolocation.watchPosition(onPosition, onPositionError, { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 });
    });
  }

  function close(){
    if (watchId != null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (map) { map.remove(); map = null; }
    if (overlay) overlay.classList.remove('open');
    markerMe = markerDest = null; model = null;
    // Le maintien de l'écran continue tant qu'une course est en cours (géré par la page).
    if (typeof cfg.onClose === 'function') cfg.onClose();
  }

  return { init, open, close, isOpen: () => !!(overlay && overlay.classList.contains('open')) };
})();
