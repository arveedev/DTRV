/* Automatic backups: a snapshot of everything, once a day (and again when the app goes to the background if the day's
   snapshot is old), compressed and kept on this phone in its own database. Every day for the last 30 days, then one a week
   up to 6 months back, then one a month up to 2 years. A mistake (a wrong delete, a bad restore) can be undone from Settings.
   It does not replace the sync copy or a downloaded file: a lost phone loses these too. */
import Dexie from 'dexie';
import { S, exportAll, importAll, totals, idle, isDirty, clearDirty } from './repo.js';
import { backgroundJob } from '../lib/scheduler.js';
import { now } from '../lib/clock.js';

const DAILY_DAYS = 30, WEEKLY_DAYS = 183, MONTHLY_DAYS = 730, KEEP_SAFETY = 5, REFRESH_MS = 6 * 3600 * 1000;
const isDaily = id => /^\d{4}-\d\d-\d\d$/.test(id);
let store = null;
const snaps = () => (store ||= (() => { const d = new Dexie('dtrv-backups'); d.version(1).stores({ snaps: 'id' }); return d; })()).snaps;

const dayNo = id => Math.floor(Date.UTC(+id.slice(0, 4), +id.slice(5, 7) - 1, +id.slice(8, 10)) / 86400000);
/** Which daily snapshot ids to keep, given today's date. Pure, so it can be tested. */
export function retained(ids, today) {
  const t = dayNo(today), keep = new Set(), newestOf = new Map();
  for (const id of [...ids].sort().reverse()) {                       // newest first
    const age = t - dayNo(id);
    if (age < 0 || age > MONTHLY_DAYS) continue;
    if (age <= DAILY_DAYS) { keep.add(id); continue; }
    const wk = Math.floor((dayNo(id) + 3) / 7);                        // weeks start on Monday
    const key = age <= WEEKLY_DAYS ? 'w' + wk : 'm' + id.slice(0, 7);
    if (!newestOf.has(key)) { newestOf.set(key, id); keep.add(id); }
  }
  return keep;
}

const pack = async text => {
  try { return { enc: 'gz', data: await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer() }; }
  catch { return { enc: 'plain', data: text }; }                       // old browsers: store as is
};
const unpack = async s => s.enc === 'gz'
  ? new Response(new Blob([s.data]).stream().pipeThrough(new DecompressionStream('gzip'))).text() : (s.enc === 'plain' ? s.data : s.text);

/** For tests: forget the open connection so the backups database can be deleted. */
export function _reset() { store?.close(); store = null; }

/** Newest first: { id, at, people, days, size } (the text itself stays in the database). */
export async function listSnapshots() {
  return (await snaps().toArray()).map(s => ({ id: s.id, at: s.at, people: s.people, days: s.days, size: s.size ?? s.text?.length ?? 0 }))
    .sort((a, b) => b.at.localeCompare(a.at));
}

async function prune() {
  const all = await listSnapshots(), daily = all.filter(x => isDaily(x.id)), keep = retained(daily.map(x => x.id), now().date);
  const old = daily.filter(x => !keep.has(x.id) && now().date >= x.id), safety = all.filter(x => !isDaily(x.id)).slice(KEEP_SAFETY);
  await snaps().bulkDelete([...old, ...safety].map(x => x.id));
}

/** Save the current data under `id` (default: today). */
export async function takeSnapshot(id = now().date) {
  const text = await exportAll({ polite: true }), t = await totals();
  const p = await pack(text);
  await snaps().put({ id, at: new Date().toISOString(), enc: p.enc, data: p.data, size: text.length, people: t.people, days: t.days });
  await prune(); return id;
}

/** Is a backup due? Something changed since the last one, and it is the evening / early morning, or the last one is old. */
export async function backupDue() {
  if (!S.ready || !S.emps.length || !idle()) return false;
  const list = await listSnapshots(), last = list.find(s => isDaily(s.id));
  if (!last) return true;                                                   // none yet: take the first one when quiet
  if (!isDirty()) return false;                                             // nothing changed: cost nothing
  const h = now().d.getHours(), age = Date.now() - new Date(last.at).getTime();
  return h >= 18 || h < 6 || age > 26 * 3600 * 1000;                        // after working hours, or overdue
}
/** Take today's snapshot if one is due. Safe to call any time; the scheduler decides when. */
export async function autoBackup() {
  if (!(await backupDue())) return false;
  await takeSnapshot(); clearDirty(); return true;
}
/** Start the quiet background job: checks cheaply, runs only when the app is not being used. */
export const startAutoBackup = () => backgroundJob({ shouldRun: () => S.ready && S.emps.length > 0, job: autoBackup, every: 180000, quietMs: 60000 });

/** Put a snapshot back. The current data is saved first, so the restore itself can be undone. */
export async function restoreSnapshot(id) {
  const s = await snaps().get(id); if (!s) throw new Error('That backup is gone');
  await takeSnapshot('before-restore-' + new Date().toISOString().slice(0, 19));
  return importAll(await unpack(s));
}
