(function(){
'use strict';

const KEY = 'training_goals_v1';
const SPORT = {
  run:  '🏃', bike: '🚴', swim: '🏊', hyrox: '🔥', race: '🏁',
};

let goals = load();

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; }
  catch (e) { return []; }
}
function save() {
  // re-number manual order to the current array order
  goals.forEach((g, i) => { g.order = i; });
  try { localStorage.setItem(KEY, JSON.stringify(goals)); } catch (e) {}
  try { window.dispatchEvent(new Event('storage')); } catch (e) {}
}

const daysRemaining = (d) => window.goalDaysRemaining ? window.goalDaysRemaining(d)
  : Math.round((new Date(d + 'T00:00:00') - new Date().setHours(0,0,0,0)) / 86400000);
const statusOf = (d) => window.goalStatus ? window.goalStatus(d) : 'Preparation';

function progressPct(g) {
  if (!g.date) return 0;
  const start = new Date((g.startDate || g.createdAt || g.date) + 'T00:00:00').getTime();
  const end = new Date(g.date + 'T00:00:00').getTime();
  const now = Date.now();
  if (end <= start) return 100;
  return Math.max(0, Math.min(100, ((now - start) / (end - start)) * 100));
}

/* ── Render ── */
function sortedGoals() {
  return goals.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}
function render() {
  const list = document.getElementById('goalsList');
  const empty = document.getElementById('goalsEmpty');
  if (!list) return;
  const gs = sortedGoals();
  empty.hidden = gs.length > 0;
  list.innerHTML = gs.map((g, i) => cardHTML(g, i)).join('');
  wireCards();
}

function cardHTML(g, idx) {
  const dr = daysRemaining(g.date);
  const st = statusOf(g.date);
  const done = dr < 0;
  const primary = idx === 0 && !done;
  const soon = dr >= 0 && dr <= 7;
  const pct = progressPct(g);
  const notes = g.notes ? `<div class="goal-notes">${esc(g.notes)}</div>` : '';
  return `
  <div class="goal-card ${primary ? 'primary' : ''} ${done ? 'done' : ''}" data-id="${g.id}" draggable="true">
    <div class="goal-rank">
      <div class="goal-rank-num">${idx + 1}</div>
      <div class="goal-drag" data-drag aria-label="Drag to reorder">⋮⋮</div>
    </div>
    <div class="goal-main">
      <div class="goal-name-row">
        <span class="goal-sport">${SPORT[g.sport] || '🎯'}</span>
        <span class="goal-name">${esc(g.name)}</span>
      </div>
      <div class="goal-sub">
        <span class="goal-pill status">${st}</span>
        <span class="goal-pill abc-${g.priority || 'B'}">${g.priority || 'B'}</span>
        ${g.target ? `<span class="goal-target">🎯 ${esc(g.target)}</span>` : ''}
        ${g.date ? `<span>${fmtDate(g.date)}</span>` : ''}
      </div>
      ${notes}
      <div class="goal-prog-track"><div class="goal-prog-fill" style="width:${pct}%"></div></div>
    </div>
    <div class="goal-count ${soon ? 'soon' : ''} ${done ? 'done-num' : ''}">
      <div class="goal-count-num">${done ? '✓' : dr}</div>
      <div class="goal-count-lbl">${done ? 'done' : (dr === 1 ? 'day' : 'days')}</div>
    </div>
  </div>`;
}

