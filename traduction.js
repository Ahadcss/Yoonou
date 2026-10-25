// ============================================================
// Yoonou — Traduction automatique français → anglais des pages
// Lit le dictionnaire de traduction-en.js. Quand la langue choisie
// est l'anglais, remplace les textes affichés (et ceux qui apparaissent
// plus tard) ainsi que les messages alert()/confirm().
// Si un texte n'est pas dans le dictionnaire, il reste en français.
// ============================================================
(function(){
  const ATTRS = ['placeholder','title','aria-label','alt'];
  const SKIP = {SCRIPT:1, STYLE:1, TEXTAREA:1, CODE:1};
  const norm = s => s.replace(/\s+/g,' ').trim();
  let exact = {}, patterns = [], frags = [], busy = false;

  function build(){
    const d = window.YOONOU_EN || {};
    exact = {}; patterns = [];
    Object.keys(d).forEach(k => {
      if (k.includes('{}')) {
        const re = new RegExp('^' + norm(k).split('{}').map(x => x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('(.+?)') + '$');
        patterns.push([re, d[k]]);
      } else exact[norm(k)] = d[k];
    });
    frags = (window.YOONOU_EN_FRAGS || []).slice().sort((a,b) => b[0].length - a[0].length);
  }
  function active(){ try { return localStorage.getItem('yoonou_lang') === 'en'; } catch(e){ return false; } }

  function tr(s){
    if (typeof s !== 'string') return s;
    const core = norm(s); if (!core) return s;
    let out = exact[core];
    if (out === undefined) {
      for (const [re, t] of patterns) {
        const m = core.match(re);
        if (m) { let i = 1; out = t.replace(/\{\}/g, () => m[i++]); break; }
      }
    }
    if (out === undefined) {
      let r = core, changed = false;
      for (const [a, b] of frags) if (r.includes(a)) { r = r.split(a).join(b); changed = true; }
      if (changed) out = r;
    }
    if (out === undefined) return s;
    return s.match(/^\s*/)[0] + out + s.match(/\s*$/)[0];
  }

  function doText(n){
    const p = n.parentNode; if (!p || SKIP[p.nodeName]) return;
    const v = n.nodeValue;
    if (n.__en !== undefined && v === n.__en) return;
    if (!/[A-Za-zÀ-ÿ]/.test(v)) return;
    const t = tr(v);
    if (t !== v) { n.__fr = v; n.__en = t; n.nodeValue = t; }
  }
  function doEl(el){
    ATTRS.forEach(a => {
      if (!el.hasAttribute(a)) return;
      const v = el.getAttribute(a), st = el.__attr || (el.__attr = {});
      if (st[a] && st[a].en === v) return;
      const t = tr(v);
      if (t !== v) { st[a] = {fr: v, en: t}; el.setAttribute(a, t); }
    });
  }
  function walk(root){
    if (root.nodeType === 3) { doText(root); return; }
    if (root.nodeType !== 1 || SKIP[root.nodeName]) return;
    doEl(root);
    const w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) { if (n.nodeType === 3) doText(n); else if (!SKIP[n.nodeName]) doEl(n); }
  }
  function restore(){
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      if (n.nodeType === 3) {
        if (n.__en !== undefined && n.nodeValue === n.__en) n.nodeValue = n.__fr;
        n.__en = undefined;
      } else if (n.__attr) {
        for (const a in n.__attr) if (n.getAttribute(a) === n.__attr[a].en) n.setAttribute(a, n.__attr[a].fr);
        n.__attr = null;
      }
    }
    if (document.__titleFr) document.title = document.__titleFr;
  }

  const mo = new MutationObserver(muts => {
    if (busy || !active()) return;
    busy = true;
    try {
      muts.forEach(m => {
        if (m.type === 'characterData') doText(m.target);
        else if (m.type === 'attributes') doEl(m.target);
        else m.addedNodes.forEach(walk);
      });
    } finally { busy = false; }
  });

  function start(){
    build();
    if (!active()) return;
    if (document.__titleFr === undefined) document.__titleFr = document.title;
    document.title = tr(document.__titleFr);
    busy = true; walk(document.body); busy = false;
    mo.observe(document.body, {childList:true, subtree:true, characterData:true, attributes:true, attributeFilter:ATTRS});
  }
  window.yoonouTr = tr;
  window.yoonouRetranslate = function(){
    if (active()) start();
    else { mo.disconnect(); restore(); }
  };

  ['alert','confirm','prompt'].forEach(name => {
    const orig = window[name];
    window[name] = function(msg, ...rest){
      if (active() && typeof msg === 'string') msg = msg.split('\n').map(tr).join('\n');
      return orig.call(window, msg, ...rest);
    };
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
