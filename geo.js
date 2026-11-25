// ============================================================
// Yoonou — Cartes, recherche d'adresses et itinéraires (remplace Mapbox)
//
//  - Carte      : MapLibre GL JS + fond de carte OpenFreeMap (gratuit, sans clé)
//  - Adresses   : Geoapify (autocomplétion, géocodage inverse)
//  - Itinéraires: Geoapify Routing (distance, durée, tracé, consignes en français)
//
// Plan de secours : si Geoapify ne répond pas (quota du jour atteint, réseau coupé),
// la distance est estimée en ligne droite x 1,3 pour ne jamais bloquer une commande.
// (La base de données refuse de toute façon une distance inférieure à 1,1 x la ligne droite.)
//
// La clé Geoapify est publique (visible dans le site). Elle est limitée à https://yoonou.com
// dans le tableau de bord Geoapify : une autre adresse ne peut pas l'utiliser.
// ============================================================

const YOONOU_GEO_KEY = 'b3fb1341af1a4c62b109a6e3a23b77ad';
const YOONOU_MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const YOONOU_GEO_API = 'https://api.geoapify.com/v1';
const YOONOU_GEO_CENTER = { lng: -17.4677, lat: 14.7167 };   // Dakar

// ---- Petits outils ----
function yoonouGeoHaversineM(a, b){
  const R = 6371000, rad = x => x * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function yoonouGeoFetch(url){
  try {
    const res = await fetch(url);
    if (!res.ok) { console.warn('Geoapify :', res.status, url.split('?')[0]); return null; }
    return await res.json();
  } catch (e) { console.warn('Geoapify indisponible :', e.message); return null; }
}

// ---- Recherche d'adresses (autocomplétion) ----
// Renvoie [{ label, title, subtitle, lat, lng, vague, source:'geocoding' }]
// "vague" = le résultat ne désigne qu'une ville / un département / un pays : pas assez précis pour livrer.
const YOONOU_GEO_VAGUE = ['city', 'county', 'state', 'country', 'postcode', 'municipality', 'region'];
const _yoonouGeoCache = new Map();

async function yoonouGeoSearch(query, prox, limit){
  const q = String(query || '').trim();
  if (q.length < 2) return [];
  const p = prox || YOONOU_GEO_CENTER;
  const key = q.toLowerCase() + '|' + p.lat.toFixed(2) + ',' + p.lng.toFixed(2);
  if (_yoonouGeoCache.has(key)) return _yoonouGeoCache.get(key);

  const url = `${YOONOU_GEO_API}/geocode/autocomplete?text=${encodeURIComponent(q)}`
    + `&filter=countrycode:sn&bias=proximity:${p.lng},${p.lat}&lang=fr&limit=${limit || 6}&apiKey=${YOONOU_GEO_KEY}`;
  const data = await yoonouGeoFetch(url);
  if (!data || !Array.isArray(data.features)) return [];

  const out = data.features.map(f => {
    const pr = f.properties || {};
    const title = pr.name || pr.address_line1 || pr.formatted || '';
    // détail = le reste de l'adresse sans « Sénégal »
    let subtitle = String(pr.address_line2 || '').replace(/,?\s*S[ée]n[ée]gal\s*$/i, '').trim();
    if (!subtitle) subtitle = [pr.suburb || pr.district, pr.city].filter(Boolean).join(', ');
    const lat = typeof pr.lat === 'number' ? pr.lat : (f.geometry && f.geometry.coordinates ? f.geometry.coordinates[1] : null);
    const lng = typeof pr.lon === 'number' ? pr.lon : (f.geometry && f.geometry.coordinates ? f.geometry.coordinates[0] : null);
    return {
      label: pr.formatted || title, title, subtitle, lat, lng,
      vague: YOONOU_GEO_VAGUE.includes(String(pr.result_type || '').toLowerCase()),
      source: 'geocoding'
    };
  }).filter(r => r.title && isFinite(r.lat) && isFinite(r.lng));

  if (_yoonouGeoCache.size > 200) _yoonouGeoCache.clear();
  _yoonouGeoCache.set(key, out);
  return out;
}

// ---- Géocodage inverse : le nom d'un point ----
// Renvoie { label, precis } ; label = « Rue X, Quartier, Ville » ou le repère le plus proche.
async function yoonouGeoReverse(lat, lng){
  const url = `${YOONOU_GEO_API}/geocode/reverse?lat=${lat}&lon=${lng}&lang=fr&apiKey=${YOONOU_GEO_KEY}`;
  const data = await yoonouGeoFetch(url);
  const f = data && data.features && data.features[0];
  if (!f) return { label: `Point choisi (${lat.toFixed(4)}, ${lng.toFixed(4)})`, precis: false, inconnu: true };
  const pr = f.properties || {};
  const type = String(pr.result_type || '').toLowerCase();
  const vague = YOONOU_GEO_VAGUE.includes(type);
  let label = pr.formatted || pr.address_line1 || '';
  label = label.replace(/,?\s*S[ée]n[ée]gal\s*$/i, '').trim();
  if (!label) label = `Point choisi (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
  return { label, precis: !vague };
}

// Étiquette finale d'un point choisi sur la carte (épingle ou position GPS).
//  rev = résultat de yoonouGeoReverse ; poiExact = nom lisible juste sous le doigt ; poiProche = repère proche
function yoonouPinLabel(rev, poiExact, poiProche){
  const addr = (rev && !rev.inconnu) ? rev.label : '';
  if (poiExact) return addr ? `${poiExact}, ${addr}` : poiExact;
  if (poiProche) return addr ? `Près de ${poiProche}, ${addr}` : `Près de ${poiProche}`;
  if (!addr) return '';
  return rev.precis ? addr : `Point choisi sur la carte — ${addr}`;
}

// ---- Itinéraire ----
// Renvoie { km, minutes, geometry (GeoJSON LineString), approximatif:boolean }
async function yoonouGeoRoute(from, to){
  const raw = await _yoonouGeoRouteRaw(from, to, false);
  if (raw) {
    const props = raw.properties;
    const coords = [].concat.apply([], raw.geometry.coordinates);   // MultiLineString -> une seule ligne
    return { km: props.distance / 1000, minutes: props.time / 60, geometry: { type: 'LineString', coordinates: coords }, approximatif: false };
  }
  // Plan de secours : ligne droite x 1,3, à ~22 km/h de moyenne en ville
  const km = yoonouGeoHaversineM(from, to) / 1000 * 1.3;
  return {
    km, minutes: km / 22 * 60, approximatif: true,
    geometry: { type: 'LineString', coordinates: [[from.lng, from.lat], [to.lng, to.lat]] }
  };
}

async function _yoonouGeoRouteRaw(from, to, withTraffic){
  const base = `${YOONOU_GEO_API}/routing?waypoints=${from.lat},${from.lng}|${to.lat},${to.lng}&mode=drive&lang=fr&details=instruction_details`;
  let data = null;
  if (withTraffic) data = await yoonouGeoFetch(base + `&traffic=approximated&apiKey=${YOONOU_GEO_KEY}`);
  if (!data) data = await yoonouGeoFetch(base + `&apiKey=${YOONOU_GEO_KEY}`);
  const f = data && data.features && data.features[0];
  if (!f || !f.geometry || !f.properties || !Array.isArray(f.geometry.coordinates) || !f.geometry.coordinates.length) return null;
  return f;
}

// ---- Itinéraire avec consignes, au format attendu par chauffeur-nav.js ----
// Renvoie { geometry:{coordinates}, distance (m), duration (s), legs:[{steps:[...]}] } ou null.
function _yoonouGeoModifier(instr){
  const type = String((instr && instr.type) || '').toLowerCase();
  const text = String((instr && instr.text) || '').toLowerCase();
  const has = re => re.test(type) || re.test(text);
  if (has(/destination|arriv/)) return { type: 'arrive' };
  if (has(/u-?turn|demi-tour/)) return { type: 'turn', modifier: 'uturn' };
  if (has(/roundabout|rond-point|giratoire/)) return { type: 'roundabout' };
  const left = has(/left|gauche/), right = has(/right|droite/);
  if (left || right) {
    const side = left ? 'left' : 'right';
    if (has(/slight|bear|l[ée]g[èe]rement|serrez|tenez|gardez/)) return { type: 'turn', modifier: 'slight ' + side };
    if (has(/sharp|fortement|brusquement|prononc/)) return { type: 'turn', modifier: 'sharp ' + side };
    return { type: 'turn', modifier: side };
  }
  return { type: 'turn', modifier: 'straight' };
}

function _yoonouGeoLowerFirst(s){ s = String(s || ''); return s.charAt(0).toLowerCase() + s.slice(1); }

async function yoonouGeoRouteWithSteps(from, to){
  const f = await _yoonouGeoRouteRaw(from, to, true);
  if (!f) return null;
  const props = f.properties;
  const coords = [].concat.apply([], f.geometry.coordinates);
  const leg = (props.legs && props.legs[0]) || { steps: [] };
  const raw = leg.steps || [];
  const steps = raw.map((s, i) => {
    const text = (s.instruction && s.instruction.text) || '';
    const next = raw[i + 1];
    const nextText = next && next.instruction ? next.instruction.text : '';
    const nextTextLow = _yoonouGeoLowerFirst(nextText).replace(/\.\s*$/, '');
    const isLast = i === raw.length - 1;
    const man = isLast ? { type: 'arrive' } : _yoonouGeoModifier(s.instruction);
    const d = s.distance || 0;
    const bannerText = nextText ? nextText.replace(/\.\s*$/, '') : 'Tu arrives à destination';
    const voice = [];
    if (nextText) {
      if (d > 150) voice.push({ distanceAlongGeometry: 100, announcement: nextText });
      if (d > 400) voice.push({ distanceAlongGeometry: 300, announcement: `Dans 300 mètres, ${nextTextLow}` });
      if (d > 900) voice.push({ distanceAlongGeometry: d, announcement: `Dans ${d >= 1000 ? (d / 1000).toFixed(1).replace('.', ',') + ' kilomètres' : Math.round(d / 10) * 10 + ' mètres'}, ${nextTextLow}` });
      if (!voice.length) voice.push({ distanceAlongGeometry: d, announcement: nextText });
    }
    return {
      distance: d, duration: s.time || 0,
      name: s.name || '',
      maneuver: Object.assign({ instruction: text }, man),
      voiceInstructions: voice,
      bannerInstructions: [{ distanceAlongGeometry: d, primary: { text: bannerText } }]
    };
  });
  return { geometry: { coordinates: coords }, distance: props.distance, duration: props.time, legs: [{ steps }] };
}

// ---- Créer une carte (MapLibre + OpenFreeMap) ----
// Ajoute la mention « Recherche Geoapify » (obligatoire avec l'offre gratuite).
function yoonouCreateMap(options){
  const opts = Object.assign({ style: YOONOU_MAP_STYLE }, options || {});
  const map = new maplibregl.Map(opts);
  return map;
}

// ---- Boutons de navigation externe (Google Maps / Waze) ----
function yoonouNavLinks(dest){
  const lat = Number(Number(dest.lat).toFixed(6)), lng = Number(Number(dest.lng).toFixed(6));
  return {
    google: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving&dir_action=navigate`,
    waze: `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`
  };
}

if (typeof module !== 'undefined') module.exports = { yoonouPinLabel, yoonouGeoSearch, yoonouGeoReverse, yoonouGeoRoute, yoonouGeoRouteWithSteps, _yoonouGeoModifier, yoonouNavLinks, YOONOU_GEO_VAGUE };
