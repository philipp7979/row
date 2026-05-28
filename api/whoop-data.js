// Allowlist of path prefixes that are valid WHOOP API routes.
// Prevents SSRF to internal Vercel infrastructure or unrelated hosts.
const V1_PATHS = ['/cycle'];
const V2_PATHS = ['/recovery', '/activity/sleep', '/activity/workout', '/user', '/body_measurement'];

function allowedPath(path) {
  return [...V1_PATHS, ...V2_PATHS].some((prefix) => path.startsWith(prefix));
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });

  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return res.status(401).json({ error: 'missing bearer token' });

  const path = (req.query && req.query.path) || '';
  if (!path || !path.startsWith('/')) return res.status(400).json({ error: 'path required' });
  if (!allowedPath(path)) return res.status(400).json({ error: 'path not allowed' });

  const fwd = new URLSearchParams();
  for (const [k, v] of Object.entries(req.query || {})) {
    if (k !== 'path') fwd.set(k, String(v));
  }
  const qs = fwd.toString();
  const base = V1_PATHS.some((p) => path.startsWith(p))
    ? 'https://api.prod.whoop.com/developer/v1'
    : 'https://api.prod.whoop.com/developer/v2';
  const url = base + path + (qs ? '?' + qs : '');

  try {
    const r = await fetch(url, {
      headers: { 'Authorization': auth, 'Accept': 'application/json' },
    });
    const text = await r.text();
    // Only claim application/json if the upstream actually returned JSON.
    const upstreamCt = r.headers.get('content-type') || '';
    const ct = upstreamCt.includes('json') ? 'application/json' : 'text/plain';
    res.status(r.status).setHeader('Content-Type', ct);
    return res.send(text);
  } catch (e) {
    return res.status(500).json({ error: 'proxy fetch failed: ' + (e.message || String(e)) });
  }
}
