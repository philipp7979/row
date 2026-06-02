const CONFIG = {
  appTitle: "Progressive Overload Coach",

  // Weight unit shown everywhere. "kg" or "lb".
  units: "kg",

  // Gyms you train at. Add as many as you want.
  // `id` must be a short unique slug (no spaces). `name` is what people see.
  gyms: [
    { id: "home",  name: "Home Gym" },
    { id: "comm",  name: "Commercial Gym" }
  ],

  // Training split. Most people use Push/Pull/Legs but you can rename
  // these to "Upper", "Lower", "Full Body", "Day A", anything.
  days: [
    { id: "push", name: "Push" },
    { id: "pull", name: "Pull" },
    { id: "legs", name: "Legs" }
  ],

  // Split rotation — the order your training days cycle through. Use day
  // ids from `days` above, plus "rest" for off-days. The pill at the top
  // of the app reads this + splitAnchor to compute "what day is today".
  splitRotation: ["push", "pull", "legs", "rest"],

  // Anchor: pair a real calendar date with which split day fell on it.
  // The rotation advances from this point. Set `date` to a recent day
  // when you knew what split you were on, and `splitId` to that day.
  // Edit this if your split drifts.
  splitAnchor: {
    date: "2026-05-12",
    splitId: "rest"
  },

  // Progression rule: hit this many reps on the top set → coach tells you
  // to add weight next session. Lower this to be more aggressive (e.g. 6),
  // raise it for more volume bias (e.g. 10).
  upgradeAtReps: 8,

  // Composition estimate (optional, for the weight chart).
  // Estimates how much of recent weight change is muscle vs fat by
  // cross-referencing the strength trend. Set yearsTraining to scale
  // expected muscle gain rate.
  composition: {
    enabled: true,
    yearsTraining: 1,        // 1 = beginner, 2 = intermediate, 3+ = advanced
    windowDays: 30           // window to compute weight + strength change
  },

  // Starter exercise list. Each one needs:
  //   name        — what shows in the dropdown
  //   gym         — one of the gym ids above, or "both"
  //   day         — one of the day ids above
  //   repMin      — bottom of your target rep range
  //   repMax      — top of your target rep range
  //   step        — how much weight you add when progressing (kg/lb)
  //   startWeight — starting weight (ignored when bw: true)
  //   bw          — true for bodyweight movements (logs reps only)
  //
  // First-run defaults. Once a user logs anything, they edit through
  // the in-app + / gear buttons; this block stays as the seed.
  defaultExercises: [
    { name: "Bench press",     gym: "comm", day: "push", repMin: 5, repMax: 8,  step: 2.5, startWeight: 60 },
    { name: "Overhead press",  gym: "comm", day: "push", repMin: 5, repMax: 8,  step: 2.5, startWeight: 35 },
    { name: "Tricep pushdown", gym: "comm", day: "push", repMin: 8, repMax: 12, step: 2.5, startWeight: 25 },
    { name: "Pull-ups",        gym: "both", day: "pull", repMin: 5, repMax: 10, step: 1,   startWeight: 0, bw: true },
    { name: "Barbell row",     gym: "comm", day: "pull", repMin: 6, repMax: 10, step: 2.5, startWeight: 50 },
    { name: "Bicep curl",      gym: "comm", day: "pull", repMin: 8, repMax: 12, step: 1.25,startWeight: 15 },
    { name: "Back squat",      gym: "comm", day: "legs", repMin: 5, repMax: 8,  step: 5,   startWeight: 80 },
    { name: "Romanian deadlift", gym: "comm", day: "legs", repMin: 6, repMax: 10, step: 5, startWeight: 60 },
    { name: "Leg press",       gym: "comm", day: "legs", repMin: 8, repMax: 12, step: 5,   startWeight: 100 }
  ]
};

