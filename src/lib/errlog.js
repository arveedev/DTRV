/* Error log: when something breaks on any phone, a short note is saved in the synced database so the admin can read it
   on the admin side (Settings > Error log), without asking anyone to describe what happened. Notes are small, de-duplicated,
   limited per day, and never leave the app's own database. */
import { db } from '../data/db.js';
import { store } from './util.js';

const MAX_PER_DAY = 20, KEEP = 100;
const IGNORE = /ResizeObserver|AbortError|NotAllowedError|superseded|Script error|Load failed|Failed to fetch dynamically|NetworkError/i;
const queue = [], seen = new Set();
let busy = false;

const rand = n => Math.random().toString(36).slice(2, 2 + n);
export function deviceInfo() {
  let id = store.get('dtrv.device'); if (!id) { id = rand(4); store.set('dtrv.device', id); }
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const os = /iPhone|iPad|iPod/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : 'Device';
  const model = (/Android [\d.]+; ([^)]+?)( Build|\))/.exec(ua) || [])[1] || '';
  return { id, label: `${os}${model ? ' ' + model : ''}` };
}
const version = () => (typeof __BUILD__ === 'undefined' ? 'dev' : __BUILD__);

async function put(row) { await db.settings.put(row); }
/** Save a note. Safe to call from anywhere, any time; it never throws. */
export async function logError(kind, err, ctx = {}) {
  if (busy) return; busy = true;
  try {
    const msg = String(err?.message || err || 'unknown').slice(0, 300);
    if (IGNORE.test(msg)) return;
    const key = kind + '|' + msg; if (seen.has(key)) return; seen.add(key);
    const day = new Date().toISOString().slice(0, 10), counter = JSON.parse(store.get('dtrv.errDay') || '{}');
    if (counter.d === day && counter.n >= MAX_PER_DAY) return;
    store.set('dtrv.errDay', JSON.stringify({ d: day, n: counter.d === day ? counter.n + 1 : 1 }));
    const at = new Date().toISOString(), d = deviceInfo();
    const row = { id: `err:${at}:${rand(3)}`, kind: 'error', what: kind, at, device: d.id, label: d.label, version: version(),
      msg, stack: String(err?.stack || '').split('\n').slice(0, 6).join('\n').slice(0, 700), ctx: { online: navigator.onLine, ...ctx } };
    if (db) await put(row); else queue.push(row);
  } catch { /* the log must never cause an error */ } finally { busy = false; }
}
/** Notes made before the database was open (start-up errors) are saved now. */
export async function flushErrors() { while (queue.length && db) { try { await put(queue.shift()); } catch { break; } } }

export function initErrorLog() {
  window.addEventListener('error', e => { if (e.filename && !e.filename.startsWith(location.origin)) return; logError('script', e.error || e.message); });
  window.addEventListener('unhandledrejection', e => logError('promise', e.reason));
}

/* ---- admin side ---- */
export const listErrors = () => db.settings.where('id').startsWith('err:').reverse().toArray();
export async function pruneErrors() { const all = await db.settings.where('id').startsWith('err:').primaryKeys(); if (all.length > KEEP + 20) await db.settings.bulkDelete(all.slice(0, all.length - KEEP)); }
export async function clearErrors() { await db.settings.bulkDelete(await db.settings.where('id').startsWith('err:').primaryKeys()); seen.clear(); }
export const errorsSeenAt = () => store.get('dtrv.errSeen') || '';
export const markErrorsSeen = () => store.set('dtrv.errSeen', new Date().toISOString());
export const unseenCount = async () => (await listErrors()).filter(r => r.at > errorsSeenAt()).length;
export const asText = rows => rows.map(r => `${r.at} · ${r.label} · ${r.device} · v${r.version} · ${r.what}\n${r.msg}${r.stack ? '\n' + r.stack : ''}`).join('\n\n');
