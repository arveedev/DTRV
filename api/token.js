// Vercel function: hands Dexie Cloud a token for the one admin user. Guarded by a shared sync key (SYNC_KEY).
// Env: DEXIE_CLOUD_DB_URL, DEXIE_CLOUD_CLIENT_ID, DEXIE_CLOUD_CLIENT_SECRET, SYNC_KEY, ADMIN_EMAIL
const NEEDED = ['DEXIE_CLOUD_DB_URL', 'DEXIE_CLOUD_CLIENT_ID', 'DEXIE_CLOUD_CLIENT_SECRET', 'SYNC_KEY', 'ADMIN_EMAIL'];

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
    const missing = NEEDED.filter(k => !process.env[k]);                       // names only, never values
    if (missing.length) return res.status(500).json({ error: 'Server settings missing in Vercel: ' + missing.join(', ') });
    const { DEXIE_CLOUD_DB_URL, DEXIE_CLOUD_CLIENT_ID: id, DEXIE_CLOUD_CLIENT_SECRET: secret, SYNC_KEY: key, ADMIN_EMAIL: email } = process.env;
    if (req.headers['x-sync-key'] !== key) return res.status(401).json({ error: 'Wrong sync key (it must equal SYNC_KEY in Vercel)' });
    let body = req.body; if (typeof body === 'string') body = JSON.parse(body);
    const { public_key } = body || {};
    if (!public_key) return res.status(400).json({ error: 'public_key missing' });
    const url = (/^https?:\/\//i.test(DEXIE_CLOUD_DB_URL) ? DEXIE_CLOUD_DB_URL : 'https://' + DEXIE_CLOUD_DB_URL).trim().replace(/\/$/, '');
    const r = await fetch(url + '/token', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ grant_type: 'client_credentials', client_id: id, client_secret: secret, public_key, scopes: ['ACCESS_DB'], claims: { sub: email, email } }),
    });
    const text = await r.text();
    if (!r.ok) return res.status(502).json({ error: 'Dexie Cloud refused the token request (' + r.status + '): ' + text.slice(0, 300) });
    res.status(200).setHeader('content-type', 'application/json').send(text);
  } catch (e) {
    res.status(500).json({ error: 'Token function crashed: ' + (e?.message || e) });
  }
}