(function() {
  // ============================================================
  // STATE — all logs + edits live in browser localStorage. Each
  // device has its own copy. Export JSON from settings if you
  // want to back up or move to another device.
  // ============================================================
  const LS_KEY = 'po_coach_v1';

  function buildDefaultExercises() {
    return CONFIG.defaultExercises.map((e, i) => Object.assign({
      id: 'seed_' + i + '_' + Date.now()
    }, e));
  }
  function loadState() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) return normalize(JSON.parse(raw));
    } catch (e) {}
    return normalize({});
  }
  function normalize(s) {
    s = s || {};
    s.units = s.units || CONFIG.units || 'kg';
    s.gyms  = (Array.isArray(s.gyms)  && s.gyms.length)  ? s.gyms  : CONFIG.gyms.slice();
    s.days  = (Array.isArray(s.days)  && s.days.length)  ? s.days  : CONFIG.days.slice();
    s.exercises = Array.isArray(s.exercises) ? s.exercises : buildDefaultExercises();
    s.logs = (s.logs && typeof s.logs === 'object') ? s.logs : {};
    s.filterGym = s.filterGym || s.gyms[0].id;
    s.filterDay = s.filterDay || s.days[0].id;
    // Split rotation lives in state so the user can edit it via the pill modal.
    // Stored as a plain array of names (e.g. ["Push", "Pull", "Legs", "Rest"]).
    if (!Array.isArray(s.splitRotation) || !s.splitRotation.length) {
      s.splitRotation = (CONFIG.splitRotation || ['Push', 'Pull', 'Legs', 'Rest']).map(x =>
        // CONFIG used ids — map id → display name where possible
        (CONFIG.days || []).find(d => d.id === x) ? (CONFIG.days.find(d => d.id === x).name) :
        (x === 'rest' ? 'Rest' : x.charAt(0).toUpperCase() + x.slice(1))
      );
    }
    if (!s.splitAnchor || !s.splitAnchor.date || s.splitAnchor.index == null) {
      // Map old anchor-by-id to new anchor-by-index, or default to today=index 0.
      const oldId = (CONFIG.splitAnchor && CONFIG.splitAnchor.splitId) || null;
      let idx = 0;
      if (oldId) {
        const oldName = (CONFIG.days || []).find(d => d.id === oldId);
        const targetName = oldName ? oldName.name : (oldId === 'rest' ? 'Rest' : oldId);
        const found = s.splitRotation.findIndex(n => n.toLowerCase() === targetName.toLowerCase());
        if (found >= 0) idx = found;
      }
      s.splitAnchor = {
        date: (CONFIG.splitAnchor && CONFIG.splitAnchor.date) || new Date().toISOString().slice(0, 10),
        index: idx
      };
    }
    return s;
  }
  function saveState() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {}
  }
  let state = loadState();
  document.getElementById('appTitle').textContent = CONFIG.appTitle || 'Progressive Overload Coach';

  // Public API so the Live Workout module can read/write through the
  // app's in-memory state (keeps logs/radar/PRs in sync, no clobbering).
  window.poLiveAPI = {
    exercises: function () { return state.exercises.slice(); },
    logs: function (id) { return (state.logs[id] || []).slice(); },
    addSet: function (id, set) {
      const a = state.logs[id] || [];
      a.push(set);
      state.logs[id] = a;
      saveState();
      if (typeof renderAll === 'function') renderAll();
      if (typeof wtRender === 'function') wtRender();
    },
    unit: function () { return state.units; },
    daysList: function () { return state.days.slice(); },
    filterDay: function () { return state.filterDay; }
  };

  // ============================================================
  // HELPERS
  // ============================================================
  const $ = (id) => document.getElementById(id);
  function unit() { return state.units; }
  function uid() { return 'ex_' + Date.now() + '_' + Math.floor(Math.random() * 9999); }
  function gymName(id) { const g = state.gyms.find(x => x.id === id); return g ? g.name : id; }
  function dayName(id) { const d = state.days.find(x => x.id === id); return d ? d.name : id; }
  function estimate1RM(w, r) { if (r < 2) return w; return w * (1 + r / 30); }
  function roundToStep(v, s) { return Math.round(v / s) * s; }
  function getFiltered() {
    return state.exercises.filter(e =>
      (e.gym === state.filterGym || e.gym === 'both') && e.day === state.filterDay);
  }
  function getCurrentEx() {
    const f = getFiltered();
    if (!f.length) return null;
    let ex = f.find(e => e.id === state.currentEx);
    if (!ex) { ex = f[0]; state.currentEx = ex.id; saveState(); }
    return ex;
  }
  function getLogs() { return (state.logs[state.currentEx] || []).slice(); }

  // Prescription engine — "what should I do next session?"
  // Upgrade trigger: hits CONFIG.upgradeAtReps (default 8) OR the
  // exercise's repMax, whichever fires first. So a 5-8 lifter hits
  // upgrade at 8; a 6-12 lifter ALSO hits it at 8 instead of grinding
  // out 12 reps before adding weight.
  function getRx(ex, logs) {
    if (!logs.length) return null;
    const last = logs[logs.length - 1];
    const { weight, reps } = last;
    const { repMin, repMax, step, bw } = ex;
    const upgradeAt = Math.min(CONFIG.upgradeAtReps || 8, repMax);
    let stuck = 0;
    for (let i = logs.length - 1; i >= 0; i--) {
      if (logs[i].weight === weight) stuck++; else break;
    }
    if (bw) {
      if (reps >= upgradeAt) return { type: 'up', weight: 0, reps: reps + 1, tag: 'Push for more', reason: reps + ' reps — strong. Push for ' + (reps + 1) + ' next time.', bw: true };
      if (reps >= repMin) return { type: 'hold', weight: 0, reps: reps + 1, tag: 'Add a rep', reason: reps + ' reps. Push for ' + (reps + 1) + ' next session.', bw: true };
      return { type: 'hold', weight: 0, reps: repMin, tag: 'Repeat', reason: reps + ' reps fell short. Repeat until you hit ' + repMin + '+.', bw: true };
    }
    if (stuck >= 3 && reps < repMin) {
      const dl = roundToStep(weight * 0.9, step);
      return { type: 'down', weight: dl, reps: repMax, tag: 'Deload', reason: 'Stuck at ' + weight + unit() + ' for ' + stuck + ' sessions. Drop 10%, reset, build back cleaner.' };
    }
    if (reps >= upgradeAt) return { type: 'up', weight: weight + step, reps: repMin, tag: 'Add weight', reason: 'You hit ' + reps + ' reps — time to add ' + step + unit() + '. Expect ' + repMin + '-' + (repMin + 1) + ' next session.' };
    if (reps >= repMin && reps < upgradeAt) return { type: 'hold', weight: weight, reps: reps + 1, tag: 'Add a rep', reason: reps + ' reps in target. Stay at ' + weight + unit() + ', push for ' + (reps + 1) + '.' };
    return { type: 'hold', weight: weight, reps: repMin, tag: 'Repeat', reason: reps + ' reps short of ' + repMin + '-' + upgradeAt + '. Repeat ' + weight + unit() + ' until you hit ' + repMin + '+ clean.' };
  }

  // ============================================================
  // RENDER
  // ============================================================
  function renderFilters() {
    $('gymSeg').innerHTML = state.gyms.map(g =>
      '<button class="po-seg-btn ' + (g.id === state.filterGym ? 'active' : '') + '" data-gym="' + g.id + '">' + escape(g.name) + '</button>'
    ).join('');
    $('daySeg').innerHTML = state.days.map(d =>
      '<button class="po-seg-btn ' + (d.id === state.filterDay ? 'active' : '') + '" data-day="' + d.id + '">' + escape(d.name) + '</button>'
    ).join('');
    $('gymSeg').querySelectorAll('.po-seg-btn').forEach(b => {
      b.addEventListener('click', () => { state.filterGym = b.dataset.gym; state.currentEx = null; saveState(); renderAll(); });
    });
    $('daySeg').querySelectorAll('.po-seg-btn').forEach(b => {
      b.addEventListener('click', () => {
        state.filterDay = b.dataset.day;
        state.currentEx = null;
        // User has now manually picked a day — stop auto-overriding to today's split.
        state._userPickedDay = true;
        saveState(); renderAll();
      });
    });
  }
  function renderSelect() {
    const sel = $('exSelect');
    const f = getFiltered();
    const noMsg = $('noExMsg');
    const editBtn = $('editExBtn');
    const logBtn = $('logBtn');
    if (!f.length) {
      sel.innerHTML = '<option>—</option>';
      sel.disabled = true; editBtn.disabled = true; logBtn.disabled = true;
      noMsg.style.display = 'block'; state.currentEx = null;
      return;
    }
    sel.disabled = false; editBtn.disabled = false; logBtn.disabled = false;
    noMsg.style.display = 'none';
    if (!f.find(e => e.id === state.currentEx)) state.currentEx = f[0].id;
    sel.innerHTML = f.map(e => {
      const wLbl = e.bw ? ' · BW' : (e.startWeight ? ' · ' + e.startWeight + unit() : '');
      const sh = e.gym === 'both' ? ' <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M12 2l2.9 6.3 6.9.6-5.2 4.6 1.6 6.8L12 17.3 5.8 20.9l1.6-6.8L2.2 8.9l6.9-.6z"/></svg>' : '';
      return '<option value="' + e.id + '"' + (e.id === state.currentEx ? ' selected' : '') + '>' + escape(e.name) + wLbl + sh + '</option>';
    }).join('');
  }
  function renderForm() {
    const ex = getCurrentEx();
    const banner = $('bwBanner');
    const wField = $('weightField');
    const oneRmLbl = $('oneRmLabel');
    const grid = $('logGrid');
    $('weightLabel').textContent = 'Weight (' + unit() + ')';
    if (ex && ex.bw) {
      banner.classList.add('show');
      wField.style.display = 'none';
      grid.classList.add('po-bw-mode');
      oneRmLbl.textContent = 'Best reps';
    } else {
      banner.classList.remove('show');
      wField.style.display = '';
      grid.classList.remove('po-bw-mode');
      oneRmLbl.textContent = 'Est. 1RM';
    }
  }
  function renderLastSet() {
    const wrap = $('lastSet');
    const v = $('lastSetValue');
    const m = $('lastSetMeta');
    const ex = getCurrentEx();
    const logs = ex ? getLogs() : [];
    if (!ex || !logs.length) { wrap.classList.remove('show'); return; }
    const last = logs[logs.length - 1];
    const setStr = ex.bw ? (last.reps + ' reps') : (last.weight + unit() + ' × ' + last.reps);
    const d = new Date(last.date);
    const da = Math.floor((Date.now() - d.getTime()) / 86400000);
    const ago = da === 0 ? 'today' : da === 1 ? 'yesterday' : da + ' days ago';
    v.textContent = setStr;
    m.textContent = ago;
    wrap.classList.add('show');
  }
  function renderRx() {
    const wrap = $('rxWrap');
    const ex = getCurrentEx();
    if (!ex) { wrap.innerHTML = '<div class="po-rx-empty">Pick a gym and day above.</div>'; return; }
    const logs = getLogs();
    const rx = getRx(ex, logs);
    if (!rx) {
      const sw = ex.startWeight, sr = ex.repMin;
      const head = ex.bw
        ? '<span class="po-accent">' + sr + '</span> reps'
        : '<span class="po-accent">' + (sw || 0) + unit() + '</span> × ' + sr + ' reps';
      const reason = ex.bw
        ? 'Aim for ' + ex.repMin + '-' + ex.repMax + ' clean reps. Once you hit ' + ex.repMax + '+, push for more.'
        : 'Hit ' + ex.repMin + '-' + ex.repMax + ' reps. Once logged, the coach will start prescribing.';
      wrap.innerHTML = '<div class="po-rx-card"><div class="po-rx-label">' + escape(ex.name) + ' · starting point</div><div class="po-rx-headline">' + head + '</div><span class="po-rx-tag hold">Start here</span><p class="po-rx-reason">' + reason + '</p></div>';
      return;
    }
    const head = rx.bw
      ? '<span class="po-accent">' + rx.reps + '</span> reps'
      : '<span class="po-accent">' + rx.weight + unit() + '</span> × ' + rx.reps + ' reps';
    wrap.innerHTML = '<div class="po-rx-card po-rx-' + rx.type + '"><div class="po-rx-label">' + escape(ex.name) + '</div><div class="po-rx-headline">' + head + '</div><span class="po-rx-tag ' + rx.type + '">' + rx.tag + '</span><p class="po-rx-reason">' + rx.reason + '</p></div>';
  }
  function renderStats() {
    const ex = getCurrentEx();
    const logs = ex ? getLogs() : [];
    if (!logs.length) {
      $('oneRm').innerHTML = '—<span class="po-unit">' + unit() + '</span>';
      $('bestSet').textContent = '—';
      $('sessionCount').textContent = '—';
      return;
    }
    if (ex.bw) {
      const br = Math.max.apply(null, logs.map(l => l.reps));
      $('oneRm').innerHTML = br + '<span class="po-unit">reps</span>';
    } else {
      const orm = Math.max.apply(null, logs.map(l => estimate1RM(l.weight, l.reps)));
      $('oneRm').innerHTML = Math.round(orm) + '<span class="po-unit">' + unit() + '</span>';
    }
    let best = logs[0];
    logs.forEach(l => {
      const cur = ex.bw ? l.reps : estimate1RM(l.weight, l.reps);
      const bestVal = ex.bw ? best.reps : estimate1RM(best.weight, best.reps);
      if (cur > bestVal) best = l;
    });
    $('bestSet').textContent = ex.bw ? (best.reps + 'r') : (best.weight + '×' + best.reps);
    $('sessionCount').textContent = logs.length;
  }
  function renderSparkline() {
    const svg = $('sparkline');
    const empty = $('sparkEmpty');
    const ex = getCurrentEx();
    const logs = ex ? getLogs().slice(-10) : [];
    if (logs.length < 2) {
      svg.style.display = 'none'; empty.style.display = 'block';
      return;
    }
    svg.style.display = 'block'; empty.style.display = 'none';
    const vals = logs.map(l => ex.bw ? l.reps : estimate1RM(l.weight, l.reps));
    const min = Math.min.apply(null, vals);
    const max = Math.max.apply(null, vals);
    const range = max - min || 1;
    const W = 300, H = 60, pad = 4;
    const pts = vals.map((v, i) => {
      const x = pad + (W - pad * 2) * (i / (vals.length - 1));
      const y = H - pad - (H - pad * 2) * ((v - min) / range);
      return [x, y];
    });
    const linePath = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const fillPath = linePath + ' L' + pts[pts.length - 1][0].toFixed(1) + ' ' + H + ' L' + pts[0][0].toFixed(1) + ' ' + H + ' Z';
    // Keep <defs> in place; replace any prior paths
    const defsHTML = '<defs><linearGradient id="sparkGrad" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="rgba(255,255,255,0.18)"/><stop offset="100%" stop-color="rgba(255,255,255,0)"/></linearGradient></defs>';
    svg.innerHTML = defsHTML
      + '<path class="po-spark-fill" d="' + fillPath + '"/>'
      + '<path class="po-spark-line" d="' + linePath + '"/>';
  }
  function renderHistory() {
    const wrap = $('historyCard');
    const ex = getCurrentEx();
    const logs = ex ? getLogs().slice().reverse() : [];
    if (!logs.length) {
      wrap.innerHTML = '<div class="po-empty">No logs yet.</div>';
      return;
    }
    wrap.innerHTML = logs.slice(0, 12).map((l, i) => {
      const d = new Date(l.date);
      const dStr = (d.getMonth() + 1) + '/' + d.getDate();
      const setStr = ex.bw ? (l.reps + ' reps') : (l.weight + unit() + ' × ' + l.reps);
      const realIdx = logs.length - 1 - i; // since we reversed
      return '<div class="po-hist-row">'
        + '<div class="po-hist-date">' + dStr + '</div>'
        + '<div class="po-hist-set">' + setStr + '</div>'
        + '<button class="po-hist-del" data-idx="' + realIdx + '" aria-label="Delete">×</button>'
        + '</div>';
    }).join('');
    wrap.querySelectorAll('.po-hist-del').forEach(b => {
      b.addEventListener('click', () => {
        if (!confirm('Delete this log?')) return;
        const realIdx = parseInt(b.dataset.idx, 10);
        const arr = state.logs[state.currentEx] || [];
        // realIdx is index in REVERSED list; map back to original
        const origIdx = arr.length - 1 - realIdx;
        arr.splice(origIdx, 1);
        if (!arr.length) delete state.logs[state.currentEx];
        else state.logs[state.currentEx] = arr;
        saveState(); renderAll();
      });
    });
  }
  // Compute today's split from state.splitRotation + state.splitAnchor.
  // Returns the rotation entry name (e.g. "Push" or "Rest") AND the index.
  function todaySplit() {
    try {
      const rot = state.splitRotation;
      if (!rot || !rot.length) return { name: '—', index: 0 };
      const a = new Date(state.splitAnchor.date);
      const t = new Date();
      a.setHours(0,0,0,0); t.setHours(0,0,0,0);
      const diffDays = Math.round((t - a) / 86400000);
      const idx = ((state.splitAnchor.index + diffDays) % rot.length + rot.length) % rot.length;
      return { name: rot[idx], index: idx };
    } catch (e) {
      return { name: (state.splitRotation && state.splitRotation[0]) || '—', index: 0 };
    }
  }
  function todayDateLabel() {
    const d = new Date();
    const dows = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
    const mons = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    return dows[d.getDay()] + ', ' + mons[d.getMonth()] + ' ' + d.getDate();
  }
  function isRestName(name) { return /^rest\b/i.test(name || ''); }
  function splitLabel(name) {
    if (!name) return '—';
    return (isRestName(name) ? 'REST DAY' : (name + ' DAY')).toUpperCase();
  }
  function renderDayPill() {
    const split = todaySplit();
    $('dayPillDate').textContent = todayDateLabel();
    const splitEl = $('dayPillSplit');
    splitEl.textContent = splitLabel(split.name);
    splitEl.classList.toggle('is-rest', isRestName(split.name));
  }

  // Build the rep buttons based on the current exercise's repMin/repMax.
  // Always spans repMin → repMax + 2 (a small buffer for over-performing
  // sets that trigger the upgrade signal), capped at 16 buttons total so
  // wide ranges don't break the mobile layout.
  function renderRepsRow() {
    const row = document.getElementById('repsRow');
    if (!row) return;
    const ex = getCurrentEx();
    let repMin, repMax;
    if (ex) {
      repMin = Math.max(1, parseInt(ex.repMin, 10) || 1);
      repMax = Math.max(repMin, parseInt(ex.repMax, 10) || repMin);
    } else {
      repMin = 4; repMax = 12;
    }
    const upper = Math.max(repMax + 2, repMin + 5);
    const end = Math.min(upper, repMin + 15);

    // Preserve the previously-selected rep if it still fits in the new
    // range; otherwise default to the target (repMax).
    const prev = parseInt(row.dataset.value, 10);
    const active = (prev >= repMin && prev <= end) ? prev : repMax;

    let html = '';
    for (let i = repMin; i <= end; i++) {
      html += '<button type="button" class="po-reps-pill' +
        (i === active ? ' active' : '') +
        '" data-v="' + i + '">' + i + '</button>';
    }
    row.innerHTML = html;
    row.dataset.value = String(active);
  }

  function renderAll() {
    renderDayPill();
    renderFilters(); renderSelect(); renderForm(); renderLastSet();
    renderRepsRow();
    renderRx(); renderStats(); renderSparkline(); renderHistory();
    renderTodaysWorkout();
    renderPastWorkouts();
    // Pre-fill weight input with last logged weight (or starting weight)
    const ex = getCurrentEx();
    if (ex && !ex.bw) {
      const logs = getLogs();
      const w = logs.length ? logs[logs.length - 1].weight : (ex.startWeight || 0);
      $('weightInput').value = w;
    }
  }

  // ============================================================
  // TODAY'S WORKOUT + PAST WORKOUTS
  //
  // Reads state.logs, groups by date, surfaces:
  //  - Today: every set logged today, per exercise, with set count + total
  //    volume (kg lifted = sum of weight × reps across all working sets).
  //  - Past: every previous workout day, sorted newest-first, with the
  //    same summary numbers + a DONE badge if the user marked that day.
  //
  // The total volume here is what the composition-estimate uses (combined
  // with the 1RM trend) — more weekly volume + strength gain = more of
  // recent body-weight delta gets attributed to muscle.
  // ============================================================
  const WORKOUT_DONE_KEY = 'po_coach_workout_done';
  function loadDoneDays() {
    try { const raw = localStorage.getItem(WORKOUT_DONE_KEY); return raw ? JSON.parse(raw) : {}; }
    catch (e) { return {}; }
  }
  function saveDoneDays(d) {
    try { localStorage.setItem(WORKOUT_DONE_KEY, JSON.stringify(d)); } catch (e) {}
  }
  let doneDays = loadDoneDays();

  function logsByDay() {
    const byDay = {};
    state.exercises.forEach(ex => {
      (state.logs[ex.id] || []).forEach(l => {
        const dk = l.date.slice(0, 10);
        if (!byDay[dk]) byDay[dk] = [];
        byDay[dk].push({ ex, log: l });
      });
    });
    return byDay;
  }

  function fmtPastDate(dk) {
    const [y, m, d] = dk.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    const dows = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
    const mons = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    return dows[dt.getDay()] + ' ' + mons[dt.getMonth()] + ' ' + dt.getDate();
  }

  function summarizeDay(daySets) {
    // daySets: [{ex, log}]. Group by exercise, return {sets: N, vol: kg, perEx: [...]}.
    const byEx = {};
    daySets.forEach(({ex, log}) => {
      if (!byEx[ex.id]) byEx[ex.id] = { ex, sets: [], vol: 0 };
      byEx[ex.id].sets.push(log);
      byEx[ex.id].vol += (log.weight || 0) * (log.reps || 0);
    });
    const perEx = Object.values(byEx);
    const totalSets = perEx.reduce((s, e) => s + e.sets.length, 0);
    const totalVol = perEx.reduce((s, e) => s + e.vol, 0);
    return { perEx, totalSets, totalVol };
  }

  function renderTodaysWorkout() {
    const todayKey = wtDateKey(new Date());
    const all = logsByDay();
    const todaySets = all[todayKey] || [];
    const sum = summarizeDay(todaySets);
    const u = state.units;

    const eyebrow = $('poTwDateLabel');
    const dows = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
    const mons = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    const d = new Date();
    eyebrow.textContent = 'TODAY · ' + dows[d.getDay()] + ', ' + mons[d.getMonth()] + ' ' + d.getDate();

    $('poTwSetCount').textContent = sum.totalSets;
    $('poTwTotalVol').textContent = Math.round(sum.totalVol).toLocaleString() + ' ' + u + ' lifted';

    const list = $('poTwList');
    const empty = $('poTwEmpty');
    if (sum.totalSets === 0) {
      list.innerHTML = '';
      empty.classList.remove('hidden');
    } else {
      empty.classList.add('hidden');
      list.innerHTML = sum.perEx.map(e => {
        const top = e.ex.bw
          ? 'top ' + Math.max.apply(null, e.sets.map(s => s.reps)) + ' reps'
          : 'top ' + Math.max.apply(null, e.sets.map(s => s.weight)) + u;
        const meta = e.ex.bw
          ? (e.sets.length + ' set' + (e.sets.length === 1 ? '' : 's') + ' · ' + top)
          : (e.sets.length + ' set' + (e.sets.length === 1 ? '' : 's') + ' · ' + top + ' · ' + Math.round(e.vol) + u + ' total');
        return '<li class="po-tw-row">'
          + '<span class="po-tw-row-name">' + escape(e.ex.name) + '</span>'
          + '<span class="po-tw-row-meta">' + meta + '</span>'
          + '</li>';
      }).join('');
    }

    // Done button state
    const btn = $('poTwDoneBtn');
    const isDone = !!doneDays[todayKey];
    btn.innerHTML = isDone ? '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg> Done' : 'Mark workout done';
    btn.classList.toggle('is-done', isDone);
    btn.disabled = sum.totalSets === 0 && !isDone;
    btn.style.opacity = btn.disabled ? '0.4' : '';
  }

  function renderPastWorkouts() {
    const todayKey = wtDateKey(new Date());
    const all = logsByDay();
    const past = Object.entries(all)
      .filter(([dk]) => dk !== todayKey)
      .sort((a, b) => b[0].localeCompare(a[0]));
    $('poTwPastCount').textContent = past.length;
    const body = $('poTwPastBody');
    if (!past.length) {
      body.innerHTML = '<div class="po-tw-past-empty">No past workouts yet.</div>';
      return;
    }
    const u = state.units;
    body.innerHTML = past.slice(0, 30).map(([dk, sets]) => {
      const sum = summarizeDay(sets);
      const isDone = !!doneDays[dk];
      const exNames = sum.perEx.map(e => e.ex.name).slice(0, 3).join(', ')
        + (sum.perEx.length > 3 ? '…' : '');
      return '<div class="po-tw-past-day">'
        + '<div class="po-tw-past-day-h">'
        +   '<span class="po-tw-past-day-date">' + fmtPastDate(dk) + '</span>'
        +   '<span class="po-tw-past-day-summary">'
        +     sum.totalSets + ' sets · ' + Math.round(sum.totalVol).toLocaleString() + ' ' + u
        +     (isDone ? ' <span class="po-tw-past-day-done">DONE</span>' : '')
        +   '</span>'
        + '</div>'
        + '<div class="po-tw-past-day-summary" style="margin-top:6px; font-size:11px; color:var(--text-3);">'
        +   escape(exNames)
        + '</div>'
        + '</div>';
    }).join('');
  }

  $('poTwDoneBtn').addEventListener('click', () => {
    const todayKey = wtDateKey(new Date());
    if (doneDays[todayKey]) {
      delete doneDays[todayKey];
    } else {
      doneDays[todayKey] = new Date().toISOString();
    }
    saveDoneDays(doneDays);
    renderTodaysWorkout();
    renderPastWorkouts();
  });
  $('poTwPastToggle').addEventListener('click', () => {
    const body = $('poTwPastBody');
    const toggle = $('poTwPastToggle');
    const open = body.style.display !== 'none';
    body.style.display = open ? 'none' : 'flex';
    body.style.flexDirection = 'column';
    toggle.setAttribute('aria-expanded', open ? 'false' : 'true');
  });

  // ============================================================
  // EVENT WIRING
  // ============================================================
  // Tap the day pill → opens the rotation editor so you can rename /
  // reorder / add / delete entries (e.g. switch Push/Pull/Legs/Rest to
  // Legs/Arms/Back/Chest). Long-press isn't a thing on web reliably so
  // this is the only action — the day filter still auto-snaps on load.
  $('dayPill').addEventListener('click', () => openRotationModal());

  // First-load nicety: if today's split matches one of the day filters
  // by name (case-insensitive) and the user hasn't manually picked one,
  // pre-select that day.
  (function autoSelectTodaySplit() {
    const s = todaySplit();
    if (!s.name || isRestName(s.name) || state._userPickedDay) return;
    const match = state.days.find(d => d.name.toLowerCase() === s.name.toLowerCase());
    if (match) state.filterDay = match.id;
  })();

  $('exSelect').addEventListener('change', e => {
    state.currentEx = e.target.value; saveState(); renderAll();
  });
  $('weightDownBtn').addEventListener('click', () => {
    const ex = getCurrentEx(); if (!ex || ex.bw) return;
    const w = parseFloat($('weightInput').value) || 0;
    $('weightInput').value = Math.max(0, w - (ex.step || 2.5));
  });
  $('weightUpBtn').addEventListener('click', () => {
    const ex = getCurrentEx(); if (!ex || ex.bw) return;
    const w = parseFloat($('weightInput').value) || 0;
    $('weightInput').value = w + (ex.step || 2.5);
  });
  // Delegated click handler — reps row is regenerated per exercise via
  // renderRepsRow(), so we listen on the container rather than the
  // individual buttons.
  $('repsRow').addEventListener('click', (e) => {
    const p = e.target.closest('.po-reps-pill');
    if (!p) return;
    $('repsRow').querySelectorAll('.po-reps-pill').forEach(x => x.classList.remove('active'));
    p.classList.add('active');
    $('repsRow').dataset.value = p.dataset.v;
  });
  $('logBtn').addEventListener('click', () => {
    const ex = getCurrentEx();
    if (!ex) return;
    const reps = parseInt($('repsRow').dataset.value, 10) || 0;
    if (reps <= 0) { alert('Pick a rep count.'); return; }
    const w = ex.bw ? 0 : (parseFloat($('weightInput').value) || 0);
    if (!ex.bw && w <= 0) { alert('Enter a weight.'); return; }
    const arr = state.logs[ex.id] || [];
    const warmupEl = $('gxWarmup'), rpeEl = $('gxRpe');
    const entry = { weight: w, reps: reps, date: new Date().toISOString() };
    if (warmupEl && warmupEl.checked) entry.warmup = true;
    if (rpeEl && rpeEl.value) entry.rpe = parseFloat(rpeEl.value);
    arr.push(entry);
    state.logs[ex.id] = arr;
    saveState(); renderAll();
    // reset warm-up toggle, auto-start rest timer (working sets only)
    if (warmupEl) warmupEl.checked = false;
    if (rpeEl) rpeEl.value = '';
    if (!entry.warmup && typeof window.gxStartRest === 'function') {
      try { const gs = JSON.parse(localStorage.getItem('gym_v1') || '{}'); window.gxStartRest(gs.restDefault || 90); } catch (e) { window.gxStartRest(90); }
    }
    // Strength changed → composition estimate may shift
    if (typeof wtRender === 'function') wtRender();
    // Tiny pulse on the button so the user feels the save
    const btn = $('logBtn');
    btn.style.transition = 'transform 0.15s';
    btn.style.transform = 'scale(0.96)';
    setTimeout(() => { btn.style.transform = ''; }, 160);
  });

  // ============================================================
  // EXERCISE MODAL (add / edit)
  // ============================================================
  let editingExId = null;
  let modalGym = null, modalDay = null;
  function renderModalSegs() {
    $('exGymSeg').innerHTML = state.gyms.map(g =>
      '<button data-gym="' + g.id + '" class="' + (modalGym === g.id ? 'active' : '') + '">' + escape(g.name) + '</button>'
    ).join('') + '<button data-gym="both" class="' + (modalGym === 'both' ? 'active' : '') + '">Both</button>';
    $('exDaySeg').innerHTML = state.days.map(d =>
      '<button data-day="' + d.id + '" class="' + (modalDay === d.id ? 'active' : '') + '">' + escape(d.name) + '</button>'
    ).join('');
    $('exGymSeg').querySelectorAll('button').forEach(b => {
      b.addEventListener('click', () => {
        modalGym = b.dataset.gym;
        $('exGymSeg').querySelectorAll('button').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
      });
    });
    $('exDaySeg').querySelectorAll('button').forEach(b => {
      b.addEventListener('click', () => {
        modalDay = b.dataset.day;
        $('exDaySeg').querySelectorAll('button').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
      });
    });
  }
  function openExModal(mode, ex) {
    editingExId = mode === 'edit' ? ex.id : null;
    $('exModalTitle').textContent = mode === 'edit' ? 'Edit exercise' : 'Add exercise';
    $('exDelete').style.display = mode === 'edit' ? 'block' : 'none';
    if (mode === 'edit') {
      $('exName').value = ex.name;
      modalGym = ex.gym;
      modalDay = ex.day;
      $('exBw').checked = !!ex.bw;
      $('exStartWeight').value = ex.startWeight || 0;
      $('exRepMin').value = ex.repMin;
      $('exRepMax').value = ex.repMax;
      $('exStep').value = ex.step;
    } else {
      $('exName').value = '';
      modalGym = state.filterGym;
      modalDay = state.filterDay;
      $('exBw').checked = false;
      $('exStartWeight').value = 20;
      $('exRepMin').value = 6;
      $('exRepMax').value = 8;
      $('exStep').value = 2.5;
    }
    renderModalSegs();
    toggleBwFields();
    $('exModalBg').classList.add('show');
    setTimeout(() => $('exName').focus(), 60);
  }
  function toggleBwFields() {
    const isBw = $('exBw').checked;
    $('exStartWeightField').style.display = isBw ? 'none' : '';
    $('exStepField').style.display = isBw ? 'none' : '';
  }
  $('exBw').addEventListener('change', toggleBwFields);
  $('addExBtn').addEventListener('click', () => openExModal('add'));
  $('editExBtn').addEventListener('click', () => {
    const ex = getCurrentEx();
    if (ex) openExModal('edit', ex);
  });
  $('exModalCancel').addEventListener('click', () => $('exModalBg').classList.remove('show'));
  $('exModalSave').addEventListener('click', () => {
    const name = $('exName').value.trim();
    if (!name) { alert('Name is required.'); return; }
    if (!modalGym) { alert('Pick a gym.'); return; }
    if (!modalDay) { alert('Pick a day.'); return; }
    const isBw = $('exBw').checked;
    const repMin = parseInt($('exRepMin').value, 10) || 6;
    const repMax = parseInt($('exRepMax').value, 10) || 8;
    const data = {
      name, gym: modalGym, day: modalDay,
      bw: isBw,
      startWeight: isBw ? 0 : (parseFloat($('exStartWeight').value) || 0),
      repMin, repMax,
      step: isBw ? 1 : (parseFloat($('exStep').value) || 2.5)
    };
    if (editingExId) {
      const ex = state.exercises.find(e => e.id === editingExId);
      if (ex) Object.assign(ex, data);
    } else {
      const ex = Object.assign({ id: uid() }, data);
      state.exercises.push(ex);
      state.currentEx = ex.id;
      state.filterGym = (modalGym === 'both') ? state.filterGym : modalGym;
      state.filterDay = modalDay;
    }
    saveState();
    $('exModalBg').classList.remove('show');
    renderAll();
  });
  $('exDelete').addEventListener('click', () => {
    if (!editingExId) return;
    if (!confirm('Delete this exercise and all its logs?')) return;
    state.exercises = state.exercises.filter(e => e.id !== editingExId);
    delete state.logs[editingExId];
    if (state.currentEx === editingExId) state.currentEx = null;
    editingExId = null;
    saveState();
    $('exModalBg').classList.remove('show');
    renderAll();
  });

  // ============================================================
  // ROTATION EDITOR (tap the day pill)
  // Edit the split cycle in place: rename, reorder, add, delete.
  // "Today is →" jumps the cycle anchor to any entry, so you can change
  // both the order AND which day in that order is "today".
  // ============================================================
  let rotDraft = null;          // working copy while modal is open
  let rotDraftTodayIdx = 0;     // which entry IS today in the draft

  function openRotationModal() {
    rotDraft = (state.splitRotation || []).slice();
    if (!rotDraft.length) rotDraft = ['Push', 'Pull', 'Legs', 'Rest'];
    rotDraftTodayIdx = todaySplit().index;
    if (rotDraftTodayIdx >= rotDraft.length) rotDraftTodayIdx = 0;
    renderRotList();
    $('rotModalBg').classList.add('show');
  }

  function renderRotList() {
    const list = $('rotList');
    list.innerHTML = rotDraft.map((name, i) => {
      const isToday = (i === rotDraftTodayIdx);
      return '<div class="rot-row ' + (isToday ? 'is-today' : '') + '" data-i="' + i + '">'
        + '<span class="rot-row-num">' + (i + 1) + '</span>'
        + '<input type="text" value="' + escape(name) + '" placeholder="e.g. Arms" maxlength="30">'
        + (isToday
            ? '<span class="rot-today-tag">TODAY</span>'
            : '<button type="button" class="rot-today-btn" data-action="today">Today is →</button>')
        + '<button type="button" class="rot-mini" data-action="up"   aria-label="Move up">↑</button>'
        + '<button type="button" class="rot-mini" data-action="down" aria-label="Move down">↓</button>'
        + '<button type="button" class="rot-mini rot-mini-del" data-action="del" aria-label="Delete">×</button>'
        + '</div>';
    }).join('');
    list.querySelectorAll('.rot-row').forEach(row => {
      const i = parseInt(row.dataset.i, 10);
      row.querySelector('input').addEventListener('input', e => { rotDraft[i] = e.target.value; });
      const upBtn = row.querySelector('[data-action="up"]');
      const dnBtn = row.querySelector('[data-action="down"]');
      const delBtn = row.querySelector('[data-action="del"]');
      const todayBtn = row.querySelector('[data-action="today"]');
      if (upBtn) upBtn.addEventListener('click', () => {
        if (i === 0) return;
        [rotDraft[i-1], rotDraft[i]] = [rotDraft[i], rotDraft[i-1]];
        if (rotDraftTodayIdx === i)   rotDraftTodayIdx = i - 1;
        else if (rotDraftTodayIdx === i - 1) rotDraftTodayIdx = i;
        renderRotList();
      });
      if (dnBtn) dnBtn.addEventListener('click', () => {
        if (i >= rotDraft.length - 1) return;
        [rotDraft[i+1], rotDraft[i]] = [rotDraft[i], rotDraft[i+1]];
        if (rotDraftTodayIdx === i)   rotDraftTodayIdx = i + 1;
        else if (rotDraftTodayIdx === i + 1) rotDraftTodayIdx = i;
        renderRotList();
      });
      if (delBtn) delBtn.addEventListener('click', () => {
        if (rotDraft.length <= 1) { alert('Need at least one day in the cycle.'); return; }
        rotDraft.splice(i, 1);
        if (rotDraftTodayIdx >= rotDraft.length) rotDraftTodayIdx = rotDraft.length - 1;
        else if (i < rotDraftTodayIdx) rotDraftTodayIdx--;
        renderRotList();
      });
      if (todayBtn) todayBtn.addEventListener('click', () => {
        rotDraftTodayIdx = i;
        renderRotList();
      });
    });
  }

  $('rotAddBtn').addEventListener('click', () => {
    rotDraft.push('New day');
    renderRotList();
    // Focus the newly added input
    setTimeout(() => {
      const inputs = $('rotList').querySelectorAll('input');
      const last = inputs[inputs.length - 1];
      if (last) { last.focus(); last.select(); }
    }, 30);
  });
  $('rotCancel').addEventListener('click', () => {
    $('rotModalBg').classList.remove('show');
    rotDraft = null;
  });
  $('rotSave').addEventListener('click', () => {
    // Trim + drop empty entries
    const cleaned = rotDraft.map(s => (s || '').trim()).filter(Boolean);
    if (!cleaned.length) { alert('Need at least one day in the cycle.'); return; }
    let newTodayIdx = rotDraftTodayIdx;
    if (newTodayIdx >= cleaned.length) newTodayIdx = 0;
    state.splitRotation = cleaned;
    state.splitAnchor = {
      date: new Date().toISOString().slice(0, 10),
      index: newTodayIdx
    };
    saveState();
    $('rotModalBg').classList.remove('show');
    rotDraft = null;
    renderAll();
  });

  // ============================================================
  // SETTINGS MODAL (gyms, days, units, data)
  // ============================================================
  function renderSettings() {
    $('setUnitsSeg').querySelectorAll('button').forEach(b => {
      b.classList.toggle('active', b.dataset.u === state.units);
    });
    $('setGyms').innerHTML = state.gyms.map((g, i) =>
      '<div class="po-set-row" data-i="' + i + '">'
      + '<input type="text" value="' + escape(g.name) + '" data-field="name" placeholder="Gym name">'
      + '<button class="po-mini-btn" data-action="del" aria-label="Delete">×</button>'
      + '</div>'
    ).join('');
    $('setDays').innerHTML = state.days.map((d, i) =>
      '<div class="po-set-row" data-i="' + i + '">'
      + '<input type="text" value="' + escape(d.name) + '" data-field="name" placeholder="Day name">'
      + '<button class="po-mini-btn" data-action="del" aria-label="Delete">×</button>'
      + '</div>'
    ).join('');
    $('setGyms').querySelectorAll('.po-set-row').forEach(row => {
      const i = parseInt(row.dataset.i, 10);
      row.querySelector('input').addEventListener('input', e => {
        state.gyms[i].name = e.target.value;
        saveState();
      });
      row.querySelector('[data-action="del"]').addEventListener('click', () => {
        if (state.gyms.length <= 1) { alert('You need at least one gym.'); return; }
        if (!confirm('Remove "' + state.gyms[i].name + '"? Exercises tagged to this gym will become invisible until you reassign them.')) return;
        state.gyms.splice(i, 1);
        if (!state.gyms.find(g => g.id === state.filterGym)) state.filterGym = state.gyms[0].id;
        saveState(); renderSettings(); renderAll();
      });
    });
    $('setDays').querySelectorAll('.po-set-row').forEach(row => {
      const i = parseInt(row.dataset.i, 10);
      row.querySelector('input').addEventListener('input', e => {
        state.days[i].name = e.target.value;
        saveState();
      });
      row.querySelector('[data-action="del"]').addEventListener('click', () => {
        if (state.days.length <= 1) { alert('You need at least one day.'); return; }
        if (!confirm('Remove "' + state.days[i].name + '"?')) return;
        state.days.splice(i, 1);
        if (!state.days.find(d => d.id === state.filterDay)) state.filterDay = state.days[0].id;
        saveState(); renderSettings(); renderAll();
      });
    });
  }
  $('settingsBtn').addEventListener('click', () => {
    renderSettings();
    $('setModalBg').classList.add('show');
  });
  $('setModalClose').addEventListener('click', () => {
    $('setModalBg').classList.remove('show');
    renderAll();
  });
  $('setUnitsSeg').querySelectorAll('button').forEach(b => {
    b.addEventListener('click', () => {
      state.units = b.dataset.u; saveState();
      $('setUnitsSeg').querySelectorAll('button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      if (typeof wtRender === 'function') wtRender();
    });
  });
  $('setAddGym').addEventListener('click', () => {
    const name = (prompt('New gym name:') || '').trim();
    if (!name) return;
    const id = 'g_' + Date.now();
    state.gyms.push({ id, name });
    saveState(); renderSettings(); renderAll();
  });
  $('setAddDay').addEventListener('click', () => {
    const name = (prompt('New day name:') || '').trim();
    if (!name) return;
    const id = 'd_' + Date.now();
    state.days.push({ id, name });
    saveState(); renderSettings(); renderAll();
  });

  // Export / Import / Reset
  $('setExport').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'po-coach-data-' + new Date().toISOString().slice(0,10) + '.json';
    a.click(); URL.revokeObjectURL(url);
  });
  $('setImport').addEventListener('click', () => $('setImportFile').click());
  $('setImportFile').addEventListener('change', e => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!confirm('Replace ALL current data with the imported file? This cannot be undone.')) return;
        state = normalize(parsed);
        saveState(); renderSettings(); renderAll();
      } catch (err) { alert('Import failed: ' + err.message); }
    };
    reader.readAsText(file);
  });
  $('setReset').addEventListener('click', () => {
    if (!confirm('Delete EVERYTHING (logs, edits, gyms, days)? This cannot be undone.')) return;
    localStorage.removeItem(LS_KEY);
    state = loadState();
    $('setModalBg').classList.remove('show');
    renderAll();
  });

  function escape(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  // ============================================================
  // WEIGHT TRACKER + COMPOSITION ESTIMATE + PROGRESS PHOTOS
  // All persisted to localStorage:
  //   po_coach_weights : [{ dateKey:'YYYY-MM-DD', weight:Number }]
  //   po_coach_photos  : [{ id, dataUrl, dateKey, weight }]
  // ============================================================
  const WT_KEY = 'po_coach_weights';
  const PHOTO_KEY = 'po_coach_photos';

  function wtLoad() {
    try {
      const raw = localStorage.getItem(WT_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.sort((a,b) => a.dateKey.localeCompare(b.dateKey)) : [];
    } catch (e) { return []; }
  }
  function wtSave(arr) {
    try { localStorage.setItem(WT_KEY, JSON.stringify(arr)); } catch (e) {}
  }
  function wtDateKey(d) {
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }
  function wtParseKey(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  function wtSmoothPath(points) {
    if (!points.length) return '';
    if (points.length === 1) return 'M ' + points[0].x + ' ' + points[0].y;
    let d = 'M ' + points[0].x.toFixed(2) + ' ' + points[0].y.toFixed(2);
    for (let i = 1; i < points.length; i++) {
      const prev = points[i-1], curr = points[i];
      const cx = (prev.x + curr.x) / 2;
      d += ' Q ' + cx.toFixed(2) + ' ' + prev.y.toFixed(2) + ', ' + cx.toFixed(2) + ' ' + ((prev.y + curr.y)/2).toFixed(2);
      d += ' T ' + curr.x.toFixed(2) + ' ' + curr.y.toFixed(2);
    }
    return d;
  }

  let wtEntries = wtLoad();

  function wtSaveEntry(weight) {
    const key = wtDateKey(new Date());
    const existing = wtEntries.find(e => e.dateKey === key);
    if (existing) existing.weight = weight;
    else { wtEntries.push({ dateKey: key, weight }); wtEntries.sort((a,b) => a.dateKey.localeCompare(b.dateKey)); }
    wtSave(wtEntries);
    wtRender();
  }

  function wtRender() {
    const last = wtEntries[wtEntries.length - 1] || null;
    const todayKey = wtDateKey(new Date());
    const todayEntry = wtEntries.find(e => e.dateKey === todayKey);
    const u = state.units;

    // Sync unit labels everywhere
    $('wtUnit').textContent = u;
    $('wtUnitStatic').textContent = u;
    $('wtNum').textContent = last ? last.weight.toFixed(1) : '—';

    // Locked vs input
    if (todayEntry) {
      $('wtEmpty').classList.add('hidden');
      $('wtLockedValue').textContent = todayEntry.weight.toFixed(1) + ' ' + u;
      $('wtLocked').classList.remove('hidden');
      $('wtInputRow').classList.add('hidden');
    } else {
      if (wtEntries.length === 0) $('wtEmpty').classList.remove('hidden');
      else $('wtEmpty').classList.add('hidden');
      $('wtLocked').classList.add('hidden');
      $('wtInputRow').classList.remove('hidden');
      if (last && !$('wtInput').value) $('wtInput').value = last.weight.toFixed(1);
    }

    // Chart, delta, composition need 2+ entries
    if (wtEntries.length >= 2) {
      $('wtChartWrap').classList.remove('hidden');
      $('wtLegend').classList.remove('hidden');
      wtRenderChart();
      wtRenderDelta();
      wtRenderComposition();
    } else {
      $('wtChartWrap').classList.add('hidden');
      $('wtLegend').classList.add('hidden');
      $('wtDelta').classList.add('hidden');
      $('wtComp').classList.add('hidden');
    }
    wtRenderStreak();
  }

  // Streak — consecutive days ending at today (or yesterday if today
  // hasn't been logged yet) with at least one weight entry.
  function wtRenderStreak() {
    const el = $('wtStreak');
    let streak = 0;
    let cursor = new Date(new Date());
    if (!wtEntries.find(e => e.dateKey === wtDateKey(cursor))) {
      cursor.setDate(cursor.getDate() - 1);
    }
    while (wtEntries.find(e => e.dateKey === wtDateKey(cursor))) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }
    if (streak >= 2) {
      $('wtStreakNum').textContent = streak + ' day streak';
      el.classList.remove('hidden');
    } else {
      el.classList.add('hidden');
    }
  }

  function wtRenderChart() {
    const recent = wtEntries.slice(-30);
    const weights = recent.map(e => e.weight);
    const min = Math.min.apply(null, weights);
    const max = Math.max.apply(null, weights);
    const pad = Math.max((max - min) * 0.15, 0.5);
    const yMin = min - pad, yMax = max + pad;
    const xLeft = 8, xRight = 312, yTop = 20, yBot = 110;
    const xRange = xRight - xLeft, yRange = yBot - yTop;
    const xFor = (i) => recent.length === 1 ? xRight : xLeft + (i / (recent.length - 1)) * xRange;
    const yFor = (w) => yBot - ((w - yMin) / (yMax - yMin)) * yRange;
    const points = recent.map((e, i) => ({ x: xFor(i), y: yFor(e.weight) }));
    const linePath = wtSmoothPath(points);
    const areaPath = linePath + ' L ' + points[points.length - 1].x.toFixed(2) + ' ' + yBot + ' L ' + points[0].x.toFixed(2) + ' ' + yBot + ' Z';
    // 7d moving avg
    const avgPoints = recent.map((_, i) => {
      const start = Math.max(0, i - 6);
      const win = recent.slice(start, i + 1);
      const avg = win.reduce((s, p) => s + p.weight, 0) / win.length;
      return { x: xFor(i), y: yFor(avg) };
    });
    const avgPath = wtSmoothPath(avgPoints);
    let html = '<path class="wt-avg-line" d="' + avgPath + '"></path>'
             + '<path class="wt-area" d="' + areaPath + '"></path>'
             + '<path class="wt-line" filter="url(#wtGlow)" d="' + linePath + '"></path>';
    points.forEach((p, i) => {
      const cls = (i === points.length - 1) ? 'wt-dot-today' : 'wt-dot';
      const r = (i === points.length - 1) ? 5 : 3;
      html += '<circle class="' + cls + '" cx="' + p.x.toFixed(2) + '" cy="' + p.y.toFixed(2) + '" r="' + r + '"/>';
    });
    $('wtChartContent').innerHTML = html;
    $('wtYAxisMax').textContent = yMax.toFixed(1);
    $('wtYAxisMin').textContent = yMin.toFixed(1);
    $('wtMeta').textContent = wtEntries.length + ' ' + (wtEntries.length === 1 ? 'entry' : 'entries') + ' · last ' + recent.length + ' days';
  }

  function wtRenderDelta() {
    const last = wtEntries[wtEntries.length - 1];
    const lastDate = wtParseKey(last.dateKey);
    const cutoff = new Date(lastDate); cutoff.setDate(cutoff.getDate() - 7);
    const baseline = wtEntries.find(e => wtParseKey(e.dateKey) >= cutoff) || wtEntries[0];
    const diff = last.weight - baseline.weight;
    const el = $('wtDelta');
    if (Math.abs(diff) < 0.05) { el.classList.add('hidden'); return; }
    const arrow = diff > 0 ? '↑' : '↓';
    const sign = diff > 0 ? '+' : '−';
    el.textContent = arrow + ' ' + sign + Math.abs(diff).toFixed(1) + ' ' + state.units + ' · last 7d';
    el.classList.toggle('up',   diff > 0);
    el.classList.toggle('down', diff < 0);
    el.classList.remove('hidden');
  }

  // ============================================================
  // COMPOSITION ESTIMATE — muscle vs fat from weight + strength trend
  //
  // Math:
  //   weightDelta   = current weight − weight ~30 days ago
  //   strengthDelta = avg of (current 1RM / 1RM 30 days ago across all
  //                   exercises with logs in BOTH windows)
  //   yearsTraining → max muscle gain rate per week:
  //     1y → 0.45 kg, 2y → 0.23 kg, 3y+ → 0.11 kg (Lyle McDonald's
  //     model — cited intermediate intermediate values are real ceilings)
  //   estimated muscle gain = max muscle rate × weeks × (1 + strengthDelta)
  //                           clipped to [0, weightDelta]
  //   estimated fat gain    = weightDelta − estimated muscle gain
  //
  // If you LOSE weight: any positive strength delta means you're keeping
  // (or building) muscle, so the loss is mostly fat.
  // ============================================================
  function wtRenderComposition() {
    const compEl = $('wtComp');
    if (!CONFIG.composition || !CONFIG.composition.enabled) {
      compEl.classList.add('hidden'); return;
    }
    const window = CONFIG.composition.windowDays || 30;
    if (wtEntries.length < 2) { compEl.classList.add('hidden'); return; }

    const now = wtParseKey(wtEntries[wtEntries.length - 1].dateKey);
    const start = new Date(now); start.setDate(start.getDate() - window);

    // Find weight at start of window (closest entry on or after start)
    const startEntry = wtEntries.find(e => wtParseKey(e.dateKey) >= start);
    const endEntry = wtEntries[wtEntries.length - 1];
    if (!startEntry || startEntry === endEntry) { compEl.classList.add('hidden'); return; }
    const weightDelta = endEntry.weight - startEntry.weight;
    const actualDays = Math.max(1, Math.round((wtParseKey(endEntry.dateKey) - wtParseKey(startEntry.dateKey)) / 86400000));
    const weeks = actualDays / 7;

    // Strength delta — for each exercise, take the AVG 1RM of logs inside
    // the window vs AVG of logs of equal count just before the window.
    let strengthRatios = [];
    let workoutDays = new Set();
    let totalVolumeInWindow = 0;
    state.exercises.forEach(ex => {
      const logs = (state.logs[ex.id] || []).slice();
      if (logs.length < 2 || ex.bw) {
        // Still count volume / sessions even for bodyweight + sparse exercises
        logs.forEach(l => {
          if (new Date(l.date) >= start) {
            workoutDays.add(l.date.slice(0, 10));
            totalVolumeInWindow += (l.weight || 0) * (l.reps || 0);
          }
        });
        return;
      }
      const inWin  = logs.filter(l => new Date(l.date) >= start);
      const before = logs.filter(l => new Date(l.date) < start);
      inWin.forEach(l => {
        workoutDays.add(l.date.slice(0, 10));
        totalVolumeInWindow += (l.weight || 0) * (l.reps || 0);
      });
      if (!inWin.length || !before.length) return;
      const avg = arr => arr.reduce((s, l) => s + estimate1RM(l.weight, l.reps), 0) / arr.length;
      const a = avg(before), b = avg(inWin);
      if (a <= 0) return;
      strengthRatios.push(b / a);
    });
    const strengthDelta = strengthRatios.length
      ? (strengthRatios.reduce((s, r) => s + r, 0) / strengthRatios.length) - 1
      : 0;
    // Frequency factor: 4+ training days/week = full credit, fewer = penalty.
    // Volume factor: moderate cap so a single huge day doesn't game the score.
    const sessionsPerWeek = (workoutDays.size / actualDays) * 7;
    const frequencyFactor = Math.max(0.4, Math.min(1.2, sessionsPerWeek / 4));

    // Max muscle gain rate per week (kg). Convert to lb if user's units are lb.
    const yt = CONFIG.composition.yearsTraining || 1;
    let maxMuscleKgPerWeek;
    if (yt <= 1) maxMuscleKgPerWeek = 0.45;
    else if (yt === 2) maxMuscleKgPerWeek = 0.23;
    else maxMuscleKgPerWeek = 0.11;
    const unitConv = (state.units === 'lb') ? 2.20462 : 1;
    const maxMusclePerWeek = maxMuscleKgPerWeek * unitConv;

    // Estimated muscle: scale by strength gain (capped between 0.5x and 1.5x)
    // AND by training frequency (you can't build muscle you didn't stimulate).
    const strengthBoost = Math.max(0.5, Math.min(1.5, 1 + strengthDelta * 4));
    let estMuscle = maxMusclePerWeek * weeks * strengthBoost * frequencyFactor;

    let estFat;
    let headlineCls = '';
    let headline = '';
    if (weightDelta > 0) {
      // Surplus: split between muscle and fat. Cap muscle at the weight gained.
      estMuscle = Math.min(estMuscle, weightDelta);
      estFat = Math.max(0, weightDelta - estMuscle);
      const musclePct = estMuscle / weightDelta;
      if (musclePct >= 0.6 && strengthDelta > 0) {
        headlineCls = 'good';
        headline = '+' + weightDelta.toFixed(1) + ' ' + state.units + ' — mostly muscle, strength up.';
      } else if (musclePct >= 0.35) {
        headlineCls = 'warn';
        headline = '+' + weightDelta.toFixed(1) + ' ' + state.units + ' — mixed. Tighten kcal or push lifts harder.';
      } else {
        headlineCls = 'bad';
        headline = '+' + weightDelta.toFixed(1) + ' ' + state.units + ' — mostly fat. Strength flat. Cut kcal.';
      }
    } else {
      // Deficit: assume fat first, only credit muscle loss if strength dropped.
      const wDown = Math.abs(weightDelta);
      if (strengthDelta >= 0) {
        // Strength preserved or up → all fat lost, slight muscle gain
        estMuscle = Math.min(maxMusclePerWeek * weeks * 0.3, 0.5);
        estFat = wDown + estMuscle;
        headlineCls = 'good';
        headline = '−' + wDown.toFixed(1) + ' ' + state.units + ' — strength holding, fat dropping.';
      } else {
        // Strength dropped → some muscle loss
        const lossPct = Math.min(0.4, Math.abs(strengthDelta) * 2);
        estMuscle = -wDown * lossPct;
        estFat = -(wDown + estMuscle);
        headlineCls = 'warn';
        headline = '−' + wDown.toFixed(1) + ' ' + state.units + ' — strength slipping. You may be losing muscle.';
      }
    }

    // Render
    compEl.classList.remove('hidden');
    $('wtCompWindow').textContent = 'last ' + actualDays + 'd';
    const headlineEl = $('wtCompHeadline');
    headlineEl.textContent = headline;
    headlineEl.className = 'wt-comp-headline ' + headlineCls;

    // Bars
    const totalAbs = Math.abs(estMuscle) + Math.abs(estFat) || 1;
    const musclePct = (Math.abs(estMuscle) / totalAbs) * 100;
    const fatPct = (Math.abs(estFat) / totalAbs) * 100;
    $('wtCompBars').innerHTML =
      '<div class="wt-comp-bar muscle" style="width:' + musclePct.toFixed(1) + '%"></div>' +
      '<div class="wt-comp-bar fat" style="width:' + fatPct.toFixed(1) + '%"></div>';

    // Foot line — strength + training frequency (so you can see why the
    // muscle estimate is what it is).
    const sd = strengthDelta * 100;
    const sdStr = (sd >= 0 ? '+' : '') + sd.toFixed(1) + '%';
    const muscleSign = estMuscle >= 0 ? '+' : '';
    const fatSign = estFat >= 0 ? '+' : '';
    const freqStr = sessionsPerWeek.toFixed(1) + ' sessions/wk';
    $('wtCompFoot').textContent =
      '~' + muscleSign + estMuscle.toFixed(1) + ' ' + state.units + ' muscle · '
      + '~' + fatSign + estFat.toFixed(1) + ' ' + state.units + ' fat · '
      + 'strength ' + sdStr
      + ' · ' + freqStr
      + (strengthRatios.length ? '' : ' (no lift data)');
  }

  // Wire weight UI
  $('wtSaveBtn').addEventListener('click', () => {
    const v = parseFloat($('wtInput').value);
    if (isNaN(v) || v <= 0) return;
    wtSaveEntry(v);
  });
  $('wtInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('wtSaveBtn').click();
  });
  $('wtEditBtn').addEventListener('click', () => {
    $('wtLocked').classList.add('hidden');
    $('wtInputRow').classList.remove('hidden');
    const todayEntry = wtEntries.find(e => e.dateKey === wtDateKey(new Date()));
    if (todayEntry) $('wtInput').value = todayEntry.weight.toFixed(1);
    $('wtInput').focus(); $('wtInput').select();
  });

  // ============================================================
  // PROGRESS PHOTOS
  // ============================================================
  let photos = [];
  try {
    const raw = localStorage.getItem(PHOTO_KEY);
    if (raw) photos = JSON.parse(raw);
  } catch (e) { photos = []; }

  function photosSave() {
    try {
      localStorage.setItem(PHOTO_KEY, JSON.stringify(photos));
      return true;
    } catch (e) {
      return false;
    }
  }
  // Downscale a dataURL to a max longest-side dimension and re-encode as
  // JPEG. Phone camera photos are often 2–5MB which blows the ~5MB
  // localStorage quota after one or two saves. Compressing to ~1080px /
  // q=0.75 typically drops each photo to <100KB.
  function compressPhotoDataUrl(dataUrl, maxDim, quality) {
    maxDim = maxDim || 1080;
    quality = quality == null ? 0.75 : quality;
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let w = img.naturalWidth || img.width;
        let h = img.naturalHeight || img.height;
        if (w > maxDim || h > maxDim) {
          if (w >= h) { h = Math.round(h * (maxDim / w)); w = maxDim; }
          else { w = Math.round(w * (maxDim / h)); h = maxDim; }
        }
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        try { resolve(c.toDataURL('image/jpeg', quality)); }
        catch { resolve(dataUrl); }
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }
  async function uploadPhotoToStorage(dataUrl) {
    // pcSupa is set inside an async IIFE — wait up to 8 s for it to initialise
    // so photos taken immediately on page load aren't silently skipped.
    if (!pcSupa) {
      await new Promise((res) => {
        const deadline = Date.now() + 8000;
        const t = setInterval(() => { if (pcSupa || Date.now() >= deadline) { clearInterval(t); res(); } }, 200);
      });
    }
    if (!pcSupa) return null;
    try {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const filename = 'photo_' + Date.now() + '_' +
        Math.random().toString(36).slice(2, 10) + '.jpg';
      const { error } = await pcSupa.storage
        .from('progress-photos')
        .upload(filename, blob, { contentType: 'image/jpeg', upsert: false });
      if (error) return null;
      const { data } = pcSupa.storage.from('progress-photos').getPublicUrl(filename);
      return data ? data.publicUrl : null;
    } catch (e) { return null; }
  }
  function photoFmtDate(key) {
    const d = wtParseKey(key);
    const mons = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return mons[d.getMonth()] + ' ' + d.getDate();
  }
  function photoCurrentWeight() {
    const last = wtEntries[wtEntries.length - 1];
    return last ? (last.weight.toFixed(1) + ' ' + state.units) : '—';
  }
  function photosRender() {
    const grid = $('wtPhotoGrid');
    if (!photos.length) {
      grid.innerHTML = '<div class="wt-photo-empty">No photos yet · tap Take Photo to start</div>';
    } else {
      grid.innerHTML = photos.map(p =>
        '<button class="wt-photo-card" data-id="' + p.id + '" type="button">' +
          '<img src="' + (p.url || p.dataUrl) + '" alt="">' +
          '<div class="wt-photo-overlay"></div>' +
          '<div class="wt-photo-meta">' +
            '<span class="wt-photo-date">' + photoFmtDate(p.dateKey) + '</span>' +
            '<span class="wt-photo-weight">' + (p.weight || '—') + '</span>' +
          '</div>' +
        '</button>'
      ).join('');
      grid.querySelectorAll('.wt-photo-card').forEach(card => {
        card.addEventListener('click', () => openPhoto(card.dataset.id));
      });
    }
    // Update count on the link
    if (!photos.length) $('wtProgressCount').textContent = '0 photos';
    else if (photos.length === 1) $('wtProgressCount').textContent = '1 photo · latest ' + photoFmtDate(photos[0].dateKey);
    else $('wtProgressCount').textContent = photos.length + ' photos · latest ' + photoFmtDate(photos[0].dateKey);
  }
  async function photosAdd(dataUrl) {
    let compressed = dataUrl;
    try { compressed = await compressPhotoDataUrl(dataUrl); } catch {}
    const id = 'p' + Date.now() + '_' + Math.floor(Math.random() * 999);
    const entry = {
      id,
      dataUrl: compressed,
      dateKey: wtDateKey(new Date()),
      weight: photoCurrentWeight()
    };
    photos.unshift(entry);
    if (!photosSave()) {
      // Storage was full even after compression — try once more at lower
      // quality before giving up.
      try {
        entry.dataUrl = await compressPhotoDataUrl(dataUrl, 800, 0.6);
      } catch {}
      if (!photosSave()) {
        photos.shift();
        alert('Phone storage is full — delete some older progress photos before adding a new one.');
        return;
      }
    }
    photosRender();
    uploadPhotoToStorage(entry.dataUrl).then((url) => {
      if (!url) return;
      const e = photos.find(p => p.id === id);
      if (!e) return;
      e.url = url;
      delete e.dataUrl;
      photosSave();
      photosRender();
    });
  }
  function fileToPhoto(file) {
    const r = new FileReader();
    r.onload = (e) => photosAdd(e.target.result);
    r.readAsDataURL(file);
  }

  $('wtProgressLink').addEventListener('click', () => {
    photosRender();
    $('wtOverlay').classList.add('is-open');
    document.body.style.overflow = 'hidden';
  });
  $('wtBack').addEventListener('click', () => {
    $('wtOverlay').classList.remove('is-open');
    document.body.style.overflow = '';
  });

  // Take Photo: try in-browser camera, fall back to file input
  let camStream = null;
  let camFacing = 'environment';
  async function openCam() {
    $('wtCam').classList.add('is-open');
    try {
      camStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: camFacing } }, audio: false
      });
      $('wtCamVideo').srcObject = camStream;
    } catch (e) {
      try {
        camStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        $('wtCamVideo').srcObject = camStream;
      } catch (e2) {
        closeCam();
        alert('Camera unavailable. Use "From Library" instead.');
        throw e2;
      }
    }
  }
  function closeCam() {
    if (camStream) { camStream.getTracks().forEach(t => t.stop()); camStream = null; }
    $('wtCamVideo').srcObject = null;
    $('wtCam').classList.remove('is-open');
  }
  $('wtTakePhotoBtn').addEventListener('click', async () => {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try { await openCam(); return; } catch (e) {}
    }
    $('wtFileCamera').click();
  });
  $('wtFileCamera').addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) fileToPhoto(f);
    e.target.value = '';
  });
  $('wtFromLibraryBtn').addEventListener('click', () => $('wtFileLibrary').click());
  $('wtFileLibrary').addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) fileToPhoto(f);
    e.target.value = '';
  });
  $('wtCamCancel').addEventListener('click', closeCam);
  $('wtCamFlip').addEventListener('click', async () => {
    camFacing = camFacing === 'environment' ? 'user' : 'environment';
    if (camStream) camStream.getTracks().forEach(t => t.stop());
    try { await openCam(); } catch (e) {}
  });
  $('wtCamShutter').addEventListener('click', () => {
    const video = $('wtCamVideo'), canvas = $('wtCamCanvas');
    if (!video.videoWidth) return;
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    closeCam();
    photosAdd(dataUrl);
  });

  // Photo viewer
  let activePhotoId = null;
  let comparePhotoId = null;       // the OTHER photo being compared to
  let pvDeleteConfirm = false;
  function openPhoto(id) {
    const p = photos.find(x => x.id === id);
    if (!p) return;
    activePhotoId = id;
    $('wtViewerImg').src = p.url || p.dataUrl;
    $('wtViewerDate').textContent = photoFmtDate(p.dateKey).toUpperCase();
    $('wtViewerWeight').textContent = p.weight || '—';
    $('wtViewer').dataset.mode = 'single';
    $('wtViewer').classList.add('is-open');
    pvDeleteConfirm = false;
    $('wtViewerDelete').textContent = 'Delete';
    $('wtViewerDelete').classList.remove('is-confirm');
    // Disable Compare button if there's no other photo to compare against
    $('wtViewerCompare').disabled = photos.length < 2;
    $('wtViewerCompare').style.opacity = photos.length < 2 ? '0.4' : '';
  }
  function closePhoto() {
    $('wtViewer').classList.remove('is-open');
    $('wtViewer').dataset.mode = 'single';
    activePhotoId = null;
    comparePhotoId = null;
  }

  // Pull a number out of "162.0 lbs" / "73.5 kg" / "—"
  function parseWeightStr(w) {
    if (!w) return null;
    const m = String(w).match(/-?\d+(\.\d+)?/);
    return m ? parseFloat(m[0]) : null;
  }
  // Format a delta with arrow + sign
  function fmtDelta(diff, units) {
    if (diff == null) return '';
    if (Math.abs(diff) < 0.05) return '· no change';
    const sign = diff > 0 ? '+' : '−';
    return '· ' + sign + Math.abs(diff).toFixed(1) + ' ' + units;
  }

  // Pick the "compare to" photo for a given active id. Default: the most
  // recent photo BEFORE the active one (older → time-progress comparison).
  // Falls back to the most recent newer photo if active is the oldest.
  function defaultCompareFor(activeId) {
    const idx = photos.findIndex(p => p.id === activeId);
    if (idx === -1) return null;
    if (photos[idx + 1]) return photos[idx + 1].id;        // photos are stored newest-first
    if (photos[idx - 1]) return photos[idx - 1].id;
    return null;
  }

  function openCompare(activeId, otherId) {
    const A = photos.find(p => p.id === activeId);
    const B = photos.find(p => p.id === otherId);
    if (!A || !B) return;
    activePhotoId = activeId;
    comparePhotoId = otherId;
    $('wtCmpImgA').src = A.url || A.dataUrl;
    $('wtCmpImgB').src = B.url || B.dataUrl;
    $('wtCmpMetaA').textContent = photoFmtDate(A.dateKey) + ' · ' + (A.weight || '—');
    $('wtCmpMetaB').textContent = photoFmtDate(B.dateKey) + ' · ' + (B.weight || '—');
    // Headline — date arrow + weight delta
    const wA = parseWeightStr(A.weight);
    const wB = parseWeightStr(B.weight);
    const headEl = $('wtCompareHeadline');
    let cls = 'flat', headline = photoFmtDate(A.dateKey) + ' → ' + photoFmtDate(B.dateKey);
    if (wA != null && wB != null) {
      const diff = wA - wB; // active vs comparison
      headline += ' ' + fmtDelta(diff, state.units);
      if (Math.abs(diff) < 0.05) cls = 'flat';
      else if (diff > 0) cls = 'up';
      else cls = 'down';
    }
    headEl.textContent = headline;
    headEl.className = 'wt-compare-headline ' + cls;
    $('wtViewer').dataset.mode = 'compare';
    $('wtViewer').classList.add('is-open');
    pvDeleteConfirm = false;
    $('wtCompareDelete').textContent = 'Delete';
    $('wtCompareDelete').classList.remove('is-confirm');
  }

  function cycleCompareTarget() {
    if (!activePhotoId) return;
    const others = photos.filter(p => p.id !== activePhotoId);
    if (!others.length) return;
    const curIdx = others.findIndex(p => p.id === comparePhotoId);
    const nextIdx = (curIdx + 1) % others.length;
    openCompare(activePhotoId, others[nextIdx].id);
  }

  function deleteActivePhoto(deleteBtn) {
    if (!activePhotoId) return;
    if (!pvDeleteConfirm) {
      pvDeleteConfirm = true;
      deleteBtn.textContent = 'Confirm delete?';
      deleteBtn.classList.add('is-confirm');
      setTimeout(() => {
        pvDeleteConfirm = false;
        deleteBtn.textContent = 'Delete';
        deleteBtn.classList.remove('is-confirm');
      }, 3000);
      return;
    }
    photos = photos.filter(p => p.id !== activePhotoId);
    photosSave();
    photosRender();
    closePhoto();
  }

  $('wtViewerClose').addEventListener('click', closePhoto);
  $('wtCompareClose').addEventListener('click', closePhoto);
  $('wtViewerDelete').addEventListener('click', () => deleteActivePhoto($('wtViewerDelete')));
  $('wtCompareDelete').addEventListener('click', () => deleteActivePhoto($('wtCompareDelete')));
  $('wtViewerCompare').addEventListener('click', () => {
    if (!activePhotoId) return;
    const otherId = defaultCompareFor(activePhotoId);
    if (!otherId) { alert('Need at least one other photo to compare.'); return; }
    openCompare(activePhotoId, otherId);
  });
  $('wtCompareBack').addEventListener('click', () => {
    if (activePhotoId) {
      $('wtViewer').dataset.mode = 'single';
    } else {
      closePhoto();
    }
  });
  // Tap the right-hand "other" photo to cycle through different comparison targets
  $('wtCmpSideB').addEventListener('click', cycleCompareTarget);

  // ============================================================
  // BOOT
  // ============================================================
  renderAll();
  wtRender();
  photosRender();

  // ============================================================
  // CLOUD SYNC via Supabase  (OPTIONAL — leave blank for local-only)
  // ------------------------------------------------------------
  // Stores your gym state as one JSONB row in the public.app_state
  // table, keyed by APP_KEY. Supabase's realtime channel pushes
  // changes to every device the instant they happen.
  //
  // SETUP (5 minutes, all in a browser):
  //   1. Make a free account at https://supabase.com
  //   2. Create a new project
  //   3. In your project: Settings → API → copy your Project URL +
  //      "Publishable" key (the one starting with `sb_publishable_`)
  //   4. Paste them below, replacing the two placeholder strings
  //   5. Open the SQL Editor and run the SQL block from README.md
  //
  // If you leave the placeholders unchanged the app still works,
  // just only on this device (data stays in your browser).
  // ============================================================
  const SUPABASE_URL = 'https://dseyqvcbcutgopqswvuy.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_kLImd3r002m5OzAAQwuN1g_56qqaGfQ';
  const APP_KEY = 'po-coach';
  const PC_SYNCED_KEYS = ['po_coach_v1', 'po_coach_workout_done', 'po_coach_weights', 'po_coach_photos'];

  let pcSupa = null;
  let pcPushTimer = null;
  let pcSuppressSync = false;
  let pcPendingRemote = null;
  // JSON of the last state we sent or received — used to ignore
  // realtime echoes of our own pushes so we don't infinite-loop.
  let pcLastSyncedJson = null;

  const _pcOrigSet = localStorage.setItem.bind(localStorage);
  const _pcOrigRemove = localStorage.removeItem.bind(localStorage);
  // Wrap setItem/removeItem so a sync-side error can NEVER prevent the
  // underlying write from happening. The original call always runs;
  // any error in the sync scheduling is swallowed.
  localStorage.setItem = function(k, v) {
    _pcOrigSet(k, v);
    try {
      if (!pcSuppressSync && PC_SYNCED_KEYS.indexOf(k) !== -1) pcSchedulePush();
    } catch (e) {}
  };
  localStorage.removeItem = function(k) {
    _pcOrigRemove(k);
    try {
      if (!pcSuppressSync && PC_SYNCED_KEYS.indexOf(k) !== -1) pcSchedulePush();
    } catch (e) {}
  };

  function pcCollectState() {
    const out = {};
    for (const k of PC_SYNCED_KEYS) {
      const v = localStorage.getItem(k);
      if (v == null) continue;
      let val;
      try { val = JSON.parse(v); } catch { continue; }
      if (k === 'po_coach_photos' && Array.isArray(val)) {
        const withUrl = val
          .filter((p) => p && p.url)
          .map((p) => ({ id: p.id, url: p.url, dateKey: p.dateKey, weight: p.weight }));
        // Only push photos if at least one has a Storage URL — avoids overwriting
        // remote with an empty array while all photos are still uploading.
        if (withUrl.length === 0) continue;
        val = withUrl;
      }
      out[k] = val;
    }
    return out;
  }

  function pcIsUserEditing() {
    const ae = document.activeElement;
    if (!ae) return false;
    const tag = ae.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (ae.getAttribute && ae.getAttribute('contenteditable') === 'true') return true;
    return false;
  }

  function pcRerender() {
    // Reload every closure variable that mirrors a synced localStorage
    // key — otherwise renderAll/wtRender/photosRender would read stale
    // in-memory copies from before the remote pull.
    try { state = loadState(); } catch {}
    try { wtEntries = wtLoad(); } catch {}
    try {
      const raw = localStorage.getItem(PHOTO_KEY);
      photos = raw ? JSON.parse(raw) : [];
    } catch { photos = []; }
    try { renderAll(); } catch {}
    try { wtRender(); } catch {}
    try { photosRender(); } catch {}
  }

  function pcApplyRemoteState(remote) {
    if (!remote || typeof remote !== 'object') return false;
    pcSuppressSync = true;
    let changed = false;
    try {
      for (const k of PC_SYNCED_KEYS) {
        if (k === 'po_coach_photos') {
          let localPhotos = [];
          try { localPhotos = JSON.parse(localStorage.getItem(k) || '[]'); } catch {}
          const remotePhotos = Array.isArray(remote[k]) ? remote[k] : [];
          const remoteIds = new Set(remotePhotos.map((p) => p && p.id));
          const localOnly = localPhotos.filter((p) => p && !p.url && !remoteIds.has(p.id));
          const merged = [...remotePhotos, ...localOnly];
          const incoming = JSON.stringify(merged);
          if (localStorage.getItem(k) !== incoming) {
            try { _pcOrigSet(k, incoming); changed = true; } catch {}
          }
          continue;
        }
        if (k in remote) {
          const incoming = JSON.stringify(remote[k]);
          const local = localStorage.getItem(k);
          if (local !== incoming) { try { _pcOrigSet(k, incoming); changed = true; } catch {} }
        } else if (localStorage.getItem(k) != null) {
          try { _pcOrigRemove(k); changed = true; } catch {}
        }
      }
    } finally {
      pcSuppressSync = false;
    }
    if (changed) { try { pcRerender(); } catch (e) {} }
    return changed;
  }

  function pcMaybeApplyRemote(remote) {
    if (pcIsUserEditing()) { pcPendingRemote = remote; return; }
    pcApplyRemoteState(remote);
  }

  function pcApplyPendingIfReady() {
    if (pcPendingRemote && !pcIsUserEditing()) {
      const r = pcPendingRemote;
      pcPendingRemote = null;
      pcApplyRemoteState(r);
    }
  }

  async function pcPushNow() {
    if (!pcSupa) return;
    const state = pcCollectState();
    const json = JSON.stringify(state);
    if (json === pcLastSyncedJson) return;
    try {
      const { error } = await pcSupa
        .from('app_state')
        .upsert(
          { key: APP_KEY, data: state, updated_at: new Date().toISOString() },
          { onConflict: 'key' }
        );
      if (!error) pcLastSyncedJson = json;
    } catch (_) {}
  }

  function pcSchedulePush() {
    if (pcSuppressSync) return;
    clearTimeout(pcPushTimer);
    pcPushTimer = setTimeout(pcPushNow, 250);
  }

  // Backup push on unload via fetch keepalive so a fast refresh
  // doesn't lose the latest change before the debounced push fires.
  function pcFlushPushOnUnload() {
    if (!pcSupa) return;
    const state = pcCollectState();
    const json = JSON.stringify(state);
    if (json === pcLastSyncedJson) return;
    try {
      fetch(SUPABASE_URL + '/rest/v1/app_state?on_conflict=key', {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': 'Bearer ' + SUPABASE_KEY,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates',
        },
        body: JSON.stringify({ key: APP_KEY, data: state, updated_at: new Date().toISOString() }),
        keepalive: true,
      }).catch(() => {});
      pcLastSyncedJson = json;
    } catch (_) {}
  }

  // Initial sync: connect Supabase, pull current state, subscribe to
  // realtime updates so other devices' changes appear instantly.
  (async function pcInitCloudSync() {
    if (!window.supabase || !SUPABASE_URL || !SUPABASE_KEY) return;
    // Skip if the placeholder values are still in place (local-only mode)
    if (SUPABASE_URL.indexOf('PASTE-') === 0 || SUPABASE_KEY.indexOf('PASTE-') === 0) return;
    pcSupa = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    try {
      const { data, error } = await pcSupa
        .from('app_state').select('data').eq('key', APP_KEY).maybeSingle();
      if (!error && data && data.data && Object.keys(data.data).length > 0) {
        pcLastSyncedJson = JSON.stringify(data.data);
        pcMaybeApplyRemote(data.data);
      } else if (Object.keys(pcCollectState()).length > 0) {
        pcSchedulePush();
      }
    } catch (_) {}
    pcSupa.channel('app_state_' + APP_KEY)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'app_state',
        filter: 'key=eq.' + APP_KEY,
      }, (payload) => {
        if (!payload.new || !payload.new.data) return;
        const incoming = JSON.stringify(payload.new.data);
        if (incoming === pcLastSyncedJson) return; // echo of our own push
        pcLastSyncedJson = incoming;
        pcMaybeApplyRemote(payload.new.data);
      })
      .subscribe();
  })();

  document.addEventListener('focusout', () => {
    setTimeout(pcApplyPendingIfReady, 0);
  }, true);
  window.addEventListener('pagehide', pcFlushPushOnUnload);
  window.addEventListener('beforeunload', pcFlushPushOnUnload);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pcFlushPushOnUnload();
  });
})();
(function(){
'use strict';
// ════════ STORAGE ════════
const GK='gym_v1', PO='po_coach_v1';
function gload(){try{return JSON.parse(localStorage.getItem(GK))||gdef();}catch{return gdef();}}
function gdef(){return{measurements:[],mesocycle:null,plates:[20,15,10,5,2.5,1.25],restDefault:90,prs:{},exerciseMeta:{},muscleTargets:{Chest:12,Back:14,Legs:14,Shoulders:10,Core:8,Arms:10}};}
function gsave(s){localStorage.setItem(GK,JSON.stringify(s));}
function po(){try{return JSON.parse(localStorage.getItem(PO))||{};}catch{return{};}}
function groqKey(){return localStorage.getItem('groq_api_key')||'';}
function todayK(){return new Date().toISOString().slice(0,10);}
function unit(){const p=po();return p.units||'kg';}

// ════════ MUSCLE MAPPING ════════
const MUSCLES=['Chest','Back','Legs','Shoulders','Core','Arms'];
const MUSCLE_COLORS={Chest:'#f87171',Back:'#3b82f6',Legs:'#34d399',Shoulders:'#fbbf24',Core:'#a78bfa',Arms:'#fb923c'};
function muscleOf(name){
  const n=(name||'').toLowerCase();
  if(/bench|chest|pec|fly|dip|push.?up|incline|decline/.test(n))return'Chest';
  if(/row|pull.?up|pull.?down|lat|chin|deadlift|rdl|romanian|shrug|back/.test(n))return'Back';
  if(/squat|leg|lunge|calf|hamstring|quad|glute|hip thrust|leg press|leg curl|leg ext/.test(n))return'Legs';
  if(/overhead|ohp|shoulder|lateral|delt|press.*shoulder|military|upright|rear delt|face pull/.test(n))return'Shoulders';
  if(/ab|core|plank|crunch|sit.?up|leg raise|rollout|oblique/.test(n))return'Core';
  if(/curl|tricep|bicep|pushdown|extension|skull|hammer|preacher|arm/.test(n))return'Arms';
  return'Other';
}
// week range (Mon-Sun)
function weekStart(d){d=d||new Date();const x=new Date(d);const dow=(x.getDay()+6)%7;x.setDate(x.getDate()-dow);x.setHours(0,0,0,0);return x;}
function inThisWeek(dateStr){const d=new Date(dateStr);const ws=weekStart();const we=new Date(ws);we.setDate(ws.getDate()+7);return d>=ws&&d<we;}

// Working sets per muscle this week
function weeklyVolume(){
  const p=po(); const vol={}; MUSCLES.forEach(m=>vol[m]=0);
  const exMap={}; (p.exercises||[]).forEach(e=>exMap[e.id]=e);
  const meta=gload().exerciseMeta;
  Object.keys(p.logs||{}).forEach(exId=>{
    const ex=exMap[exId]; if(!ex)return;
    const m=muscleOf(ex.name); if(!MUSCLES.includes(m))return;
    (p.logs[exId]||[]).forEach(set=>{
      if(set.warmup)return; // warm-ups don't count
      if(inThisWeek(set.date))vol[m]++;
    });
  });
  return vol;
}
// 1RM Epley
function epley(w,r){if(!w||r<1)return 0;if(r===1)return w;return Math.round(w*(1+r/30));}
function best1RM(){
  const p=po(); const exMap={}; (p.exercises||[]).forEach(e=>exMap[e.id]=e);
  const out=[];
  Object.keys(p.logs||{}).forEach(exId=>{
    const ex=exMap[exId]; if(!ex||ex.bw)return;
    let max=0;
    (p.logs[exId]||[]).forEach(s=>{const e=epley(s.weight,s.reps);if(e>max)max=e;});
    if(max>0)out.push({name:ex.name,val:max});
  });
  return out.sort((a,b)=>b.val-a.val);
}

// ════════ RENDER MAIN PANEL ════════
let gxSubTab='overview';
function gxRender(){
  const root=document.getElementById('gxRoot'); if(!root)return;
  const s=gload();
  const vol=weeklyVolume();
  const targets=s.muscleTargets;

  // balance warnings
  const push=(vol.Chest||0)+(vol.Shoulders||0)+(vol.Arms||0)*0.5;
  const pull=(vol.Back||0)+(vol.Arms||0)*0.5;
  let balanceWarn='';
  if(push+pull>=6){
    const ratio=pull>0?push/pull:99;
    if(ratio>1.5)balanceWarn=`<div class="gx-warn orange"><span><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>️</span><div><b>Push:Pull imbalance.</b> You're doing ${push.toFixed(0)} push vs ${pull.toFixed(0)} pull sets. Add more back work to balance.</div></div>`;
    else if(ratio<0.6)balanceWarn=`<div class="gx-warn orange"><span><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>️</span><div><b>Pull-heavy week.</b> ${pull.toFixed(0)} pull vs ${push.toFixed(0)} push. Add pressing volume.</div></div>`;
  }

  root.innerHTML=`
    <div class="gx-card">
      <div class="gx-title">Muscle Volume · This Week ${gxBalanceFlag(vol,targets)}</div>
      <div class="gx-radar-wrap">${gxRadarSVG(vol,targets)}
        <div class="gx-radar-legend">${MUSCLES.map(m=>{
          const v=vol[m]||0,t=targets[m]||10;
          const col=v>=t?'#6ee7b7':v>=t*0.5?'#fbbf24':'#ff8a8a';
          return`<div class="gx-leg"><span class="gx-leg-dot" style="background:${MUSCLE_COLORS[m]}"></span><span class="gx-leg-name">${m}</span><span class="gx-leg-val" style="color:${col}">${v}/${t}</span></div>`;
        }).join('')}</div>
      </div>
      ${balanceWarn}
      ${gxDeloadBanner(s)}
    </div>

    <div class="gx-card">
      <div class="gx-title">AI Coach <span class="gx-flag" style="background:rgba(255,255,255,.08);color:rgba(255,255,255,.5)">Groq</span></div>
      <div class="gx-ai-btns">
        <button class="gx-ai-btn" onclick="gxAiPlan()"><span class="ico"><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08A3 3 0 0 1 2.5 11a2.5 2.5 0 0 1 2-4.9A2.5 2.5 0 0 1 7 3.5 2.5 2.5 0 0 1 9.5 2zM14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08A3 3 0 0 0 21.5 11a2.5 2.5 0 0 0-2-4.9A2.5 2.5 0 0 0 17 3.5 2.5 2.5 0 0 0 14.5 2z"/></svg></span>Generate Plan</button>
        <button class="gx-ai-btn" onclick="gxAiWeight()"><span class="ico"><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M12 3v18M7 21h10M3 7h18M6.5 7L3 14h7zM17.5 7L14 14h7z"/></svg>️</span>Weight Suggestion</button>
        <button class="gx-ai-btn" onclick="gxAiPlateau()"><span class="ico"><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M3 3v18h18"/><rect x="7" y="11" width="3" height="6"/><rect x="13" y="7" width="3" height="10"/></svg></span>Plateau Check</button>
        <button class="gx-ai-btn" onclick="gxAiAlternatives()"><span class="ico"><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="m17 2 4 4-4 4M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v1a4 4 0 0 1-4 4H3"/></svg></span>Pain → Swap</button>
      </div>
      <div class="gx-ai-out" id="gxAiOut"></div>
    </div>

    <div class="gx-card">
      <div class="gx-sub-tabs">
        <button class="gx-sub-tab ${gxSubTab==='overview'?'on':''}" onclick="gxSetSub('overview')">Strength</button>
        <button class="gx-sub-tab ${gxSubTab==='progress'?'on':''}" onclick="gxSetSub('progress')">Progress</button>
        <button class="gx-sub-tab ${gxSubTab==='body'?'on':''}" onclick="gxSetSub('body')">Body</button>
        <button class="gx-sub-tab ${gxSubTab==='plan'?'on':''}" onclick="gxSetSub('plan')">Plan</button>
      </div>
      <div class="gx-sub-pane ${gxSubTab==='overview'?'on':''}" id="gxPaneOverview">${gxRender1RM()}</div>
      <div class="gx-sub-pane ${gxSubTab==='progress'?'on':''}" id="gxPaneProgress">${gxRenderProgress()}</div>
      <div class="gx-sub-pane ${gxSubTab==='body'?'on':''}" id="gxPaneBody">${gxRenderBody(s)}</div>
      <div class="gx-sub-pane ${gxSubTab==='plan'?'on':''}" id="gxPanePlan">${gxRenderPlan(s)}</div>
    </div>`;

  if(gxSubTab==='progress')setTimeout(gxDrawProgress,30);
}

function gxBalanceFlag(vol,targets){
  const hit=MUSCLES.filter(m=>(vol[m]||0)>=(targets[m]||10)).length;
  const col=hit>=5?'#6ee7b7':hit>=3?'#fbbf24':'#ff8a8a';
  return`<span class="gx-flag" style="background:${col}22;color:${col}">${hit}/6 on target</span>`;
}

// Radar SVG
function gxRadarSVG(vol,targets){
  const cx=150,cy=140,R=110,n=6;
  const maxV=Math.max(...MUSCLES.map(m=>Math.max((targets[m]||10)*1.3,(vol[m]||0))),12);
  function pt(i,r){const ang=(Math.PI*2*i/n)-Math.PI/2;return[cx+r*Math.cos(ang),cy+r*Math.sin(ang)];}
  // grid rings
  let grid='';
  [0.25,0.5,0.75,1].forEach(f=>{
    const pts=MUSCLES.map((m,i)=>pt(i,R*f).join(',')).join(' ');
    grid+=`<polygon points="${pts}" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="1"/>`;
  });
  // axes + labels
  let axes='',labels='';
  MUSCLES.forEach((m,i)=>{
    const[x,y]=pt(i,R);axes+=`<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="rgba(255,255,255,.07)"/>`;
    const[lx,ly]=pt(i,R+18);
    labels+=`<text x="${lx}" y="${ly}" fill="rgba(255,255,255,.6)" font-size="11" font-weight="700" text-anchor="middle" dominant-baseline="middle">${m}</text>`;
  });
  // target ring (recommended min)
  const tgtPts=MUSCLES.map((m,i)=>pt(i,R*Math.min(1,(targets[m]||10)/maxV)).join(',')).join(' ');
  // current polygon
  const curPts=MUSCLES.map((m,i)=>pt(i,R*Math.min(1,(vol[m]||0)/maxV)).join(',')).join(' ');
  // overall color
  const hit=MUSCLES.filter(m=>(vol[m]||0)>=(targets[m]||10)).length;
  const fillCol=hit>=5?'#6ee7b7':hit>=3?'#fbbf24':'#ff8a8a';
  // dots
  let dots='';
  MUSCLES.forEach((m,i)=>{const[x,y]=pt(i,R*Math.min(1,(vol[m]||0)/maxV));dots+=`<circle cx="${x}" cy="${y}" r="3.5" fill="${MUSCLE_COLORS[m]}"/>`;});
  return`<svg class="gx-radar" viewBox="0 0 300 290">
    ${grid}${axes}
    <polygon points="${tgtPts}" fill="none" stroke="rgba(255,255,255,.3)" stroke-width="1.5" stroke-dasharray="4 3"/>
    <polygon points="${curPts}" fill="${fillCol}33" stroke="${fillCol}" stroke-width="2"/>
    ${dots}${labels}
  </svg>`;
}

// Deload banner — after 4 weeks progressive overload
function gxDeloadBanner(s){
  const p=po();
  // count weeks with at least one logged set
  const weeks=new Set();
  Object.values(p.logs||{}).forEach(arr=>arr.forEach(set=>{
    const d=new Date(set.date);const ws=weekStart(d);weeks.add(ws.toISOString().slice(0,10));
  }));
  // consecutive recent weeks
  let streak=0;const now=weekStart();
  for(let i=0;i<12;i++){const w=new Date(now);w.setDate(now.getDate()-7*i);if(weeks.has(w.toISOString().slice(0,10)))streak++;else break;}
  if(streak>=4 && !(s.mesocycle&&s.mesocycle.deloadDone)){
    return`<div class="gx-warn green"><span><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M7 20h10M10 20c5.5-2.5.8-6.4 3-10M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8zM14.1 6c-.9.8-1.6 2-2.1 3.6 2.1.4 3.5-.5 4.5-1.6 1-1.1 1.5-2.5 1.5-4.5-2 .5-3 1.7-3.9 2.5z"/></svg></span><div><b>${streak} weeks of training.</b> Consider a deload week — drop volume ~50% to recover and come back stronger. <span style="text-decoration:underline;cursor:pointer" onclick="gxAiDeload()">Get AI plan</span></div></div>`;
  }
  return'';
}

// 1RM list
function gxRender1RM(){
  const list=best1RM();
  if(!list.length)return`<div class="gx-prog-empty">Log some sets to see estimated 1RMs.</div>`;
  return list.slice(0,8).map(x=>`<div class="gx-1rm"><span class="gx-1rm-name">${x.name}</span><span class="gx-1rm-val">${x.val} ${unit()}</span></div>`).join('')
    +`<div style="font-size:11px;color:rgba(255,255,255,.35);margin-top:10px">Estimated 1RM via Epley formula (weight × (1 + reps/30))</div>`;
}

// Progress chart
function gxRenderProgress(){
  const p=po();const exs=(p.exercises||[]).filter(e=>!e.bw&&(p.logs[e.id]||[]).length>1);
  if(!exs.length)return`<div class="gx-prog-empty">Log an exercise at least twice to see a progress graph.</div>`;
  const cur=window.gxProgEx||exs[0].id;
  return`<select class="gx-ex-pick" id="gxProgPick" onchange="window.gxProgEx=this.value;gxDrawProgress()">
    ${exs.map(e=>`<option value="${e.id}" ${e.id===cur?'selected':''}>${e.name}</option>`).join('')}
  </select>
  <svg class="gx-prog-chart" id="gxProgSvg" viewBox="0 0 320 140" preserveAspectRatio="none"></svg>
  <div id="gxProgMeta" style="text-align:center;font-size:12px;color:rgba(255,255,255,.5);margin-top:6px"></div>`;
}
function gxDrawProgress(){
  const svg=document.getElementById('gxProgSvg');if(!svg)return;
  const p=po();const exId=window.gxProgEx||(document.getElementById('gxProgPick')||{}).value;
  if(!exId)return;
  const logs=(p.logs[exId]||[]).slice().sort((a,b)=>new Date(a.date)-new Date(b.date));
  if(logs.length<2){svg.innerHTML='';return;}
  const ws=logs.map(l=>l.weight);
  const min=Math.min(...ws),max=Math.max(...ws),range=max-min||1;
  const pad=10,W=320,H=140;
  const pts=logs.map((l,i)=>{
    const x=pad+(W-2*pad)*(i/(logs.length-1));
    const y=H-pad-(H-2*pad)*((l.weight-min)/range);
    return[x,y];
  });
  const path=pts.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' ');
  const area=path+` L ${pts[pts.length-1][0].toFixed(1)} ${H-pad} L ${pts[0][0].toFixed(1)} ${H-pad} Z`;
  svg.innerHTML=`
    <defs><linearGradient id="gxPg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#6ee7b7" stop-opacity=".3"/><stop offset="100%" stop-color="#6ee7b7" stop-opacity="0"/></linearGradient></defs>
    <path d="${area}" fill="url(#gxPg)"/>
    <path d="${path}" fill="none" stroke="#6ee7b7" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    ${pts.map(p=>`<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3" fill="#6ee7b7"/>`).join('')}`;
  const meta=document.getElementById('gxProgMeta');
  if(meta)meta.textContent=`${min}→${max} ${unit()} over ${logs.length} sessions`;
}

// Body tracking
let gxBodyView='map';
function gxRenderBody(s){
  const trained=gxMusclesTrainedToday();
  const meas=s.measurements||[];
  const last=meas[meas.length-1];
  const prev=meas[meas.length-2];
  const fields=[['chest','Chest'],['arms','Arms'],['waist','Waist'],['legs','Legs'],['shoulders','Shoulders']];
  let measHtml;
  if(!last){
    measHtml=`<div class="gx-prog-empty">No measurements yet.</div>`;
  } else {
    measHtml=fields.map(([k,n])=>{
      const v=last[k];if(v==null)return'';
      let trend='';
      if(prev&&prev[k]!=null){const d=v-prev[k];trend=d>0?`<span style="color:#6ee7b7">▲ ${d.toFixed(1)}</span>`:d<0?`<span style="color:#ff8a8a">▼ ${Math.abs(d).toFixed(1)}</span>`:`<span style="color:rgba(255,255,255,.4)">—</span>`;}
      return`<div class="gx-meas-row"><span class="gx-meas-name">${n}</span><span class="gx-meas-val">${v} cm</span><span class="gx-meas-trend">${trend}</span></div>`;
    }).join('');
  }
  return`
    <div class="gx-sub-tabs" style="margin-bottom:12px">
      <button class="gx-sub-tab ${gxBodyView==='map'?'on':''}" onclick="gxBodyView='map';gxRender()">Muscle Map</button>
      <button class="gx-sub-tab ${gxBodyView==='meas'?'on':''}" onclick="gxBodyView='meas';gxRender()">Measurements</button>
    </div>
    ${gxBodyView==='map'?`
      <div class="gx-bodies">${gxBodySVG('front',trained)}${gxBodySVG('back',trained)}</div>
      <div style="text-align:center;font-size:12px;color:rgba(255,255,255,.5);margin-top:10px">${trained.length?'Trained today: '+trained.join(', '):'No muscles trained today yet'}</div>
    `:`
      ${gxWithingsSummary()}
      ${measHtml}
      <button class="gx-mbtn pri" style="margin-top:14px" onclick="gxOpenMeas()">+ Log Measurements</button>
    `}`;
}
// Compact Withings body-composition summary (read-only, synced from Health tab)
function gxWithingsSummary(){
  let w; try{w=JSON.parse(localStorage.getItem('withings_data_v1'))||{};}catch(e){return'';}
  const recs=(w.records||[]).slice().sort((a,b)=>a.date.localeCompare(b.date));
  if(!recs.length)return'';
  const last=recs[recs.length-1],prev=recs[recs.length-2]||{};
  const cell=(label,key,unit,goodUp)=>{
    if(last[key]==null)return'';
    let ch='';if(prev[key]!=null){const d=last[key]-prev[key];const good=goodUp?d>0:d<0;ch=`<span style="font-size:10px;color:${Math.abs(d)<.05?'#8e8e93':good?'#6ee7b7':'#ff8a8a'}">${Math.abs(d)<.05?'':(d>0?'▲':'▼')+Math.abs(Math.round(d*10)/10)}</span>`;}
    return`<div style="background:rgba(255,255,255,.04);border-radius:10px;padding:10px;text-align:center"><div style="font-size:18px;font-weight:800">${Math.round(last[key]*10)/10}<span style="font-size:11px;color:#8e8e93">${unit}</span></div><div style="font-size:10px;color:#8e8e93;margin-top:2px">${label} ${ch}</div></div>`;
  };
  return`<div style="margin-bottom:14px">
    <div style="font-size:12px;color:#00b8a9;font-weight:700;margin-bottom:8px">Withings · Body Composition</div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
      ${cell('Weight','weight','kg',false)}${cell('Body Fat','fat','%',false)}${cell('Muscle','muscle','kg',true)}
    </div></div>`;
}
function gxMusclesTrainedToday(){
  const p=po();const exMap={};(p.exercises||[]).forEach(e=>exMap[e.id]=e);
  const set=new Set();const t=todayK();
  Object.keys(p.logs||{}).forEach(id=>{
    const ex=exMap[id];if(!ex)return;
    (p.logs[id]||[]).forEach(s=>{if(s.date&&s.date.slice(0,10)===t){const m=muscleOf(ex.name);if(MUSCLES.includes(m))set.add(m);}});
  });
  return[...set];
}
// Simplified body silhouette with muscle regions
function gxBodySVG(side,trained){
  const on=m=>trained.includes(m)?'active':'';
  if(side==='front'){
    return`<div class="gx-body"><svg viewBox="0 0 80 200">
      <ellipse cx="40" cy="14" rx="9" ry="10" fill="rgba(255,255,255,.08)" stroke="rgba(255,255,255,.15)" stroke-width=".5"/>
      <rect class="gx-musc ${on('Shoulders')}" x="20" y="28" width="40" height="9" rx="4"/>
      <rect class="gx-musc ${on('Chest')}" x="24" y="40" width="32" height="16" rx="4"/>
      <rect class="gx-musc ${on('Arms')}" x="14" y="40" width="8" height="34" rx="4"/>
      <rect class="gx-musc ${on('Arms')}" x="58" y="40" width="8" height="34" rx="4"/>
      <rect class="gx-musc ${on('Core')}" x="27" y="58" width="26" height="26" rx="4"/>
      <rect class="gx-musc ${on('Legs')}" x="25" y="88" width="13" height="50" rx="5"/>
      <rect class="gx-musc ${on('Legs')}" x="42" y="88" width="13" height="50" rx="5"/>
      <text x="40" y="158" fill="rgba(255,255,255,.3)" font-size="8" text-anchor="middle">FRONT</text>
    </svg></div>`;
  }
  return`<div class="gx-body"><svg viewBox="0 0 80 200">
    <ellipse cx="40" cy="14" rx="9" ry="10" fill="rgba(255,255,255,.08)" stroke="rgba(255,255,255,.15)" stroke-width=".5"/>
    <rect class="gx-musc ${on('Shoulders')}" x="20" y="28" width="40" height="9" rx="4"/>
    <rect class="gx-musc ${on('Back')}" x="24" y="40" width="32" height="30" rx="4"/>
    <rect class="gx-musc ${on('Arms')}" x="14" y="40" width="8" height="34" rx="4"/>
    <rect class="gx-musc ${on('Arms')}" x="58" y="40" width="8" height="34" rx="4"/>
    <rect class="gx-musc ${on('Legs')}" x="25" y="88" width="13" height="50" rx="5"/>
    <rect class="gx-musc ${on('Legs')}" x="42" y="88" width="13" height="50" rx="5"/>
    <text x="40" y="158" fill="rgba(255,255,255,.3)" font-size="8" text-anchor="middle">BACK</text>
  </svg></div>`;
}

// Mesocycle planner
function gxRenderPlan(s){
  const m=s.mesocycle;
  let mesoHtml;
  if(!m){
    mesoHtml=`<div class="gx-prog-empty">No active training block.</div>`;
  } else {
    const start=new Date(m.start);const now=new Date();
    const weekNum=Math.max(1,Math.floor((now-start)/(7*864e5))+1);
    const pct=Math.min(100,Math.round(weekNum/m.weeks*100));
    const isTaper=weekNum>=m.weeks;
    mesoHtml=`<div style="margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">
        <span style="font-size:16px;font-weight:700;text-transform:capitalize">${m.goal} Block</span>
        <span style="font-size:13px;color:rgba(255,255,255,.5)">Week ${Math.min(weekNum,m.weeks)} of ${m.weeks}</span>
      </div>
      <div style="height:6px;background:rgba(255,255,255,.08);border-radius:3px;overflow:hidden"><div style="height:100%;width:${pct}%;background:#6ee7b7;border-radius:3px"></div></div>
      ${isTaper?`<div class="gx-warn green" style="margin-top:10px"><span><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/></svg></span><div><b>Final week — taper.</b> Reduce volume, keep intensity. Prepare to test or transition.</div></div>`:''}
    </div>
    <button class="gx-mbtn sec" onclick="gxClearMeso()">End Block</button>`;
  }
  // rotation suggestion
  const rot=gxRotationSuggestion();
  return mesoHtml
    +`<button class="gx-mbtn pri" style="margin-top:10px" onclick="gxOpenMeso()">${m?'New Block':'+ Plan Mesocycle'}</button>`
    +(rot?`<div class="gx-warn orange" style="margin-top:12px"><span><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/></svg></span><div>${rot}</div></div>`:'');
}
function gxRotationSuggestion(){
  const p=po();const exMap={};(p.exercises||[]).forEach(e=>exMap[e.id]=e);
  // find exercise trained for 6+ weeks continuously
  for(const id of Object.keys(p.logs||{})){
    const logs=p.logs[id]||[];if(logs.length<6)continue;
    const first=new Date(logs[0].date);const wks=(Date.now()-first)/(7*864e5);
    if(wks>=6){const ex=exMap[id];if(ex)return`<b>${ex.name}</b> has been in rotation 6+ weeks. Consider swapping it for variety.`;}
  }
  return'';
}

// ════════ SUB-TAB / MODAL CONTROLS ════════
window.gxSetSub=function(t){gxSubTab=t;gxRender();};
window.gxOpenPlate=function(){gxBuildPlateChips();gxCalcPlates();document.getElementById('gxPlateModal').classList.add('open');};
window.gxOpenRestSetup=function(){document.getElementById('gxRestModal').classList.add('open');};
window.gxOpenMeas=function(){document.getElementById('gxMeasModal').classList.add('open');};
window.gxOpenMeso=function(){document.getElementById('gxMesoStart').value=todayK();document.getElementById('gxMesoModal').classList.add('open');};
window.gxCloseModal=function(id){document.getElementById(id).classList.remove('open');};

// ════════ PLATE CALCULATOR ════════
window.gxBuildPlateChips=function(){
  const s=gload();const all=[25,20,15,10,5,2.5,1.25];
  document.getElementById('gxPlateChips').innerHTML=all.map(p=>
    `<div class="gx-chip ${s.plates.includes(p)?'on':''}" onclick="gxTogglePlate(${p})">${p}</div>`).join('');
};
window.gxTogglePlate=function(p){
  const s=gload();const i=s.plates.indexOf(p);
  if(i>=0)s.plates.splice(i,1);else s.plates.push(p);
  s.plates.sort((a,b)=>b-a);gsave(s);gxBuildPlateChips();gxCalcPlates();
};
window.gxCalcPlates=function(){
  const s=gload();
  const target=parseFloat(document.getElementById('gxPlateTarget').value)||0;
  const bar=parseFloat(document.getElementById('gxPlateBar').value)||20;
  const vis=document.getElementById('gxPlateVisual');
  const list=document.getElementById('gxPlateList');
  if(target<=bar){vis.innerHTML='<div class="gx-plate-empty">Enter weight above bar weight</div>';list.textContent='';return;}
  let perSide=(target-bar)/2;
  const plates=s.plates.slice().sort((a,b)=>b-a);const used=[];
  plates.forEach(p=>{while(perSide>=p-.001){used.push(p);perSide-=p;}});
  const colors={25:'#ef4444',20:'#3b82f6',15:'#fbbf24',10:'#22c55e',5:'#f8fafc',2.5:'#1e293b',1.25:'#94a3b8'};
  let bars='<div class="gx-plate-rod"></div>';
  used.forEach(p=>{const h=30+p*1.6;bars+=`<div class="gx-plate" style="height:${Math.min(h,70)}px;width:${Math.max(8,p*0.7)}px;background:${colors[p]||'#888'};color:${p===5?'#000':'#fff'}">${p}</div>`;});
  vis.innerHTML=bars+'<div class="gx-plate-rod"></div>';
  if(used.length)list.innerHTML='Per side: '+used.join(' + ')+(perSide>0.01?`<br><span style="color:#fbbf24">+${perSide.toFixed(2)} ${unit()} unreachable</span>`:'');
  else list.textContent='No plates needed';
};

// ════════ REST TIMER ════════
let gxRestInt=null,gxRestLeft=0;
window.gxStartRest=function(sec){
  gxCloseModal('gxRestModal');
  const s=gload();s.restDefault=sec;gsave(s);
  gxRestLeft=sec;
  document.getElementById('gxRestPill').classList.add('show');
  gxUpdateRest();
  clearInterval(gxRestInt);
  gxRestInt=setInterval(()=>{
    gxRestLeft--;gxUpdateRest();
    if(gxRestLeft<=0){
      clearInterval(gxRestInt);
      if(navigator.vibrate)navigator.vibrate([200,100,200]);
      gxBeep();
      document.getElementById('gxRestTime').classList.add('done');
      setTimeout(gxRestStop,3000);
    }
  },1000);
};
window.gxRestAdd=function(s){gxRestLeft+=s;gxUpdateRest();document.getElementById('gxRestTime').classList.remove('done');};
window.gxRestStop=function(){clearInterval(gxRestInt);document.getElementById('gxRestPill').classList.remove('show');document.getElementById('gxRestTime').classList.remove('done');};
function gxUpdateRest(){const m=Math.floor(Math.max(0,gxRestLeft)/60),s=Math.max(0,gxRestLeft)%60;document.getElementById('gxRestTime').textContent=m+':'+String(s).padStart(2,'0');}
function gxBeep(){try{const a=new(window.AudioContext||window.webkitAudioContext)();const o=a.createOscillator();const g=a.createGain();o.connect(g);g.connect(a.destination);o.frequency.value=880;o.start();g.gain.setValueAtTime(.3,a.currentTime);g.gain.exponentialRampToValueAtTime(.001,a.currentTime+.5);o.stop(a.currentTime+.5);}catch(e){}}

// ════════ MEASUREMENTS ════════
window.gxSaveMeas=function(){
  const s=gload();
  const m={date:todayK()};
  ['chest','arms','waist','legs','shoulders'].forEach(k=>{
    const v=parseFloat(document.getElementById('gxMeas'+k.charAt(0).toUpperCase()+k.slice(1)).value);
    if(!isNaN(v))m[k]=v;
  });
  s.measurements.push(m);gsave(s);gxCloseModal('gxMeasModal');gxRender();
};

// ════════ MESOCYCLE ════════
window.gxSaveMeso=function(){
  const s=gload();
  s.mesocycle={goal:document.getElementById('gxMesoGoal').value,weeks:parseInt(document.getElementById('gxMesoWeeks').value),start:document.getElementById('gxMesoStart').value||todayK(),deloadDone:false};
  gsave(s);gxCloseModal('gxMesoModal');gxRender();
};
window.gxClearMeso=function(){const s=gload();s.mesocycle=null;gsave(s);gxRender();};

// ════════ PR DETECTION ════════
function gxCheckPR(){
  const p=po();const s=gload();const exMap={};(p.exercises||[]).forEach(e=>exMap[e.id]=e);
  let newPR=null;
  Object.keys(p.logs||{}).forEach(id=>{
    const ex=exMap[id];if(!ex||ex.bw)return;
    const logs=p.logs[id]||[];if(!logs.length)return;
    let max=0,maxIdx=-1;
    logs.forEach((l,i)=>{const e=epley(l.weight,l.reps);if(e>max){max=e;maxIdx=i;}});
    const prev=s.prs[id]||0;
    if(max>prev){
      // is the record the most recent set? (just set a PR)
      if(maxIdx===logs.length-1 && prev>0){newPR={name:ex.name,val:max};}
      s.prs[id]=max;
    }
  });
  gsave(s);
  if(newPR)gxShowPR(newPR);
}
function gxShowPR(pr){
  const t=document.getElementById('gxPrToast');
  document.getElementById('gxPrText').textContent=`PR! ${pr.name} ${pr.val}${unit()}`;
  t.classList.add('show');
  if(navigator.vibrate)navigator.vibrate([100,50,100,50,200]);
  setTimeout(()=>t.classList.remove('show'),3500);
}

// ════════ GROQ AI ════════
async function groq(prompt,sys){
  const key=groqKey();
  if(!key)throw new Error('NO_KEY');
  const r=await fetch('https://api.groq.com/openai/v1/chat/completions',{
    method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},
    body:JSON.stringify({model:'llama-3.3-70b-versatile',messages:[{role:'system',content:sys||'You are an expert strength coach. Be concise and practical.'},{role:'user',content:prompt}],max_tokens:600,temperature:0.5})
  });
  const d=await r.json();
  if(!r.ok)throw new Error(d?.error?.message||'Groq error');
  return(d?.choices?.[0]?.message?.content||'').trim();
}
function gxAiOut(html){const o=document.getElementById('gxAiOut');o.innerHTML=html;o.classList.add('show');}
function gxAiLoading(label){gxAiOut(`<div style="display:flex;align-items:center;gap:10px;color:rgba(255,255,255,.6)"><span class="po-spin" style="width:16px;height:16px;border:2px solid rgba(255,255,255,.2);border-top-color:#fff;border-radius:50%;display:inline-block;animation:gxSpin .7s linear infinite"></span>${label}</div>`);}
function gxAiErr(e){
  if(e.message==='NO_KEY')gxAiOut(`<div style="color:#ff8a8a">Add your Groq API key in the dashboard Settings (<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82L4.2 7.12a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>) to use AI features.</div>`);
  else gxAiOut(`<div style="color:#ff8a8a">AI failed: ${e.message}</div>`);
}
function exerciseSummary(){
  const p=po();const exMap={};(p.exercises||[]).forEach(e=>exMap[e.id]=e);
  const lines=[];
  Object.keys(p.logs||{}).forEach(id=>{
    const ex=exMap[id];if(!ex)return;const logs=(p.logs[id]||[]).slice(-3);
    if(!logs.length)return;
    lines.push(`${ex.name}: ${logs.map(l=>l.weight+(unit())+'×'+l.reps).join(', ')}`);
  });
  return lines.join('\n');
}
window.gxAiWeight=async function(){
  gxAiLoading('Analyzing your last sessions…');
  try{
    const summary=exerciseSummary();
    if(!summary)return gxAiOut('Log a few sessions first.');
    const out=await groq(`Based on these recent sets (last 3 sessions per exercise), for each exercise say whether to INCREASE, KEEP, or DECREASE the weight next session and by how much. Be brief — one line each.\n\n${summary}`);
    gxAiOut(`<h4><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M12 3v18M7 21h10M3 7h18M6.5 7L3 14h7zM17.5 7L14 14h7z"/></svg>️ Weight Suggestions</h4>${escapeHtml(out)}`);
  }catch(e){gxAiErr(e);}
};
window.gxAiPlateau=async function(){
  gxAiLoading('Checking for plateaus…');
  try{
    const summary=exerciseSummary();
    if(!summary)return gxAiOut('Log a few sessions first.');
    const out=await groq(`Here are recent sets. Identify any exercise that has plateaued (no weight/rep progress). For each plateaued lift, suggest ONE specific fix (add volume, change rep range, or deload). If none plateaued, say so.\n\n${summary}`);
    gxAiOut(`<h4><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M3 3v18h18"/><rect x="7" y="11" width="3" height="6"/><rect x="13" y="7" width="3" height="10"/></svg> Plateau Analysis</h4>${escapeHtml(out)}`);
  }catch(e){gxAiErr(e);}
};
window.gxAiDeload=async function(){
  gxAiLoading('Building deload plan…');
  try{
    const out=await groq(`Design a 1-week deload for a lifter who just did 4+ weeks of progressive overload. Give concrete instructions: % of working weight, sets, reps, and what to avoid. Keep it under 120 words.`);
    gxAiOut(`<h4><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M7 20h10M10 20c5.5-2.5.8-6.4 3-10M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8zM14.1 6c-.9.8-1.6 2-2.1 3.6 2.1.4 3.5-.5 4.5-1.6 1-1.1 1.5-2.5 1.5-4.5-2 .5-3 1.7-3.9 2.5z"/></svg> Deload Week</h4>${escapeHtml(out)}`);
    const s=gload();if(s.mesocycle)s.mesocycle.deloadDone=true;gsave(s);
  }catch(e){gxAiErr(e);}
};
window.gxAiAlternatives=async function(){
  const p=po();const names=(p.exercises||[]).map(e=>e.name);
  const ex=prompt('Which exercise causes pain? Enter the name:',names[0]||'');
  if(!ex)return;
  gxAiLoading('Finding safer alternatives…');
  try{
    const out=await groq(`A lifter feels pain doing "${ex}". Suggest 3 alternative exercises that train the same muscles with less joint stress. One line each with a brief why.`);
    gxAiOut(`<h4><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="m17 2 4 4-4 4M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v1a4 4 0 0 1-4 4H3"/></svg> Alternatives to ${escapeHtml(ex)}</h4>${escapeHtml(out)}`);
  }catch(e){gxAiErr(e);}
};
window.gxAiPlan=async function(){
  const days=prompt('How many days per week can you train? (e.g. 4)','4');
  if(!days)return;
  const goal=prompt('Goal? (hypertrophy / strength / general)','hypertrophy');
  const equip=prompt('Equipment? (full gym / dumbbells only / bodyweight)','full gym');
  gxAiLoading('Generating your plan…');
  try{
    const out=await groq(`Create a ${days}-day/week ${goal} strength training plan for someone with: ${equip}. For each day give the split name and 4-6 exercises with sets×reps. Keep it clean and scannable.`,'You are an expert strength coach. Output a clear, well-formatted weekly plan.');
    gxAiOut(`<h4><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08A3 3 0 0 1 2.5 11a2.5 2.5 0 0 1 2-4.9A2.5 2.5 0 0 1 7 3.5 2.5 2.5 0 0 1 9.5 2zM14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08A3 3 0 0 0 21.5 11a2.5 2.5 0 0 0-2-4.9A2.5 2.5 0 0 0 17 3.5 2.5 2.5 0 0 0 14.5 2z"/></svg> Your ${days}-Day ${goal} Plan</h4>${escapeHtml(out)}`);
  }catch(e){gxAiErr(e);}
};
function escapeHtml(s){return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

// ════════ BOOT + SYNC ════════
const _origSet=localStorage.setItem.bind(localStorage);
localStorage.setItem=function(k,v){_origSet(k,v);if(k===PO){try{gxCheckPR();gxRender();}catch(e){}}};
gxCheckPR();
gxRender();
window.addEventListener('storage',e=>{if(e.key===PO||e.key===GK)gxRender();});
if(window.initCloudSync){window.initCloudSync({appKey:'gym-extra',syncedKeys:[GK],onApplied:gxRender});}
const _spin=document.createElement('style');_spin.textContent='@keyframes gxSpin{to{transform:rotate(360deg)}}';document.head.appendChild(_spin);
})();
(function(){
'use strict';
const GK='gym_v1', PO='po_coach_v1';
function gload(){try{return JSON.parse(localStorage.getItem(GK))||{};}catch{return{};}}
function gsave(s){localStorage.setItem(GK,JSON.stringify(s));}
function groqKey(){return localStorage.getItem('groq_api_key')||'';}
function api(){return window.poLiveAPI;}
function unit(){return api()?api().unit():'kg';}
const MUSCLES=['Chest','Back','Legs','Shoulders','Core','Arms'];
const MCOL={Chest:'#f87171',Back:'#3b82f6',Legs:'#34d399',Shoulders:'#fbbf24',Core:'#a78bfa',Arms:'#fb923c'};
function muscleOf(name){const n=(name||'').toLowerCase();
  if(/bench|chest|pec|fly|dip|push.?up|incline|decline/.test(n))return'Chest';
  if(/row|pull.?up|pull.?down|lat|chin|deadlift|rdl|romanian|shrug/.test(n))return'Back';
  if(/squat|leg|lunge|calf|hamstring|quad|glute|hip thrust/.test(n))return'Legs';
  if(/overhead|ohp|shoulder|lateral|delt|military|upright|face pull/.test(n))return'Shoulders';
  if(/ab|core|plank|crunch|sit.?up|leg raise|rollout|oblique/.test(n))return'Core';
  if(/curl|tricep|bicep|pushdown|extension|skull|hammer|preacher/.test(n))return'Arms';return'Other';}
function epley(w,r){if(!w||r<1)return 0;if(r===1)return w;return Math.round(w*(1+r/30));}

// ════════ WORKOUT STATE ════════
let W=null; // {name, startTs, exercises:[{exId,name,bw,sets:[{weight,reps,rpe,note,done}],targetSets,restSec,prevBest1RM}], curIdx, wakeLock}
let stopInt=null, restInt=null, restTotal=0, restLeft=0, curRpe=null;
let wakeLock=null;

window.lwOpenStart=function(){
  const exs=api()?api().exercises():[];
  const days=api()?api().daysList():[];
  // group exercises by day
  const opts=[];
  days.forEach(d=>{
    const list=exs.filter(e=>e.day===d.id);
    if(list.length)opts.push({id:d.id,name:d.name,count:list.length});
  });
  let html=opts.map(o=>`<div class="lw-start-opt" onclick="lwBegin('${o.id}')">
    <span class="lw-start-opt-ico"><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M3 14c1.5 0 3-.5 4-2M4 12c0-3 1-6 5-6 3 0 5 2 6 4l3 2c1 .7 1.5 2 1 3-.5 1.2-2 1.5-3 1l-2-1c0 2-1 4-4 4-4 0-6-3-6-6M14 10l-2 1.5"/></svg></span>
    <div style="flex:1"><div class="lw-start-opt-name">${o.name}</div><div class="lw-start-opt-sub">${o.count} exercises</div></div>
    <span style="color:rgba(255,255,255,.3);font-size:20px">›</span></div>`).join('');
  html+=`<div class="lw-start-opt" onclick="lwBegin('__empty__')">
    <span class="lw-start-opt-ico"><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 15l.7 1.8L21.5 17l-1.8.7L19 19.5l-.7-1.8L16.5 17l1.8-.7zM5 15l.7 1.8L7.5 17l-1.8.7L5 19.5l-.7-1.8L2.5 17l1.8-.7z"/></svg></span>
    <div style="flex:1"><div class="lw-start-opt-name">Empty Workout</div><div class="lw-start-opt-sub">Add exercises as you go</div></div>
    <span style="color:rgba(255,255,255,.3);font-size:20px">›</span></div>`;
  document.getElementById('lwStartOpts').innerHTML=html||'<div style="color:rgba(255,255,255,.5);text-align:center;padding:20px">No exercises set up yet.</div>';
  document.getElementById('lwStartModal').classList.add('open');
};

window.lwBegin=function(dayId){
  gxCloseModal('lwStartModal');
  const exs=api()?api().exercises():[];
  const s=gload();
  const gymF=exs[0]?exs[0].gym:null;
  let chosen;
  if(dayId==='__empty__')chosen=[];
  else chosen=exs.filter(e=>e.day===dayId);
  const dayName=dayId==='__empty__'?'Workout':(api().daysList().find(d=>d.id===dayId)||{}).name||'Workout';
  W={
    name:dayName, dayId, startTs:Date.now(), curIdx:0,
    exercises:chosen.map(e=>{
      const logs=api().logs(e.id);
      const prev=logs[logs.length-1];
      let prevBest=0; logs.forEach(l=>{const v=epley(l.weight,l.reps);if(v>prevBest)prevBest=v;});
      return{exId:e.id,name:e.name,bw:!!e.bw,step:e.step||2.5,repMin:e.repMin||8,
        sets:[],targetSets:4,restSec:(s.restDefault||90),
        prev:prev?{weight:prev.weight,reps:prev.reps}:null, prevBest1RM:prevBest, lastWeight:prev?prev.weight:(e.startWeight||20)};
    })
  };
  document.getElementById('lwScreen').classList.add('open');
  document.body.style.overflow='hidden';
  lwStartStopwatch();
  lwRequestWake();
  lwRenderEx();
};

function lwStartStopwatch(){
  clearInterval(stopInt);
  stopInt=setInterval(()=>{
    const el=document.getElementById('lwTime');if(!el||!W)return;
    const s=Math.floor((Date.now()-W.startTs)/1000);
    const m=Math.floor(s/60),h=Math.floor(m/60);
    el.textContent=(h>0?h+':'+String(m%60).padStart(2,'0'):m)+':'+String(s%60).padStart(2,'0');
  },1000);
}
async function lwRequestWake(){try{if('wakeLock'in navigator){wakeLock=await navigator.wakeLock.request('screen');}}catch(e){}}
function lwReleaseWake(){try{if(wakeLock){wakeLock.release();wakeLock=null;}}catch(e){}}
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&W&&!wakeLock)lwRequestWake();});