function fmtDate(d) {
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' });
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

/* ── Card interactions: tap to edit + drag to reorder ── */
function wireCards() {
  document.querySelectorAll('#goalsList .goal-card').forEach(card => {
    const id = card.dataset.id;
    // Tap (not on the drag handle) → edit
    card.addEventListener('click', (e) => {
      if (e.target.closest('[data-drag]')) return;
      openModal(id);
    });
    // HTML5 drag (desktop)
    card.addEventListener('dragstart', (e) => {
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', id);
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      document.querySelectorAll('.goal-card').forEach(c => c.classList.remove('drag-over'));
    });
    card.addEventListener('dragover', (e) => { e.preventDefault(); card.classList.add('drag-over'); });
    card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
    card.addEventListener('drop', (e) => {
      e.preventDefault();
      const srcId = e.dataTransfer.getData('text/plain');
      reorder(srcId, id);
    });
    // Pointer drag (touch) via the handle
    const handle = card.querySelector('[data-drag]');
    if (handle) handle.addEventListener('pointerdown', (e) => startPointerDrag(e, card));
  });
}

function reorder(srcId, destId) {
  if (srcId === destId) return;
  const arr = sortedGoals();
  const from = arr.findIndex(g => g.id === srcId);
  const to = arr.findIndex(g => g.id === destId);
  if (from < 0 || to < 0) return;
  const [moved] = arr.splice(from, 1);
  arr.splice(to, 0, moved);
  goals = arr;
  save(); render();
}

let dragInfo = null;
function startPointerDrag(e, card) {
  e.preventDefault();
  const id = card.dataset.id;
  card.classList.add('dragging');
  dragInfo = { id, card };
  const move = (ev) => {
    const y = ev.clientY;
    const cards = [...document.querySelectorAll('#goalsList .goal-card')];
    let target = null;
    for (const c of cards) {
      const r = c.getBoundingClientRect();
      if (y < r.top + r.height / 2) { target = c; break; }
    }
    cards.forEach(c => c.classList.remove('drag-over'));
    if (target && target !== card) target.classList.add('drag-over');
    dragInfo.beforeId = target ? target.dataset.id : null; // null = drop at end
  };
  const up = () => {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    card.classList.remove('dragging');
    document.querySelectorAll('.goal-card').forEach(c => c.classList.remove('drag-over'));
    if (dragInfo) {
      const arr = sortedGoals();
      const from = arr.findIndex(g => g.id === id);
      const [moved] = arr.splice(from, 1);
      let to = dragInfo.beforeId ? arr.findIndex(g => g.id === dragInfo.beforeId) : arr.length;
      if (to < 0) to = arr.length;
      arr.splice(to, 0, moved);
      goals = arr; save(); render();
    }
    dragInfo = null;
  };
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
}

/* ── Add / edit modal ── */
let editingId = null;
let mSport = 'run';
let mPri = 'B';

function openModal(id) {
  editingId = id || null;
  const g = id ? goals.find(x => x.id === id) : null;
  document.getElementById('goalModalTitle').textContent = g ? 'Edit Goal' : 'New Goal';
  document.getElementById('gmName').value = g ? g.name : '';
  document.getElementById('gmDate').value = g ? g.date : '';
  document.getElementById('gmTarget').value = g ? (g.target || '') : '';
  document.getElementById('gmNotes').value = g ? (g.notes || '') : '';
  mSport = g ? g.sport : 'run';
  mPri = g ? (g.priority || 'B') : 'B';
  syncSportPri();
  document.getElementById('gmDelete').hidden = !g;
  document.getElementById('goalModalBg').classList.add('show');
}
function closeModal() { document.getElementById('goalModalBg').classList.remove('show'); }

function syncSportPri() {
  document.querySelectorAll('#gmSports .gm-sport').forEach(b =>
    b.classList.toggle('on', b.dataset.sport === mSport));
  document.querySelectorAll('#gmPri button').forEach(b =>
    b.classList.toggle('on', b.dataset.pri === mPri));
}

function saveModal() {
  const name = document.getElementById('gmName').value.trim();
  const date = document.getElementById('gmDate').value;
  if (!name) { document.getElementById('gmName').focus(); return; }
  const target = document.getElementById('gmTarget').value.trim();
  const notes = document.getElementById('gmNotes').value.trim();
  if (editingId) {
    const g = goals.find(x => x.id === editingId);
    if (g) Object.assign(g, { name, sport: mSport, date, priority: mPri, target, notes });
  } else {
    goals.push({
      id: 'goal_' + Date.now().toString(36) + Math.random().toString(36).slice(2,5),
      name, sport: mSport, date, priority: mPri, target, notes,
      startDate: new Date().toISOString().slice(0,10),
      createdAt: new Date().toISOString().slice(0,10),
      order: goals.length,
    });
  }
  save(); render(); closeModal();
}

function deleteGoal() {
  if (!editingId) return;
  goals = goals.filter(g => g.id !== editingId);
  save(); render(); closeModal();
}

/* ── Ask AI about my goals ── */
async function askAI() {
  const panel = document.getElementById('goalsAiPanel');
  const body = document.getElementById('goalsAiBody');
  panel.hidden = false;
  if (!window.groqKey || !window.groqKey()) {
    body.innerHTML = 'Add a Groq API key in Settings (⚙ top-right of the dashboard) to enable AI coaching.';
    return;
  }
  if (!goals.length) { body.textContent = 'Add a goal first — then I can build your focus plan.'; return; }
  body.innerHTML = '<span class="spin"></span>Reading your goals and building a focus plan…';

  // Pull a little recent context for realism
  let recovery = null, recentTraining = [];
  try {
    const w = JSON.parse(localStorage.getItem('whoop_data_v1'));
    const e = w && (w.recoveries || w.data || [])[0];
    if (e) recovery = Math.round(e.score || e.recovery_score || 0);
  } catch (e) {}
  try {
    recentTraining = (JSON.parse(localStorage.getItem('training_calendar_v1')) || [])
      .slice(-10).map(s => ({ sport: s.discipline, name: s.name, done: s.done }));
  } catch (e) {}

  const user = [
    'Coach me on my training goals. Today is ' + new Date().toISOString().slice(0,10) + '.',
    recovery != null ? 'Current Whoop recovery: ' + recovery + '%.' : '',
    recentTraining.length ? 'Recent sessions: ' + JSON.stringify(recentTraining) : '',
    '',
    'Answer concisely in four short labelled sections:',
    '1. CURRENT FOCUS — which goal to prioritise right now and why.',
    '2. TIMELINE — is each goal realistic in the time left? Flag any that are tight.',
    '3. NEEDS MOST ATTENTION — the single biggest thing to work on this week.',
    '4. WEEKLY SPLIT — a recommended 7-day training split across the goals,',
    '   weighting the #1 goal but keeping base fitness for the others.',
  ].filter(Boolean).join('\n');

  try {
    const reply = await window.callGroq(
      [{ role: 'system', content: 'You are an elite endurance & hybrid (Hyrox/triathlon) coach. Be specific and practical.' },
       { role: 'user', content: user }],
      { max_tokens: 900, temperature: 0.6 }
    );
    body.textContent = reply.trim();
  } catch (e) {
    body.innerHTML = '<span style="color:#ff8a8a">AI failed: ' + esc(e.message) + '</span>';
  }
}

/* ── Wiring ── */
function wire() {
  document.getElementById('goalsAddBtn').addEventListener('click', () => openModal(null));
  document.getElementById('goalsAiBtn').addEventListener('click', askAI);
  document.getElementById('goalsAiClose').addEventListener('click', () => {
    document.getElementById('goalsAiPanel').hidden = true;
  });
  document.getElementById('gmCancel').addEventListener('click', closeModal);
  document.getElementById('gmSave').addEventListener('click', saveModal);
  document.getElementById('gmDelete').addEventListener('click', deleteGoal);
  document.getElementById('goalModalBg').addEventListener('click', (e) => {
    if (e.target.id === 'goalModalBg') closeModal();
  });
  document.querySelectorAll('#gmSports .gm-sport').forEach(b =>
    b.addEventListener('click', () => { mSport = b.dataset.sport; syncSportPri(); }));
  document.querySelectorAll('#gmPri button').forEach(b =>
    b.addEventListener('click', () => { mPri = b.dataset.pri; syncSportPri(); }));

  // Cloud sync
  if (window.initCloudSync) {
    window.initCloudSync({
      appKey: 'training-goals', syncedKeys: [KEY],
      onApplied: () => { goals = load(); render(); },
    });
  }
  window.addEventListener('storage', (e) => { if (e.key === KEY) { goals = load(); render(); } });
}

render();
wire();
window.goalsRender = render;

})();
