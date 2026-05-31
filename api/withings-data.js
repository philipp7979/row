// Withings data proxy. Forwards an authenticated getmeas request to Withings
// using the client's Bearer access token (mirrors whoop-data.js). The client
// stores its own tokens; no secrets are needed here.
//
// Usage: GET /api/withings-data?meastypes=1,5,6,8,76,77,88,...&startdate=...&lastupdate=...
//        Authorization: Bearer <withings access token>
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });

  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return res.status(401).json({ error: 'missing bearer token' });
  const accessToken = auth.slice(7);

  // Build the getmeas request. meastypes is a comma-separated list of Withings
  // measure type codes; default covers the full body-composition set.
  const q = req.query || {};
  const meastypes = String(q.meastypes || '1,5,6,8,9,11,12,76,77,88,91,155,168,169,170,173,174,175,226');
  const form = new URLSearchParams({ action: 'getmeas', meastypes, category: '1' });
  if (q.startdate) form.set('startdate', String(q.startdate));
  if (q.lastupdate) form.set('lastupdate', String(q.lastupdate));
  if (q.offset) form.set('offset', String(q.offset));

  try {
    const r = await fetch('https://wbsapi.withings.net/measure', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + accessToken,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form,
    });
    const text = await r.text();
    res.status(r.status).setHeader('Content-Type', 'application/json');
    return res.send(text);
  } catch (e) {
    return res.status(500).json({ error: 'proxy fetch failed: ' + (e.message || String(e)) });
  }
}
