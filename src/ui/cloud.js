/* Optional Dexie Cloud sync. Off unless VITE_DEXIE_CLOUD_DB_URL is set at build time.
   Auth is "custom": the app never shows a Dexie login. A tiny Vercel function (api/token.js) hands out tokens for
   the single admin user, guarded by a shared sync key that the admin types once per phone (Settings). */
import { store } from '../lib/util.js';

const rawUrl0 = String(import.meta.env?.VITE_DEXIE_CLOUD_DB_URL || '').trim().replace(/^["']|["']$/g, '');
const rawUrl = rawUrl0 && !/^https?:\/\//i.test(rawUrl0) ? 'https://' + rawUrl0 : rawUrl0;   // forgiving: "z123.dexie.cloud" works
const validUrl = u => { try { return new URL(u).protocol === 'https:'; } catch { return false; } };
/** '' when sync is off, or when the configured address is not a valid https URL (the app then stays local-only). */
export const cloudUrl = validUrl(rawUrl) ? rawUrl.replace(/\/$/, '') : '';
export const cloudInfo = () => ({ on: !!cloudUrl, bad: !!rawUrl && !cloudUrl, hasKey: !!store.get('dtrv.syncKey'), error: lastError });
/** Accepts the bare key or a whole setup link. */
export function saveKeyFrom(text) {
  const t = String(text || '').trim(), m = /[#&?]key=([^&\s]+)/.exec(t);
  const k = m ? decodeURIComponent(m[1]) : t; if (!k) return false; setSyncKey(k); return true;
}
let lastError = '';
export const setSyncKey = k => store.set('dtrv.syncKey', k || null);

/** A setup link looks like https://app/#key=SECRET. Save the key and remove it from the address bar. Call before opening the database. */
export function takeKeyFromLink() {
  const m = /[#&]key=([^&]+)/.exec(location.hash); if (!m) return false;
  try { setSyncKey(decodeURIComponent(m[1])); } catch { return false; }
  history.replaceState(null, '', location.pathname + location.search); return true;
}
export const setupLink = () => { const k = store.get('dtrv.syncKey'); return k ? `${location.origin}/#key=${encodeURIComponent(k)}` : ''; };

/** Find out which link is broken when sync says "offline": the phone's internet, the sync server, or the Vercel token function / key. Returns one plain sentence. */
export async function diagnoseSync() {
  const timed = (u, o) => { const c = new AbortController(), t = setTimeout(() => c.abort(), 8000); return fetch(u, { ...o, signal: c.signal }).finally(() => clearTimeout(t)); };
  try { await timed('/favicon.ico', { cache: 'no-store' }); } catch { return "This phone can't reach the internet right now."; }
  let tokenRes;
  try { tokenRes = await timed('/api/token', { method: 'POST', headers: { 'content-type': 'application/json', 'x-sync-key': store.get('dtrv.syncKey') || '' }, body: '{}' }); }
  catch { return "Can't reach this app's server (api/token). Check the connection and try again."; }
  if (tokenRes.status === 401) return cloudUrl ? 'The sync key on this phone is wrong or missing. Type it under Sync key below (it must equal SYNC_KEY in Vercel).' : 'Wrong sync key.';
  if (tokenRes.status === 500) { let m = ''; try { m = (await tokenRes.json()).error; } catch {} return m || 'Vercel is missing a sync setting.'; }
  if (tokenRes.status === 404) return 'The token function is not deployed (api/token). Redeploy on Vercel.';
  try { await timed(cloudUrl + '/', { mode: 'no-cors', cache: 'no-store' }); }
  catch { return "Can't reach the Dexie Cloud server. Check the sync address (VITE_DEXIE_CLOUD_DB_URL) in Vercel."; }
  return `The sync key and server look fine (${location.origin}). If it stays offline, run: npx dexie-cloud whitelist ${location.origin}`;
}

/** Passed to db.cloud.configure({ fetchTokens }). */
export async function fetchTokens(tokenParams) {
  const res = await fetch('/api/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-sync-key': store.get('dtrv.syncKey') || '' },
    body: JSON.stringify(tokenParams),
  });
  if (!res.ok) {
    let why = ''; try { why = (await res.json()).error || ''; } catch {}
    lastError = `Sync sign-in failed (${res.status})${why ? ': ' + why : ''}`; throw new Error(lastError);
  }
  lastError = ''; return res.json();
}