// ════════ RENDER CURRENT EXERCISE ════════
function lwRenderEx(){
  if(!W)return;
  const body=document.getElementById('lwBody');
  document.getElementById('lwName').textContent=W.name;
  if(!W.exercises.length){
    body.innerHTML=`<div style="text-align:center;padding:40px 0;color:rgba(255,255,255,.5)">
      <div style="font-size:18px;margin-bottom:16px">Empty workout</div>
      <button class="lw-action-btn" style="max-width:240px;margin:0 auto" onclick="lwAddExercisePrompt()">+ Add Exercise</button>
    </div>`;
    lwUpdateProgress();return;
  }
  const ex=W.exercises[W.curIdx];
  const setNum=ex.sets.length+1;
  const u=unit();
  // set dots
  let dots='';
  for(let i=0;i<Math.max(ex.targetSets,ex.sets.length);i++){
    const done=i<ex.sets.length;
    const cur=i===ex.sets.length;
    dots+=`<div class="lw-set-dot ${done?'done':''} ${cur?'cur':''}">${done?'<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>':i+1}</div>`;
  }
  const prevTxt=ex.prev?`Last time: <b>${ex.prev.weight?ex.prev.weight+u+' × ':''}${ex.prev.reps} reps</b>`:'No previous data';
  const wInit=ex.bw?'':(ex.sets.length?ex.sets[ex.sets.length-1].weight:ex.lastWeight);
  body.innerHTML=`
    <div class="lw-ex-name">${ex.name}</div>
    <div class="lw-set-counter">Set ${setNum} of ${ex.targetSets}</div>
    <div class="lw-prev">${prevTxt}</div>
    <div class="lw-set-dots">${dots}</div>
    <div class="lw-inputs">
      ${ex.bw?'':`<div class="lw-input-box"><label>Weight (${u})</label><div class="lw-input-row">
        <button class="lw-step-btn" onclick="lwStep('lwWeight',-${ex.step})">−</button>
        <input class="lw-num-input" id="lwWeight" type="number" inputmode="decimal" value="${wInit}">
        <button class="lw-step-btn" onclick="lwStep('lwWeight',${ex.step})">+</button>
      </div></div>`}
      <div class="lw-input-box" ${ex.bw?'style="grid-column:1/-1"':''}><label>Reps</label><div class="lw-input-row">
        <button class="lw-step-btn" onclick="lwStep('lwReps',-1)">−</button>
        <input class="lw-num-input" id="lwReps" type="number" inputmode="numeric" value="${ex.repMin}">
        <button class="lw-step-btn" onclick="lwStep('lwReps',1)">+</button>
      </div></div>
    </div>
    <div class="lw-rpe">
      <div class="lw-rpe-label">RPE (optional)</div>
      <div class="lw-rpe-row" id="lwRpeRow">${[6,6.5,7,7.5,8,8.5,9,9.5,10].map(r=>`<button class="lw-rpe-pill" onclick="lwSetRpe(${r},this)">${r}</button>`).join('')}</div>
    </div>
    <textarea class="lw-note" id="lwNote" placeholder="Notes (form cue, pain…)" rows="1"></textarea>
    <button class="lw-log-btn" onclick="lwLogSet()">Log Set <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg></button>
    <div class="lw-action-row">
      <button class="lw-action-btn" onclick="lwAddSet()">+ Add Set</button>
      <button class="lw-action-btn" onclick="lwPrevEx()">‹ Prev</button>
      <button class="lw-action-btn" onclick="lwNextEx()">Next ›</button>
    </div>`;
  curRpe=null;
  lwUpdateProgress();
  lwBindSwipe();
}

