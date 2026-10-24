/* Taskora — Shared helpers */
window.TK = (function(){
  'use strict';
  const K_USER = 'taskora.user.v1';
  const K_TASKS = 'taskora.tasks.v1';
  const K_PROJECTS = 'taskora.projects.v1';
  const K_THEME = 'taskora.theme.v1';
  const K_PLAN = 'taskora.plan.v1';

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
    const x = new Date(d + 'T00:00:00');
    return x.toLocaleDateString(undefined, { month:'short', day:'numeric', year:'numeric' });
  }
  function fmtDateShort(d){
    if (!d) return '';
    const x = new Date(d + 'T00:00:00');
    return x.toLocaleDateString(undefined, { month:'short', day:'numeric' });
  }

  /* Theme */
  function initTheme(){
    const stored = load(K_THEME, null);
    if (stored === 'dark' || stored === 'light'){
      document.documentElement.setAttribute('data-theme', stored);
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches){
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  }
  function setTheme(theme){
    document.documentElement.setAttribute('data-theme', theme);
    save(K_THEME, theme);
    updateThemeLabels();
  }
  function toggleTheme(){
    const cur = document.documentElement.getAttribute('data-theme');
    setTheme(cur === 'dark' ? 'light' : 'dark');
    return document.documentElement.getAttribute('data-theme');
  }
  function updateThemeLabels(){
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    document.querySelectorAll('.theme-toggle').forEach(btn => {
      btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
    });
  }

  /* Toast */
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

  /* User */
  function getUser(){ return load(K_USER, null); }
  function setUser(u){ save(K_USER, u); }
  function clearUser(){ try{ localStorage.removeItem(K_USER); localStorage.removeItem(K_PLAN); }catch(e){} }
  function getPlan(){ return load(K_PLAN, 'free'); }
  function setPlan(p){ save(K_PLAN, p); }

  /* Data */
  function getTasks(){ return load(K_TASKS, []); }
  function setTasks(v){ save(K_TASKS, v); }
  function getProjects(){ return load(K_PROJECTS, []); }
  function setProjects(v){ save(K_PROJECTS, v); }
  function clearData(){ try{
    localStorage.removeItem(K_TASKS);
    localStorage.removeItem(K_PROJECTS);
  }catch(e){} }

  /* Boot theme + toggle buttons */
  initTheme();
  document.addEventListener('DOMContentLoaded', () => {
    updateThemeLabels();
    document.querySelectorAll('.theme-toggle').forEach(btn => {
      btn.addEventListener('click', () => toggleTheme());
    });
  });

  return {
    uid, escapeHtml, todayStr, startOfDay, isOverdue, fmtDate, fmtDateShort,
    initTheme, setTheme, toggleTheme, updateThemeLabels, toast,
    getUser, setUser, clearUser, getPlan, setPlan,
    getTasks, setTasks, getProjects, setProjects, clearData,
    KEYS:{ K_USER, K_TASKS, K_PROJECTS, K_THEME, K_PLAN }
  };
})();