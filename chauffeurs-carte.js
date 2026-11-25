// ============================================================
// Yoonou — Carte des chauffeurs à proximité (côté client)
//
//  YoonouDriversMap.open({ sb, lat, lng })   ouvre la carte plein écran
//  YoonouDriversMap.close()                  la ferme
//
// - Une icône par type de véhicule (vélo, moto, tricycle, charrette, voiture, SUV, minivan, pick-up, camionnette, camion)
// - Anneau vert + flèche = en mouvement ; anneau gris = à l'arrêt
// - Regroupement en bulles avec un nombre quand la carte est dézoomée (zoom libre, pas de rayon fixe côté écran)
// - Rafraîchissement toutes les 10 s (zoom proche) ou 20 s (dézoomé), uniquement carte ouverte et page visible
// - Positions approximatives (décalage ~100 m) fournies par la base : on ne voit ni nom, ni photo, ni numéro
//
// Données : fonction Supabase chauffeurs_a_proximite_carte (voir chauffeurs-carte.sql)
// ============================================================

const YoonouDriversMap = (function(){
  const EMOJIS = { velo:'🚲', moto:'🏍', tricycle:'🛺', charrette:'🐴', voiture:'🚗', suv:'🚙', minivan:'🚐', pickup:'🛻', camionnette:'🚚', camion:'🚛' };
  const CELL_PX = 64;          // taille d'une case de regroupement, en pixels
  const NO_CLUSTER_ZOOM = 16;  // à partir de ce zoom, chaque chauffeur a son icône
  const ANIM_MS = 2500;

  let overlay = null, map = null, ctx = null, timer = null;
  let points = [];                          // dernière liste reçue
  const markers = new Map();                // clé -> { marker, el, lng, lat, anim }
  let meMarker = null, closed = true;

  // ---------- Fonctions pures (testables) ----------
  function iconFor(type){ return EMOJIS[String(type || '').toLowerCase()] || '📦'; }

  // Regroupe les points qui tombent dans la même case de l'écran.
  // project(lng, lat) -> {x, y} en pixels ; renvoie [{ key, single:point | null, count, lng, lat, members }]
  function clusterPoints(pts, project, cellPx, noCluster){
    if (noCluster) return pts.map(p => ({ key: 'd:' + p.id_anonyme, single: p, count: 1, lng: p.lng, lat: p.lat, members: [p] }));
    const cells = new Map();
    for (const p of pts) {
      const s = project(p.lng, p.lat);
      const k = Math.floor(s.x / cellPx) + ',' + Math.floor(s.y / cellPx);
      if (!cells.has(k)) cells.set(k, []);
      cells.get(k).push(p);
    }
    const out = [];
    cells.forEach((members, k) => {
      if (members.length === 1) {
        const p = members[0];
        out.push({ key: 'd:' + p.id_anonyme, single: p, count: 1, lng: p.lng, lat: p.lat, members });
      } else {
        const lng = members.reduce((a, m) => a + m.lng, 0) / members.length;
        const lat = members.reduce((a, m) => a + m.lat, 0) / members.length;
        out.push({ key: 'c:' + k, single: null, count: members.length, lng, lat, members });
      }
    });
    return out;
  }

  function ageText(sec){
    if (sec == null) return '';
    if (sec < 90) return 'position à l’instant';
    return 'position il y a ' + Math.round(sec / 60) + ' min';
  }

  // ---------- Style (injecté une seule fois) ----------
  function ensureStyle(){
    if (document.getElementById('ydm-style')) return;
    const st = document.createElement('style'); st.id = 'ydm-style';
    st.textContent = `
      #ydm{position:fixed; inset:0; z-index:9998; background:#fff; display:flex; flex-direction:column;}
      #ydm .ydm-head{display:flex; align-items:center; justify-content:space-between; gap:10px; padding:12px 14px; padding-top:max(12px, env(safe-area-inset-top));
        background:var(--indigo-deep,#16213E); color:var(--sand,#F1E6D0); font-family:'Space Grotesk',sans-serif;}
      #ydm .ydm-title{font-weight:700; font-size:16px;} #ydm .ydm-sub{font-size:12.5px; opacity:.8; margin-top:2px;}
      #ydm .ydm-close{border:1.5px solid rgba(255,255,255,.5); background:none; color:inherit; border-radius:8px; padding:8px 12px; font-weight:600; font-size:13px; cursor:pointer;}
      #ydm .ydm-map{flex:1; position:relative; min-height:0;}
      #ydm .ydm-foot{background:#fff; border-top:1px solid #eee; padding:10px 12px; padding-bottom:max(10px, env(safe-area-inset-bottom)); display:flex; gap:8px; align-items:center; flex-wrap:wrap;}
      #ydm .ydm-chip{display:inline-flex; align-items:center; gap:6px; background:rgba(22,33,62,.07); border-radius:999px; padding:6px 10px; font-size:13px; font-weight:600;}
      #ydm .ydm-all{margin-left:auto; border:1.5px solid var(--teal,#2A7F76); background:none; color:var(--teal,#2A7F76); border-radius:8px; padding:8px 12px; font-weight:700; font-size:13px; cursor:pointer;}
      #ydm .ydm-empty{position:absolute; left:12px; right:12px; top:12px; z-index:5; background:#fff; border-radius:10px; padding:10px 12px; font-size:13.5px; box-shadow:0 2px 10px rgba(0,0,0,.2);}
      .ydm-pin{position:relative; width:38px; height:38px; border-radius:50%; background:#fff; border:3px solid #9aa0a6; display:flex; align-items:center; justify-content:center; font-size:20px; box-shadow:0 2px 6px rgba(0,0,0,.3); cursor:pointer;}
      .ydm-pin.moving{border-color:var(--teal,#2A7F76);}
      .ydm-arrow-wrap{position:absolute; inset:-9px; pointer-events:none; display:none;}
      .ydm-pin.moving .ydm-arrow-wrap{display:block;}
      .ydm-arrow{position:absolute; left:50%; top:0; margin-left:-6px; width:0; height:0; border-left:6px solid transparent; border-right:6px solid transparent; border-bottom:10px solid var(--teal,#2A7F76);}
      .ydm-label{display:none; position:absolute; top:44px; left:50%; transform:translateX(-50%); white-space:nowrap; background:var(--indigo-deep,#16213E); color:#fff; border-radius:8px; padding:5px 8px; font-size:12px; font-weight:600; z-index:3;}
      .ydm-pin.show-label .ydm-label{display:block;}
      .ydm-cluster{display:flex; align-items:center; justify-content:center; border-radius:50%; background:var(--teal,#2A7F76); color:#fff; font-family:'Space Grotesk',sans-serif; font-weight:700; border:3px solid #fff; box-shadow:0 2px 6px rgba(0,0,0,.3); cursor:pointer;}
      .ydm-me{width:16px; height:16px; border-radius:50%; background:#1a73e8; border:3px solid #fff; box-shadow:0 0 0 6px rgba(26,115,232,.25);}
    `;
    document.head.appendChild(st);
  }

  // ---------- Éléments de la carte ----------
  function singleElement(p){
    const el = document.createElement('div');
    el.className = 'ydm-pin ' + (p.en_mouvement ? 'moving' : 'idle');
    el.innerHTML = '<span class="ydm-emoji"></span><span class="ydm-arrow-wrap"><span class="ydm-arrow"></span></span><span class="ydm-label"></span>';
    updateSingle(el, p);
    el.addEventListener('click', e => { e.stopPropagation(); el.classList.toggle('show-label'); });
    return el;
  }
  function updateSingle(el, p){
    el.classList.toggle('moving', !!p.en_mouvement);
    el.classList.toggle('idle', !p.en_mouvement);
    el.querySelector('.ydm-emoji').textContent = iconFor(p.type);
    const wrap = el.querySelector('.ydm-arrow-wrap');
    wrap.style.transform = 'rotate(' + (Number(p.cap) || 0) + 'deg)';
    el.querySelector('.ydm-label').textContent = (p.label || p.type || 'Véhicule') + ' · ' + (p.en_mouvement ? 'en mouvement' : 'à l’arrêt') + ' · ' + ageText(p.age_s);
  }
  function clusterElement(c){
    const el = document.createElement('div');
    const size = c.count >= 100 ? 54 : c.count >= 20 ? 46 : 38;
    el.className = 'ydm-cluster'; el.style.width = el.style.height = size + 'px';
    el.style.fontSize = (c.count >= 100 ? 15 : 14) + 'px';
    el.textContent = c.count;
    el.addEventListener('click', e => { e.stopPropagation(); map.easeTo({ center: [c.lng, c.lat], zoom: Math.min(map.getZoom() + 2, 18) }); });
    return el;
  }

  // Déplacement fluide d'une icône vers sa nouvelle position
  function animateTo(entry, lng, lat){
    if (entry.anim) cancelAnimationFrame(entry.anim);
    if (document.hidden || (Math.abs(entry.lng - lng) < 1e-7 && Math.abs(entry.lat - lat) < 1e-7)) {
      entry.lng = lng; entry.lat = lat; entry.marker.setLngLat([lng, lat]); return;
    }
    const from = { lng: entry.lng, lat: entry.lat }, t0 = performance.now();
    const step = now => {
      const k = Math.min(1, (now - t0) / ANIM_MS);
      entry.lng = from.lng + (lng - from.lng) * k; entry.lat = from.lat + (lat - from.lat) * k;
      entry.marker.setLngLat([entry.lng, entry.lat]);
      entry.anim = k < 1 ? requestAnimationFrame(step) : null;
    };
    entry.anim = requestAnimationFrame(step);
  }

  function renderMarkers(){
    if (!map) return;
    const noCluster = map.getZoom() >= NO_CLUSTER_ZOOM;
    const items = clusterPoints(points, (lng, lat) => map.project([lng, lat]), CELL_PX, noCluster);
    const keep = new Set(items.map(i => i.key));
    markers.forEach((entry, key) => { if (!keep.has(key)) { if (entry.anim) cancelAnimationFrame(entry.anim); entry.marker.remove(); markers.delete(key); } });
    for (const it of items) {
      const entry = markers.get(it.key);
      if (it.single) {
        if (entry) { updateSingle(entry.el, it.single); animateTo(entry, it.lng, it.lat); }
        else {
          const el = singleElement(it.single);
          const m = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([it.lng, it.lat]).addTo(map);
          markers.set(it.key, { marker: m, el, lng: it.lng, lat: it.lat, anim: null });
        }
      } else {
        if (entry) { entry.el.textContent = it.count; entry.marker.setLngLat([it.lng, it.lat]); entry.lng = it.lng; entry.lat = it.lat; }
        else {
          const el = clusterElement(it);
          const m = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([it.lng, it.lat]).addTo(map);
          markers.set(it.key, { marker: m, el, lng: it.lng, lat: it.lat, anim: null });
        }
      }
    }
  }

  function renderLegend(){
    const foot = overlay.querySelector('.ydm-chips');
    const byType = {};
    points.forEach(p => { byType[p.type] = byType[p.type] || { n: 0, label: p.label || p.type }; byType[p.type].n++; });
    foot.innerHTML = Object.keys(byType).sort((a, b) => byType[b].n - byType[a].n)
      .map(t => '<span class="ydm-chip"><span>' + iconFor(t) + '</span>' + byType[t].n + ' <span style="font-weight:500">' + byType[t].label + '</span></span>').join('');
    overlay.querySelector('.ydm-sub').textContent = points.length
      ? points.length + ' chauffeur' + (points.length > 1 ? 's' : '') + ' disponible' + (points.length > 1 ? 's' : '') + ' (positions approximatives)'
      : 'Aucun chauffeur disponible pour le moment';
    const empty = overlay.querySelector('.ydm-empty');
    empty.style.display = points.length ? 'none' : 'block';
  }

  // ---------- Données ----------
  async function refresh(){
    if (closed || !ctx) return;
    try {
      const { data, error } = await ctx.sb.rpc('chauffeurs_a_proximite_carte', { client_lat: ctx.lat, client_lng: ctx.lng, rayon_km: 300, max_resultats: 300 });
      if (error) throw error;
      points = (data || []).map(r => ({
        id_anonyme: r.id_anonyme, type: r.type, label: r.label,
        lat: Number(r.lat), lng: Number(r.lng), en_mouvement: !!r.en_mouvement, cap: r.cap == null ? null : Number(r.cap), age_s: r.age_s
      })).filter(p => isFinite(p.lat) && isFinite(p.lng));
      if (closed) return;
      renderMarkers(); renderLegend();
    } catch (e) {
      console.warn('Carte des chauffeurs indisponible :', e && e.message);
      if (!closed && overlay) {
        const empty = overlay.querySelector('.ydm-empty');
        empty.textContent = 'La carte des chauffeurs est indisponible pour le moment. Réessaie dans un instant.'; empty.style.display = 'block';
      }
    }
    schedule();
  }

  function schedule(){
    clearTimeout(timer);
    if (closed || !map) return;
    const delay = map.getZoom() >= 13 ? 10000 : 20000;
    timer = setTimeout(() => { if (!document.hidden) refresh(); else schedule(); }, delay);
  }

  function onVisibility(){ if (!closed && !document.hidden) refresh(); }

  function fitAll(){
    if (!map || !points.length) return;
    const b = new maplibregl.LngLatBounds();
    b.extend([ctx.lng, ctx.lat]);
    points.forEach(p => b.extend([p.lng, p.lat]));
    map.fitBounds(b, { padding: 60, maxZoom: 15, duration: 600 });
  }

  // ---------- Ouverture / fermeture ----------
  function open(options){
    if (!closed) return;
    if (typeof maplibregl === 'undefined') { alert('La carte ne peut pas se charger (connexion internet requise).'); return; }
    ensureStyle();
    ctx = { sb: options.sb, lat: Number(options.lat), lng: Number(options.lng) };
    closed = false; points = [];
    overlay = document.createElement('div'); overlay.id = 'ydm';
    overlay.innerHTML = `
      <div class="ydm-head"><div><div class="ydm-title">🗺️ Chauffeurs à proximité</div><div class="ydm-sub">Chargement…</div></div>
        <button type="button" class="ydm-close">Fermer</button></div>
      <div class="ydm-map"><div class="ydm-empty" style="display:none"></div><div id="ydmCanvas" style="position:absolute; inset:0;"></div></div>
      <div class="ydm-foot"><span class="ydm-chips" style="display:contents"></span><button type="button" class="ydm-all">Voir tout</button></div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('.ydm-close').addEventListener('click', close);
    overlay.querySelector('.ydm-all').addEventListener('click', fitAll);

    map = new maplibregl.Map({
      container: 'ydmCanvas', style: YOONOU_MAP_STYLE, center: [ctx.lng, ctx.lat], zoom: 13,
      attributionControl: { compact: true }
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    const meEl = document.createElement('div'); meEl.className = 'ydm-me';
    meMarker = new maplibregl.Marker({ element: meEl }).setLngLat([ctx.lng, ctx.lat]).addTo(map);
    map.on('zoomend', () => { renderMarkers(); schedule(); });
    map.on('moveend', renderMarkers);
    map.on('click', () => overlay.querySelectorAll('.ydm-pin.show-label').forEach(e => e.classList.remove('show-label')));
    document.addEventListener('visibilitychange', onVisibility);
    map.on('load', refresh);
    // si la carte tarde, on charge quand même les chauffeurs
    setTimeout(() => { if (!closed && !points.length && map && overlay) refresh(); }, 1500);
  }

  function close(){
    closed = true; clearTimeout(timer);
    document.removeEventListener('visibilitychange', onVisibility);
    markers.forEach(e => { if (e.anim) cancelAnimationFrame(e.anim); try { e.marker.remove(); } catch (x) { /* déjà retiré */ } });
    markers.clear();
    if (meMarker) { try { meMarker.remove(); } catch (x) { /* déjà retiré */ } }
    if (map) { try { map.remove(); } catch (e) { /* déjà détruite */ } map = null; }
    if (overlay) { overlay.remove(); overlay = null; }
    meMarker = null; points = [];
  }

  const api = { open, close, _clusterPoints: clusterPoints, _iconFor: iconFor, _ageText: ageText };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
