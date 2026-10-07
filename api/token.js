// Vercel function: hands Dexie Cloud a token for the one admin user. Guarded by a shared sync key (SYNC_KEY).
// Env: DEXIE_CLOUD_DB_URL, DEXIE_CLOUD_CLIENT_ID, DEXIE_CLOUD_CLIENT_SECRET, SYNC_KEY, ADMIN_EMAIL
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { DEXIE_CLOUD_DB_URL: url, DEXIE_CLOUD_CLIENT_ID: id, DEXIE_CLOUD_CLIENT_SECRET: secret, SYNC_KEY: key, ADMIN_EMAIL: email } = process.env;
  if (!url || !id || !secret || !key || !email) return res.status(500).json({ error: 'Server is not configured' });
  if (req.headers['x-sync-key'] !== key) return res.status(401).json({ error: 'Wrong sync key' });
  const { public_key } = req.body || {};
  if (!public_key) return res.status(400).json({ error: 'public_key missing' });
  const r = await fetch(url.replace(/\/$/, '') + '/token', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ grant_type: 'client_credentials', client_id: id, client_secret: secret, public_key, scopes: ['ACCESS_DB'], claims: { sub: email, email } }),
  });
  res.status(r.status).setHeader('content-type', 'application/json').send(await r.text());
}
