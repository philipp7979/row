(function(){

  (function () {
    const KEY       = 'whoop_tokens_v1';
    const CLIENT_ID = 'ae647e05-832f-4f89-acd7-1178aaf20d9f';
    const REDIRECT  = window.location.origin + '/api/whoop-callback';
    const SCOPES    = 'read:recovery read:sleep read:workout read:cycles read:profile read:body_measurement offline';
    const CIRC      = 2 * Math.PI * 96; // 603.19 — matches r="96" on the ring

    const el = (id) => document.getElementById(id);
    const loadTokens  = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };
    const saveTokens  = (t) => { try { localStorage.setItem(KEY, JSON.stringify(t)); } catch {} };
    const clearTokens = () => { try { localStorage.removeItem(KEY); } catch {} };

    // Absorb token from URL hash after OAuth redirect back to this page
    if (location.hash && location.hash.indexOf('whoop_access') !== -1) {
      const h = new URLSearchParams(location.hash.slice(1));
      const access = h.get('whoop_access'), refresh = h.get('whoop_refresh');
      const expires = Number(h.get('whoop_expires')) || (Date.now() + 3500 * 1000);
      if (access) { saveTokens({ access, refresh, expires }); history.replaceState(null, '', location.pathname + location.search); }
    }

    el('whoopConnectBtn').addEventListener('click', () => {
      location.href = 'https://api.prod.whoop.com/oauth/oauth2/auth'
        + '?client_id='    + encodeURIComponent(CLIENT_ID)
        + '&redirect_uri=' + encodeURIComponent(REDIRECT)
        + '&response_type=code'
        + '&scope='        + encodeURIComponent(SCOPES)
        + '&state='        + Math.random().toString(36).slice(2);
    });
    el('whoopDisconnectBtn').addEventListener('click', () => { clearTokens(); render(); });
    el('whoopRefreshBtn').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.style.transition = 'transform 0.5s ease';
      btn.style.transform  = 'rotate(360deg)';
      try { await loadData(); } finally { setTimeout(() => { btn.style.transform = ''; btn.style.transition = ''; }, 500); }
    });

    // Shared promise so concurrent 401s don't each fire a separate refresh request.
    let _refreshPending = null;
    async function refreshToken(t) {
      if (!t.refresh) return null;
      if (_refreshPending) return _refreshPending;
      _refreshPending = (async () => {
        try {
          const r = await fetch('/api/whoop-refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: t.refresh }) });
          const j = await r.json();
          if (j.access_token) {
            const next = { access: j.access_token, refresh: j.refresh_token || t.refresh, expires: Date.now() + (j.expires_in != null ? j.expires_in : 3500) * 1000 };
            saveTokens(next); return next;
          }
        } catch {}
        return null;
      })();
      try { return await _refreshPending; } finally { _refreshPending = null; }
    }

    // retried flag prevents infinite recursion when a refreshed token is also rejected.
    async function whoopFetch(path, t, retried) {
      const [p, qs] = path.split('?');
      const params = new URLSearchParams(qs || '');
      params.set('path', p);
      const r = await fetch('/api/whoop-data?' + params.toString(), { headers: { 'Authorization': 'Bearer ' + t.access, 'Accept': 'application/json' } });
      if (r.status === 401 && !retried) { const n = await refreshToken(t); if (n) return whoopFetch(path, n, true); throw new Error('Session expired — tap Disconnect then Connect again'); }
      if (!r.ok) throw new Error('WHOOP ' + r.status + ': ' + (await r.text()));
      return r.json();
    }

    function fmtMins(ms) { const m = Math.round(ms / 60000); const h = Math.floor(m / 60); return h + 'h ' + String(m % 60).padStart(2, '0') + 'm'; }

    function recoveryColor(s) { return s >= 67 ? '#6BE3A4' : s >= 34 ? '#F2C063' : '#FF6B6B'; }
    function recoveryLabel(s) { return s >= 67 ? 'High Recovery' : s >= 34 ? 'Moderate' : 'Low Recovery'; }

    function setZone(id, cls) {
      const e = el(id); if (!e) return;
      e.className = 'whoop-zone' + (cls ? ' ' + cls : '');
    }

    function setRing(score) {
      const fill = el('whoopRecoveryRingFill'); if (!fill) return;
      const color  = recoveryColor(score);
      fill.style.strokeDashoffset = CIRC * (1 - score / 100);
      fill.style.stroke = color;
      fill.style.filter = 'drop-shadow(0 0 8px ' + color + '80)';
      el('whoopRecoveryScore').textContent = Math.round(score) + '%';
      const lbl = el('whoopRecoveryLabel');
      lbl.textContent = recoveryLabel(score);
      lbl.style.color = color;
    }

    function buildVerdict(recovery, strain, sleepPct) {
      const v = el('whoopVerdict'); if (!v || recovery == null) return;
      let badge, color, borderColor, bgColor, headline, reasons = [], avoid = [];
      if (recovery >= 67) {
        badge = 'Go'; color = '#6BE3A4'; borderColor = 'rgba(107,227,164,0.45)'; bgColor = 'rgba(107,227,164,0.10)';
        headline = 'Your body is primed — push it today.';
        reasons.push('Recovery ' + Math.round(recovery) + '% puts you in the green zone.');
        if (strain != null && strain < 10) reasons.push('Yesterday was light (' + strain.toFixed(1) + ' strain) — you have capacity to train hard.');
        if (sleepPct != null && sleepPct >= 70) reasons.push('Sleep performance ' + Math.round(sleepPct) + '% — well rested.');
      } else if (recovery >= 34) {
        badge = 'Moderate'; color = '#F2C063'; borderColor = 'rgba(242,192,99,0.45)'; bgColor = 'rgba(242,192,99,0.10)';
        headline = 'Moderate effort is safe — don\'t overdo it.';
        reasons.push('Recovery ' + Math.round(recovery) + '% is in the yellow zone.');
        if (strain != null && strain > 16) { reasons.push('Yesterday was very demanding (' + strain.toFixed(1) + ' strain).'); avoid.push('max-effort lifting or HIIT'); }
        if (sleepPct != null && sleepPct < 50) reasons.push('Sleep performance was low (' + Math.round(sleepPct) + '%).');
      } else {
        badge = 'Rest'; color = '#FF6B6B'; borderColor = 'rgba(255,107,107,0.45)'; bgColor = 'rgba(255,107,107,0.10)';
        headline = 'Your body needs recovery — take it easy.';
        reasons.push('Recovery ' + Math.round(recovery) + '% signals your body is under stress.');
        avoid.push('intense training', 'heavy compound lifts');
        reasons.push('Prioritise sleep, light movement, and nutrition today.');
      }
      const b = el('whoopVerdictBadge');
      b.textContent = badge; b.style.color = color; b.style.borderColor = borderColor; b.style.background = bgColor;
      v.style.borderLeftColor = color;
      el('whoopVerdictHeadline').textContent = headline;
      el('whoopVerdictReasons').innerHTML = reasons.map(r => '· ' + r).join('<br>');
      const avoidEl = el('whoopVerdictAvoid');
      if (avoid.length) { el('whoopVerdictAvoidText').textContent = avoid.join(', '); avoidEl.style.display = ''; }
      else { avoidEl.style.display = 'none'; }
      v.style.display = '';
    }

    async function loadData() {
      let t = loadTokens(); if (!t) return;
      if (t.expires && Date.now() > t.expires - 60000) { const n = await refreshToken(t); if (n) t = n; }
      el('whoopUpdated').textContent = 'loading…';
      try {
        const [rec, sleep, cycle] = await Promise.all([
          whoopFetch('/recovery?limit=1', t).catch(e => { console.error('[whoop] recovery:', e.message); return null; }),
          whoopFetch('/activity/sleep?limit=1', t).catch(e => { console.error('[whoop] sleep:', e.message); return null; }),
          whoopFetch('/cycle?limit=1', t).catch(e => { console.error('[whoop] cycle:', e.message); return null; }),
        ]);

        // Recovery ring + HRV / RHR / biomarkers
        const recScore = rec && rec.records && rec.records[0] && rec.records[0].score;
        let recoveryPct = null;
        if (recScore) {
          const _rawRec = recScore.recovery_score;
          recoveryPct = _rawRec != null ? _rawRec : null;
          setRing(recoveryPct);
          const hrv = recScore.hrv_rmssd_milli;
          const rhr = recScore.resting_heart_rate;
          el('whoopHrv').textContent = hrv != null ? Math.round(hrv) : '—';
          el('whoopRhr').textContent = rhr != null ? Math.round(rhr) : '—';
          setZone('whoopZoneHrv', hrv == null ? '' : hrv >= 60 ? 'z-good' : hrv >= 40 ? 'z-norm' : 'z-warn');
          setZone('whoopZoneRhr', rhr == null ? '' : rhr <= 55 ? 'z-good' : rhr <= 70 ? 'z-norm' : 'z-bad');
          const skin = recScore.skin_temp_celsius, spo2 = recScore.spo2_percentage;
          let hasBio = false;
          if (skin != null) { el('whoopSkinTemp').textContent = skin.toFixed(1) + '°C'; setZone('whoopZoneSkin', Math.abs(skin) < 0.5 ? 'z-good' : 'z-norm'); hasBio = true; }
          if (spo2 != null) { el('whoopSpo2').textContent = spo2.toFixed(1) + '%'; setZone('whoopZoneSpo2', spo2 >= 95 ? 'z-good' : spo2 >= 90 ? 'z-warn' : 'z-bad'); hasBio = true; }
          if (hasBio) el('whoopBio').style.display = '';
        }

        // Sleep stages + performance
        let sleepPct = null;
        const sleepRec = sleep && sleep.records && sleep.records[0];
        if (sleepRec && sleepRec.score) {
          const sc = sleepRec.score, ss = sc.stage_summary || {};
          sleepPct = sc.sleep_performance_percentage;
          const rem   = ss.total_rem_sleep_time_milli       || 0;
          const deep  = ss.total_slow_wave_sleep_time_milli || 0;
          const light = ss.total_light_sleep_time_milli     || 0;
          const awake = ss.total_awake_time_milli           || 0;
          const inBed = rem + deep + light + awake;
          el('whoopSleepScore').textContent    = sleepPct != null ? Math.round(sleepPct) + '%' : '—';
          el('whoopSleepDuration').textContent = (rem + deep + light) ? fmtMins(rem + deep + light) : '—';
          setZone('whoopZoneSleep', sleepPct == null ? '' : sleepPct >= 85 ? 'z-good' : sleepPct >= 70 ? 'z-norm' : 'z-warn');
          if (inBed > 0) {
            el('whoopStageRem').style.width   = (rem   / inBed * 100).toFixed(1) + '%';
            el('whoopStageDeep').style.width  = (deep  / inBed * 100).toFixed(1) + '%';
            el('whoopStageLight').style.width = (light / inBed * 100).toFixed(1) + '%';
            el('whoopStageAwake').style.width = (awake / inBed * 100).toFixed(1) + '%';
            el('whoopStageRemTxt').textContent   = rem   ? fmtMins(rem)   : '—';
            el('whoopStageDeepTxt').textContent  = deep  ? fmtMins(deep)  : '—';
            el('whoopStageLightTxt').textContent = light ? fmtMins(light) : '—';
            el('whoopStageAwakeTxt').textContent = awake ? fmtMins(awake) : '—';
            el('whoopStagesMeta').textContent = fmtMins(inBed) + ' in bed';
            el('whoopStages').style.display = '';
          }
          const resp = sc.respiratory_rate;
          if (resp != null) {
            el('whoopResp').textContent = resp.toFixed(1) + ' rpm';
            setZone('whoopZoneResp', resp >= 12 && resp <= 20 ? 'z-norm' : 'z-warn');
            el('whoopBio').style.display = '';
          }
        }

        // Strain
        let strainVal = null;
        const cycleRec = cycle && cycle.records && cycle.records[0];
        if (cycleRec && cycleRec.score) {
          strainVal = cycleRec.score.strain;
          el('whoopStrain').textContent = strainVal != null ? strainVal.toFixed(1) : '—';
          setZone('whoopZoneStrain', strainVal == null ? '' : strainVal >= 14 ? 'z-warn' : strainVal >= 8 ? 'z-norm' : 'z-good');
        }

        buildVerdict(recoveryPct, strainVal, sleepPct);
        el('whoopUpdated').textContent = 'Updated ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        // ── Cache parsed metrics to whoop_data_v1 for the Health Lab ──
        try {
          const rs = recScore || {};
          const sc = (sleepRec && sleepRec.score) || {};
          const ss = sc.stage_summary || {};
          let wd = {}; try { wd = JSON.parse(localStorage.getItem('whoop_data_v1')) || {}; } catch (e) {}
          const today = new Date().toISOString().slice(0, 10);
          wd.recovery = recoveryPct;
          wd.hrv = rs.hrv_rmssd_milli != null ? Math.round(rs.hrv_rmssd_milli) : null;
          wd.rhr = rs.resting_heart_rate != null ? Math.round(rs.resting_heart_rate) : null;
          wd.spo2 = rs.spo2_percentage != null ? rs.spo2_percentage : null;
          wd.skinTemp = rs.skin_temp_celsius != null ? rs.skin_temp_celsius : null;
          wd.sleepScore = sleepPct != null ? Math.round(sleepPct) : null;
          wd.sleepDurationMin = (ss.total_rem_sleep_time_milli||0)+(ss.total_slow_wave_sleep_time_milli||0)+(ss.total_light_sleep_time_milli||0) > 0
            ? Math.round(((ss.total_rem_sleep_time_milli||0)+(ss.total_slow_wave_sleep_time_milli||0)+(ss.total_light_sleep_time_milli||0))/60000) : null;
          wd.sleepStages = {
            rem: Math.round((ss.total_rem_sleep_time_milli||0)/60000),
            deep: Math.round((ss.total_slow_wave_sleep_time_milli||0)/60000),
            light: Math.round((ss.total_light_sleep_time_milli||0)/60000),
            awake: Math.round((ss.total_awake_time_milli||0)/60000)
          };
          wd.strain = strainVal != null ? Math.round(strainVal*10)/10 : null;
          wd.respiratory = sc.respiratory_rate != null ? Math.round(sc.respiratory_rate*10)/10 : null;
          wd.updated = Date.now();
          // daily history for trends (one entry per day)
          wd.history = wd.history || {};
          wd.history[today] = { hrv: wd.hrv, rhr: wd.rhr, recovery: wd.recovery, sleepScore: wd.sleepScore };
          // keep last 45 days
          const days = Object.keys(wd.history).sort();
          while (days.length > 45) { delete wd.history[days.shift()]; }
          localStorage.setItem('whoop_data_v1', JSON.stringify(wd));
          if (window.hlRender) window.hlRender(); // refresh Health Lab with fresh WHOOP data
        } catch (e) {}
      } catch (e) {
        console.error('[whoop] loadData:', e);
        el('whoopUpdated').textContent = 'Error — ' + (e.message || 'fetch failed');
      }
    }

    function render() {
      const t = loadTokens();
      if (t && t.access) { el('whoopDisconnected').style.display = 'none'; el('whoopConnected').style.display = ''; loadData(); }
      else               { el('whoopDisconnected').style.display = '';     el('whoopConnected').style.display = 'none'; }
    }
    render();
  })();
  


  // When the dashboard topbar "Add Food" command fires, scroll the food
  // tracker into view (the food iframe opens its own Add Food sheet).
  window.addEventListener('storage', function(e){
    if(e.key==='fl_open_add'){
      var t=document.getElementById('nutritionTitle');
      if(t) t.scrollIntoView({behavior:'smooth',block:'start'});
    }
  });
  


  (function () {
    var iframe = document.getElementById('waterIframe');
    if (!iframe) return;
    function fitIframe() {
      try {
        var doc = iframe.contentDocument || iframe.contentWindow.document;
        var h = doc.documentElement.scrollHeight || doc.body.scrollHeight;
        if (h > 100) iframe.style.height = h + 'px';
      } catch (e) {}
    }
    iframe.addEventListener('load', function () {
      fitIframe();
      // Re-fit when content inside changes (e.g. settings modal expands)
      try {
        var doc = iframe.contentDocument || iframe.contentWindow.document;
        new ResizeObserver(fitIframe).observe(doc.documentElement);
      } catch (e) {}
    });
  })();
  