window.lwStep=function(id,d){const el=document.getElementById(id);if(!el)return;let v=parseFloat(el.value)||0;v=Math.max(0,Math.round((v+d)*100)/100);el.value=v;};
window.lwSetRpe=function(r,btn){curRpe=r;document.querySelectorAll('#lwRpeRow .lw-rpe-pill').forEach(p=>p.classList.remove('on'));btn.classList.add('on');};

window.lwLogSet=function(){
  if(!W)return;const ex=W.exercises[W.curIdx];if(!ex)return;
  const reps=parseInt(document.getElementById('lwReps').value,10)||0;
  if(reps<=0){alert('Enter reps');return;}
  const weight=ex.bw?0:(parseFloat(document.getElementById('lwWeight').value)||0);
  if(!ex.bw&&weight<=0){alert('Enter weight');return;}
  const note=document.getElementById('lwNote').value||'';
  const set={weight,reps,date:new Date().toISOString()};
  if(curRpe)set.rpe=curRpe;
  if(note)set.note=note;
  ex.sets.push(set);
  // write through to po_coach_v1 via app API
  if(api())api().addSet(ex.exId,set);
  // PR check
  const e1=epley(weight,reps);
  if(e1>ex.prevBest1RM&&ex.prevBest1RM>0&&!ex.bw){lwPrFlash(ex.name+' '+e1+unit());ex._prHit=ex.name+' — '+e1+unit()+' est. 1RM';ex.prevBest1RM=e1;}
  else if(e1>ex.prevBest1RM)ex.prevBest1RM=e1;
  lwUpdateVol();
  // auto-add a target set if exceeded
  if(ex.sets.length>=ex.targetSets)ex.targetSets=ex.sets.length;
  // start rest then re-render
  lwStartRest(ex.restSec);
};
window.lwAddSet=function(){if(!W)return;const ex=W.exercises[W.curIdx];ex.targetSets++;lwRenderEx();};

