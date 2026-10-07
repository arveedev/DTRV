/* The repository: an in-memory copy of the data (S) that the UI reads synchronously, plus async writes that
   persist every change to IndexedDB. Live queries keep S correct when the data changes elsewhere
   (another tab, or another phone through Dexie Cloud). */
import { liveQuery } from 'dexie';
import { db, openDatabase } from './db.js';
import { DEFAULT_SCHEDULE, SLOTS, canRecord, dayState, orderError, sequenceError, awayConflicts, AWAY, statsOf, remarkHistory } from '../lib/rules.js';
import { daysInMonth, pad } from '../lib/util.js';
import { now } from '../lib/clock.js';

export const DEFAULT_SIGN = { name: 'AL MARTIN A. MENES', title: 'Acting Branch Manager', label: 'In Charge' };

export class RepoError extends Error {
  constructor(code, html) { super(code); this.code = code; this.html = html || code; }
}

/** The in-memory copy. Day key: "<code>|<YYYY-MM-DD>". */
export const S = { ready: false, emps: [], sched: { ...DEFAULT_SCHEDULE }, sign: { ...DEFAULT_SIGN }, holidays: [], adminPin: null, e: {} };

/* ---------- accessors (sync) ---------- */
export const key = (no, d) => no + '|' + d;
export const get = (no, d) => S.e[key(no, d)];
export const emp = no => S.emps.find(x => x.no === no);
export const schedOf = p => p.sched || S.sched;
export const activePeople = () => S.emps.filter(p => p.active !== false);
const blankDay = () => ({ am_in: null, am_out: null, pm_in: null, pm_out: null, remark: null, edited: false });
const ensureDay = (no, d) => (S.e[key(no, d)] ||= blankDay());
const dropIfEmpty = (no, d) => { const x = get(no, d); if (x && !SLOTS.some(s => x[s]) && !x.remark) delete S.e[key(no, d)]; };

export function monthDays(no, ym) {
  const out = [];
  for (let d = 1; d <= daysInMonth(ym); d++) { const e = get(no, `${ym}-${pad(d)}`); if (e) out.push({ ...e, date: `${ym}-${pad(d)}` }); }
  return out;
}
export const monthStats = (no, ym) => statsOf(monthDays(no, ym), schedOf(emp(no)));

/* ---------- row <-> object ---------- */
const toEmp = r => ({ no: r.code, name: r.name, nick: r.nick || '', pos: r.pos || '', sched: r.sched || null, active: r.active !== false });
const fromEmp = p => ({ id: 'emp:' + p.no, code: p.no, name: p.name, nick: p.nick || '', pos: p.pos || '', sched: p.sched || null, active: p.active !== false });
const dayId = (no, d) => `day:${no}:${d}`;
const toDay = r => ({ am_in: r.am_in ?? null, am_out: r.am_out ?? null, pm_in: r.pm_in ?? null, pm_out: r.pm_out ?? null, remark: r.remark ?? null, edited: !!r.edited });
const fromDay = (no, d, x) => ({ id: dayId(no, d), employeeId: no, date: d, am_in: x.am_in, am_out: x.am_out, pm_in: x.pm_in, pm_out: x.pm_out, remark: x.remark, edited: x.edited });
const uid = () => (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36));
const strip = r => { if (!r) return {}; const { id, ...rest } = r; return rest; };

/* ---------- change tracking ---------- */
const listeners = new Set();
/** Called when data changed from *outside* this tab's own actions (other tab / other phone). */
export const onExternalChange = fn => { listeners.add(fn); return () => listeners.delete(fn); };
const notify = () => listeners.forEach(f => { try { f(); } catch (e) { console.error(e); } });

const timers = {};        // settings id -> debounce timer
const dirty = new Set();  // settings ids edited but not yet written (their in-memory value is the newest)
let pending = 0, skipped = false;
/** Wrap every DB write: while writes are in flight, ignore live-query echoes (they may be stale) and re-sync after. */
async function write(fn) {
  pending++;
  try { return await fn(); }
  finally { pending--; if (!pending && skipped) { skipped = false; await reloadAll(true); } }
}

const sig = x => JSON.stringify(x);

