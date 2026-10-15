// ============================================================
// Yoonou — Recherche de lieux (partagée par nouvelle-demande.html et ajouter-zone.html)
//
// Pourquoi : la recherche d'adresses ne trouvait pas certains lieux pourtant
// visibles sur la carte (ex. un dispensaire). Causes probables : pluriel / accents /
// mots en trop dans ce qui est tapé, et base de recherche Mapbox incomplète.
//
// Ce que fait ce fichier :
//  1. Corrige la saisie (accents, pluriels, mots courts) et essaie plusieurs variantes
//  2. Cherche d'abord dans les lieux ajoutés par la communauté Yoonou (validés)
//  3. Interroge Mapbox Geocoding (gratuit jusqu'à un gros volume) avec ces variantes
//  4. Si une carte est affichée, cherche aussi dans les lieux écrits sur la carte
//  5. Fournit yoonouPoiAtPoint() : le nom du lieu écrit sur la carte à l'endroit touché
// ============================================================

const YOONOU_PROXIMITY = { lng: -17.4677, lat: 14.7167 }; // Dakar

function yoonouNormalize(str){
  return String(str || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // enlève les accents
    .replace(/[’'`´]/g, ' ')                            // apostrophes -> espace
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Singulier approximatif : "dispensaires" -> "dispensaire"
function yoonouSingular(word){
  if (word.length > 4 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  if (word.length > 4 && word.endsWith('x')) return word.slice(0, -1);
  return word;
}

// Variantes de recherche, de la plus précise à la plus large
function yoonouQueryVariants(query){
  const norm = yoonouNormalize(query);
  const tokens = norm.split(' ').filter(Boolean);
  const variants = [];
  const add = v => { v = v.trim(); if (v.length >= 3 && !variants.includes(v)) variants.push(v); };

  add(query.trim());
  add(norm);
  add(tokens.map(yoonouSingular).join(' '));
  if (tokens.length >= 2) {
    // sans le premier mot (souvent un mot générique : "dispensaire", "pharmacie", "rond-point")
    add(tokens.slice(1).map(yoonouSingular).join(' '));
    // le dernier mot seul si assez long
    const last = tokens[tokens.length - 1];
    if (last.length >= 5) add(last);
  }
  return variants.slice(0, 4);
}

function yoonouDistanceM(a, b){
  const R = 6371000, toRad = x => x * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat/2)**2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function yoonouFetchJson(url){
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) { return null; }
}

// --- Mapbox Geocoding (comme avant) ---
async function yoonouGeocoding(query, token, prox){
  const base = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${token}&country=sn&language=fr&limit=6&proximity=${prox.lng},${prox.lat}`;
  let data = await yoonouFetchJson(base + '&types=poi,address,neighborhood,locality,place');
  if (!data || !data.features || data.features.length === 0) data = await yoonouFetchJson(base);
  return ((data && data.features) || []).map(f => {
    // Titre = nom du lieu ; détail = quartier / commune / région (le reste de l'adresse, sans « Sénégal »)
    const title = f.text_fr || f.text || f.place_name;
    const parts = String(f.place_name || '').split(',').map(x => x.trim()).filter(Boolean);
    if (parts.length && yoonouNormalize(parts[0]) === yoonouNormalize(title)) parts.shift();
    const subtitle = parts.filter(x => !/^s[eé]n[eé]gal$/i.test(x)).join(', ');
    return { label: f.place_name, title, subtitle, lat: f.center[1], lng: f.center[0], source: 'geocoding' };
  });
}

// --- Lieux écrits sur la carte (si une carte Mapbox est affichée) ---
function yoonouMapLabelsSearch(map, query){
  if (!map || !map.isStyleLoaded || !map.isStyleLoaded()) return [];
  const qTokens = yoonouNormalize(query).split(' ').filter(t => t.length >= 2).map(yoonouSingular);
  if (qTokens.length === 0) return [];
  let features = [];
  try {
    features = map.querySourceFeatures('composite', { sourceLayer: 'poi_label' });
  } catch (e) { return []; }
  const seen = new Set(), out = [];
  for (const f of features) {
    const name = f.properties && (f.properties.name_fr || f.properties.name);
    if (!name || !f.geometry || f.geometry.type !== 'Point') continue;
    const nName = yoonouNormalize(name);
    if (!qTokens.every(t => nName.includes(t))) continue;
    const key = nName + '|' + f.geometry.coordinates.map(c => c.toFixed(4)).join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ label: name + ' (sur la carte)', title: name, subtitle: 'Lieu écrit sur la carte', lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], source: 'carte' });
    if (out.length >= 4) break;
  }
  return out;
}

// --- Le nom du lieu écrit sur la carte à l'endroit touché / au centre ---
function yoonouPoiAtPoint(map, point, radiusPx){
  if (!map) return null;
  const r = radiusPx || 18;
  let feats = [];
  try {
    feats = map.queryRenderedFeatures([[point.x - r, point.y - r], [point.x + r, point.y + r]]);
  } catch (e) { return null; }
  const poi = feats.find(f => f.layer && /poi|place-label|landmark|transit|airport/.test(f.layer.id)
                              && f.properties && (f.properties.name_fr || f.properties.name));
  return poi ? (poi.properties.name_fr || poi.properties.name) : null;
}

// --- Point d'entrée : renvoie [{label, lat, lng, yoonou}] ---
async function yoonouSearchPlaces(query, sb, token, options){
  options = options || {};
  const prox = options.proximity || YOONOU_PROXIMITY;
  const variants = yoonouQueryVariants(query);
  const results = [];

  // 1) Lieux Yoonou validés (communauté), insensible aux accents / mots partiels
  try {
    const words = yoonouNormalize(query).split(' ').filter(w => w.length >= 3).map(yoonouSingular);
    if (sb && words.length) {
      const colonnes = ['nom_zone, description, type_lieu, adresse, latitude, longitude', 'nom_zone, description, latitude, longitude'];
      let data = null;
      for (const cols of colonnes) {      // 2e essai sans type_lieu / adresse si ces colonnes n'existent pas encore
        const rep = await sb.from('zone_suggestions').select(cols)
          .eq('statut', 'APPROUVEE')
          .ilike('nom_zone', `%${words[words.length - 1]}%`)
          .limit(20);
        if (!rep.error) { data = rep.data; break; }
      }
      (data || [])
        .filter(z => { const n = yoonouNormalize(z.nom_zone + ' ' + (z.description || '')); return words.every(w => n.includes(w)); })
        .slice(0, 3)
        .forEach(z => results.push({
          label: z.nom_zone + (z.description ? ' — ' + z.description : ''),
          title: z.nom_zone,
          subtitle: [z.type_lieu, z.adresse || z.description].filter(Boolean).join(' · '),
          lat: z.latitude, lng: z.longitude, yoonou: true
        }));
    }
  } catch (e) { console.warn('Lieux Yoonou indisponibles :', e.message); }

  // 2) Lieux écrits sur la carte affichée
  yoonouMapLabelsSearch(options.map, query).forEach(r => results.push(r));

  // 3) Mapbox : on essaie les variantes jusqu'à avoir des résultats
  for (const v of variants) {
    const found = await yoonouGeocoding(v, token, prox);
    found.forEach(r => results.push(r));
    if (found.length >= 3) break;
  }

  // 4) Dédoublonnage (même endroit à ~60 m près) et tri : lieux Yoonou, puis proximité
  const unique = [];
  for (const r of results) {
    if (!unique.some(u => yoonouDistanceM(u, r) < 60 && yoonouNormalize(u.label).slice(0, 8) === yoonouNormalize(r.label).slice(0, 8))) unique.push(r);
  }
  // Distance depuis la personne (si sa position est connue) : affichée à droite, comme dans les applis de transport
  const from = options.from;
  if (from && isFinite(from.lat) && isFinite(from.lng)) unique.forEach(r => { r.distanceM = yoonouDistanceM(from, r); });
  unique.sort((x, y) => ((y.yoonou ? 1 : 0) - (x.yoonou ? 1 : 0)) || ((x.distanceM != null && y.distanceM != null) ? x.distanceM - y.distanceM : 0));
  return unique.slice(0, 8);
}


// ============================================================
// Lecture d'une position reçue par message (WhatsApp, SMS, Telegram…)
// Reconnaît : liens Google Maps / Apple Plans / OpenStreetMap, « geo: », coordonnées simples
// (14.7167, -17.4677 ou 14.7167° N, 17.4677° W) et codes plus (« 7FG8+8R Dakar »).
// Renvoie { type: 'coords', lat, lng } | { type: 'short' } (lien court non lisible ici) | null.
// ============================================================
const YOONOU_OLC = '23456789CFGHJMPQRVWX';

function yoonouOlcEncode(lat, lng){            // code à 10 chiffres (précision ~14 m)
  lat = Math.min(90 - 1e-9, Math.max(-90, lat)); lng = ((lng + 180) % 360 + 360) % 360 - 180;
  let latVal = Math.floor((lat + 90) * 8000 + 1e-7), lngVal = Math.floor((lng + 180) * 8000 + 1e-7);
  let code = '';
  for (let i = 0; i < 5; i++) {
    code = YOONOU_OLC[lngVal % 20] + code; lngVal = Math.floor(lngVal / 20);
    code = YOONOU_OLC[latVal % 20] + code; latVal = Math.floor(latVal / 20);
  }
  return code.slice(0, 8) + '+' + code.slice(8);
}

function yoonouOlcDecode(code){               // code complet -> centre de la zone
  const clean = code.replace('+', '').toUpperCase();
  let lat = -90, lng = -180, res = 20;
  const pairs = Math.min(clean.length, 10);
  for (let i = 0; i < pairs; i += 2) {
    lat += YOONOU_OLC.indexOf(clean[i]) * res;
    lng += YOONOU_OLC.indexOf(clean[i + 1]) * res;
    if (i < 8) res /= 20;
  }
  let latSize = res * (pairs >= 10 ? 1 : 20), lngSize = latSize;
  if (pairs >= 10) { latSize = lngSize = 0.000125; }
  else { latSize = lngSize = 20 / Math.pow(20, pairs / 2 - 1) ; }
  if (clean.length > 10) {
    let rowRes = 0.000125 / 5, colRes = 0.000125 / 4;
    for (let i = 10; i < clean.length; i++) {
      const idx = YOONOU_OLC.indexOf(clean[i]);
      lat += Math.floor(idx / 4) * rowRes; lng += (idx % 4) * colRes;
      latSize = rowRes; lngSize = colRes; rowRes /= 5; colRes /= 4;
    }
  }
  return { lat: lat + latSize / 2, lng: lng + lngSize / 2 };
}

function yoonouOlcRecover(shortCode, refLat, refLng){   // code court + position de référence
  const plus = shortCode.indexOf('+');
  const padding = 8 - plus;
  if (plus < 2 || plus % 2 !== 0 || padding <= 0) return null;
  const resolution = Math.pow(20, 2 - padding / 2), half = resolution / 2;
  const rLat = Math.floor(refLat / resolution) * resolution, rLng = Math.floor(refLng / resolution) * resolution;
  const prefix = yoonouOlcEncode(rLat, rLng).slice(0, padding);
  const area = yoonouOlcDecode(prefix + shortCode.toUpperCase());
  let lat = area.lat, lng = area.lng;
  if (lat - refLat > half) lat -= resolution; else if (lat - refLat < -half) lat += resolution;
  if (lng - refLng > half) lng -= resolution; else if (lng - refLng < -half) lng += resolution;
  return { lat, lng };
}

function yoonouParsePosition(input, ref){
  if (!input) return null;
  ref = ref || YOONOU_PROXIMITY;
  let text = String(input).trim();
  try { text = decodeURIComponent(text.replace(/\+/g, '%2B')).replace(/%2B/g, '+'); } catch (e) { /* texte déjà lisible */ }

  const valid = (la, ln) => isFinite(la) && isFinite(ln) && Math.abs(la) <= 90 && Math.abs(ln) <= 180 && !(la === 0 && ln === 0);
  const ok = (la, ln) => { la = parseFloat(la); ln = parseFloat(ln); return valid(la, ln) ? { type: 'coords', lat: la, lng: ln } : null; };
  const num = '(-?\\d{1,3}(?:\\.\\d+)?)';

  // 1) Liens et formats connus
  let m;
  if ((m = text.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/))) { const r = ok(m[1], m[2]); if (r) return r; }
  if ((m = text.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/))) { const r = ok(m[1], m[2]); if (r) return r; }
  if ((m = text.match(new RegExp('[?&#](?:q|ll|sll|query|destination|daddr|saddr|center|coordinate|viewpoint|map_action=map&center)=(?:loc:)?' + num + '[,;+ ]\\s*' + num, 'i')))) { const r = ok(m[1], m[2]); if (r) return r; }
  if ((m = text.match(new RegExp('geo:' + num + ',' + num, 'i')))) { const r = ok(m[1], m[2]); if (r) return r; }
  if ((m = text.match(new RegExp('/place/' + num + ',' + num)))) { const r = ok(m[1], m[2]); if (r) return r; }
  if ((m = text.match(/[?&]mlat=(-?\d+(?:\.\d+)?)&mlon=(-?\d+(?:\.\d+)?)/))) { const r = ok(m[1], m[2]); if (r) return r; }
  if ((m = text.match(/#map=\d+\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/))) { const r = ok(m[1], m[2]); if (r) return r; }

  // 2) Coordonnées avec N/S/E/O (ex. 14.7167° N, 17.4677° W)
  if ((m = text.match(/(\d{1,2}(?:\.\d+)?)\s*°?\s*([NS])[\s,;]+(\d{1,3}(?:\.\d+)?)\s*°?\s*([EWO])/i))) {
    const la = parseFloat(m[1]) * (m[2].toUpperCase() === 'S' ? -1 : 1);
    const ln = parseFloat(m[3]) * (/[WO]/i.test(m[4]) ? -1 : 1);
    if (valid(la, ln)) return { type: 'coords', lat: la, lng: ln };
  }

  // 3) Deux nombres décimaux collés (au moins 3 décimales, pour éviter les faux positifs)
  if ((m = text.match(/(-?\d{1,2}\.\d{3,})\s*[,;\s]\s*(-?\d{1,3}\.\d{3,})/))) { const r = ok(m[1], m[2]); if (r) return r; }

  // 4) Code plus (complet ou court, ex. « 7FG8+8R Dakar »)
  if ((m = text.match(/\b([23456789CFGHJMPQRVWX]{2,8}\+[23456789CFGHJMPQRVWX]{2,3})\b/i))) {
    const code = m[1].toUpperCase();
    const before = code.indexOf('+');
    if (before === 8) { const c = yoonouOlcDecode(code); if (valid(c.lat, c.lng)) return { type: 'coords', lat: c.lat, lng: c.lng, source: 'pluscode' }; }
    else { const c = yoonouOlcRecover(code, ref.lat, ref.lng); if (c && valid(c.lat, c.lng)) return { type: 'coords', lat: c.lat, lng: c.lng, source: 'pluscode' }; }
  }

  // 5) Lien court (non lisible depuis le navigateur)
  if (/(maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs|bit\.ly|tinyurl|t\.co\/|share\.here\.com|what3words)/i.test(text)) return { type: 'short' };
  return null;
}

// Numéro au format wa.me : chiffres seulement, indicatif Sénégal (221) ajouté si le numéro a 9 chiffres
function yoonouWaNumber(raw){
  let d = String(raw || '').replace(/[^0-9]/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 9) d = '221' + d;
  return d;
}

if (typeof module !== 'undefined') module.exports = { yoonouWaNumber, yoonouParsePosition, yoonouOlcEncode, yoonouOlcDecode, yoonouOlcRecover, YOONOU_PROXIMITY };
