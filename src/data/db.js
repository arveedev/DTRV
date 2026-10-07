import Dexie from 'dexie';

/* Local-first database (IndexedDB via Dexie). When VITE_DEXIE_CLOUD_DB_URL is set, the same tables sync
   through Dexie Cloud; the addon is imported lazily so the plain local build stays small. */
export const SCHEMA = {
  employees: 'id, code',                    // id 'emp:024'
  days: 'id, [employeeId+date], date',      // id 'day:024:2026-10-07'  (one row per person per day)
  punches: 'id, [employeeId+date]',         // append-only log of every Record / Undo press
  settings: 'id',                           // 'schedule' | 'signatory' | 'admin'
  holidays: 'date',                         // the admin's holiday list
  audit: 'id, at',                          // who/what/when for edits
};

export let db = null;
export let cloudEnabled = false;
/** Latest Dexie Cloud sync state, for the "syncing…" screen. `phase` is '' when sync is off. */
export const sync = { phase: '', error: '' };
export function watchSync(fn) {
  if (!cloudEnabled || !db?.cloud?.syncState) return () => {};
  const s = db.cloud.syncState.subscribe(v => { sync.phase = v.phase || ''; sync.error = v.error ? String(v.error.message || v.error) : ''; fn(sync); });
  return () => s.unsubscribe();
}

/** The sync add-on is a separate download; this loads it once and remembers it. */
let addonP = null;
export const loadAddon = () => (addonP ||= import('dexie-cloud-addon').catch(e => { addonP = null; throw e; }));
/** Why sync is not running, in plain words (shown on the card when it matters). */
export const syncNote = { text: '' };

/**
 * @param {{name?:string, cloudUrl?:string, fetchTokens?:Function}} opts
 */
export async function openDatabase({ name = 'dtrv', cloudUrl = import.meta.env?.VITE_DEXIE_CLOUD_DB_URL, fetchTokens } = {}) {
  const addons = [];
  if (cloudUrl) addons.push((await loadAddon()).default);
  if (db) { try { db.close(); } catch { /* already closed */ } }        // one connection at a time, or the upgrade waits for the old one
  cloudEnabled = false;
  db = new Dexie(name, { addons });
  db.version(1).stores(SCHEMA);
  if (cloudUrl) {
    try { db.cloud.configure({ databaseUrl: cloudUrl, requireAuth: true, customLoginGui: true, fetchTokens }); cloudEnabled = true; }
    catch (e) { syncNote.text = String(e?.message || e); console.error('Dexie Cloud could not start; running local-only', e); }
  }
  await db.open();
  return db;
}

export async function closeDatabase() { if (db) { db.close(); db = null; } }