/* ---------- loading ---------- */
async function readStatic() {
  const [emps, settings, hols] = await Promise.all([db.employees.toArray(), db.settings.toArray(), db.holidays.toArray()]);
  return { emps, settings, hols };
}
function applyStatic({ emps, settings, hols }) {
  const before = sig([S.emps, S.sched, S.sign, S.holidays, S.adminPin]);
  S.emps = emps.map(toEmp).sort((a, b) => a.no.localeCompare(b.no));
  // an edit that is still waiting to be written is newer than what the database holds: keep it
  if (!dirty.has('schedule')) S.sched = { ...DEFAULT_SCHEDULE, ...strip(settings.find(r => r.id === 'schedule')) };
  if (!dirty.has('signatory')) S.sign = { ...DEFAULT_SIGN, ...strip(settings.find(r => r.id === 'signatory')) };
  const a = settings.find(r => r.id === 'admin'); S.adminPin = a ? { salt: a.salt, hash: a.hash } : null;
  S.holidays = hols.map(h => ({ date: h.date, name: h.name || '' })).sort((x, y) => x.date.localeCompare(y.date));
  return before !== sig([S.emps, S.sched, S.sign, S.holidays, S.adminPin]);
}

const months = new Map();   // ym -> { ready, sub }
const monthRange = ym => [ym + '-01', ym + '-32'];
const monthQuery = ym => db.days.where('date').between(...monthRange(ym), true, true).toArray();
function applyMonth(ym, rows) {
  const keys = Object.keys(S.e).filter(k => k.slice(k.indexOf('|') + 1, -3) === ym);
  const before = sig(keys.map(k => [k, S.e[k]]).sort());
  keys.forEach(k => delete S.e[k]);
  for (const r of rows) S.e[key(r.employeeId, r.date)] = toDay(r);
  const after = sig(Object.keys(S.e).filter(k => k.slice(k.indexOf('|') + 1, -3) === ym).map(k => [k, S.e[k]]).sort());
  return before !== after;
}

/** Load a month of days (all people) into memory and keep it live. Safe to call repeatedly. */
export function ensureMonth(ym) {
  if (months.has(ym)) return months.get(ym).ready;
  let first = true, resolve;
  const ready = new Promise(r => { resolve = r; });
  const sub = liveQuery(() => monthQuery(ym)).subscribe({
    next: rows => {
      if (pending) { skipped = true; } else if (applyMonth(ym, rows) && !first) notify();
      if (first) { first = false; resolve(); }
    },
    error: e => { console.error(e); if (first) { first = false; resolve(); } },
  });
  months.set(ym, { ready, sub });
  return ready;
}

async function reloadAll(emit) {
  let changed = applyStatic(await readStatic());
  for (const ym of months.keys()) if (applyMonth(ym, await monthQuery(ym))) changed = true;
  if (emit && changed) notify();
  return changed;
}

let staticSub = null;
/** Open the database and load everything the app needs to start. */
export async function init(opts) {
  staleCleanup();
  await openDatabase(opts);
  applyStatic(await readStatic());
  await ensureMonth(now().date.slice(0, 7));
  staticSub = liveQuery(readStatic).subscribe({ next: v => { if (pending) { skipped = true; return; } if (applyStatic(v)) notify(); }, error: e => console.error(e) });
  S.ready = true;
  return S;
}
function staleCleanup() {
  staticSub?.unsubscribe(); staticSub = null;
  months.forEach(v => v.sub.unsubscribe()); months.clear();
  S.ready = false; S.emps = []; S.holidays = []; S.e = {}; S.adminPin = null;
  S.sched = { ...DEFAULT_SCHEDULE }; S.sign = { ...DEFAULT_SIGN };
  pending = 0; skipped = false;
}
export const shutdown = staleCleanup;

/* ---------- audit ---------- */
const auditRow = (action, no, date, before, after) => ({ id: uid(), at: new Date().toISOString(), actor: 'device', action, employeeId: no ?? null, date: date ?? null, before: before ?? null, after: after ?? null });
const snap = (no, d) => { const x = get(no, d); return x ? { am_in: x.am_in, am_out: x.am_out, pm_in: x.pm_in, pm_out: x.pm_out, remark: x.remark } : null; };
async function saveDayRow(no, d, audit) {
  const x = get(no, d);
  await write(async () => {
    if (x) await db.days.put(fromDay(no, d, x)); else await db.days.delete(dayId(no, d));
    if (audit) await db.audit.add(audit);
  });
}

