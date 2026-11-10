// Vercel function: says yes/no to "is this the admin reset code?". Env: RESET_CODE (keep it private, do not share it like SYNC_KEY).
import { timingSafeEqual } from 'node:crypto';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
    const want = process.env.RESET_CODE;
    if (!want) return res.status(500).json({ error: 'RESET_CODE is not set in Vercel yet' });
    let body = req.body; if (typeof body === 'string') body = JSON.parse(body);
    const a = Buffer.from(String(body?.code ?? '')), b = Buffer.from(want);
    const same = a.length === b.length && timingSafeEqual(a, b);
    if (!same) { await new Promise(r => setTimeout(r, 1200)); return res.status(401).json({ error: 'Wrong reset code' }); }
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Reset check failed: ' + (e?.message || e) });
  }
}
