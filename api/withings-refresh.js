// Exchanges a Withings refresh token for a fresh access token.
// Secrets live ONLY in Vercel env vars — never in client code.
//   WITHINGS_CLIENT_ID, WITHINGS_CLIENT_SECRET
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const refresh = body && body.refresh_token;
  if (!refresh) return res.status(400).json({ error: 'refresh_token required' });

  const clientId = process.env.WITHINGS_CLIENT_ID;
  const clientSecret = process.env.WITHINGS_CLIENT_SECRET;
  if (!clientId || !clientSecret) return res.status(500).json({ error: 'server not configured (WITHINGS_CLIENT_ID/SECRET)' });

  try {
    const form = new URLSearchParams({
      action: 'requesttoken',
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refresh,
    });
    const r = await fetch('https://wbsapi.withings.net/v2/oauth2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    });
    const data = await r.json().catch(() => ({}));
    // Withings wraps responses as { status, body }
    if (!data || data.status !== 0 || !data.body) {
      return res.status(500).json({ error: 'refresh failed: ' + JSON.stringify(data && data.error ? data.error : data) });
    }
    return res.status(200).json(data.body); // { access_token, refresh_token, expires_in, ... }
  } catch (e) {
    return res.status(500).json({ error: 'fetch error: ' + (e.message || String(e)) });
  }
}