// ════════ NAVIGATION ════════
window.lwNextEx=function(){if(!W)return;if(W.curIdx<W.exercises.length-1){W.curIdx++;lwRenderEx();lwSlide();}else lwConfirmFinish();};
window.lwPrevEx=function(){if(!W)return;if(W.curIdx>0){W.curIdx--;lwRenderEx();lwSlide();}};
function lwSlide(){const b=document.getElementById('lwBody');b.style.opacity='0';b.style.transition='opacity .15s';setTimeout(()=>{b.style.opacity='1';},150);}
let swipeX=0,swipeY=0;
function lwBindSwipe(){
  const b=document.getElementById('lwBody');if(!b||b._sw)return;b._sw=1;
  b.addEventListener('touchstart',e=>{swipeX=e.touches[0].clientX;swipeY=e.touches[0].clientY;},{passive:true});
  b.addEventListener('touchend',e=>{const dx=e.changedTouches[0].clientX-swipeX,dy=e.changedTouches[0].clientY-swipeY;
    if(Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy)*1.8){if(dx<0)lwNextEx();else lwPrevEx();}},{passive:true});
}

window.lwOpenJump=function(){
  if(!W)return;
  document.getElementById('lwJumpList').innerHTML=W.exercises.map((ex,i)=>`
    <div class="lw-jump-item" onclick="lwJumpTo(${i})">
      <div class="lw-jump-num ${ex.sets.length>=ex.targetSets&&ex.sets.length>0?'done':''}">${i+1}</div>
      <div class="lw-jump-name">${ex.name}</div>
      <div class="lw-jump-sets">${ex.sets.length}/${ex.targetSets}</div>
    </div>`).join('')||'<div style="color:rgba(255,255,255,.5);padding:20px;text-align:center">No exercises</div>';
  document.getElementById('lwJump').classList.add('show');
};
window.lwJumpTo=function(i){W.curIdx=i;document.getElementById('lwJump').classList.remove('show');lwRenderEx();};

