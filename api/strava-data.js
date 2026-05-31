// Strava data proxy. In single-user mode the server refreshes its own access
// token (using STRAVA_CLIENT_ID/SECRET/REFRESH_TOKEN) so the client never sees
// any credentials. A client may also pass its own Bearer token to override.
//
// Usage: GET /api/strava-data?path=/athlete/activities&per_page=100&page=1
//   Env: STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_REFRESH_TOKEN

// Allowlist of Strava API path prefixes (prevents SSRF / abuse).
const ALLOWED = ['/athlete/activities', '/activities/', '/athlete'];
function allowedPath(path) {
  return ALLOWED.some((p) => path === p || path.startsWith(p));
}

// Cache the refreshed access token in module memory across warm invocations.
let cachedToken = null; // { access, expiresAt }

async function getServerAccessToken() {
  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  const refresh = process.env.STRAVA_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refresh) return null;

  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt - 120 > now) return cachedToken.access;

  const form = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refresh,
    client_id: clientId,
    client_secret: clientSecret,
  });
  const r = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
  });
  if (!r.ok) throw new Error('token refresh failed: ' + (await r.text()));
  const j = await r.json();
  cachedToken = { access: j.access_token, expiresAt: j.expires_at || now + 21600 };
  return cachedToken.access;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });

  const path = (req.query && req.query.path) || '';
  if (!path || !path.startsWith('/')) return res.status(400).json({ error: 'path required' });
  if (!allowedPath(path)) return res.status(400).json({ error: 'path not allowed' });

  // Determine the access token: client Bearer override, else server refresh.
  let bearer = '';
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) {
    bearer = auth.slice(7);
  } else {
    try {
      const t = await getServerAccessToken();
      if (!t) return res.status(500).json({ error: 'server not configured (STRAVA_CLIENT_ID/SECRET/REFRESH_TOKEN)' });
      bearer = t;
    } catch (e) {
      return res.status(500).json({ error: String(e.message || e) });
    }
  }

  // Forward remaining query params (per_page, page, etc.)
  const fwd = new URLSearchParams();
  for (const [k, v] of Object.entries(req.query || {})) {
    if (k !== 'path') fwd.set(k, String(v));
  }
  const qs = fwd.toString();
  const url = 'https://www.strava.com/api/v3' + path + (qs ? '?' + qs : '');

  try {
    const r = await fetch(url, {
      headers: { 'Authorization': 'Bearer ' + bearer, 'Accept': 'application/json' },
    });
    const text = await r.text();
    const upstreamCt = r.headers.get('content-type') || '';
    const ct = upstreamCt.includes('json') ? 'application/json' : 'text/plain';
    res.status(r.status).setHeader('Content-Type', ct);
    return res.send(text);
  } catch (e) {
    return res.status(500).json({ error: 'proxy fetch failed: ' + (e.message || String(e)) });
  }
}
