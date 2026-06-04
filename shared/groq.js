window.groqKey = () => localStorage.getItem('groq_api_key') || '';

/* ──────────────────────────────────────────────────────────────
   Goal helpers — shared shape stored under `training_goals_v1`.
   A goal: { id, name, sport, date:'YYYY-MM-DD', priority:'A'|'B'|'C',
             target, notes, startDate, order }
   ────────────────────────────────────────────────────────────── */
window.loadGoals = function() {
  try { return JSON.parse(localStorage.getItem('training_goals_v1')) || []; }
  catch (e) { return []; }
};

window.goalDaysRemaining = function(dateStr) {
  if (!dateStr) return Infinity;
  const t = new Date(); t.setHours(0,0,0,0);
  const d = new Date(dateStr + 'T00:00:00');
  return Math.round((d - t) / 86400000);
};

window.goalStatus = function(dateStr) {
  const dr = window.goalDaysRemaining(dateStr);
  if (dr < 0)  return 'Done';
  if (dr <= 7) return 'Race Week';
  if (dr <= 14) return 'Taper';
  if (dr <= 28) return 'Peak';
  return 'Preparation';
};

/* Goals sorted by priority for the AI: manual order first, then by
   how urgent they are (closest deadline + highest A/B/C priority). */
window.rankedGoals = function() {
  const goals = window.loadGoals().filter(g => window.goalDaysRemaining(g.date) >= 0);
  const pri = { A: 0, B: 1, C: 2 };
  return goals.slice().sort((a, b) => {
    if (typeof a.order === 'number' && typeof b.order === 'number' && a.order !== b.order)
      return a.order - b.order;
    const pa = pri[a.priority] ?? 1, pb = pri[b.priority] ?? 1;
    if (pa !== pb) return pa - pb;
    return window.goalDaysRemaining(a.date) - window.goalDaysRemaining(b.date);
  });
};

/* The block injected into every Groq call so the model always trains
   the athlete toward their #1 goal while keeping the others in mind. */
window.buildMasterContext = function() {
  const goals = window.rankedGoals();
  if (!goals.length) return '';
  const line = (g) => {
    const dr = window.goalDaysRemaining(g.date);
    return `${g.name} — ${dr} days — ${g.priority || 'B'} priority` +
           (g.target ? ` — target ${g.target}` : '') +
           ` (${window.goalStatus(g.date)})`;
  };
  const primary = goals[0];
  let out = 'ATHLETE GOAL CONTEXT\n';
  out += `PRIMARY GOAL (highest priority, closest deadline): ${primary.name} in ` +
         `${window.goalDaysRemaining(primary.date)} days — ${primary.target || 'finish'}\n`;
  out += 'ALL GOALS by priority:\n';
  goals.forEach((g, i) => { out += `${i + 1}. ${line(g)}\n`; });
  out += 'Adjust all training recommendations with primary focus on goal #1 ' +
         'while maintaining base fitness for all other goals.';
  return out;
};

/* callGroq automatically prepends the goal context as a system message.
   Pass opts.noContext = true to skip it. */
window.callGroq = async function(messages, opts = {}) {
  const key = window.groqKey();
  if (!key) throw new Error('No Groq API key — add one in Settings');

  let finalMessages = messages;
  if (!opts.noContext) {
    const ctx = window.buildMasterContext();
    if (ctx) finalMessages = [{ role: 'system', content: ctx }, ...messages];
  }

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
    body: JSON.stringify({
      model: opts.model || 'llama-3.3-70b-versatile',
      messages: finalMessages,
      max_tokens: opts.max_tokens || 1024,
      temperature: opts.temperature !== undefined ? opts.temperature : 0.7,
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || 'Groq error ' + res.status);
  return data?.choices?.[0]?.message?.content || '';
};