window.lwAddExercisePrompt=function(){
  const exs=api()?api().exercises():[];
  if(!exs.length){alert('No exercises set up. Add them in the main coach first.');return;}
  const name=prompt('Exercise name (must match one of your exercises):\n'+exs.map(e=>e.name).slice(0,12).join(', '));
  if(!name)return;
  const found=exs.find(e=>e.name.toLowerCase()===name.toLowerCase());
  if(!found){alert('No match found.');return;}
  const logs=api().logs(found.id);const prev=logs[logs.length-1];
  let pb=0;logs.forEach(l=>{const v=epley(l.weight,l.reps);if(v>pb)pb=v;});
  W.exercises.push({exId:found.id,name:found.name,bw:!!found.bw,step:found.step||2.5,repMin:found.repMin||8,sets:[],targetSets:4,restSec:90,prev:prev?{weight:prev.weight,reps:prev.reps}:null,prevBest1RM:pb,lastWeight:prev?prev.weight:(found.startWeight||20)});
  W.curIdx=W.exercises.length-1;lwRenderEx();
};

// ════════ REST TIMER ════════
function lwStartRest(sec){
  restTotal=sec;restLeft=sec;
  const rest=document.getElementById('lwRest');rest.classList.add('show');
  // duration chips
  document.getElementById('lwRestDurs').innerHTML=[30,60,90,120,180].map(d=>`<div class="lw-dur-chip ${d===sec?'on':''}" onclick="lwSetRestDur(${d})">${d}s</div>`).join('');
  // next set preview
  const ex=W.exercises[W.curIdx];
  const nextSetNum=ex.sets.length+1;
  let nextTxt;
  if(nextSetNum<=ex.targetSets){const last=ex.sets[ex.sets.length-1];nextTxt=`Next: <b>${ex.name}</b> — Set ${nextSetNum}${last&&!ex.bw?' · '+last.weight+unit():''}`;}
  else{const ne=W.exercises[W.curIdx+1];nextTxt=ne?`Next up: <b>${ne.name}</b>`:'Last set done — finish when ready';}
  document.getElementById('lwRestNext').innerHTML=nextTxt;
  lwUpdateRestCircle();
  clearInterval(restInt);
  restInt=setInterval(()=>{
    restLeft--;lwUpdateRestCircle();
    if(restLeft<=0){clearInterval(restInt);lwRestDone();}
  },1000);
}
function lwUpdateRestCircle(){
  const num=document.getElementById('lwRestNum');
  const m=Math.floor(Math.max(0,restLeft)/60),s=Math.max(0,restLeft)%60;
  num.textContent=m+':'+String(s).padStart(2,'0');
  const circ=691.15;const prog=document.getElementById('lwRestProg');
  prog.style.strokeDashoffset=circ*(1-Math.max(0,restLeft)/restTotal);
}
function lwRestDone(){
  if(navigator.vibrate)navigator.vibrate([300,120,300]);
  lwBeep();
  const num=document.getElementById('lwRestNum');num.textContent='0:00';num.style.color='#6ee7b7';
  setTimeout(()=>{num.style.color='';lwEndRest();},1200);
}
function lwEndRest(){document.getElementById('lwRest').classList.remove('show');lwRenderEx();}
window.lwRestAdd=function(s){restLeft+=s;restTotal+=s;lwUpdateRestCircle();};
window.lwRestSkip=function(){clearInterval(restInt);lwEndRest();};
window.lwSetRestDur=function(d){const ex=W.exercises[W.curIdx];if(ex)ex.restSec=d;const gs=gload();gs.restDefault=d;gsave(gs);restTotal=d;restLeft=d;lwUpdateRestCircle();document.querySelectorAll('#lwRestDurs .lw-dur-chip').forEach(c=>c.classList.toggle('on',c.textContent===d+'s'));};
function lwBeep(){try{const a=new(window.AudioContext||window.webkitAudioContext)();const o=a.createOscillator();const g=a.createGain();o.connect(g);g.connect(a.destination);o.frequency.value=880;o.start();g.gain.setValueAtTime(.3,a.currentTime);g.gain.exponentialRampToValueAtTime(.001,a.currentTime+.5);o.stop(a.currentTime+.5);}catch(e){}}

