/* Automatic backups: a snapshot of everything, once a day (and again when the app goes to the background if the day's
   snapshot is old), kept on this phone in its own database for the last 14 days. A mistake (a wrong delete, a bad restore)
   can be undone from Settings. It does not replace the sync copy or a downloaded file: a lost phone loses these too. */
import Dexie from 'dexie';
import { S, exportAll, importAll, idle } from './repo.js';
import { now } from '../lib/clock.js';

const KEEP_DAYS = 14, KEEP_SAFETY = 3, REFRESH_MS = 6 * 3600 * 1000;
const isDaily = id => /^\d{4}-\d\d-\d\d$/.test(id);
let store = null;
const snaps = () => (store ||= (() => { const d = new Dexie('dtrv-backups'); d.version(1).stores({ snaps: 'id' }); return d; })()).snaps;

/** Newest first: { id, at, people, days, size } (the text itself stays in the database). */
export async function listSnapshots() {
  return (await snaps().toArray()).map(s => ({ id: s.id, at: s.at, people: s.people, days: s.days, size: s.text.length }))
    .sort((a, b) => b.at.localeCompare(a.at));
}

async function prune() {
  const all = await listSnapshots();
  const daily = all.filter(s => isDaily(s.id)).slice(KEEP_DAYS), safety = all.filter(s => !isDaily(s.id)).slice(KEEP_SAFETY);
  await snaps().bulkDelete([...daily, ...safety].map(s => s.id));
}

/** Save the current data under `id` (default: today). */
export async function takeSnapshot(id = now().date) {
  const text = await exportAll(), j = JSON.parse(text);
  await snaps().put({ id, at: new Date().toISOString(), text, people: j.employees.length, days: j.days.length });
  await prune(); return id;
}

/** Called at start-up and when the app goes to the background. Cheap when there is nothing to do. */
export async function autoBackup() {
  if (!S.ready || !S.emps.length || !idle()) return false;
  const have = await snaps().get(now().date);
  if (have && Date.now() - new Date(have.at).getTime() < REFRESH_MS) return false;
  await takeSnapshot(); return true;
}

/** Put a snapshot back. The current data is saved first, so the restore itself can be undone. */
export async function restoreSnapshot(id) {
  const s = await snaps().get(id); if (!s) throw new Error('That backup is gone');
  await takeSnapshot('before-restore-' + new Date().toISOString().slice(0, 19));
  return importAll(s.text);
}