/* ---------- recording (employee) ---------- */
/** Record `slot` for `no` at `time` on `date`: once per slot, in order, never on a leave/day-off/holiday. */
export async function recordTime(no, slot, time, date = now().date) {
  const cur = get(no, date), st = dayState(cur);
  if (st.away) throw new RepoError('AWAY', 'Not working today');
  const chk = canRecord(cur, slot);
  if (!chk.ok) throw new RepoError(chk.reason, chk.why);
  const d = ensureDay(no, date); d[slot] = time;
  await write(async () => {
    await db.days.put(fromDay(no, date, d));
    await db.punches.add({ id: uid(), employeeId: no, date, slot, time, at: new Date().toISOString(), kind: 'record' });
  });
  return d;
}

/** Take back a time just recorded (the sheet's Undo). */
export async function undoRecord(no, date, slot) {
  const d = get(no, date); if (!d || !d[slot]) return;
  const time = d[slot]; d[slot] = null; dropIfEmpty(no, date);
  await write(async () => {
    const x = get(no, date); if (x) await db.days.put(fromDay(no, date, x)); else await db.days.delete(dayId(no, date));
    await db.punches.add({ id: uid(), employeeId: no, date, slot, time, at: new Date().toISOString(), kind: 'undo' });
  });
}

/** Edit one time (or clear it with null). Marks the day as edited. */
export async function setTime(no, date, slot, time) {
  const before = snap(no, date), cur = get(no, date);
  if (time && dayState(cur).away) throw new RepoError('AWAY', 'Not working today');
  if (time) { const err = orderError(cur || {}, slot, time); if (err) throw new RepoError('ORDER', err); }
  const d = ensureDay(no, date); d[slot] = time || null; d.edited = true; dropIfEmpty(no, date);
  await saveDayRow(no, date, auditRow('time.set', no, date, before, snap(no, date)));
}

/** Save a whole day from the editor: four times and an optional remark. */
export async function saveDay(no, date, { am_in = null, am_out = null, pm_in = null, pm_out = null, remark = null }) {
  const vals = { am_in, am_out, pm_in, pm_out };
  const err = sequenceError(vals); if (err) throw new RepoError('ORDER', err);
  if (remark && AWAY.includes(remark.code) && SLOTS.some(s => vals[s])) throw new RepoError('HAS_TIMES', `With times recorded this day can't be <b>${remark.code}</b>`);
  const before = snap(no, date), d = ensureDay(no, date);
  SLOTS.forEach(k => { if (vals[k] !== d[k]) { d[k] = vals[k]; d.edited = true; } });
  d.remark = remark; dropIfEmpty(no, date);
  await saveDayRow(no, date, auditRow('day.save', no, date, before, snap(no, date)));
}

export async function deleteDay(no, date) {
  const before = snap(no, date); delete S.e[key(no, date)];
  await write(async () => { await db.days.delete(dayId(no, date)); await db.audit.add(auditRow('day.delete', no, date, before, null)); });
}

/** Put the same remark on several dates (Leave range, Others). Refuses leave/day-off/holiday over days with times. */
export async function setRemarks(no, dates, remark) {
  if (AWAY.includes(remark.code)) {
    const bad = dates.find(d => awayConflicts(get(no, d)));
    if (bad) throw new RepoError('HAS_TIMES', bad);
  }
  const rows = [];
  for (const d of dates) { ensureDay(no, d).remark = remark; rows.push(fromDay(no, d, get(no, d))); }
  await write(async () => { await db.days.bulkPut(rows); await db.audit.add(auditRow('remark.set', no, dates[0], null, { remark, dates: dates.length })); });
}

/** This person's own past "Others" reasons, most used first (from the whole history, not only loaded months). */
export async function remarkSuggestions(no) {
  const rows = await db.days.where('[employeeId+date]').between([no, ''], [no, '￿']).filter(d => d.remark?.code === 'OTHER').toArray();
  return remarkHistory(rows);
}

/* ---------- people ---------- */
export async function saveEmployee(data, isNew) {
  if (!/^\d{3}$/.test(data.no)) throw new RepoError('BAD_CODE', 'Code must be exactly 3 digits');
  let p = emp(data.no);
  if (isNew && p) throw new RepoError('CODE_TAKEN', 'That code is already used');
  if (p) Object.assign(p, data); else { p = { active: true, ...data }; S.emps.push(p); S.emps.sort((a, b) => a.no.localeCompare(b.no)); }
  await write(async () => { await db.employees.put(fromEmp(p)); await db.audit.add(auditRow(isNew ? 'person.add' : 'person.edit', p.no, null, null, { name: p.name })); });
  return p;
}

