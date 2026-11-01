/* VYQORLUNE — Shared helpers */
window.TK = (function(){
  'use strict';
  const K_USER   = 'taskora.user.v1';
  const K_TASKS  = 'taskora.tasks.v1';
  const K_PROJECTS = 'taskora.projects.v1';
  const K_PLAN   = 'taskora.plan.v1';
  const K_CUSTOM = 'taskora.custom.v1';
  const K_LOGO   = 'taskora.logo.v1';

  function load(k, f){ try{ const v = localStorage.getItem(k); return v ? JSON.parse(v) : f; } catch(e){ return f; } }
  function save(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); } catch(e){} }

  function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
  function escapeHtml(s){
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function todayStr(){
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }
  function startOfDay(d){ const x = new Date(d); x.setHours(0,0,0,0); return x; }
  function isOverdue(t){
    if (!t.dueDate || t.status === 'completed') return false;
    return startOfDay(t.dueDate + 'T00:00:00') < startOfDay(new Date());
  }
  function fmtDate(d){
    if (!d) return '';
    return new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month:'short', day:'numeric', year:'numeric' });
  }
  function fmtDateShort(d){
    if (!d) return '';
    return new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month:'short', day:'numeric' });
  }

  /* ===== Custom brand color ===== */
  function getCustomTheme(){ return load(K_CUSTOM, {}); }
  function setCustomTheme(primary){ save(K_CUSTOM, { primary }); applyCustomTheme(); }
  function resetCustomTheme(){
    try{ localStorage.removeItem(K_CUSTOM); }catch(e){}
    ['--blue-50','--blue-500','--blue-600','--blue-700'].forEach(v => document.documentElement.style.removeProperty(v));
  }
  function shadeColor(hex){
    const h = hex.replace('#','');
    const n = parseInt(h.length === 3 ? h.split('').map(c => c+c).join('') : h, 16);
    const r = (n>>16)&255, g = (n>>8)&255, b = n&255;
    const mixT = (c, t, a) => Math.round(c + (t - c) * a);
    const mixS = (c, a) => Math.round(c - c * a);
    const toHex = (r,g,b) => '#' + [r,g,b].map(v => Math.max(0,Math.min(255,v)).toString(16).padStart(2,'0')).join('');
    return {
      50:  toHex(mixT(r,255,.92), mixT(g,255,.92), mixT(b,255,.92)),
      500: hex,
      600: toHex(mixS(r,.10), mixS(g,.10), mixS(b,.10)),
      700: toHex(mixS(r,.25), mixS(g,.25), mixS(b,.25))
    };
  }
  function applyCustomTheme(){
    const t = getCustomTheme();
    if (!t.primary) return;
    const shades = shadeColor(t.primary);
    const root = document.documentElement;
    root.style.setProperty('--blue-50',  shades[50]);
    root.style.setProperty('--blue-500', shades[500]);
    root.style.setProperty('--blue-600', shades[600]);
    root.style.setProperty('--blue-700', shades[700]);
  }

  /* ===== Logo ===== */
  function getLogo(){ return load(K_LOGO, ''); }
  function setLogo(dataUrl){
    if (dataUrl) save(K_LOGO, dataUrl);
    else { try{ localStorage.removeItem(K_LOGO); }catch(e){} }
    refreshBrandMarks();
  }
  function refreshBrandMarks(){
    const logo = getLogo();
    document.querySelectorAll('.brand-mark').forEach(el => {
      const svg = el.querySelector('svg');
      let img = el.querySelector('img');
      if (logo){
        el.classList.add('has-logo');
        if (!img){
          img = document.createElement('img');
          img.alt = '';
          el.appendChild(img);
        }
        img.src = logo;
        if (svg) svg.style.display = 'none';
      } else {
        el.classList.remove('has-logo');
        if (img) img.remove();
        if (svg) svg.style.display = '';
      }
    });
  }

  /* ===== Toast ===== */
  let toastTimer = null;
  function toast(msg, type){
    let el = document.getElementById('tk-toast');
    if (!el){
      el = document.createElement('div');
      el.id = 'tk-toast';
      el.className = 'toast';
      el.setAttribute('role','status');
      el.setAttribute('aria-live','polite');
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.className = 'toast show ' + (type || '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = 'toast'; }, 2800);
  }

  /* ===== User ===== */
  function getRegisteredUser(){ return load(K_USER, null); }
  function getUser(){
    const u = load(K_USER, null);
    if (!u) return null;
    if (u.loggedOut === true) return null;
    return u;
  }
  function setUser(u){ save(K_USER, u); }
  function clearUser(){
    try{
      const u = load(K_USER, null);
      if (u){ u.loggedOut = true; save(K_USER, u); }
      localStorage.removeItem(K_PLAN);
    }catch(e){}
  }
  function getPlan(){ return load(K_PLAN, 'free'); }
  function setPlan(p){ save(K_PLAN, p); }

  /* ===== Per-user data ===== */
  function userKey(base){
    const u = load(K_USER, null);
    return u && u.email ? base + '.' + u.email : base;
  }
  function getTasks(){ return load(userKey(K_TASKS), []); }
  function setTasks(v){ save(userKey(K_TASKS), v); }
  function getProjects(){ return load(userKey(K_PROJECTS), []); }
  function setProjects(v){ save(userKey(K_PROJECTS), v); }
  function clearData(){
    try{
      localStorage.removeItem(userKey(K_TASKS));
      localStorage.removeItem(userKey(K_PROJECTS));
    }catch(e){}
  }

  /* ===== Export / Import account ===== */
  function exportAccount(){
    const user = load(K_USER, null);
    if (!user) return null;
    return {
      version: '1.0',
      app: 'VYQORLUNE',
      exportedAt: new Date().toISOString(),
      user,
      tasks: getTasks(),
      projects: getProjects(),
      logo: getLogo(),
      plan: getPlan(),
      custom: getCustomTheme()
    };
  }
  function importAccount(data){
    if (!data || !data.user || !data.user.email) throw new Error('Invalid account file');
    save(K_USER, data.user);
    if (Array.isArray(data.tasks)) save(userKey(K_TASKS), data.tasks);
    if (Array.isArray(data.projects)) save(userKey(K_PROJECTS), data.projects);
    if (data.logo) save(K_LOGO, data.logo);
    if (data.plan) save(K_PLAN, data.plan);
    if (data.custom) save(K_CUSTOM, data.custom);
    applyCustomTheme();
    refreshBrandMarks();
    return data.user;
  }
  function downloadAccount(){
    const data = exportAccount();
    if (!data){ toast('No account to export', 'error'); return; }
    const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'vyqorlune-account-' + todayStr() + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Account exported — carry to another device', 'success');
  }
  function readAccountFile(file, callback){
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = JSON.parse(e.target.result);
        importAccount(data);
        callback(null, data);
      } catch(err){ callback(err); }
    };
    reader.onerror = () => callback(new Error('Could not read file'));
    reader.readAsText(file);
  }

  /* ===== Boot ===== */
  document.addEventListener('DOMContentLoaded', () => {
    applyCustomTheme();
    refreshBrandMarks();
  });

  return {
    uid, escapeHtml, todayStr, startOfDay, isOverdue, fmtDate, fmtDateShort, toast,
    getCustomTheme, setCustomTheme, resetCustomTheme, applyCustomTheme,
    getLogo, setLogo, refreshBrandMarks,
    getRegisteredUser, getUser, setUser, clearUser, getPlan, setPlan,
    getTasks, setTasks, getProjects, setProjects, clearData,
    exportAccount, importAccount, downloadAccount, readAccountFile,
    KEYS:{ K_USER, K_TASKS, K_PROJECTS, K_PLAN, K_CUSTOM, K_LOGO }
  };
})();


/* ============================================================
   PAGE TRANSITION HELPER — minimal, works with native VT
   ============================================================ */
window.PageTransition = (function(){
  'use strict';

  function prefersReducedMotion(){
    return window.matchMedia &&
           window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function supportsViewTransitions(){
    return typeof CSS !== 'undefined' &&
           CSS.supports &&
           CSS.supports('view-transition-name: none');
  }

  function go(url){
    if (!url || window._navigating) return;
    if (location.href.split('#')[0] === new URL(url, location.href).href.split('#')[0]) {
      location.hash = new URL(url, location.href).hash;
      return;
    }
    window._navigating = true;

    if (prefersReducedMotion() || supportsViewTransitions()){
      location.href = url;
    } else {
      document.documentElement.classList.add('vt-exit');
      setTimeout(() => { location.href = url; }, 220);
    }
  }

  /* Reset navigating flag when returning via bfcache */
  window.addEventListener('pageshow', e => {
    if (e.persisted){
      window._navigating = false;
      document.documentElement.classList.remove('vt-exit');
    }
  });

  return { go };
})();