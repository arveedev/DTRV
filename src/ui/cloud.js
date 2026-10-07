/* Optional Dexie Cloud sync. Off unless VITE_DEXIE_CLOUD_DB_URL is set at build time.
   Auth is "custom": the app never shows a Dexie login. A tiny Vercel function (api/token.js) hands out tokens for
   the single admin user, guarded by a shared sync key that the admin types once per phone (Settings). */
import { store } from '../lib/util.js';

export const cloudUrl = import.meta.env?.VITE_DEXIE_CLOUD_DB_URL || '';
export const cloudInfo = () => ({ on: !!cloudUrl, hasKey: !!store.get('dtrv.syncKey') });
export const setSyncKey = k => store.set('dtrv.syncKey', k || null);

/** A setup link looks like https://app/#key=SECRET. Save the key and remove it from the address bar. Call before opening the database. */
export function takeKeyFromLink() {
  const m = /[#&]key=([^&]+)/.exec(location.hash); if (!m) return false;
  try { setSyncKey(decodeURIComponent(m[1])); } catch { return false; }
  history.replaceState(null, '', location.pathname + location.search); return true;
}
export const setupLink = () => { const k = store.get('dtrv.syncKey'); return k ? `${location.origin}/#key=${encodeURIComponent(k)}` : ''; };

/** Passed to db.cloud.configure({ fetchTokens }). */
export async function fetchTokens(tokenParams) {
  const res = await fetch('/api/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-sync-key': store.get('dtrv.syncKey') || '' },
    body: JSON.stringify(tokenParams),
  });
  if (!res.ok) throw new Error('Sync sign-in failed (' + res.status + ')');
  return res.json();
}
