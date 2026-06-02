'use strict';

/* ── Module map: tab name → module folder ── */
const TAB_MODULE = {
  main:     'main',
  health:   'health',
  training: 'training',
  others:   'bible',
};

/* ── Lazy iframe loader ── */
function loadTab(tab) {
  const mod = TAB_MODULE[tab];
  if (!mod) return;
  const container = document.getElementById('mod-' + tab);
  if (!container || container.querySelector('iframe')) return; // already loaded
  const iframe = document.createElement('iframe');
  iframe.src = 'modules/' + mod + '/index.html';
  iframe.allow = 'camera;microphone';
  container.appendChild(iframe);
}

/* ── Tab switching ── */
const TABS = ['main', 'health', 'training', 'others'];
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
  loadTab(tab);
}

function openFinance(e) {
  if (e) e.preventDefault();
  const fin = document.getElementById('mod-finance');
  fin.classList.add('active');
  window._financeOpen = true;
  document.body.classList.add('finance-open');
  if (!fin.querySelector('iframe')) {
    const iframe = document.createElement('iframe');
    iframe.src = 'modules/finance/index.html';
    fin.appendChild(iframe);
  }
}
window.openFinance = openFinance;
window.switchTab = switchTab;
window.closeFinance = function() { switchTab(curTab || 'main'); };

/* ── Listen for messages from module iframes ── */
window.addEventListener('message', function(e) {
  if (!e.data) return;
  if (e.data.type === 'closeFinance') window.closeFinance();
  if (e.data.type === 'switchTab') switchTab(e.data.tab);
});

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
  const totalMl = wKg*35 + (p.activityHrsPerWeek||0)/7*500 +
    Math.max(0,(s.caffeineMgPerDay||200)-200)*1.5 +
    (s.substances||[]).reduce((a,x)=>a+Math.max(0,(x.dose||x.defaultDose||0)*(x.mlPerUnit||0)),0) +
    (p.sex==='m'?200:0) + ((p.age||0)>=50?100:0);
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
  if (!s || typeof s !== 'object') s = {unit:'bottle',bottleMl:500,glassMl:250,weightUnit:'kg',
    profile:{weightKg:75,age:25,sex:'m',activityHrsPerWeek:5},caffeineMgPerDay:200,substances:[],logs:{}};
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
  if (!key.startsWith('gsk_')) { setKS('err','Invalid key — must start with gsk_'); return; }
  localStorage.setItem('groq_api_key', key);
  setKS('ok','Saved — AI features enabled.');
};
window.clearKey = function() {
  localStorage.removeItem('groq_api_key');
  document.getElementById('groqKeyInput').value = '';
  setKS('ok','Key removed.');
};
window.testKey = async function() {
  const key = document.getElementById('groqKeyInput').value.trim() || localStorage.getItem('groq_api_key') || '';
  if (!key) { setKS('err','No key to test.'); return; }
  setKS('','Testing…');
  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},
      body: JSON.stringify({model:'llama-3.1-8b-instant',messages:[{role:'user',content:'Reply OK'}],max_tokens:5})
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d?.error?.message||'Error '+r.status);
    localStorage.setItem('groq_api_key', key);
    setKS('ok','Working! Replied: "' + (d?.choices?.[0]?.message?.content||'').trim() + '"');
  } catch(e) { setKS('err', e.message); }
};
function setKS(t,m) {
  const el = document.getElementById('keyStatus');
  el.className = 'sh-key-status' + (t?' '+t:'');
  el.textContent = m; el.style.display = t ? 'block' : 'none';
}

/* ── Quick food shortcut ── */
window.quickAddFood = function() {
  switchTab('health');
  try { localStorage.setItem('fl_open_add', JSON.stringify({tab:'scan',ts:Date.now()})); } catch(e) {}
};

/* ── Quick-add sheet ── */
window.openQuickAdd = function() {
  document.getElementById('qaScrim').classList.add('show');
  document.getElementById('qaModal').classList.add('show');
};
window.closeQuickAdd = function() {
  document.getElementById('qaScrim').classList.remove('show');
  document.getElementById('qaModal').classList.remove('show');
};
window.addWaterQuick = function() { addWater(); };

/* ── iOS keyboard fix ── */
(function(){
  const vv = window.visualViewport; if (!vv) return;
  const wrap = document.querySelector('.sh-bot-wrap'); if (!wrap) return;
  function adj() {
    const kH = window.innerHeight - vv.height - vv.offsetTop;
    wrap.style.transform = kH > 60 ? 'translateY(-'+kH+'px)' : '';
  }
  vv.addEventListener('resize', adj); vv.addEventListener('scroll', adj); adj();
})();

/* ── Init: load main tab on start ── */
loadTab('main');
