(function(){
'use strict';
(function () {
  'use strict';

  function getGroqKey() { return localStorage.getItem('groq_api_key') || ''; }
  function promptGroqKey() {
    const k = window.prompt('Enter your Groq API key to enable AI Polish:\n(Free at console.groq.com → API Keys → Create API Key)');
    if (k && k.trim()) { localStorage.setItem('groq_api_key', k.trim()); return k.trim(); }
    return '';
  }

  const WAKE_HOUR  = 8;
  const SLEEP_HOUR = 24;

  // ---------- storage helpers ----------
  function storeGet(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
  }
  function storeSet(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
    if (typeof key === 'string' && key.indexOf('goals:') === 0) {
      window.dispatchEvent(new CustomEvent('goals-changed'));
    }
  }
  function storeDelete(key) { try { localStorage.removeItem(key); } catch (e) {} }
  function storeListKeys(prefix) {
    const out = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.indexOf(prefix) === 0) out.push(k);
    }
    return out;
  }

  // ---------- date helpers ----------
  function pad2(n) { return String(n).padStart(2, '0'); }
  function dateToKey(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function getActiveDateString() {
    const now = new Date();
    if (now.getHours() < 6) {
      const d = new Date(now);
      d.setDate(d.getDate() - 1);
      return dateToKey(d);
    }
    return dateToKey(now);
  }
  function getTomorrowDateString() {
    const now = new Date();
    const d = new Date(now);
    if (now.getHours() >= 6) d.setDate(d.getDate() + 1);
    return dateToKey(d);
  }
  function formatDate(yyyy_mm_dd) {
    const parts = yyyy_mm_dd.split('-').map(Number);
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    const wk = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()];
    const mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()];
    return wk + ', ' + mo + ' ' + d.getDate();
  }

  function todayKey()    { return 'goals:' + getActiveDateString(); }
  function tomorrowKey() { return 'goals:' + getTomorrowDateString(); }

  function getGoals(key) {
    const g = storeGet(key);
    return Array.isArray(g) ? g : [];
  }
  function setGoals(key, list) { storeSet(key, list); }

  // ---------- rollover: pull undone older goals into today ----------
  function rollover() {
    const todayDateStr = getActiveDateString();
    const todayK = 'goals:' + todayDateStr;
    let today = getGoals(todayK);
    const texts = new Set(today.map(g => g.text));

    storeListKeys('goals:').forEach(k => {
      const dateStr = k.slice('goals:'.length);
      if (dateStr >= todayDateStr) return;
      const old = getGoals(k);
      old.forEach(g => {
        if (!g.done && g.text && !texts.has(g.text)) {
          today.push({ text: g.text, done: false });
          texts.add(g.text);
        }
      });
      storeDelete(k);
    });
    setGoals(todayK, today);
  }

  // ---------- streak ----------
  function loadStreak() {
    const s = storeGet('goal_streak_v1');
    if (s && typeof s.count === 'number') return s;
    return { count: 0, lastProcessedDate: '' };
  }
  function saveStreak(s) { storeSet('goal_streak_v1', s); }

  function processStreak() {
    const s = loadStreak();
    const todayDateStr = getActiveDateString();
    const keys = storeListKeys('goals:')
      .map(k => k.slice('goals:'.length))
      .filter(d => d < todayDateStr)
      .sort();
    keys.forEach(dateStr => {
      if (s.lastProcessedDate && dateStr <= s.lastProcessedDate) return;
      const list = getGoals('goals:' + dateStr);
      if (list.length === 0) { /* don't break the streak on empty days */ }
      else if (list.every(g => g.done)) s.count += 1;
      else s.count = 0;
      s.lastProcessedDate = dateStr;
    });
    saveStreak(s);
  }

  // ---------- Goal Ticker ----------
  const tickerStage = document.getElementById('goalTickerStage');
  const tickerMeta  = document.getElementById('goalTickerMeta');
  let cycleIdx = 0;
  let tickerTimer = null;

  function buildTickerItems() {
    const goals = getGoals(todayKey());
    const total = goals.length;
    const done  = goals.filter(g => g.done).length;
    if (total === 0) return { items: [{ status: 'empty',   text: 'No goals set for today — add one to get rolling.' }], done, total };
    if (done === total) return { items: [{ status: 'done', text: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg> All goals done — solid day.' }], done, total };
    const items = goals.filter(g => !g.done).map(g => ({ status: 'pending', text: g.text }));
    return { items, done, total };
  }

  function statusGlyph(status) {
    if (status === 'done') return '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
    if (status === 'pending') return '○';
    return '·';
  }

  let firstTick = true;
  function tick() {
    const { items, done, total } = buildTickerItems();
    if (cycleIdx >= items.length) cycleIdx = 0;
    const item = items[cycleIdx];
    cycleIdx = (cycleIdx + 1) % items.length;
    tickerMeta.textContent = done + '/' + total;

    let row = tickerStage.querySelector('.goal-ticker-row');
    if (!row) {
      row = document.createElement('div');
      row.className = 'goal-ticker-row';
      row.innerHTML =
        '<span class="goal-ticker-status"></span>' +
        '<span class="goal-ticker-text"></span>';
      tickerStage.appendChild(row);
    }

    const statusEl = row.querySelector('.goal-ticker-status');
    const textEl   = row.querySelector('.goal-ticker-text');

    const apply = () => {
      statusEl.setAttribute('data-status', item.status);
      statusEl.innerHTML = statusGlyph(item.status);
      textEl.textContent = item.text;
      row.classList.remove('is-fading');
    };

    if (firstTick) { apply(); firstTick = false; return; }
    row.classList.add('is-fading');
    setTimeout(apply, 220);
  }

  function startTicker() {
    tick();
    if (tickerTimer) clearInterval(tickerTimer);
    tickerTimer = setInterval(tick, 5000);
  }

  window.addEventListener('goals-changed', () => {
    cycleIdx = 0;
    tick();
  });

  // ---------- Day Ring ----------
  const PALETTE = [
    [0,    [255, 216, 158]],
    [12.5, [255, 205, 121]],
    [25,   [255, 227, 143]],
    [37.5, [255, 183, 106]],
    [50,   [255, 149,  89]],
    [62.5, [243, 111,  79]],
    [75,   [226,  93, 122]],
    [87.5, [123,  91, 176]],
    [100,  [ 47,  58, 102]]
  ];
  function lerp(a, b, t) { return a + (b - a) * t; }
  function paletteAt(p) {
    if (p <= PALETTE[0][0]) return PALETTE[0][1];
    if (p >= PALETTE[PALETTE.length - 1][0]) return PALETTE[PALETTE.length - 1][1];
    for (let i = 0; i < PALETTE.length - 1; i++) {
      const [p0, c0] = PALETTE[i];
      const [p1, c1] = PALETTE[i + 1];
      if (p >= p0 && p <= p1) {
        const t = (p - p0) / (p1 - p0);
        return [lerp(c0[0], c1[0], t), lerp(c0[1], c1[1], t), lerp(c0[2], c1[2], t)];
      }
    }
    return [255,255,255];
  }
  function rgb(c) { return 'rgb(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ')'; }

  function formatClock(d) {
    let h = d.getHours();
    const m = d.getMinutes();
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    if (h === 0) h = 12;
    return h + ':' + pad2(m) + ' ' + ampm;
  }
  function formatRemaining(totalMin) {
    const h = Math.floor(totalMin / 60);
    const m = Math.floor(totalMin % 60);
    return h + 'h ' + m + 'm';
  }

  const C = 2 * Math.PI * 52;
  const fillEl = document.getElementById('dayRingFill');
  fillEl.setAttribute('stroke-dasharray', C);
  fillEl.setAttribute('stroke-dashoffset', C);

  function updateDayRing() {
    const now = new Date();
    const hours = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
    const percentEl   = document.getElementById('dayRingPercent');
    const phaseEl     = document.getElementById('dayRingPhase');
    const clockEl     = document.getElementById('dayRingClock');
    const statusEl    = document.getElementById('dayRingStatus');
    const remainingEl = document.getElementById('dayRingRemaining');

    clockEl.textContent = formatClock(now);

    if (hours < WAKE_HOUR) {
      fillEl.setAttribute('stroke-dashoffset', C);
      fillEl.style.stroke = '#4D4B47';
      percentEl.textContent = '—';
      phaseEl.textContent   = 'SLEEPING';
      statusEl.innerHTML  = '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/></svg> Still sleeping';
      const minsUntil = (WAKE_HOUR - hours) * 60;
      remainingEl.textContent = formatRemaining(minsUntil) + ' until wake-up';
      return;
    }

    if (hours >= SLEEP_HOUR) {
      fillEl.setAttribute('stroke-dashoffset', 0);
      fillEl.style.stroke = '#E25D7A';
      percentEl.textContent = '100%';
      phaseEl.textContent   = 'PAST BEDTIME';
      statusEl.innerHTML  = '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg> Past bedtime';
      remainingEl.textContent = 'Sleep!';
      return;
    }

    const span = SLEEP_HOUR - WAKE_HOUR;
    const percent = (hours - WAKE_HOUR) / span * 100;
    fillEl.setAttribute('stroke-dashoffset', C * (1 - percent / 100));
    fillEl.style.stroke = rgb(paletteAt(percent));
    percentEl.textContent = Math.floor(percent) + '%';

    let phase, status;
    if (percent < 25)      { phase = 'MORNING';   status = '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>️ Morning — fresh start'; }
    else if (percent < 50) { phase = 'MIDDAY';    status = '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M13 2 3 14h9l-1 8 10-12h-9z"/></svg> Midday — keep moving'; }
    else if (percent < 75) { phase = 'AFTERNOON'; status = '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg> Afternoon — push it'; }
    else if (percent < 90) { phase = 'EVENING';   status = '⏳ Evening — wrap up'; }
    else                   { phase = 'BEDTIME';   status = '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/></svg> Bedtime soon'; }
    phaseEl.textContent  = phase;
    statusEl.innerHTML = status;

    const minsLeft = (SLEEP_HOUR - hours) * 60;
    remainingEl.textContent = formatRemaining(minsLeft) + ' awake time left';
  }

  // ---------- Row building ----------
  function makeInlineEdit(textEl, goals, idx, key, reload) {
    textEl.addEventListener('click', () => {
      if (textEl.getAttribute('contenteditable') === 'true') return;
      const original = textEl.textContent;
      textEl.setAttribute('contenteditable', 'true');
      textEl.focus();
      const range = document.createRange();
      range.selectNodeContents(textEl);
      range.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges(); sel.addRange(range);

      function commit() {
        const next = textEl.textContent.trim();
        textEl.removeAttribute('contenteditable');
        if (next && next !== original) {
          const list = getGoals(key);
          if (list[idx]) { list[idx].text = next; setGoals(key, list); }
          reload();
        } else {
          textEl.textContent = original;
        }
      }
      function cancel() {
        textEl.removeAttribute('contenteditable');
        textEl.textContent = original;
      }
      textEl.addEventListener('blur', commit, { once: true });
      textEl.addEventListener('keydown', function onKey(e) {
        if (e.key === 'Enter') { e.preventDefault(); textEl.removeEventListener('keydown', onKey); textEl.blur(); }
        else if (e.key === 'Escape') { e.preventDefault(); textEl.removeEventListener('keydown', onKey); cancel(); }
      });
    });
  }

  function wireDragReorder(row, listEl, key, reload) {
    row.setAttribute('draggable', 'true');
    row.addEventListener('dragstart', (e) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', row.dataset.idx);
    });
    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      row.classList.add('is-drag-over');
    });
    row.addEventListener('dragleave', () => row.classList.remove('is-drag-over'));
    row.addEventListener('drop', (e) => {
      e.preventDefault();
      row.classList.remove('is-drag-over');
      const from = parseInt(e.dataTransfer.getData('text/plain'), 10);
      const to   = parseInt(row.dataset.idx, 10);
      if (isNaN(from) || isNaN(to) || from === to) return;
      const list = getGoals(key);
      const [moved] = list.splice(from, 1);
      list.splice(to, 0, moved);
      setGoals(key, list);
      reload();
    });
  }

  function buildGoalRow(goal, idx, key, readOnly, reload) {
    const li = document.createElement('li');
    li.className = 'gm-row';
    li.dataset.idx = String(idx);
    if (goal.done) li.classList.add('gm-row-done');
    if (goal.queued) li.classList.add('gm-row-queued');

    const handle = document.createElement('span');
    handle.className = 'gm-handle';
    handle.textContent = '⋮⋮';
    li.appendChild(handle);

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'gm-check';
    cb.checked = !!goal.done;
    if (readOnly) { cb.disabled = true; cb.title = 'Activates at 6 AM tomorrow'; }
    cb.addEventListener('change', () => {
      const list = getGoals(key);
      if (!list[idx]) return;
      list[idx].done = cb.checked;
      if (cb.checked) list[idx].doneAt = Date.now();
      else delete list[idx].doneAt;
      setGoals(key, list);
      reload();
    });
    li.appendChild(cb);

    const text = document.createElement('span');
    text.className = 'gm-text';
    text.textContent = goal.text;
    li.appendChild(text);
    makeInlineEdit(text, null, idx, key, reload);

    const queueBtn = document.createElement('button');
    queueBtn.type = 'button';
    queueBtn.className = 'gm-queue-btn' + (goal.queued ? ' gm-queue-active' : '');
    queueBtn.innerHTML = '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M13 2 3 14h9l-1 8 10-12h-9z"/></svg>';
    queueBtn.title = 'Queue for productivity window';
    if (readOnly) queueBtn.disabled = true;
    queueBtn.addEventListener('click', () => {
      const list = getGoals(key);
      if (!list[idx]) return;
      list[idx].queued = !list[idx].queued;
      setGoals(key, list);
      li.classList.add('is-queue-flashing');
      setTimeout(reload, 480);
    });
    li.appendChild(queueBtn);

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'goal-delete';
    del.setAttribute('aria-label', 'Delete goal');
    del.textContent = '×';
    del.addEventListener('click', () => {
      const list = getGoals(key);
      list.splice(idx, 1);
      setGoals(key, list);
      reload();
    });
    li.appendChild(del);

    wireDragReorder(li, null, key, reload);
    return li;
  }

  // ---------- Renderers ----------
  function renderTodayHeader() {
    const goals = getGoals(todayKey());
    const total = goals.length;
    const done  = goals.filter(g => g.done).length;
    document.getElementById('gmProgressNum').textContent   = done;
    document.getElementById('gmProgressTotal').textContent = '/ ' + total;
    const label = document.getElementById('gmProgressLabel');
    if (total === 0)        label.textContent = 'no goals yet';
    else if (done === total) label.textContent = 'all done — solid day';
    else                     label.textContent = 'complete';

    document.getElementById('todayLabel').textContent =
      'Today — ' + formatDate(getActiveDateString());

    const bar = document.getElementById('gmBar');
    bar.innerHTML = '';
    goals.forEach(g => {
      const seg = document.createElement('div');
      seg.className = 'gm-bar-seg' + (g.done ? ' gm-bar-seg-done' : '');
      bar.appendChild(seg);
    });

    const card = document.getElementById('gmCardToday');
    card.classList.toggle('gm-all-done', total > 0 && done === total);

    const pushBtn = document.getElementById('gmPushBtn');
    pushBtn.style.display = (total > 0 && done < total) ? 'block' : 'none';
  }

  function renderStreak() {
    const s = loadStreak();
    document.getElementById('gmStreakNum').textContent = s.count;
    document.getElementById('gmStreak').classList.toggle('gm-streak-active', s.count > 0);
  }

  function renderTomorrowCount() {
    const list = getGoals(tomorrowKey());
    document.getElementById('gmTomorrowCount').textContent = list.length + ' planned';
    document.getElementById('tomorrowLabel').textContent =
      'Plan tomorrow — ' + formatDate(getTomorrowDateString());
  }

  function renderListInto(goals, listEl, emptyEl, key, readOnly) {
    listEl.innerHTML = '';
    emptyEl.style.display = goals.length === 0 ? 'block' : 'none';
    const reload = () => (key === todayKey() ? loadToday() : loadTomorrow());

    const visible = goals.length > 5 ? goals.slice(0, 5) : goals;
    visible.forEach((g, i) => listEl.appendChild(buildGoalRow(g, i, key, readOnly, reload)));

    if (goals.length > 5) {
      let expanded = false;
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'gm-show-toggle';
      const updateLabel = () => {
        toggle.textContent = expanded ? 'Show less ▴' : ('Show ' + (goals.length - 5) + ' more ▾');
      };
      updateLabel();
      toggle.addEventListener('click', () => {
        expanded = !expanded;
        if (expanded) {
          goals.slice(5).forEach((g, i) => {
            const row = buildGoalRow(g, i + 5, key, readOnly, reload);
            listEl.insertBefore(row, toggle);
          });
        } else {
          Array.from(listEl.querySelectorAll('.gm-row')).slice(5).forEach(r => r.remove());
        }
        updateLabel();
      });
      listEl.appendChild(toggle);
    }

    if (key === todayKey()) renderTodayHeader();
    else                    renderTomorrowCount();
  }

  function loadToday() {
    const goals = getGoals(todayKey());
    renderListInto(goals, document.getElementById('goalList'), document.getElementById('emptyState'), todayKey(), false);
  }
  function loadTomorrow() {
    const goals = getGoals(tomorrowKey());
    renderListInto(goals, document.getElementById('tomorrowList'), document.getElementById('tomorrowEmpty'), tomorrowKey(), true);
  }

  // ---------- Push remaining ----------
  document.getElementById('gmPushBtn').addEventListener('click', () => {
    const today    = getGoals(todayKey());
    const remaining = today.filter(g => !g.done);
    if (remaining.length === 0) return;
    if (!confirm('Move ' + remaining.length + ' unchecked goal' + (remaining.length === 1 ? '' : 's') + ' to tomorrow?')) return;
    const tomorrow = getGoals(tomorrowKey());
    const seen = new Set(tomorrow.map(g => g.text));
    remaining.forEach(g => {
      if (!seen.has(g.text)) { tomorrow.push({ text: g.text, done: false }); seen.add(g.text); }
    });
    setGoals(tomorrowKey(), tomorrow);
    setGoals(todayKey(), today.filter(g => g.done));
    loadToday(); loadTomorrow();
  });

  // ---------- Add + Polish handlers ----------
  function showStatus(el, message, isError) {
    el.textContent = message;
    el.classList.toggle('gm-status-error', !!isError);
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.textContent = ''; el.classList.remove('gm-status-error'); }, 3500);
  }

  function localPolish(text) {
    // Ensure starts with capital, ends with period, trimmed to 60 chars
    let t = text.trim();
    // Capitalize first letter
    t = t.charAt(0).toUpperCase() + t.slice(1);
    // Strip trailing punctuation then add period
    t = t.replace(/[.!?,;]+$/, '') + '.';
    // Trim to 60 chars at word boundary
    if (t.length > 60) t = t.slice(0, 57).replace(/\s\S*$/, '…');
    return t;
  }

  async function polishOne(text, key) {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content:
          'Rewrite this goal to be concrete and action-oriented, max 60 characters. Reply with only the rewritten goal — no quotes, no explanation.\n\nGoal: ' + text
        }],
        max_tokens: 80,
        temperature: 0.4
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || 'API error ' + res.status);
    const content = (data?.choices?.[0]?.message?.content || '').trim();
    if (!content) throw new Error('empty response');
    return content.replace(/^["'`]|["'`]$/g, '').trim();
  }

  function makeAddHandlers(input, addBtn, polishBtn, key, statusEl, reload) {
    function plainAdd(text) {
      const list = getGoals(key);
      list.push({ text, done: false });
      setGoals(key, list);
      input.value = '';
      reload();
    }
    addBtn.addEventListener('click', () => {
      const text = input.value.trim();
      if (!text) return;
      plainAdd(text);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); addBtn.click(); }
    });
    polishBtn.addEventListener('click', async () => {
      const text = input.value.trim();
      if (!text) return;
      polishBtn.disabled = true;
      polishBtn.textContent = '…';
      const apiKey = getGroqKey();
      if (apiKey) {
        try {
          const polished = await polishOne(text, apiKey);
          plainAdd(polished);
          showStatus(statusEl, '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg> AI polished', false);
          return;
        } catch (e) {
          const msg = e.message || '';
          if (msg.includes('quota') || msg.includes('429') || msg.includes('rate_limit') || msg.includes('limit')) {
            showStatus(statusEl, 'Groq rate limit — using local polish. Try again shortly.', true);
          }
          // fall through to local polish
        } finally {
          polishBtn.disabled = false;
          polishBtn.innerHTML = '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 15l.7 1.8L21.5 17l-1.8.7L19 19.5l-.7-1.8L16.5 17l1.8-.7zM5 15l.7 1.8L7.5 17l-1.8.7L5 19.5l-.7-1.8L2.5 17l1.8-.7z"/></svg> Polish';
        }
      }
      // Local polish fallback — always works
      plainAdd(localPolish(text));
      if (!apiKey) showStatus(statusEl, 'Locally polished. Add Groq key in Settings (<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82L4.2 7.12a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>) for AI.', false);
      polishBtn.disabled = false;
      polishBtn.innerHTML = '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 15l.7 1.8L21.5 17l-1.8.7L19 19.5l-.7-1.8L16.5 17l1.8-.7zM5 15l.7 1.8L7.5 17l-1.8.7L5 19.5l-.7-1.8L2.5 17l1.8-.7z"/></svg> Polish';
    });
  }

  makeAddHandlers(
    document.getElementById('goalInput'),
    document.getElementById('goalAddBtn'),
    document.getElementById('goalPolishBtn'),
    todayKey(),
    document.getElementById('polishStatus'),
    loadToday
  );
  makeAddHandlers(
    document.getElementById('tomorrowInput'),
    document.getElementById('tomorrowAddBtn'),
    document.getElementById('tomorrowPolishBtn'),
    tomorrowKey(),
    document.getElementById('tomorrowStatus'),
    loadTomorrow
  );

  // ---------- Boot ----------
  rollover();
  processStreak();
  loadToday();
  loadTomorrow();
  renderStreak();
  updateDayRing();
  setInterval(updateDayRing, 60 * 1000);
  startTicker();

  // Re-render when storage changes from another tab (or our bridged parent).
  window.addEventListener('storage', () => {
    loadToday(); loadTomorrow(); renderStreak();
  });
})();
(function() {
  if (typeof initCloudSync !== 'function') return;
  initCloudSync({
    appKey: 'goals',
    syncedPrefixes: ['goals:'],
    onApplied: function () {
      window.dispatchEvent(new CustomEvent('goals-changed'));
      window.dispatchEvent(new Event('storage'));
    }
  });
})();
})();