// ════════ PROGRESS / VOLUME ════════
function lwUpdateProgress(){
  if(!W)return;
  const total=W.exercises.length;
  const done=W.exercises.filter(e=>e.sets.length>=e.targetSets&&e.sets.length>0).length;
  const pct=total?Math.round(done/total*100):0;
  document.getElementById('lwProgFill').style.width=pct+'%';
  document.getElementById('lwProgText').textContent=done+' / '+total+' exercises';
  document.getElementById('lwProgPct').textContent=pct+'%';
  const ne=W.exercises[W.curIdx+1];
  document.getElementById('lwNext').innerHTML=ne?`Next: <b>${ne.name}</b>`:'';
  lwUpdateVol();
}
function lwUpdateVol(){
  if(!W)return;let vol=0,sets=0;
  W.exercises.forEach(e=>e.sets.forEach(s=>{vol+=(s.weight||0)*(s.reps||0);sets++;}));
  document.getElementById('lwVol').textContent=Math.round(vol).toLocaleString();
  document.getElementById('lwVolUnit').textContent=unit();
  document.getElementById('lwSetTotal').textContent=sets;
}
function lwPrFlash(txt){
  const f=document.getElementById('lwPrFlash');
  document.getElementById('lwPrText').textContent='PR! '+txt;
  f.classList.add('show');if(navigator.vibrate)navigator.vibrate([100,50,100,50,200]);
  setTimeout(()=>f.classList.remove('show'),2800);
}

