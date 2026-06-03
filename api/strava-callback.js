// Strava OAuth callback. Exchanges the authorization code for tokens and
// redirects back to the app with them in the URL hash (mirrors whoop-callback).
// The returned refresh_token can be saved as STRAVA_REFRESH_TOKEN in Vercel
// for single-user server-side mode.
//   Env: STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_REDIRECT_URI
export default async function handler(req, res) {
  const code = req.query && req.query.code;
  if (req.query && req.query.error) return res.status(400).send('Strava auth error: ' + req.query.error);
  if (!code) return res.status(400).send('Missing code parameter.');

  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return res.status(500).send('Server not configured (missing STRAVA_* env vars).');
  }

  try {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
    });
    const tokenRes = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const text = await tokenRes.text();
    if (!tokenRes.ok) return res.status(500).send('Strava token exchange failed: ' + text);
    let json;
    try { json = JSON.parse(text); } catch { return res.status(500).send('Non-JSON from Strava: ' + text); }

    const access = json.access_token || '';
    const refresh = json.refresh_token || '';
    const expiresAt = json.expires_at != null ? json.expires_at : Math.floor(Date.now() / 1000) + 21600;
    const hash = new URLSearchParams({
      strava_access: access,
      strava_refresh: refresh,
      strava_expires: String(expiresAt * 1000),
    }).toString();
    res.writeHead(302, { Location: '/modules/training/index.html#' + hash });
    res.end();
  } catch (e) {
    res.status(500).send('Unexpected: ' + (e.message || String(e)));
  }
}
