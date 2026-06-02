'use strict';

/* ── Module loader ── */
const loaded = new Set();

async function loadModule(name, targetEl) {
  if (loaded.has(name)) return;
  loaded.add(name);
  const base = `modules/${name}/${name}`;
  const [html, css] = await Promise.all([
    fetch(base + '.html').then(r => r.text()),
    fetch(base + '.css').then(r => r.text()),
  ]);
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
  const el = targetEl || document.getElementById('mod-' + name);
  if (el) el.insertAdjacentHTML('beforeend', html);
  await new Promise((ok, fail) => {
    const s = document.createElement('script');
    s.src = base + '.js';
    s.onload = ok; s.onerror = fail;
    document.head.appendChild(s);
  });
}

/* ── Tab switching ── */
const TABS = ['main', 'health', 'training', 'others'];
const TAB_MOD = { health: 'health', training: 'training' };
let curTab = 'main';

function switchTab(tab) {
  if (tab === curTab && !window._financeOpen) return;
  if (window._financeOpen) {
    window._financeOpen = false;
    document.getElementById('mod-finance').classList.remove('active');
    document.body.classList.remove('finance-open');
  }
  TABS.forEach(t => {
    document.getElementById('mod-' + t).classList.toggle('active', t === tab);
    document.getElementById('tab-' + t).classList.toggle('active', t === tab);
  });
  curTab = tab;
  if (tab === 'others') {
    // Bible (includes Thoughts + Grades/School tabs inline)
    const el = document.getElementById('mod-others');
    loadModule('bible', el);
  } else if (tab === 'main') {
    // Main loads todo list; life-calendar CSS+JS boot after #cal-root exists
    loadModule('main').then(() => loadModule('life-calendar', document.getElementById('mod-main')));
  } else {
    loadModule(TAB_MOD[tab] || tab);
  }
}

function openFinance(e) {
  if (e) e.preventDefault();
  const fin = document.getElementById('mod-finance');
  fin.classList.add('active');
  window._financeOpen = true;
  document.body.classList.add('finance-open');
  loadModule('finance');
}
window.openFinance = openFinance;
window.switchTab = switchTab;
window.closeFinance = () => switchTab(curTab || 'main');

/* ── Water widget ── */
function dateKey() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function getWater() {
  let s; try { s = JSON.parse(localStorage.getItem('po_water_v1')); } catch(e) {}
  if (!s) return { done: 0, total: 0 };
  const done = (s.logs || {})[dateKey()] || 0;
  const p = s.profile || { weightKg: 75 };
  const wKg = s.weightUnit === 'lb' ? (p.weightKg||0)/2.20462 : (p.weightKg||0);
  const base = wKg * 35;
  const exercise = (p.activityHrsPerWeek||0)/7*500;
  const caffeine = Math.max(0,(s.caffeineMgPerDay||200)-200)*1.5;
  const subs = (s.substances||[]).reduce((a,x)=>a+Math.max(0,(x.dose||x.defaultDose||0)*((x.mlPerUnit)||0)),0);
  let adj = 0; if (p.sex==='m') adj+=200; if ((p.age||0)>=50) adj+=100;
  const totalMl = base + exercise + caffeine + subs + adj;
  const uv = s.unit==='glass'?s.glassMl||250:s.unit==='oz'?30:s.unit==='ml'?1:s.bottleMl||500;
  return { done, total: Math.max(1, Math.ceil(totalMl/uv)) };
}
function renderWater() {
  const { done, total } = getWater();
  document.getElementById('shWaterCount').textContent = done + '/' + total;
  const pill = document.getElementById('shWaterPill');
  pill.classList.remove('warn','miss');
  if (total > 0) {
    if (done < total * 0.5) pill.classList.add(new Date().getHours()>=18?'miss':'warn');
    else if (done < total) pill.classList.add('warn');
  }
}
function addWater() {
  let s; try { s = JSON.parse(localStorage.getItem('po_water_v1')); } catch(e) {}
  if (!s || typeof s !== 'object') s = { unit:'bottle',bottleMl:500,glassMl:250,weightUnit:'kg',profile:{weightKg:75,age:25,sex:'m',activityHrsPerWeek:5},caffeineMgPerDay:200,substances:[],logs:{} };
  s.logs = s.logs || {};
  const k = dateKey(); s.logs[k] = (s.logs[k]||0) + 1;
  localStorage.setItem('po_water_v1', JSON.stringify(s));
  renderWater();
  const btn = document.getElementById('shWaterAdd');
  btn.classList.add('flash'); setTimeout(() => btn.classList.remove('flash'), 220);
}
document.getElementById('shWaterAdd').addEventListener('click', addWater);
document.getElementById('shWaterPill').addEventListener('click', () => switchTab('health'));
renderWater();
window.addEventListener('storage', renderWater);
setInterval(renderWater, 30000);