// ════════ FINISH ════════
window.lwConfirmFinish=function(){
  if(!W)return;
  let setsDone=0,exRemain=0;
  W.exercises.forEach(e=>{setsDone+=e.sets.length;if(e.sets.length<e.targetSets)exRemain++;});
  if(!confirm(`End workout?\n${setsDone} sets completed, ${exRemain} exercises remaining.`))return;
  lwFinish();
};
async function lwFinish(){
  clearInterval(stopInt);clearInterval(restInt);
  document.getElementById('lwRest').classList.remove('show');
  lwReleaseWake();
  const durSec=Math.floor((Date.now()-W.startTs)/1000);
  let vol=0,sets=0;const muscleVol={};
  W.exercises.forEach(e=>{const m=muscleOf(e.name);e.sets.forEach(s=>{vol+=(s.weight||0)*(s.reps||0);sets++;if(MUSCLES.includes(m))muscleVol[m]=(muscleVol[m]||0)+1;});});
  // PRs achieved this session
  const prs=[];
  W.exercises.forEach(e=>{if(e._prHit)prs.push(e._prHit);});
  // save workout record to gym_v1
  const gs=gload();if(!gs.workouts)gs.workouts=[];
  gs.workouts.push({date:new Date().toISOString(),name:W.name,durSec,volume:Math.round(vol),sets,muscleVol,
    exercises:W.exercises.map(e=>({name:e.name,sets:e.sets.length}))});
  if(gs.workouts.length>200)gs.workouts=gs.workouts.slice(-200);
  gsave(gs);
  // render summary
  const h=Math.floor(durSec/3600),m=Math.floor((durSec%3600)/60),s=durSec%60;
  const durTxt=(h>0?h+'h ':'')+m+'m '+(h>0?'':s+'s');
  const sum=document.getElementById('lwSummary');
  sum.innerHTML=`
    <div class="lw-sum-title"><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M3 14c1.5 0 3-.5 4-2M4 12c0-3 1-6 5-6 3 0 5 2 6 4l3 2c1 .7 1.5 2 1 3-.5 1.2-2 1.5-3 1l-2-1c0 2-1 4-4 4-4 0-6-3-6-6M14 10l-2 1.5"/></svg> Workout Complete</div>
    <div class="lw-sum-sub">${W.name} · ${new Date().toLocaleDateString('en',{weekday:'long',month:'short',day:'numeric'})}</div>
    <div class="lw-sum-stats">
      <div class="lw-sum-stat"><div class="lw-sum-stat-val">${durTxt}</div><div class="lw-sum-stat-label">Total time</div></div>
      <div class="lw-sum-stat"><div class="lw-sum-stat-val">${Math.round(vol).toLocaleString()}</div><div class="lw-sum-stat-label">Volume (${unit()})</div></div>
      <div class="lw-sum-stat"><div class="lw-sum-stat-val">${sets}</div><div class="lw-sum-stat-label">Total sets</div></div>
      <div class="lw-sum-stat"><div class="lw-sum-stat-val">${W.exercises.length}</div><div class="lw-sum-stat-label">Exercises</div></div>
    </div>
    ${Object.keys(muscleVol).length?`<div class="lw-sum-section-title">Sets per muscle group</div>${MUSCLES.filter(mu=>muscleVol[mu]).map(mu=>{const mx=Math.max(...Object.values(muscleVol));return`<div class="lw-sum-musc"><span class="lw-sum-musc-name">${mu}</span><div class="lw-sum-musc-bar"><div class="lw-sum-musc-fill" style="width:${muscleVol[mu]/mx*100}%;background:${MCOL[mu]}"></div></div><span class="lw-sum-musc-val">${muscleVol[mu]}</span></div>`;}).join('')}`:''}
    ${prs.length?`<div class="lw-sum-section-title">Personal Records <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M6 4h12v5a6 6 0 0 1-12 0zM12 15v4M8 21h8"/></svg></div>${prs.map(p=>`<div class="lw-sum-pr"><span><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M12 2l2.9 6.3 6.9.6-5.2 4.6 1.6 6.8L12 17.3 5.8 20.9l1.6-6.8L2.2 8.9l6.9-.6z"/></svg></span>${p}</div>`).join('')}`:''}
    <div class="lw-sum-section-title">AI Analysis</div>
    <div class="lw-ai-box" id="lwAiBox"><span style="color:rgba(255,255,255,.5)">Analyzing your session…</span></div>
    <button class="lw-sum-save" onclick="lwSaveClose()">Save &amp; Close</button>`;
  sum.classList.add('show');
  // Groq feedback
  lwAiFeedback(durTxt,vol,sets,muscleVol);
}
async function lwAiFeedback(durTxt,vol,sets,muscleVol){
  const box=document.getElementById('lwAiBox');
  const key=groqKey();
  if(!key){box.innerHTML='<span style="color:rgba(255,255,255,.5)">Add a Groq API key in Settings (<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82L4.2 7.12a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>) for AI session analysis.</span>';return;}
  try{
    const exSummary=W.exercises.map(e=>`${e.name}: ${e.sets.map(s=>s.weight+'×'+s.reps+(s.rpe?' @RPE'+s.rpe:'')).join(', ')}`).filter(x=>!x.endsWith(': ')).join('\n');
    const muscles=Object.entries(muscleVol).map(([m,v])=>m+' '+v+' sets').join(', ');
    const r=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},
      body:JSON.stringify({model:'llama-3.3-70b-versatile',messages:[{role:'system',content:'You are a strength coach. Give ONE concise, encouraging paragraph (3-4 sentences) analyzing this workout: effort, balance, and one specific thing for next time.'},{role:'user',content:`Workout: ${W.name}, ${durTxt}, ${Math.round(vol)}${unit()} volume, ${sets} sets.\nMuscles: ${muscles}.\nDetails:\n${exSummary}`}],max_tokens:250,temperature:0.6})});
    const d=await r.json();
    if(!r.ok)throw new Error(d?.error?.message||'error');
    box.textContent=(d?.choices?.[0]?.message?.content||'').trim();
  }catch(e){box.innerHTML='<span style="color:#ff8a8a">AI analysis failed: '+e.message+'</span>';}
}
window.lwSaveClose=function(){
  document.getElementById('lwSummary').classList.remove('show');
  document.getElementById('lwScreen').classList.remove('open');
  document.body.style.overflow='';
  W=null;
  // trigger re-render of coach modules
  try{if(window.gxRender)window.gxRender();}catch(e){}
};
})();
