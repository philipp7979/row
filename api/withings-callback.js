// Withings OAuth callback. Exchanges the authorization code for tokens and
// redirects back to the app with them in the URL hash (mirrors whoop-callback).
//   Env: WITHINGS_CLIENT_ID, WITHINGS_CLIENT_SECRET, WITHINGS_REDIRECT_URI
// The redirect_uri MUST exactly match the callback URL registered in the
// Withings developer dashboard.
export default async function handler(req, res) {
  const code = req.query && req.query.code;
  if (req.query && req.query.error) return res.status(400).send('Withings auth error: ' + req.query.error);
  if (!code) return res.status(400).send('Missing code parameter.');

  const clientId = process.env.WITHINGS_CLIENT_ID;
  const clientSecret = process.env.WITHINGS_CLIENT_SECRET;
  const redirectUri = process.env.WITHINGS_REDIRECT_URI || 'https://row-gray.vercel.app/api/withings-callback';
  if (!clientId || !clientSecret) {
    return res.status(500).send('Server not configured (missing WITHINGS_* env vars).');
  }

  try {
    const form = new URLSearchParams({
      action: 'requesttoken',
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    });
    const r = await fetch('https://wbsapi.withings.net/v2/oauth2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    });
    const data = await r.json().catch(() => ({}));
    if (!data || data.status !== 0 || !data.body) {
      return res.status(500).send('Withings token exchange failed: ' + JSON.stringify(data));
    }
    const b = data.body;
    const access = b.access_token || '';
    const refresh = b.refresh_token || '';
    const expiresIn = b.expires_in != null ? b.expires_in : 10800;
    const hash = new URLSearchParams({
      withings_access: access,
      withings_refresh: refresh,
      withings_expires: String(Date.now() + expiresIn * 1000),
    }).toString();
    res.writeHead(302, { Location: '/modules/health/index.html#' + hash });
    res.end();
  } catch (e) {
    res.status(500).send('Unexpected: ' + (e.message || String(e)));
  }
}