/* ---------- settings ---------- */
const settingNow = id => ({ schedule: S.sched, signatory: S.sign }[id]);
/** Debounced: typing in a field writes once it pauses. `settle()` flushes immediately. */
function persistSetting(id, delay = 350) {
  dirty.add(id); clearTimeout(timers[id]);
  timers[id] = setTimeout(() => { delete timers[id]; flush(id).catch(console.error); }, delay);
}
const flush = id => write(() => db.settings.put({ id, ...settingNow(id) })).finally(() => { if (!timers[id]) dirty.delete(id); });
export const saveSchedule = patch => { Object.assign(S.sched, patch); persistSetting('schedule'); };
export const saveSignatory = patch => { Object.assign(S.sign, patch); persistSetting('signatory'); };
export async function settle() {
  const ids = Object.keys(timers);
  for (const id of ids) { clearTimeout(timers[id]); delete timers[id]; }
  for (const id of ids) await flush(id);
}

/* ---------- holidays for everyone ---------- */
/** Mark `date` as a holiday for every active person without times that day. */
export async function applyHoliday(date, name = '') {
  let hit = 0, kept = 0; const rows = [];
  for (const p of activePeople()) {
    if (awayConflicts(get(p.no, date))) { kept++; continue; }
    ensureDay(p.no, date).remark = { code: 'HOLIDAY', text: name }; rows.push(fromDay(p.no, date, get(p.no, date))); hit++;
  }
  S.holidays = S.holidays.filter(h => h.date !== date).concat({ date, name }).sort((a, b) => a.date.localeCompare(b.date));
  await write(async () => { await db.days.bulkPut(rows); await db.holidays.put({ date, name }); await db.audit.add(auditRow('holiday.add', null, date, null, { name, hit, kept })); });
  return { hit, kept };
}
export async function removeHoliday(date) {
  const gone = [], rows = [];
  for (const p of S.emps) { const e = get(p.no, date); if (e?.remark?.code === 'HOLIDAY') { e.remark = null; if (SLOTS.some(s => e[s])) rows.push(fromDay(p.no, date, e)); else { delete S.e[key(p.no, date)]; gone.push(dayId(p.no, date)); } } }
  S.holidays = S.holidays.filter(h => h.date !== date);
  await write(async () => { await db.days.bulkPut(rows); await db.days.bulkDelete(gone); await db.holidays.delete(date); await db.audit.add(auditRow('holiday.remove', null, date)); });
}

/* ---------- admin PIN (an app lock, not real security: every device holds the data) ---------- */
const hex = u8 => [...u8].map(b => b.toString(16).padStart(2, '0')).join('');
const unhex = h => Uint8Array.from(h.match(/../g) || [], x => parseInt(x, 16));
async function hashPin(pin, saltHex) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  return hex(new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: unhex(saltHex), iterations: 100000, hash: 'SHA-256' }, k, 256)));
}
export const hasAdminPin = () => !!S.adminPin;
export async function setAdminPin(pin) {
  if (!/^\d{6}$/.test(pin)) throw new RepoError('BAD_PIN', 'PIN must be 6 digits');
  const salt = hex(crypto.getRandomValues(new Uint8Array(16))), hash = await hashPin(pin, salt);
  S.adminPin = { salt, hash };
  await write(() => db.settings.put({ id: 'admin', salt, hash }));
}
export async function checkAdminPin(pin) {
  if (!S.adminPin || !/^\d{6}$/.test(pin)) return false;
  return (await hashPin(pin, S.adminPin.salt)) === S.adminPin.hash;
}

/* ---------- backup / restore ---------- */
const TABLES = ['employees', 'days', 'punches', 'settings', 'holidays', 'audit'];
export async function exportAll() {
  const out = { app: 'dtrv', version: 1, exportedAt: new Date().toISOString() };
  for (const t of TABLES) out[t] = await db[t].toArray();
  return JSON.stringify(out);
}
/** Replace everything with a backup file's contents. Throws RepoError('BAD_BACKUP') for anything else. */
export async function importAll(text) {
  let j; try { j = JSON.parse(text); } catch { throw new RepoError('BAD_BACKUP', 'This is not a backup file'); }
  if (j?.app !== 'dtrv' || !Array.isArray(j.employees) || !Array.isArray(j.days)) throw new RepoError('BAD_BACKUP', 'This is not a DTRV backup');
  await write(() => db.transaction('rw', TABLES.map(t => db[t]), async () => {
    for (const t of TABLES) { await db[t].clear(); if (Array.isArray(j[t]) && j[t].length) await db[t].bulkPut(j[t]); }
  }));
  S.e = {};
  await reloadAll(false);
  return { people: j.employees.length, days: j.days.length };
}