(() => {
  'use strict';

  const storeGet = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
  const storeSet = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  function getActiveDate() {
    const now = new Date();
    if (now.getHours() < 6) now.setDate(now.getDate() - 1);
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  const TEMPLATE_VERSION = 5;

  const STACK_DEFAULTS = [
    { id: 'm1', name: 'XXXXX - Supplement of choice', dose: '', window: 'morning', note: 'how much MG, meal times, any data below', tag: null,    ordered: true  },
    { id: 'm2', name: 'XXXXX - Supplement of choice', dose: '', window: 'morning', note: 'how much MG, meal times, any data below', tag: 'stack', ordered: true  },
    { id: 'm3', name: 'XXXXX - Supplement of choice', dose: '', window: 'morning', note: 'how much MG, meal times, any data below', tag: null,    ordered: true  },
    { id: 'l1', name: 'XXXXX - Supplement of choice', dose: '', window: 'lunch',   note: 'how much MG, meal times, any data below', tag: null,    ordered: true  },
    { id: 'l2', name: 'XXXXX - Supplement of choice', dose: '', window: 'lunch',   note: 'how much MG, meal times, any data below', tag: null,    ordered: true  },
    { id: 'e1', name: 'XXXXX - Supplement of choice', dose: '', window: 'evening', note: 'how much MG, meal times, any data below', tag: null,    ordered: true  },
    { id: 'e2', name: 'XXXXX - Supplement of choice', dose: '', window: 'evening', note: 'how much MG, meal times, any data below', tag: 'not-ordered', ordered: false },
    { id: 'e3', name: 'XXXXX - Supplement of choice', dose: '', window: 'evening', note: 'how much MG, meal times, any data below', tag: null,    ordered: true  },
  ];

  const STACK_WINDOWS = [
    { key: 'morning', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M17 18a5 5 0 0 0-10 0M12 2v7M4.2 10.2l1.4 1.4M1 18h2M21 18h2M18.4 11.6l1.4-1.4M23 22H1M16 5l-4 4-4-4"/></svg>', title: 'Morning', time: '7–10 AM', cutoffHour: 10 },
    { key: 'lunch',   icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M3 3v7c0 1 1 2 2 2s2-1 2-2V3M5 12v9M19 3v18M16 3c-1 1-2 3-2 6 0 2 1 3 2 3h2"/></svg>️', title: 'Lunch',   time: '12–2 PM', cutoffHour: 14 },
    { key: 'evening', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/></svg>', title: 'Evening', time: '9–11 PM', cutoffHour: 23 },
    { key: 'anytime', icon: '⏱️', title: 'Anytime', time: 'No fixed window', cutoffHour: null },
  ];

  // ====== SUPPLEMENT DATABASE — researched defaults ======
  const SUPPLEMENT_DB = [
    { name: 'Creatine monohydrate', dose: '5g', window: 'anytime', note: 'Daily — consistency matters more than timing', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M14.4 14.4 9.6 9.6M3 7l3-3 3 3-3 3zM15 15l3-3 3 3-3 3zM6.5 9.5 4 12M17.5 14.5 20 12"/></svg>️', aliases: ['creatine'] },
    { name: 'Beta-alanine', dose: '2–5g', window: 'morning', note: 'Pre-workout — split doses to avoid tingles', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M14.4 14.4 9.6 9.6M3 7l3-3 3 3-3 3zM15 15l3-3 3 3-3 3zM6.5 9.5 4 12M17.5 14.5 20 12"/></svg>️', aliases: ['beta alanine'] },
    { name: 'L-citrulline', dose: '6–8g', window: 'morning', note: '~30 min pre-workout for pump', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M14.4 14.4 9.6 9.6M3 7l3-3 3 3-3 3zM15 15l3-3 3 3-3 3zM6.5 9.5 4 12M17.5 14.5 20 12"/></svg>️', aliases: ['citrulline'] },
    { name: 'BCAAs', dose: '5–10g', window: 'anytime', note: 'Around workout window', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M14.4 14.4 9.6 9.6M3 7l3-3 3 3-3 3zM15 15l3-3 3 3-3 3zM6.5 9.5 4 12M17.5 14.5 20 12"/></svg>️', aliases: ['bcaa'] },
    { name: 'Whey protein', dose: '25–40g', window: 'anytime', note: 'Post-workout or to hit daily target', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M5 8h14l-1.3 12.1a2 2 0 0 1-2 1.9H8.3a2 2 0 0 1-2-1.9zM5 8l1-4h12M11 4V2h2"/></svg>', aliases: ['whey'] },
    { name: 'Casein protein', dose: '25–40g', window: 'evening', note: 'Before bed for slow overnight aminos', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M5 8h14l-1.3 12.1a2 2 0 0 1-2 1.9H8.3a2 2 0 0 1-2-1.9zM5 8l1-4h12M11 4V2h2"/></svg>', aliases: ['casein'] },
    { name: 'L-carnitine', dose: '1–2g', window: 'morning', note: 'With carbs for best uptake', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M14.4 14.4 9.6 9.6M3 7l3-3 3 3-3 3zM15 15l3-3 3 3-3 3zM6.5 9.5 4 12M17.5 14.5 20 12"/></svg>️', aliases: ['carnitine'] },
    { name: 'Acetyl-L-carnitine', dose: '500mg–2g', window: 'morning', note: 'Cognitive variant — crosses BBB', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08A3 3 0 0 1 2.5 11a2.5 2.5 0 0 1 2-4.9A2.5 2.5 0 0 1 7 3.5 2.5 2.5 0 0 1 9.5 2zM14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08A3 3 0 0 0 21.5 11a2.5 2.5 0 0 0-2-4.9A2.5 2.5 0 0 0 17 3.5 2.5 2.5 0 0 0 14.5 2z"/></svg>', aliases: ['alcar'] },
    { name: 'HMB', dose: '3g', window: 'anytime', note: 'Split 3x daily — muscle preservation', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M14.4 14.4 9.6 9.6M3 7l3-3 3 3-3 3zM15 15l3-3 3 3-3 3zM6.5 9.5 4 12M17.5 14.5 20 12"/></svg>️', aliases: ['hmb'] },
    { name: 'Glutamine', dose: '5g', window: 'anytime', note: 'Recovery — post-workout or before bed', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M14.4 14.4 9.6 9.6M3 7l3-3 3 3-3 3zM15 15l3-3 3 3-3 3zM6.5 9.5 4 12M17.5 14.5 20 12"/></svg>️', aliases: ['l-glutamine'] },
    { name: 'Vitamin D3', dose: '2000–5000 IU', window: 'lunch', note: 'Fat-soluble — take with biggest meal', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>️', aliases: ['vit d', 'vitamin d', 'd3', 'cholecalciferol'] },
    { name: 'Vitamin K2 (MK-7)', dose: '100–200 mcg', window: 'lunch', note: 'Pairs with D3 — same meal', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M10.5 20.5 3.5 13.5a5 5 0 0 1 7-7l7 7a5 5 0 0 1-7 7zM8.5 8.5l7 7"/></svg>', aliases: ['vit k', 'vitamin k', 'k2', 'mk7'] },
    { name: 'Vitamin C', dose: '500–1000mg', window: 'morning', note: 'Water-soluble — split if over 500mg', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 5V3M12 3c0-1 1-1 2-1"/></svg>', aliases: ['vit c', 'ascorbic acid'] },
    { name: 'Vitamin B12', dose: '500–1000mcg', window: 'morning', note: 'Methylcobalamin form preferred', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M13 2 3 14h9l-1 8 10-12h-9z"/></svg>', aliases: ['b12', 'methylcobalamin'] },
    { name: 'B-complex', dose: '1 cap', window: 'morning', note: 'All B vitamins — energy', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M13 2 3 14h9l-1 8 10-12h-9z"/></svg>', aliases: ['b complex', 'b vitamins'] },
    { name: 'Vitamin A', dose: '5000 IU', window: 'lunch', note: 'Fat-soluble — with fat', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M10.5 20.5 3.5 13.5a5 5 0 0 1 7-7l7 7a5 5 0 0 1-7 7zM8.5 8.5l7 7"/></svg>', aliases: ['vit a', 'retinol'] },
    { name: 'Vitamin E', dose: '400 IU', window: 'lunch', note: 'Fat-soluble — with fat', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M10.5 20.5 3.5 13.5a5 5 0 0 1 7-7l7 7a5 5 0 0 1-7 7zM8.5 8.5l7 7"/></svg>', aliases: ['vit e', 'tocopherol'] },
    { name: 'Folate', dose: '400–800mcg', window: 'morning', note: 'Methylfolate preferred', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M10.5 20.5 3.5 13.5a5 5 0 0 1 7-7l7 7a5 5 0 0 1-7 7zM8.5 8.5l7 7"/></svg>', aliases: ['folic acid', 'b9', 'methylfolate'] },
    { name: 'Biotin', dose: '30mcg–5mg', window: 'anytime', note: 'Hair, skin, nails', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/></svg>', aliases: ['biotin', 'b7'] },
    { name: 'Multivitamin', dose: '1 serving', window: 'lunch', note: 'Take with food', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M10.5 20.5 3.5 13.5a5 5 0 0 1 7-7l7 7a5 5 0 0 1-7 7zM8.5 8.5l7 7"/></svg>', aliases: ['multi', 'multivitamin'] },
    { name: 'Magnesium glycinate', dose: '200–400mg', window: 'evening', note: '30–60 min before bed — sleep helper', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/></svg>', aliases: ['magnesium', 'mag glycinate', 'bisglycinate'] },
    { name: 'Magnesium L-threonate', dose: '144mg elemental', window: 'evening', note: 'Cognitive variant — crosses BBB', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08A3 3 0 0 1 2.5 11a2.5 2.5 0 0 1 2-4.9A2.5 2.5 0 0 1 7 3.5 2.5 2.5 0 0 1 9.5 2zM14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08A3 3 0 0 0 21.5 11a2.5 2.5 0 0 0-2-4.9A2.5 2.5 0 0 0 17 3.5 2.5 2.5 0 0 0 14.5 2z"/></svg>', aliases: ['magtein', 'threonate'] },
    { name: 'Magnesium citrate', dose: '200–400mg', window: 'evening', note: 'Also supports digestion', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/></svg>', aliases: ['mag citrate'] },
    { name: 'Zinc', dose: '15–30mg', window: 'evening', note: 'With food — not with calcium or iron', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M10.5 20.5 3.5 13.5a5 5 0 0 1 7-7l7 7a5 5 0 0 1-7 7zM8.5 8.5l7 7"/></svg>', aliases: ['zinc'] },
    { name: 'Iron', dose: '18–65mg', window: 'morning', note: 'Empty stomach with vit C', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M10.5 20.5 3.5 13.5a5 5 0 0 1 7-7l7 7a5 5 0 0 1-7 7zM8.5 8.5l7 7"/></svg>', aliases: ['iron'] },
    { name: 'Calcium', dose: '500mg', window: 'evening', note: 'With food — not with iron', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M17 10c1.5 0 3 1 3 3s-1.5 3-3 3M7 14c-1.5 0-3-1-3-3s1.5-3 3-3M7 8a2 2 0 1 1 4 0M7 16a2 2 0 1 0 4 0M17 8a2 2 0 1 0-4 0M17 16a2 2 0 1 1-4 0M9 12h6"/></svg>', aliases: ['calcium'] },
    { name: 'Selenium', dose: '100–200mcg', window: 'anytime', note: 'Thyroid + antioxidant', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M10.5 20.5 3.5 13.5a5 5 0 0 1 7-7l7 7a5 5 0 0 1-7 7zM8.5 8.5l7 7"/></svg>', aliases: ['selenium'] },
    { name: 'Iodine', dose: '150mcg', window: 'morning', note: 'Thyroid support', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M10.5 20.5 3.5 13.5a5 5 0 0 1 7-7l7 7a5 5 0 0 1-7 7zM8.5 8.5l7 7"/></svg>', aliases: ['iodine'] },
    { name: 'Omega-3 (Fish oil)', dose: '2–3g EPA+DHA', window: 'lunch', note: 'With biggest fatty meal', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M6.5 12c2-4 6-6 12-6-1 2-1 4 0 6-6 0-10-2-12-6zM6.5 12c2 4 6 6 12 6-1-2-1-4 0-6M2 12c1-1 2.5-1.5 4.5-1.5"/><circle cx="15" cy="10" r="0.6" fill="currentColor" stroke="none"/></svg>', aliases: ['omega 3', 'omega3', 'fish oil', 'epa', 'dha'] },
    { name: 'Krill oil', dose: '500–1000mg', window: 'lunch', note: 'More absorbable than fish oil', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M6.5 12c2-4 6-6 12-6-1 2-1 4 0 6-6 0-10-2-12-6zM6.5 12c2 4 6 6 12 6-1-2-1-4 0-6M2 12c1-1 2.5-1.5 4.5-1.5"/><circle cx="15" cy="10" r="0.6" fill="currentColor" stroke="none"/></svg>', aliases: ['krill'] },
    { name: 'MCT oil', dose: '1–2 tbsp', window: 'morning', note: 'Fast energy — start low', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="9" cy="10" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="10" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="14" r="1" fill="currentColor" stroke="none"/></svg>', aliases: ['mct'] },
    { name: 'Flaxseed oil', dose: '1–2g', window: 'lunch', note: 'Plant omega-3 — with food', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M7 20h10M10 20c5.5-2.5.8-6.4 3-10M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8zM14.1 6c-.9.8-1.6 2-2.1 3.6 2.1.4 3.5-.5 4.5-1.6 1-1.1 1.5-2.5 1.5-4.5-2 .5-3 1.7-3.9 2.5z"/></svg>', aliases: ['flax', 'flaxseed'] },
    { name: 'L-theanine', dose: '100–200mg', window: 'morning', note: 'Stacks with caffeine 2:1', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08A3 3 0 0 1 2.5 11a2.5 2.5 0 0 1 2-4.9A2.5 2.5 0 0 1 7 3.5 2.5 2.5 0 0 1 9.5 2zM14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08A3 3 0 0 0 21.5 11a2.5 2.5 0 0 0-2-4.9A2.5 2.5 0 0 0 17 3.5 2.5 2.5 0 0 0 14.5 2z"/></svg>', aliases: ['theanine'] },
    { name: 'Caffeine', dose: '100–200mg', window: 'morning', note: 'Stack with L-theanine for cleaner focus', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M17 8h1a4 4 0 1 1 0 8h-1M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z"/></svg>', aliases: ['caffeine'] },
    { name: 'Rhodiola rosea', dose: '200–400mg', window: 'morning', note: 'Adaptogen — energy and stress', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10zM2 21c0-3 1.9-5.4 5.1-6"/></svg>', aliases: ['rhodiola'] },
    { name: 'Lion\'s mane', dose: '500–1000mg', window: 'morning', note: 'Cognitive support — daily', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M4 11a8 8 0 0 1 16 0H4zM10 11v6a2 2 0 0 0 4 0v-6"/></svg>', aliases: ['lions mane', 'hericium'] },
    { name: 'Bacopa monnieri', dose: '300–600mg', window: 'morning', note: 'With fat — long-term memory', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10zM2 21c0-3 1.9-5.4 5.1-6"/></svg>', aliases: ['bacopa'] },
    { name: 'Ginkgo biloba', dose: '120–240mg', window: 'morning', note: 'Circulation and cognition', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10zM2 21c0-3 1.9-5.4 5.1-6"/></svg>', aliases: ['ginkgo'] },
    { name: 'Alpha-GPC', dose: '300–600mg', window: 'morning', note: 'Choline — focus and learning', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08A3 3 0 0 1 2.5 11a2.5 2.5 0 0 1 2-4.9A2.5 2.5 0 0 1 7 3.5 2.5 2.5 0 0 1 9.5 2zM14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08A3 3 0 0 0 21.5 11a2.5 2.5 0 0 0-2-4.9A2.5 2.5 0 0 0 17 3.5 2.5 2.5 0 0 0 14.5 2z"/></svg>', aliases: ['alpha gpc'] },
    { name: 'Phosphatidylserine', dose: '100–300mg', window: 'evening', note: 'Cortisol regulation', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08A3 3 0 0 1 2.5 11a2.5 2.5 0 0 1 2-4.9A2.5 2.5 0 0 1 7 3.5 2.5 2.5 0 0 1 9.5 2zM14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08A3 3 0 0 0 21.5 11a2.5 2.5 0 0 0-2-4.9A2.5 2.5 0 0 0 17 3.5 2.5 2.5 0 0 0 14.5 2z"/></svg>', aliases: ['ps'] },
    { name: 'NAC', dose: '600–1800mg', window: 'morning', note: 'Glutathione precursor — split doses', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M10.5 20.5 3.5 13.5a5 5 0 0 1 7-7l7 7a5 5 0 0 1-7 7zM8.5 8.5l7 7"/></svg>', aliases: ['nac', 'n-acetyl cysteine'] },
    { name: 'Melatonin', dose: '0.3–3mg', window: 'evening', note: '30–60 min before bed — start low', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/></svg>', aliases: ['melatonin'] },
    { name: 'Glycine', dose: '3g', window: 'evening', note: 'Body temp drop = better sleep onset', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/></svg>', aliases: ['glycine'] },
    { name: 'Apigenin', dose: '50mg', window: 'evening', note: 'From chamomile — before bed', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/></svg>', aliases: ['apigenin'] },
    { name: 'Ashwagandha', dose: '300–600mg', window: 'evening', note: 'KSM-66 form — stress and cortisol', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10zM2 21c0-3 1.9-5.4 5.1-6"/></svg>', aliases: ['ashwagandha', 'ksm-66'] },
    { name: 'L-tryptophan', dose: '500mg–1g', window: 'evening', note: 'Serotonin precursor — sleep onset', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/></svg>', aliases: ['tryptophan'] },
    { name: 'GABA', dose: '500–750mg', window: 'evening', note: 'Calming — before bed', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/></svg>', aliases: ['gaba'] },
    { name: 'Valerian root', dose: '300–600mg', window: 'evening', note: 'Sleep onset support', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/></svg>', aliases: ['valerian'] },
    { name: 'Probiotics', dose: '10–50 billion CFU', window: 'morning', note: 'Empty stomach or with food', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><circle cx="12" cy="12" r="6"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19"/></svg>', aliases: ['probiotic'] },
    { name: 'Quercetin', dose: '500–1000mg', window: 'anytime', note: 'Pairs well with vitamin C', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10zM2 21c0-3 1.9-5.4 5.1-6"/></svg>', aliases: ['quercetin'] },
    { name: 'Curcumin', dose: '500–1000mg', window: 'lunch', note: 'With black pepper + fat', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10zM2 21c0-3 1.9-5.4 5.1-6"/></svg>', aliases: ['curcumin', 'turmeric'] },
    { name: 'Resveratrol', dose: '250–500mg', window: 'morning', note: 'With fat for absorption', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><circle cx="8" cy="14" r="2"/><circle cx="12" cy="14" r="2"/><circle cx="16" cy="14" r="2"/><circle cx="10" cy="18" r="2"/><circle cx="14" cy="18" r="2"/><path d="M12 10V4M12 4c0-1 1-2 3-2"/></svg>', aliases: ['resveratrol'] },
    { name: 'CoQ10 / Ubiquinol', dose: '100–200mg', window: 'lunch', note: 'Fat-soluble — with biggest meal', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M10.5 20.5 3.5 13.5a5 5 0 0 1 7-7l7 7a5 5 0 0 1-7 7zM8.5 8.5l7 7"/></svg>', aliases: ['coq10', 'ubiquinol'] },
    { name: 'Alpha lipoic acid', dose: '300–600mg', window: 'morning', note: 'Empty stomach for absorption', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M10.5 20.5 3.5 13.5a5 5 0 0 1 7-7l7 7a5 5 0 0 1-7 7zM8.5 8.5l7 7"/></svg>', aliases: ['ala', 'alpha lipoic'] },
    { name: 'Glutathione', dose: '250–1000mg', window: 'morning', note: 'Liposomal form for absorption', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M10.5 20.5 3.5 13.5a5 5 0 0 1 7-7l7 7a5 5 0 0 1-7 7zM8.5 8.5l7 7"/></svg>', aliases: ['glutathione'] },
    { name: 'Astaxanthin', dose: '4–12mg', window: 'lunch', note: 'Fat-soluble — with fatty meal', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M10.5 20.5 3.5 13.5a5 5 0 0 1 7-7l7 7a5 5 0 0 1-7 7zM8.5 8.5l7 7"/></svg>', aliases: ['astaxanthin'] },
    { name: 'Berberine', dose: '500mg', window: 'lunch', note: 'Before meals — glucose support', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M10.5 20.5 3.5 13.5a5 5 0 0 1 7-7l7 7a5 5 0 0 1-7 7zM8.5 8.5l7 7"/></svg>', aliases: ['berberine'] },
    { name: 'Milk thistle', dose: '200–400mg', window: 'anytime', note: 'Silymarin — liver support', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10zM2 21c0-3 1.9-5.4 5.1-6"/></svg>', aliases: ['milk thistle', 'silymarin'] },
    { name: 'Spirulina', dose: '3–5g', window: 'morning', note: 'Algae — protein and antioxidants', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M7 20h10M10 20c5.5-2.5.8-6.4 3-10M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8zM14.1 6c-.9.8-1.6 2-2.1 3.6 2.1.4 3.5-.5 4.5-1.6 1-1.1 1.5-2.5 1.5-4.5-2 .5-3 1.7-3.9 2.5z"/></svg>', aliases: ['spirulina'] },
    { name: 'Chlorella', dose: '2–4g', window: 'morning', note: 'Algae — detox support', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M7 20h10M10 20c5.5-2.5.8-6.4 3-10M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8zM14.1 6c-.9.8-1.6 2-2.1 3.6 2.1.4 3.5-.5 4.5-1.6 1-1.1 1.5-2.5 1.5-4.5-2 .5-3 1.7-3.9 2.5z"/></svg>', aliases: ['chlorella'] },
    { name: 'Tongkat ali', dose: '200–400mg', window: 'morning', note: 'Cycle 8 weeks on/off', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10zM2 21c0-3 1.9-5.4 5.1-6"/></svg>', aliases: ['tongkat', 'longjack'] },
    { name: 'Fadogia agrestis', dose: '600mg', window: 'morning', note: 'Cycle 8 weeks on/off', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10zM2 21c0-3 1.9-5.4 5.1-6"/></svg>', aliases: ['fadogia'] },
    { name: 'DHEA', dose: '25–50mg', window: 'morning', note: 'Hormonal — consult doctor', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M10.5 20.5 3.5 13.5a5 5 0 0 1 7-7l7 7a5 5 0 0 1-7 7zM8.5 8.5l7 7"/></svg>', aliases: ['dhea'] },
    { name: 'Pregnenolone', dose: '10–50mg', window: 'morning', note: 'Hormonal — consult doctor', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M10.5 20.5 3.5 13.5a5 5 0 0 1 7-7l7 7a5 5 0 0 1-7 7zM8.5 8.5l7 7"/></svg>', aliases: ['pregnenolone'] },
    { name: 'Tribulus terrestris', dose: '250–750mg', window: 'morning', note: 'Libido and energy', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10zM2 21c0-3 1.9-5.4 5.1-6"/></svg>', aliases: ['tribulus'] },
    { name: 'Maca root', dose: '1.5–3g', window: 'morning', note: 'Adaptogen — energy and libido', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10zM2 21c0-3 1.9-5.4 5.1-6"/></svg>', aliases: ['maca'] },
    { name: 'Collagen peptides', dose: '10–20g', window: 'anytime', note: 'With vitamin C for synthesis', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/></svg>', aliases: ['collagen'] },
    { name: 'Glucosamine', dose: '1500mg', window: 'lunch', note: 'With food', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M17 10c1.5 0 3 1 3 3s-1.5 3-3 3M7 14c-1.5 0-3-1-3-3s1.5-3 3-3M7 8a2 2 0 1 1 4 0M7 16a2 2 0 1 0 4 0M17 8a2 2 0 1 0-4 0M17 16a2 2 0 1 1-4 0M9 12h6"/></svg>', aliases: ['glucosamine'] },
    { name: 'Chondroitin', dose: '1200mg', window: 'lunch', note: 'Often paired with glucosamine', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M17 10c1.5 0 3 1 3 3s-1.5 3-3 3M7 14c-1.5 0-3-1-3-3s1.5-3 3-3M7 8a2 2 0 1 1 4 0M7 16a2 2 0 1 0 4 0M17 8a2 2 0 1 0-4 0M17 16a2 2 0 1 1-4 0M9 12h6"/></svg>', aliases: ['chondroitin'] },
    { name: 'MSM', dose: '1–3g', window: 'anytime', note: 'Joint support', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M17 10c1.5 0 3 1 3 3s-1.5 3-3 3M7 14c-1.5 0-3-1-3-3s1.5-3 3-3M7 8a2 2 0 1 1 4 0M7 16a2 2 0 1 0 4 0M17 8a2 2 0 1 0-4 0M17 16a2 2 0 1 1-4 0M9 12h6"/></svg>', aliases: ['msm'] },
    { name: 'Hyaluronic acid', dose: '120–200mg', window: 'anytime', note: 'Skin and joint hydration', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/></svg>', aliases: ['hyaluronic', 'ha'] },
    { name: 'Cordyceps', dose: '1–3g', window: 'morning', note: 'Energy and endurance', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M4 11a8 8 0 0 1 16 0H4zM10 11v6a2 2 0 0 0 4 0v-6"/></svg>', aliases: ['cordyceps'] },
    { name: 'Reishi', dose: '1–2g', window: 'evening', note: 'Calming adaptogen', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M4 11a8 8 0 0 1 16 0H4zM10 11v6a2 2 0 0 0 4 0v-6"/></svg>', aliases: ['reishi', 'ganoderma'] },
    { name: 'Chaga', dose: '1–2g', window: 'morning', note: 'Antioxidant and immune', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M4 11a8 8 0 0 1 16 0H4zM10 11v6a2 2 0 0 0 4 0v-6"/></svg>', aliases: ['chaga'] },
  ];

  let todayKey = `stack:taken:${getActiveDate()}`;

  function getItems() {
    const storedVersion = storeGet('stack:version');
    const stored = storeGet('stack:items');
    if (!stored || !Array.isArray(stored) || !stored.length || storedVersion !== TEMPLATE_VERSION) {
      const fresh = JSON.parse(JSON.stringify(STACK_DEFAULTS));
      storeSet('stack:items', fresh);
      storeSet('stack:version', TEMPLATE_VERSION);
      return fresh;
    }
    return stored;
  }
  function setItems(items) { storeSet('stack:items', items); }
  function getTaken() { return storeGet(todayKey) || {}; }
  function setTaken(map) { storeSet(todayKey, map); }
  function getLow() { return storeGet('stack:low') || []; }
  function setLow(arr) { storeSet('stack:low', arr); }

  function toggleTaken(id) {
    const taken = getTaken();
    if (taken[id]) delete taken[id]; else taken[id] = Date.now();
    setTaken(taken); render();
  }
  function toggleLow(id) {
    const low = getLow();
    if (low.includes(id)) setLow(low.filter(x => x !== id));
    else { low.push(id); setLow(low); }
    render();
  }
  function deleteItem(id) {
    setItems(getItems().filter(i => i.id !== id));
    const taken = getTaken();
    delete taken[id];
    setTaken(taken);
    setLow(getLow().filter(x => x !== id));
    render();
  }
  function addItem(name, dose, windowKey, note = '') {
    const v = String(name || '').trim();
    if (!v) return;
    const items = getItems();
    const id = 'custom_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    items.push({
      id, name: v,
      dose: String(dose || '').trim(),
      window: ['morning','lunch','evening','anytime'].includes(windowKey) ? windowKey : 'anytime',
      note: String(note || '').trim(),
      tag: null, ordered: true
    });
    setItems(items);
    render();
  }
  function updateItem(id, field, value) {
    const items = getItems();
    const item = items.find(i => i.id === id);
    if (!item) return;
    item[field] = value;
    setItems(items);
  }

  function render() {
    const items = getItems();
    const taken = getTaken();
    const low = getLow();
    const totalCount = items.length;
    const takenCount = items.filter(i => taken[i.id]).length;
    document.getElementById('stackProgressText').textContent =
      `${takenCount} / ${totalCount} taken today · resets at 6 AM`;
    const pct = totalCount === 0 ? 0 : (takenCount / totalCount) * 100;
    document.getElementById('stackProgressBar').style.width = pct + '%';

    const groupsEl = document.getElementById('stackGroups');
    groupsEl.innerHTML = '';

    const now = new Date();
    const nowHour = now.getHours() + (now.getMinutes() / 60);

    STACK_WINDOWS.forEach(win => {
      const winItems = items.filter(i => (i.window || 'anytime') === win.key);
      if (winItems.length === 0) return;

      const group = document.createElement('div');
      group.className = 'stack-window';
      group.innerHTML = `
        <div class="stack-window-header">
          <span class="stack-window-icon">${win.icon}</span>
          <span class="stack-window-title">${win.title}</span>
          <span class="stack-window-time">${win.time}</span>
        </div>`;

      const isPastCutoff = win.cutoffHour !== null && nowHour > win.cutoffHour;

      winItems.forEach(item => {
        const isTaken = !!taken[item.id];
        const isLow = low.includes(item.id);
        const isMissed = !isTaken && isPastCutoff;

        const row = document.createElement('div');
        row.className = 'stack-item' + (isTaken ? ' taken' : '') + (isMissed ? ' missed' : '');

        let tagHtml = '';
        if (item.tag === 'stack') tagHtml = '<span class="stack-item-tag tag-stack">stack</span>';
        else if (item.tag === 'not-ordered') tagHtml = '<span class="stack-item-tag tag-not-ordered">not ordered</span>';

        row.innerHTML = `
          <button class="stack-check ${isTaken ? 'checked' : ''}" data-action="toggle" data-id="${item.id}" aria-label="Mark taken">${isTaken ? '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>' : ''}</button>
          <div class="stack-item-body">
            <div class="stack-item-name" data-edit="name" data-id="${item.id}">
              <span class="stack-item-name-text">${escapeHtml(item.name)}</span>${tagHtml}
            </div>
            <div class="stack-item-meta" data-edit="meta" data-id="${item.id}">${escapeHtml(metaText(item))}</div>
          </div>
          <button class="stack-low-btn ${isLow ? 'is-low' : ''}" data-action="low" data-id="${item.id}">↓ Running low</button>
          <button class="stack-item-del" data-action="del" data-id="${item.id}" aria-label="Delete">×</button>`;

        group.appendChild(row);
      });

      groupsEl.appendChild(group);
    });

    if (groupsEl.children.length === 0) {
      groupsEl.innerHTML = `<div class="stack-window-empty">No items yet — add one below to start your stack.</div>`;
    }

    // Sync ticker after every render
    renderTicker();
  }

  // ====== TICKER ======
  let tickerIndex = 0;
  let tickerInterval = null;
  let cachedIssues = [];

  function getStackIssues() {
    const items = getItems();
    const taken = getTaken();
    const low = getLow();
    const now = new Date();
    const nowHour = now.getHours() + (now.getMinutes() / 60);

    const missed = [];
    const lowList = [];

    items.forEach(item => {
      const win = STACK_WINDOWS.find(w => w.key === (item.window || 'anytime'));
      const isPastCutoff = win && win.cutoffHour !== null && nowHour > win.cutoffHour;
      const isTaken = !!taken[item.id];
      if (isPastCutoff && !isTaken) {
        missed.push({
          type: 'missed',
          text: `${item.name} — missed ${win.title.toLowerCase()} dose`
        });
      }
      if (low.includes(item.id)) {
        lowList.push({
          type: 'low',
          text: `${item.name} — running low, reorder soon`
        });
      }
    });

    return [...missed, ...lowList];
  }

  function renderTicker() {
    const issues = getStackIssues();
    const tickerEl = document.getElementById('stackTicker');
    const msgEl = document.getElementById('stackTickerMsg');
    const countEl = document.getElementById('stackTickerCount');
    const totalItems = getItems().length;

    cachedIssues = issues;

    if (issues.length === 0) {
      msgEl.textContent = 'All caught up — keep it rolling';
      tickerEl.classList.remove('status-low', 'status-missed');
      countEl.textContent = `0/${totalItems}`;
      tickerIndex = 0;
      return;
    }

    const hasMissed = issues.some(i => i.type === 'missed');
    tickerEl.classList.remove('status-low', 'status-missed');
    tickerEl.classList.add(hasMissed ? 'status-missed' : 'status-low');

    if (tickerIndex >= issues.length) tickerIndex = 0;
    msgEl.textContent = issues[tickerIndex].text;
    countEl.textContent = `${issues.length}/${totalItems}`;
  }

  function cycleTicker() {
    if (cachedIssues.length <= 1) {
      renderTicker();
      return;
    }
    const msgEl = document.getElementById('stackTickerMsg');
    msgEl.classList.add('is-fading');
    setTimeout(() => {
      tickerIndex++;
      renderTicker();
      msgEl.classList.remove('is-fading');
    }, 280);
  }

  function startTicker() {
    if (tickerInterval) clearInterval(tickerInterval);
    tickerInterval = setInterval(cycleTicker, 5000);
  }

  function metaText(item) {
    const parts = [];
    if (item.dose) parts.push(item.dose);
    if (item.note) parts.push(item.note);
    return parts.join(' · ');
  }
  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  document.getElementById('stackGroups').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    e.stopPropagation();
    const id = btn.dataset.id;
    if (btn.dataset.action === 'toggle') toggleTaken(id);
    else if (btn.dataset.action === 'low') toggleLow(id);
    else if (btn.dataset.action === 'del') deleteItem(id);
  });
  document.getElementById('stackGroups').addEventListener('pointerdown', (e) => {
    const btn = e.target.closest('[data-action="del"]');
    if (!btn) return;
    e.preventDefault(); e.stopPropagation();
    deleteItem(btn.dataset.id);
  });
  document.getElementById('stackGroups').addEventListener('click', (e) => {
    const editEl = e.target.closest('[data-edit]');
    if (!editEl) return;
    if (e.target.closest('[data-action]')) return;
    if (editEl.getAttribute('contenteditable') === 'true') return;
    startEdit(editEl);
  });

  function startEdit(el) {
    const id = el.dataset.id;
    const field = el.dataset.edit;
    if (field === 'name') {
      const textSpan = el.querySelector('.stack-item-name-text');
      if (!textSpan) return;
      textSpan.setAttribute('contenteditable', 'true');
      textSpan.style.outline = '1px solid rgba(255,255,255,0.25)';
      textSpan.style.outlineOffset = '4px';
      textSpan.style.borderRadius = '4px';
      textSpan.focus();
      placeCaretAtEnd(textSpan);
      const finish = (commit) => {
        textSpan.removeAttribute('contenteditable');
        textSpan.style.outline = ''; textSpan.style.outlineOffset = '';
        if (commit) {
          const newVal = textSpan.textContent.trim();
          if (newVal) updateItem(id, 'name', newVal); else render();
        } else render();
      };
      textSpan.addEventListener('blur', () => finish(true), { once: true });
      textSpan.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); textSpan.blur(); }
        if (e.key === 'Escape') { textSpan.blur(); render(); }
      });
    }
    if (field === 'meta') {
      el.setAttribute('contenteditable', 'true');
      el.focus(); placeCaretAtEnd(el);
      const finish = (commit) => {
        el.removeAttribute('contenteditable');
        if (commit) {
          const text = el.textContent.trim();
          const parts = text.split(/\s*·\s*/);
          updateItem(id, 'dose', parts[0] || '');
          updateItem(id, 'note', parts.slice(1).join(' · '));
        }
        render();
      };
      el.addEventListener('blur', () => finish(true), { once: true });
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
        if (e.key === 'Escape') { el.blur(); render(); }
      });
    }
  }

  function placeCaretAtEnd(el) {
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  // ====== ADD FORM + SEARCH AUTOCOMPLETE ======
  const nameInput = document.getElementById('stackAddName');
  const doseInput = document.getElementById('stackAddDose');
  const winSelect = document.getElementById('stackAddWindow');
  const addBtn = document.getElementById('stackAddBtn');
  const resultsEl = document.getElementById('stackSearchResults');

  let pendingNote = ''; // hidden note auto-filled when a DB result is selected

  function searchSupplements(q) {
    const query = q.toLowerCase().trim();
    if (!query) return [];
    const starts = [];
    const contains = [];
    SUPPLEMENT_DB.forEach(s => {
      const nameLC = s.name.toLowerCase();
      const aliases = (s.aliases || []).map(a => a.toLowerCase());
      const allNames = [nameLC, ...aliases];
      if (allNames.some(n => n.startsWith(query))) starts.push(s);
      else if (allNames.some(n => n.includes(query))) contains.push(s);
    });
    return [...starts, ...contains].slice(0, 6);
  }

  function renderSearchResults(q) {
    const matches = searchSupplements(q);
    if (!q.trim() || matches.length === 0) {
      resultsEl.hidden = true;
      resultsEl.innerHTML = '';
      return;
    }
    resultsEl.hidden = false;
    resultsEl.innerHTML = matches.map(s => {
      const winMeta = STACK_WINDOWS.find(w => w.key === s.window) || STACK_WINDOWS[3];
      return `
        <button class="stack-result" data-name="${escapeHtml(s.name)}" data-dose="${escapeHtml(s.dose)}" data-window="${s.window}" data-note="${escapeHtml(s.note)}">
          <div class="stack-result-icon">${s.icon || '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M10.5 20.5 3.5 13.5a5 5 0 0 1 7-7l7 7a5 5 0 0 1-7 7zM8.5 8.5l7 7"/></svg>'}</div>
          <div class="stack-result-body">
            <div class="stack-result-name">${escapeHtml(s.name)}</div>
            <div class="stack-result-meta">${escapeHtml(s.dose)} · ${winMeta.icon} ${winMeta.title.toLowerCase()} · ${escapeHtml(s.note)}</div>
          </div>
        </button>`;
    }).join('');
  }

  nameInput.addEventListener('input', () => {
    renderSearchResults(nameInput.value);
    pendingNote = ''; // reset note if user is typing manually
  });
  nameInput.addEventListener('focus', () => {
    if (nameInput.value.trim()) renderSearchResults(nameInput.value);
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.stack-name-wrap')) resultsEl.hidden = true;
  });

  resultsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.stack-result');
    if (!btn) return;
    nameInput.value = btn.dataset.name;
    doseInput.value = btn.dataset.dose;
    winSelect.value = btn.dataset.window;
    pendingNote = btn.dataset.note;
    resultsEl.hidden = true;
    addBtn.focus();
  });

  addBtn.addEventListener('click', () => {
    addItem(nameInput.value, doseInput.value, winSelect.value, pendingNote);
    nameInput.value = '';
    doseInput.value = '';
    pendingNote = '';
    resultsEl.hidden = true;
    nameInput.focus();
  });

  [nameInput, doseInput].forEach(i => {
    i.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        // If search dropdown is open with matches, pick the first one
        if (!resultsEl.hidden && i === nameInput) {
          const firstResult = resultsEl.querySelector('.stack-result');
          if (firstResult) { e.preventDefault(); firstResult.click(); return; }
        }
        addBtn.click();
      }
      if (e.key === 'Escape') resultsEl.hidden = true;
    });
  });

  setInterval(() => {
    const newKey = `stack:taken:${getActiveDate()}`;
    if (newKey !== todayKey) todayKey = newKey;
    render();
  }, 60 * 1000);

  render();
  startTicker();
})();



document.addEventListener('DOMContentLoaded', function () {
  if (typeof initCloudSync !== 'function') return;
  initCloudSync({
    appKey: 'health',
    syncedKeys: ['stack:items', 'stack:version', 'stack:low', 'po_water_v1', 'whoop_data_v1', 'daily_checkin_v1', 'body_metrics_v1', 'hlab_insight_v1'],
    syncedPrefixes: ['stack:taken:'],
    onApplied: function () { window.dispatchEvent(new Event('storage')); }
  });
});



(function(){
'use strict';
const ICOL={green:'#6BE3A4',orange:'#F2C063',red:'#FF6B6B'};
function load(k,d){try{return JSON.parse(localStorage.getItem(k))||d;}catch(e){return d;}}
function save(k,v){localStorage.setItem(k,JSON.stringify(v));}
function todayK(){return new Date().toISOString().slice(0,10);}
function groqKey(){return localStorage.getItem('groq_api_key')||'';}

// ── DATA SOURCES ──
function whoop(){return load('whoop_data_v1',{});}
function checkin(){return load('daily_checkin_v1',{});}
function todayCheckin(){const c=checkin();return c[todayK()]||{};}
function withings(){return load('withings_data_v1',{});}
function withingsConnected(){const w=withings();return !!(w.refresh||(w.records&&w.records.length));}
// Weight logged in the (now-removed) training tab: po_coach_weights [{dateKey,weight}]
function trainingWeights(){
  try{const a=JSON.parse(localStorage.getItem('po_coach_weights'))||[];
    return a.filter(e=>e&&e.dateKey&&e.weight!=null).map(e=>({date:e.dateKey,val:Math.round(e.weight*10)/10})).sort((x,y)=>x.date.localeCompare(y.date));
  }catch(e){return[];}
}
// Body metrics: prefer Withings smart-scale; fall back to manual + training-tab weights
function bodyMetrics(){
  const manual=load('body_metrics_v1',{weight:[],bodyFat:[],muscle:[]});
  const w=withings();const recs=(w.records||[]).slice().sort((a,b)=>a.date.localeCompare(b.date));
  const out={weight:[],bodyFat:[],muscle:[]};
  recs.forEach(r=>{
    if(r.weight!=null)out.weight.push({date:r.date,val:Math.round(r.weight*10)/10});
    if(r.fat!=null)out.bodyFat.push({date:r.date,val:Math.round(r.fat*10)/10});
    if(r.muscle!=null)out.muscle.push({date:r.date,val:Math.round(r.muscle*10)/10});
  });
  // weight: Withings → manual → training-tab history
  if(!out.weight.length)out.weight=(manual.weight&&manual.weight.length)?manual.weight:trainingWeights();
  if(!out.bodyFat.length)out.bodyFat=manual.bodyFat||[];
  if(!out.muscle.length)out.muscle=manual.muscle||[];
  return out;
}
function strava(){return load('strava_data_v1',{activities:[]});}
function foodProfile(){return load('fl_profile',null);}
function foodLogToday(){return load('fl_log_'+todayK(),[]);}

// ── CALCULATED ──
function recoveryBand(v){return v>=67?'green':v>=34?'orange':'red';}
// combined recovery: whoop recovery + manual energy(1-10→%) + sleep score
function combinedRecovery(){
  const w=whoop(), ci=todayCheckin();
  const parts=[],wts=[];
  if(w.recovery!=null){parts.push(w.recovery);wts.push(0.55);}
  if(w.sleepScore!=null){parts.push(w.sleepScore);wts.push(0.25);}
  if(ci.energy!=null){parts.push(ci.energy*10);wts.push(0.20);}
  if(!parts.length)return null;
  let s=0,tw=0;parts.forEach((p,i)=>{s+=p*wts[i];tw+=wts[i];});
  return Math.round(s/tw);
}
function trainingReadiness(){
  const rec=combinedRecovery();
  const ci=todayCheckin();
  if(rec==null)return{band:'orange',score:null};
  let score=rec;
  // penalize high stress/soreness, reward good mood
  if(ci.stress!=null)score-=(ci.stress-5)*2;
  if(ci.soreness!=null)score-=(ci.soreness-5)*2;
  score=Math.max(0,Math.min(100,Math.round(score)));
  return{band:recoveryBand(score),score};
}
function cardioLoad(){
  // weekly endurance hours from Strava (this week)
  const acts=strava().activities||[];
  const ws=new Date();const dow=(ws.getDay()+6)%7;ws.setDate(ws.getDate()-dow);ws.setHours(0,0,0,0);
  let min=0,km=0;
  acts.forEach(a=>{const d=new Date(a.date);if(d>=ws){min+=(a.durationMin||0);if(['swim','bike','run'].includes(a.disc))km+=(a.distanceKm||0);}});
  return{hours:Math.round(min/60*10)/10,km:Math.round(km)};
}
function nutritionScore(){
  const p=foodProfile();if(!p||!p.daily_kcal)return null;
  const log=foodLogToday();
  const tot=log.reduce((a,e)=>({k:a.k+(e.kcal||0),p:a.p+(e.protein||0)}),{k:0,p:0});
  const kPct=Math.min(1,tot.k/p.daily_kcal);
  const pPct=p.daily_protein?Math.min(1,tot.p/p.daily_protein):kPct;
  return Math.round((kPct*0.5+pPct*0.5)*100);
}
function hrvBaseline(){
  const h=whoop().history||{};const vals=Object.values(h).map(x=>x.hrv).filter(v=>v!=null);
  if(!vals.length)return null;
  const last30=vals.slice(-30);
  return Math.round(last30.reduce((a,b)=>a+b,0)/last30.length);
}

// trend arrow from a value vs previous
function trendArrow(cur,prev,goodUp){
  if(cur==null||prev==null)return'';
  const d=cur-prev;if(Math.abs(d)<0.01)return'<span style="color:#76746E">→</span>';
  const up=d>0;const good=goodUp?up:!up;
  const col=good?'#6BE3A4':'#FF6B6B';
  return'<span style="color:'+col+'">'+(up?'▲':'▼')+' '+Math.abs(Math.round(d*10)/10)+'</span>';
}
function hrvSeries(){
  const h=whoop().history||{};
  return Object.keys(h).sort().map(d=>({d,v:h[d].hrv})).filter(x=>x.v!=null);
}
function sparkline(vals,color){
  if(!vals||vals.length<2)return'';
  const min=Math.min(...vals),max=Math.max(...vals),r=max-min||1;
  const pts=vals.map((v,i)=>(i/(vals.length-1)*100).toFixed(1)+','+(20-((v-min)/r)*18).toFixed(1)).join(' ');
  return'<svg class="hl-spark" viewBox="0 0 100 20" preserveAspectRatio="none"><polyline points="'+pts+'" fill="none" stroke="'+(color||'#7DD3FC')+'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}

// ── ICONS ──
const I={
  recovery:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
  hrv:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l2-7 4 14 2-7h6"/></svg>',
  heart:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z"/></svg>',
  sleep:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/></svg>',
  strain:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 3 14h9l-1 8 10-12h-9z"/></svg>',
  lungs:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v8M8 22c-2 0-3-1.5-3-4 0-3 1-5 1-8a2 2 0 0 1 4 0M16 22c2 0 3-1.5 3-4 0-3-1-5-1-8a2 2 0 0 0-4 0"/></svg>',
  temp:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/></svg>',
  o2:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5S12.5 4 12 2c-.5 2-2 3.9-4 5.5S5 13 5 15a7 7 0 0 0 7 7z"/></svg>',
  bolt:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 3 14h9l-1 8 10-12h-9z"/></svg>',
  mood:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/></svg>',
  scale:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="2"/><path d="M5 21V8h14v13zM9 21v-7M15 21v-7"/></svg>',
  food:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v7c0 1 1 2 2 2s2-1 2-2V3M5 12v9M19 3v18M16 3c-1 1-2 3-2 6 0 2 1 3 2 3h2"/></svg>',
  run:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="14" cy="5" r="2"/><path d="M11 21l1.5-5-3-2 2-5 3 2 2 1M7 12l2-4M13 16l3 1 1 4M9 21l1-4"/></svg>'
};

// ── RENDER ──
function render(){
  const root=document.getElementById('healthLab');if(!root)return;
  const w=whoop(), ci=todayCheckin();
  const rec=combinedRecovery();
  const readiness=trainingReadiness();
  const series=hrvSeries();
  const baseline=hrvBaseline();
  const cardio=cardioLoad();
  const nutri=nutritionScore();
  const body=bodyMetrics();

  // hero ring
  const band=rec!=null?recoveryBand(rec):'orange';
  const ringCol=ICOL[band];
  const circ=2*Math.PI*52;
  const off=rec!=null?circ*(1-rec/100):circ;
  const readyLabel=readiness.band==='green'?'Ready to train':readiness.band==='orange'?'Train moderately':'Prioritize recovery';
  const readySub=readiness.band==='green'?'Your body is primed — green light for hard sessions.':readiness.band==='orange'?'Capacity is moderate — keep intensity controlled.':'Signals point to rest — keep it light or recover.';

  // metric helper
  function metric(name,ico,valHtml,trend,onclick,extra){
    return'<div class="hl-metric" onclick="'+onclick+'">'
      +'<div class="hl-metric-top"><span class="hl-metric-ico">'+ico+'</span><span class="hl-metric-trend">'+(trend||'')+'</span></div>'
      +'<div class="hl-metric-val">'+valHtml+'</div><div class="hl-metric-name">'+name+'</div>'+(extra||'')+'</div>';
  }
  const v=(x,u)=>x!=null?x+(u?'<span class="hl-metric-unit"> '+u+'</span>':''):'<span style="color:#4D4B47">—</span>';

  // trends from history
  const hist=w.history||{};const days=Object.keys(hist).sort();
  const prev=days.length>1?hist[days[days.length-2]]:{};

  // sleep stage bar
  let stageBar='';
  if(w.sleepStages){const s=w.sleepStages;const tot=(s.rem+s.deep+s.light+s.awake)||1;
    stageBar='<div class="hl-stage-bar">'
      +'<div style="width:'+(s.rem/tot*100)+'%;background:#7DD3FC"></div>'
      +'<div style="width:'+(s.deep/tot*100)+'%;background:#4D7CFE"></div>'
      +'<div style="width:'+(s.light/tot*100)+'%;background:#76746E"></div>'
      +'<div style="width:'+(s.awake/tot*100)+'%;background:#38362F"></div></div>';
  }

  // body weight latest
  const wLast=body.weight&&body.weight.length?body.weight[body.weight.length-1].val:null;
  const wPrev=body.weight&&body.weight.length>1?body.weight[body.weight.length-2].val:null;
  const bfLast=body.bodyFat&&body.bodyFat.length?body.bodyFat[body.bodyFat.length-1].val:null;
  const mmLast=body.muscle&&body.muscle.length?body.muscle[body.muscle.length-1].val:null;

  root.innerHTML=
  '<div class="hl-wrap"><div class="hl-title">Health Lab</div>'
  +'<div class="hl-card">'
    // hero
    +'<div class="hl-hero">'
      +'<div class="hl-ring"><svg viewBox="0 0 120 120"><circle class="hl-ring-track" cx="60" cy="60" r="52"/>'
        +'<circle class="hl-ring-fill" cx="60" cy="60" r="52" stroke="'+ringCol+'" stroke-dasharray="'+circ.toFixed(1)+'" stroke-dashoffset="'+off.toFixed(1)+'"/></svg>'
        +'<div class="hl-ring-c"><div class="hl-ring-num" style="color:'+ringCol+'">'+(rec!=null?rec:'—')+'</div><div class="hl-ring-lbl">Recovery</div></div></div>'
      +'<div class="hl-readiness"><div class="hl-readiness-status" style="color:'+ICOL[readiness.band]+'">'+readyLabel+'</div>'
        +'<div class="hl-readiness-sub">'+readySub+'</div></div>'
    +'</div>'
    // AI insight
    +'<div class="hl-insight" id="hlInsight"><span class="hl-insight-ico">'+I.bolt+'</span><span id="hlInsightText">'+(insightCached()||'Tap to generate your daily insight…')+'</span></div>'
    // metric grid
    +'<div class="hl-grid">'
      +metric('HRV',I.hrv,v(w.hrv,'ms'),trendArrow(w.hrv,prev.hrv,true),"hlOpen('hrv')",sparkline(series.slice(-10).map(x=>x.v),'#7DD3FC'))
      +metric('Resting HR',I.heart,v(w.rhr,'bpm'),trendArrow(w.rhr,prev.rhr,false),"hlOpen('rhr')")
      +metric('Sleep',I.sleep,v(w.sleepScore,'%'),'',"hlOpen('sleep')",w.sleepDurationMin?'<div class="hl-metric-name" style="margin-top:4px">'+Math.floor(w.sleepDurationMin/60)+'h '+(w.sleepDurationMin%60)+'m</div>'+stageBar:'')
      +metric('Strain',I.strain,v(w.strain),'',"hlOpen('strain')")
      +metric('Resp. Rate',I.lungs,v(w.respiratory,'rpm'),'',"hlOpen('resp')")
      +metric('SpO₂',I.o2,v(w.spo2!=null?w.spo2.toFixed(0):null,'%'),'',"hlOpen('spo2')")
      +metric('Skin Temp',I.temp,v(w.skinTemp!=null?w.skinTemp.toFixed(1):null,'°C'),'',"hlOpen('skin')")
      +metric('Cardio Load',I.run,v(cardio.hours,'h'),'',"hlOpen('cardio')",'<div class="hl-metric-name" style="margin-top:3px">'+cardio.km+' km this wk</div>')
      +metric('Nutrition',I.food,v(nutri,'%'),'',"hlOpen('nutrition')")
      +metric('Weight',I.scale,v(wLast,'kg'),trendArrow(wLast,wPrev,false),"hlOpen('weight')")
      +metric('Body Fat',I.scale,v(bfLast,'%'),'',"hlOpen('bodyFat')")
      +metric('Muscle',I.scale,v(mmLast,'kg'),'',"hlOpen('muscle')")
    +'</div>'
    // hrv chart
    +'<div class="hl-chart-card"><div class="hl-chart-head"><span class="hl-chart-title">HRV · last 7 days</span>'
      +'<span class="hl-chart-base">'+(baseline?'baseline '+baseline+'ms':'')+'</span></div>'
      +hrvChart(series.slice(-7),baseline)+'</div>'
    // Withings body composition
    +withingsCard()
    // daily check-in
    +'<div style="margin-top:16px;padding-top:16px;border-top:1px solid rgba(255,255,255,.06)">'
      +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><span style="font-size:13px;font-weight:700;color:var(--text-secondary,#B8B6B0)">Daily check-in</span>'
        +'<span class="hl-sub-link" onclick="hlOpenBody()">Log body metrics</span></div>'
      +checkinUI(ci)
    +'</div>'
  +'</div></div>';
}

function hrvChart(series,baseline){
  if(series.length<2)return'<div class="hl-empty" style="padding:18px">Not enough HRV data yet — sync WHOOP a few days.</div>';
  const vals=series.map(x=>x.v);
  let min=Math.min(...vals),max=Math.max(...vals);
  if(baseline){min=Math.min(min,baseline);max=Math.max(max,baseline);}
  const r=(max-min)||1;const pad=8,W=320,H=90;
  const pts=series.map((x,i)=>[pad+(W-2*pad)*(i/(series.length-1)),H-pad-(H-2*pad)*((x.v-min)/r)]);
  const path=pts.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' ');
  const area=path+' L '+pts[pts.length-1][0].toFixed(1)+' '+(H-pad)+' L '+pts[0][0].toFixed(1)+' '+(H-pad)+' Z';
  let baseLine='';
  if(baseline){const by=H-pad-(H-2*pad)*((baseline-min)/r);baseLine='<line x1="'+pad+'" y1="'+by.toFixed(1)+'" x2="'+(W-pad)+'" y2="'+by.toFixed(1)+'" stroke="rgba(255,255,255,.25)" stroke-width="1" stroke-dasharray="4 3"/>';}
  return'<svg class="hl-chart" viewBox="0 0 320 90" preserveAspectRatio="none">'
    +'<defs><linearGradient id="hlHrvG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#7DD3FC" stop-opacity=".25"/><stop offset="100%" stop-color="#7DD3FC" stop-opacity="0"/></linearGradient></defs>'
    +'<path d="'+area+'" fill="url(#hlHrvG)"/>'+baseLine
    +'<path d="'+path+'" fill="none" stroke="#7DD3FC" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>'
    +pts.map(p=>'<circle cx="'+p[0].toFixed(1)+'" cy="'+p[1].toFixed(1)+'" r="2.5" fill="#7DD3FC"/>').join('')+'</svg>';
}

function checkinUI(ci){
  const rows=[['energy','Energy'],['mood','Mood'],['stress','Stress'],['soreness','Soreness']];
  return'<div class="hl-checkin">'+rows.map(([k,label])=>{
    const val=ci[k]!=null?ci[k]:5;
    return'<div class="hl-ci-row"><div class="hl-ci-label"><span>'+label+'</span><span class="hl-ci-val" id="hlci-'+k+'">'+val+'</span></div>'
      +'<input type="range" min="1" max="10" value="'+val+'" class="hl-ci-slider" oninput="document.getElementById(\'hlci-'+k+'\').textContent=this.value" data-ci="'+k+'"></div>';
  }).join('')+'</div>'
  +'<button class="hl-btn pri" onclick="hlSaveCheckin()">Save check-in</button>';
}
window.hlSaveCheckin=function(){
  const c=load('daily_checkin_v1',{});const day={};
  document.querySelectorAll('[data-ci]').forEach(el=>{day[el.dataset.ci]=parseInt(el.value);});
  c[todayK()]=day;save('daily_checkin_v1',c);
  render();
};

// ── DETAIL MODALS ──
function hlOpenModal(html){document.getElementById('hlModalPanel').innerHTML='<div class="hl-modal-handle"></div>'+html;document.getElementById('hlModal').classList.add('open');}
window.hlCloseModal=function(){document.getElementById('hlModal').classList.remove('open');};
window.hlOpen=function(key){
  const w=whoop();const hist=w.history||{};const days=Object.keys(hist).sort().reverse();
  const titles={hrv:'HRV',rhr:'Resting Heart Rate',sleep:'Sleep Score',strain:'Strain',resp:'Respiratory Rate',spo2:'Blood Oxygen',skin:'Skin Temp',cardio:'Cardio Load',nutrition:'Nutrition Score',weight:'Weight',bodyFat:'Body Fat %',muscle:'Muscle Mass'};
  const histKey={hrv:'hrv',rhr:'rhr',sleep:'sleepScore'}[key];
  const bodyKey={weight:'weight',bodyFat:'bodyFat',muscle:'muscle'}[key];
  let body='';
  if(histKey){
    const rows=days.map(d=>({d,v:hist[d][histKey]})).filter(x=>x.v!=null);
    body=rows.length?rows.map(r=>'<div class="hl-hist-row"><span class="hl-hist-date">'+r.d+'</span><span class="hl-hist-val">'+r.v+'</span></div>').join(''):'<div class="hl-empty">No history yet.</div>';
  } else if(bodyKey){
    const b=bodyMetrics()[bodyKey]||[];
    body='<button class="hl-btn pri" style="margin-bottom:14px" onclick="hlOpenBody()">+ Log new value</button>'
      +(b.length?b.slice().reverse().map(r=>'<div class="hl-hist-row"><span class="hl-hist-date">'+r.date+'</span><span class="hl-hist-val">'+r.val+'</span></div>').join(''):'<div class="hl-empty">No entries yet.</div>');
  } else {
    body='<div class="hl-empty">Live metric from WHOOP — current value shown on the dashboard.</div>';
  }
  hlOpenModal('<div class="hl-modal-title">'+(titles[key]||key)+'</div><div class="hl-modal-sub">History</div>'+body+'<button class="hl-btn sec" onclick="hlCloseModal()" style="margin-top:8px">Close</button>');
};
window.hlOpenBody=function(){
  hlOpenModal('<div class="hl-modal-title">Log Body Metrics</div><div class="hl-modal-sub">Leave blank to skip</div>'
    +'<div class="hl-field"><label>Weight (kg)</label><input type="number" id="hlbWeight" step="0.1"></div>'
    +'<div class="hl-field"><label>Body Fat (%)</label><input type="number" id="hlbBF" step="0.1"></div>'
    +'<div class="hl-field"><label>Muscle Mass (kg)</label><input type="number" id="hlbMM" step="0.1"></div>'
    +'<button class="hl-btn pri" onclick="hlSaveBody()">Save</button>'
    +'<button class="hl-btn sec" onclick="hlCloseModal()">Cancel</button>');
};
window.hlSaveBody=function(){
  const b=bodyMetrics();const d=todayK();
  const add=(arr,id)=>{const x=parseFloat(document.getElementById(id).value);if(!isNaN(x))arr.push({date:d,val:x});};
  add(b.weight,'hlbWeight');add(b.bodyFat,'hlbBF');add(b.muscle,'hlbMM');
  save('body_metrics_v1',b);hlCloseModal();render();
};

// ── AI INSIGHT (cached once/day) ──
function insightCached(){const c=load('hlab_insight_v1',{});return c.date===todayK()?c.text:null;}
async function genInsight(){
  if(insightCached())return;
  const key=groqKey();if(!key)return;
  const w=whoop(),ci=todayCheckin(),base=hrvBaseline(),cardio=cardioLoad(),nutri=nutritionScore();
  const ctx='Recovery '+(combinedRecovery()??'?')+'%, HRV '+(w.hrv??'?')+'ms (baseline '+(base??'?')+'), RHR '+(w.rhr??'?')+', sleep '+(w.sleepScore??'?')+'%, strain '+(w.strain??'?')+', energy '+(ci.energy??'?')+'/10, stress '+(ci.stress??'?')+'/10, soreness '+(ci.soreness??'?')+'/10, weekly cardio '+cardio.hours+'h, nutrition '+(nutri??'?')+'%.';
  try{
    const r=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},
      body:JSON.stringify({model:'llama-3.3-70b-versatile',messages:[
        {role:'system',content:'You are a concise health coach. Give exactly ONE short sentence of actionable insight based on the metrics (e.g. "HRV is 15% below baseline — keep today easy"). No preamble.'},
        {role:'user',content:ctx}],max_tokens:60,temperature:0.5})});
    const data=await r.json();if(!r.ok)return;
    const text=(data.choices&&data.choices[0]&&data.choices[0].message&&data.choices[0].message.content||'').trim().replace(/^["']|["']$/g,'');
    if(text){save('hlab_insight_v1',{date:todayK(),text});const el=document.getElementById('hlInsightText');if(el)el.textContent=text;}
  }catch(e){}
}
// tap insight to (re)generate
document.addEventListener('click',function(e){
  if(e.target.closest&&e.target.closest('#hlInsight')){
    if(!groqKey()){const el=document.getElementById('hlInsightText');if(el)el.textContent='Add a Groq key in dashboard Settings for daily insights.';return;}
    const el=document.getElementById('hlInsightText');if(el)el.textContent='Thinking…';
    save('hlab_insight_v1',{});genInsight();
  }
});

// ── WITHINGS BODY COMPOSITION CARD ──
function wRecords(){const w=withings();return (w.records||[]).slice().sort((a,b)=>a.date.localeCompare(b.date));}
function wAvg(recs,key,days){
  const cut=Date.now()-days*864e5;
  const vals=recs.filter(r=>new Date(r.date).getTime()>=cut&&r[key]!=null).map(r=>r[key]);
  if(!vals.length)return null;return Math.round(vals.reduce((a,b)=>a+b,0)/vals.length*10)/10;
}
function withingsCard(){
  if(!withingsConnected()){
    return '<div style="margin-top:16px;padding-top:16px;border-top:1px solid rgba(255,255,255,.06)">'
      +'<div style="display:flex;align-items:center;gap:12px">'
      +'<div style="width:38px;height:38px;border-radius:10px;background:rgba(0,150,136,.15);display:flex;align-items:center;justify-content:center;color:#26d0b0">'+I.scale+'</div>'
      +'<div style="flex:1"><div style="font-size:14px;font-weight:700">Withings Smart Scale</div><div style="font-size:12px;color:var(--text-tertiary,#76746E)">Connect for automatic body composition</div></div>'
      +'<button class="hl-btn pri" style="width:auto;margin:0;padding:9px 16px;background:#00b8a9;color:#fff" onclick="window.withingsConnect&&window.withingsConnect()">Connect</button></div></div>';
  }
  const recs=wRecords();const w=withings();
  if(!recs.length)return '<div style="margin-top:16px" class="hl-empty">Withings connected — syncing measurements…</div>';
  const last=recs[recs.length-1], prev=recs.length>1?recs[recs.length-2]:{};
  const goal=w.goalWeight||null;

  // metric row helper with change vs last
  function row(name,key,unit,goodUp,dec){
    if(last[key]==null)return'';
    const cur=Math.round(last[key]*(dec?10:1))/(dec?10:1);
    let ch='';
    if(prev[key]!=null){const d=last[key]-prev[key];const up=d>0;const good=goodUp?up:!up;
      ch='<span style="font-size:11px;font-weight:700;color:'+(Math.abs(d)<.05?'#76746E':good?'#6BE3A4':'#FF6B6B')+'">'+(Math.abs(d)<.05?'→':(up?'▲':'▼')+' '+Math.abs(Math.round(d*10)/10)+unit)+'</span>';}
    return'<div class="hl-hist-row"><span class="hl-hist-date" style="color:var(--text-secondary,#B8B6B0);font-size:13px">'+name+'</span><span><span class="hl-hist-val">'+cur+unit+'</span> '+ch+'</span></div>';
  }

  // weight progress to goal
  let goalHtml='';
  if(goal&&last.weight!=null){
    const start=recs[0].weight||last.weight;
    const total=Math.abs(start-goal)||1;const done=Math.abs(start-last.weight);
    const pct=Math.min(100,Math.round(done/total*100));
    goalHtml='<div style="margin-top:12px"><div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:5px"><span style="color:var(--text-secondary,#B8B6B0)">Goal '+goal+'kg</span><span style="color:var(--text-tertiary,#76746E)">'+pct+'%</span></div>'
      +'<div style="height:6px;background:rgba(255,255,255,.08);border-radius:3px;overflow:hidden"><div style="height:100%;width:'+pct+'%;background:#00b8a9;border-radius:3px"></div></div></div>';
  }

  const wkAvg=wAvg(recs,'weight',7), moAvg=wAvg(recs,'weight',30);
  const muscleTrend=wAvg(recs,'muscle',7), muscleTrendOld=wAvg(recs,'muscle',30);
  const fatTrend=wAvg(recs,'fatMass',7), fatTrendOld=wAvg(recs,'fatMass',30);
  let trendNote='';
  if(muscleTrend!=null&&muscleTrendOld!=null){const md=muscleTrend-muscleTrendOld;trendNote+='<span style="color:'+(md>=0?'#6BE3A4':'#FF6B6B')+'">Muscle '+(md>=0?'+':'')+Math.round(md*10)/10+'kg</span> · ';}
  if(fatTrend!=null&&fatTrendOld!=null){const fd=fatTrend-fatTrendOld;trendNote+='<span style="color:'+(fd<=0?'#6BE3A4':'#FF6B6B')+'">Fat '+(fd>=0?'+':'')+Math.round(fd*10)/10+'kg</span>';}

  return '<div style="margin-top:16px;padding-top:16px;border-top:1px solid rgba(255,255,255,.06)">'
    +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><span style="font-size:13px;font-weight:700;color:var(--text-secondary,#B8B6B0)">Body Composition · Withings</span>'
      +'<span class="hl-sub-link" onclick="window.withingsSetGoal&&window.withingsSetGoal()">'+(goal?'Goal '+goal+'kg':'Set goal')+'</span></div>'
    // big weight + chart
    +'<div style="display:flex;align-items:baseline;gap:10px;margin-bottom:2px"><span style="font-size:30px;font-weight:800;letter-spacing:-1px">'+(last.weight!=null?Math.round(last.weight*10)/10:'—')+'<span style="font-size:15px;color:var(--text-tertiary,#76746E);font-weight:600"> kg</span></span>'
      +(prev.weight!=null?'<span style="font-size:13px;font-weight:700;color:'+(last.weight<=prev.weight?'#6BE3A4':'#FF6B6B')+'">'+(last.weight>prev.weight?'▲':'▼')+' '+Math.abs(Math.round((last.weight-prev.weight)*10)/10)+'kg</span>':'')+'</div>'
    +'<div style="font-size:12px;color:var(--text-tertiary,#76746E);margin-bottom:8px">7-day avg '+(wkAvg||'—')+'kg · 30-day '+(moAvg||'—')+'kg'+(trendNote?' · '+trendNote:'')+'</div>'
    +weightChart(recs.slice(-30),goal)
    +goalHtml
    // donut + metrics
    +'<div style="display:flex;gap:16px;align-items:center;margin-top:16px;flex-wrap:wrap">'
      +bodyDonut(last)
      +'<div style="flex:1;min-width:160px">'
        +row('Body Fat','fat','%',false,true)
        +row('Fat Mass','fatMass','kg',false,true)
        +row('Muscle Mass','muscle','kg',true,true)
        +row('Lean Mass','lean','kg',true,true)
        +row('Bone Mass','bone','kg',true,true)
        +row('Body Water','waterPct','%',true,true)
      +'</div>'
    +'</div>'
    // extra metrics
    +'<div style="margin-top:6px">'
      +row('Visceral Fat','visceral','',false,false)
      +row('BMI','bmi','',false,true)
      +row('Pulse Wave Vel.','pwv',' m/s',false,true)
      +row('Heart Rate','hr',' bpm',false,false)
      +(last.metabolicAge!=null?row('Metabolic Age','metabolicAge',' yr',false,false):'')
    +'</div>'
    +'<button class="hl-btn sec" style="margin-top:12px" onclick="window.hlBodyAI&&window.hlBodyAI()">'+I.bolt+' AI body-composition analysis</button>'
    +'<div id="hlBodyAiOut" style="display:none;margin-top:10px;padding:12px 14px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:12px;font-size:13.5px;line-height:1.6;color:var(--text-secondary,#B8B6B0)"></div>'
  +'</div>';
}
function bodyDonut(last){
  // masses: fat, muscle (or lean), bone, water
  const fat=last.fatMass||0, bone=last.bone||0, water=last.water||0;
  const muscle=(last.muscle!=null?last.muscle:(last.lean||0))-water-bone; // approx soft-lean excl water/bone
  const segs=[['Fat',Math.max(0,fat),'#F2C063'],['Muscle',Math.max(0,muscle),'#6BE3A4'],['Water',Math.max(0,water),'#7DD3FC'],['Bone',Math.max(0,bone),'#B8B6B0']];
  const total=segs.reduce((a,s)=>a+s[1],0)||1;
  let off=0;const r=34,circ=2*Math.PI*r;
  const arcs=segs.map(([n,v,c])=>{const frac=v/total;const dash=frac*circ;const el='<circle cx="45" cy="45" r="'+r+'" fill="none" stroke="'+c+'" stroke-width="12" stroke-dasharray="'+dash.toFixed(1)+' '+(circ-dash).toFixed(1)+'" stroke-dashoffset="'+(-off).toFixed(1)+'" transform="rotate(-90 45 45)"/>';off+=dash;return el;}).join('');
  const legend=segs.filter(s=>s[1]>0).map(([n,v,c])=>'<div style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--text-secondary,#B8B6B0)"><span style="width:8px;height:8px;border-radius:2px;background:'+c+'"></span>'+n+' '+Math.round(v*10)/10+'kg</div>').join('');
  return'<div style="display:flex;flex-direction:column;align-items:center;gap:8px"><svg width="90" height="90" viewBox="0 0 90 90">'+arcs+'</svg><div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 10px">'+legend+'</div></div>';
}
function weightChart(recs,goal){
  const pts0=recs.filter(r=>r.weight!=null);
  if(pts0.length<2)return'';
  const vals=pts0.map(r=>r.weight);let min=Math.min(...vals),max=Math.max(...vals);
  if(goal){min=Math.min(min,goal);max=Math.max(max,goal);}
  const r=(max-min)||1;const pad=8,W=320,H=80;
  const pts=pts0.map((x,i)=>[pad+(W-2*pad)*(i/(pts0.length-1)),H-pad-(H-2*pad)*((x.weight-min)/r)]);
  const path=pts.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' ');
  const area=path+' L '+pts[pts.length-1][0].toFixed(1)+' '+(H-pad)+' L '+pts[0][0].toFixed(1)+' '+(H-pad)+' Z';
  let goalLine='';if(goal){const gy=H-pad-(H-2*pad)*((goal-min)/r);goalLine='<line x1="'+pad+'" y1="'+gy.toFixed(1)+'" x2="'+(W-pad)+'" y2="'+gy.toFixed(1)+'" stroke="#00b8a9" stroke-width="1.2" stroke-dasharray="4 3"/>';}
  return'<svg style="width:100%;height:80px" viewBox="0 0 320 80" preserveAspectRatio="none">'
    +'<defs><linearGradient id="hlWg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#00b8a9" stop-opacity=".22"/><stop offset="100%" stop-color="#00b8a9" stop-opacity="0"/></linearGradient></defs>'
    +'<path d="'+area+'" fill="url(#hlWg)"/>'+goalLine
    +'<path d="'+path+'" fill="none" stroke="#00b8a9" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}
window.withingsSetGoal=function(){
  const w=withings();const g=prompt('Goal weight (kg):',w.goalWeight||'');
  if(g===null)return;const v=parseFloat(g);
  if(!isNaN(v)){w.goalWeight=v;save('withings_data_v1',w);render();}
};
// AI body-composition analysis (weight trend vs calories vs training)
window.hlBodyAI=async function(){
  const out=document.getElementById('hlBodyAiOut');if(!out)return;
  if(!groqKey()){out.style.display='block';out.textContent='Add a Groq key in dashboard Settings for AI analysis.';return;}
  out.style.display='block';out.textContent='Analyzing your body composition trends…';
  const recs=wRecords();const last=recs[recs.length-1]||{};
  const wk=wAvg(recs,'weight',7),mo=wAvg(recs,'weight',30);
  const mus7=wAvg(recs,'muscle',7),mus30=wAvg(recs,'muscle',30);
  const fat7=wAvg(recs,'fatMass',7),fat30=wAvg(recs,'fatMass',30);
  // calories from food tracker (today + profile target)
  const fp=foodProfile();const cal=fp?fp.daily_kcal:'?';
  const cardio=cardioLoad();
  const ctx='Weight now '+(last.weight||'?')+'kg (7d avg '+(wk||'?')+', 30d '+(mo||'?')+'). Body fat '+(last.fat||'?')+'%. Muscle 7d '+(mus7||'?')+' vs 30d '+(mus30||'?')+'kg. Fat mass 7d '+(fat7||'?')+' vs 30d '+(fat30||'?')+'kg. Daily calorie target '+cal+'. Weekly cardio '+cardio.hours+'h, '+cardio.km+'km.';
  try{
    const r=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+groqKey()},
      body:JSON.stringify({model:'llama-3.3-70b-versatile',messages:[
        {role:'system',content:'You are a body-composition coach. In 2-3 sentences, analyze whether the athlete is gaining muscle / losing fat given their weight trend, calorie target, and training load, and give one concrete recommendation.'},
        {role:'user',content:ctx}],max_tokens:160,temperature:0.5})});
    const data=await r.json();if(!r.ok)throw new Error((data.error&&data.error.message)||'failed');
    out.textContent=(data.choices&&data.choices[0]&&data.choices[0].message&&data.choices[0].message.content||'').trim();
  }catch(e){out.textContent='Analysis failed: '+(e.message||e);}
};

// ── BOOT ──
window.hlRender=render; // allow the WHOOP card (same document) to refresh the lab
render();
window.addEventListener('storage',e=>{if(['whoop_data_v1','daily_checkin_v1','body_metrics_v1','strava_data_v1','hlab_insight_v1','withings_data_v1'].includes(e.key)||(e.key||'').indexOf('fl_log_')===0)render();});
setTimeout(genInsight,1500); // auto-generate once per day shortly after load
})();



(function(){
  function reorder(){
    var main=document.querySelector('main');if(!main)return;
    var order=['#hsecNutrition','#water','.whoop-section','#healthLab','#hsecStack'];
    order.forEach(function(sel){var el=main.querySelector(sel);if(el)main.appendChild(el);});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',reorder);
  else reorder();
})();



(function(){
'use strict';
const WK='withings_data_v1';
const CLIENT_ID='cc3bffc6d3c20c406ec9c812518c928cb9d14cb31267d863237308b90f9bfef9';
const REDIRECT='https://row-gray.vercel.app/api/withings-callback';
function load(){try{return JSON.parse(localStorage.getItem(WK))||{};}catch{return{};}}
function save(s){localStorage.setItem(WK,JSON.stringify(s));}

// Withings measure type codes → our field names (value already scaled)
const TYPE={1:'weight',5:'lean',6:'fat',8:'fatMass',11:'hr',12:'temp',76:'muscle',77:'water',88:'bone',91:'pwv',155:'vascularAge',170:'visceral',4:'height',226:'metabolicAge'};

window.withingsConnect=function(){
  const url='https://account.withings.com/oauth2_user/authorize2?response_type=code&client_id='+CLIENT_ID
    +'&scope=user.metrics&redirect_uri='+encodeURIComponent(REDIRECT)+'&state=hl'+Date.now();
  try{(window.top||window).location.href=url;}catch(e){location.href=url;}
};

async function accessToken(){
  const s=load();
  if(s.access && s.expires && Date.now() < s.expires-60000) return s.access;
  if(!s.refresh) return null;
  const r=await fetch('/api/withings-refresh',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({refresh_token:s.refresh})});
  const j=await r.json().catch(()=>({}));
  if(!r.ok||!j.access_token) throw new Error(j.error||'refresh failed');
  s.access=j.access_token; if(j.refresh_token)s.refresh=j.refresh_token;
  s.expires=Date.now()+(j.expires_in||10800)*1000; save(s);
  return s.access;
}

function parseMeasures(json){
  const grps=json && json.body && json.body.measuregrps;
  if(!Array.isArray(grps))return null;
  let height=null;
  const byDay={};
  grps.forEach(g=>{
    const day=new Date((g.date||0)*1000).toISOString().slice(0,10);
    const rec=byDay[day]||(byDay[day]={date:day});
    (g.measures||[]).forEach(m=>{
      const field=TYPE[m.type]; if(!field)return;
      const val=m.value*Math.pow(10,m.unit);
      if(field==='height'){height=val;return;}
      rec[field]=val;
    });
  });
  // derive water%, BMI per record
  Object.values(byDay).forEach(r=>{
    if(r.water!=null&&r.weight)r.waterPct=Math.round(r.water/r.weight*1000)/10;
    if(r.weight&&height)r.bmi=Math.round(r.weight/(height*height)*10)/10;
  });
  return {records:Object.values(byDay).sort((a,b)=>a.date.localeCompare(b.date)), height};
}

async function fetchAll(){
  try{
    const token=await accessToken(); if(!token)return;
    // last ~2 years of body-composition measures
    const startdate=Math.floor(Date.now()/1000)-2*365*24*3600;
    const r=await fetch('/api/withings-data?startdate='+startdate,{headers:{'Authorization':'Bearer '+token}});
    const j=await r.json().catch(()=>({}));
    if(!r.ok){console.warn('[withings]',j.error||r.status);return;}
    const parsed=parseMeasures(j); if(!parsed)return;
    const s=load();
    s.records=parsed.records; if(parsed.height)s.height=parsed.height; s.updated=Date.now();
    save(s);
    if(window.hlRender)try{window.hlRender();}catch(e){}
  }catch(e){console.warn('[withings] fetch',e.message);}
}

// Capture OAuth tokens on return, then go back to the dashboard shell
(function(){
  if(location.hash.indexOf('withings_refresh=')>=0){
    const p=new URLSearchParams(location.hash.slice(1));
    const s=load();
    s.access=p.get('withings_access')||s.access;
    s.refresh=p.get('withings_refresh')||s.refresh;
    s.expires=parseInt(p.get('withings_expires'))||s.expires;
    save(s);
    if(window.self===window.top){ history.replaceState(null,'',location.pathname); location.replace('/'); return; }
    history.replaceState(null,'',location.pathname+location.search);
  }
})();

// Auto-fetch on every dashboard open (if connected)
if(load().refresh) fetchAll();
window.withingsSync=fetchAll;
})();
})();