/* ── Settings ── */
window.openSettings = function() {
  document.getElementById('groqKeyInput').value = localStorage.getItem('groq_api_key') || '';
  document.getElementById('settingsScrim').classList.add('show');
  document.getElementById('settingsModal').classList.add('show');
};
window.closeSettings = function() {
  document.getElementById('settingsScrim').classList.remove('show');
  document.getElementById('settingsModal').classList.remove('show');
};
window.saveKey = function() {
  const key = document.getElementById('groqKeyInput').value.trim();
  if (!key.startsWith('gsk_')) { setKS('err','Invalid key — Groq keys start with gsk_'); return; }
  localStorage.setItem('groq_api_key', key);
  setKS('ok','Key saved — AI enabled across all tabs.');
};
window.clearKey = function() { localStorage.removeItem('groq_api_key'); document.getElementById('groqKeyInput').value=''; setKS('ok','Key removed.'); };
window.testKey = async function() {
  const key = document.getElementById('groqKeyInput').value.trim() || localStorage.getItem('groq_api_key') || '';
  if (!key) { setKS('err','No key to test.'); return; }
  setKS('','Testing…');
  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},body:JSON.stringify({model:'llama-3.1-8b-instant',messages:[{role:'user',content:'Reply OK'}],max_tokens:5})});
    const d = await r.json(); if (!r.ok) throw new Error(d?.error?.message||'Error '+r.status);
    localStorage.setItem('groq_api_key', key);
    setKS('ok','Working! Groq replied: "' + (d?.choices?.[0]?.message?.content||'').trim() + '"');
  } catch(e) { setKS('err', e.message); }
};
function setKS(t, m) { const el=document.getElementById('keyStatus'); el.className='sh-key-status'+(t?' '+t:''); el.textContent=m; el.style.display=t?'block':'none'; }

/* ── Quick food ── */
window.quickAddFood = function() {
  switchTab('health');
  try { localStorage.setItem('fl_open_add', JSON.stringify({tab:'scan',ts:Date.now()})); } catch(e) {}
};

/* ── iOS keyboard fix — keep pill + button above keyboard ── */
(function(){
  const vv = window.visualViewport;
  if (!vv) return;
  const wrap = document.querySelector('.sh-bot-wrap');
  if (!wrap) return;
  function adj(){
    const kH = window.innerHeight - vv.height - vv.offsetTop;
    wrap.style.transform = kH > 60 ? 'translateY(-' + kH + 'px)' : '';
  }
  vv.addEventListener('resize', adj); vv.addEventListener('scroll', adj); adj();
})();

/* ── Quick-add sheet ── */
window.openQuickAdd = function() {
  document.getElementById('qaScrim').classList.add('show');
  document.getElementById('qaModal').classList.add('show');
};
window.closeQuickAdd = function() {
  document.getElementById('qaScrim').classList.remove('show');
  document.getElementById('qaModal').classList.remove('show');
};
window.addWaterQuick = function() {
  addWater();
  const btn = document.getElementById('shWaterAdd');
  if (btn) { btn.classList.add('flash'); setTimeout(()=>btn.classList.remove('flash'),220); }
};

/* ── Init ── */
loadModule('main').then(() => loadModule('life-calendar', document.getElementById('mod-main')));
