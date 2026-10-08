/* The business rules. Pure functions: no DOM, no database. Everything here is unit-tested. */
import { m, hm, t12 } from './util.js';

export const SLOTS = ['am_in', 'am_out', 'pm_in', 'pm_out'];
export const SLOT_LABEL = { am_in: 'AM IN', am_out: 'AM OUT', pm_in: 'PM IN', pm_out: 'PM OUT' };
export const REMARKS = { LEAVE: 'ON LEAVE', DAYOFF: 'DAY-OFF', HOLIDAY: 'HOLIDAY', OTHER: '' };
export const REMARK_LABEL = { LEAVE: 'Leave', DAYOFF: 'Day-off', HOLIDAY: 'Holiday', OTHER: 'Others' };
/** Remarks that mean "not working today": no clock-in is allowed on such a day. */
export const AWAY = ['LEAVE', 'DAYOFF', 'HOLIDAY'];
/** Lunch is the same for everyone, in fixed and in flexi. There is no grace period. */
export const LUNCH_START = '12:00';
export const LUNCH_END = '13:00';

export const DEFAULT_SCHEDULE = { mode: 'fixed', amIn: '08:00', flexStart: '07:00', flexEnd: '09:00', req: 8, pmLate: false };

export const nickOf = p => p.nick || p.name.split(' ')[0].charAt(0) + p.name.split(' ')[0].slice(1).toLowerCase();

/** What is printed in the Undertime column for a remark. */
export const remarkText = r => !r ? '' : r.code === 'OTHER' ? r.text : (r.code === 'HOLIDAY' && r.text) ? `HOLIDAY – ${r.text}` : REMARKS[r.code];

/* ---------- lateness ---------- */
export const lateLimit = sc => sc.mode === 'flexi' ? sc.flexEnd : sc.amIn;

/** Minutes late for one day (0 = on time). Counted from the limit; 1 minute over is late. */
export function lateMinutes(day, sc) {
  if (!day) return 0;
  let late = 0;
  if (day.am_in) { const o = m(day.am_in) - m(lateLimit(sc)); if (o > 0) late += o; }
  if (sc.pmLate && day.pm_in) { const o = m(day.pm_in) - m(LUNCH_END); if (o > 0) late += o; }
  return late;
}

/** Flexi only: when the person may go home after clocking in. */
/** Which arrivals were late: AM IN after the limit; PM IN after 1:00 PM only if the late-return setting is on. */
export function lateSlots(day, sc) {
  if (!day) return { am_in: false, pm_in: false };
  return { am_in: !!day.am_in && m(day.am_in) > m(lateLimit(sc)), pm_in: !!(sc.pmLate && day.pm_in && m(day.pm_in) > m(LUNCH_END)) };
}

export function expectedOut(day, sc) {
  if (!day?.am_in || sc.mode !== 'flexi') return null;
  return hm(Math.max(m(day.am_in), m(sc.flexStart)) + sc.req * 60 + (m(LUNCH_END) - m(LUNCH_START)));
}

/** Flexi only: [earliest, latest] clock-out. */
export function clockOutWindow(sc) {
  if (sc.mode !== 'flexi') return null;
  const lunch = m(LUNCH_END) - m(LUNCH_START);
  return [hm(m(sc.flexStart) + sc.req * 60 + lunch), hm(m(sc.flexEnd) + sc.req * 60 + lunch)];
}

/** Month summary from a list of day objects. */
export function statsOf(days, sc) {
  let present = 0, lates = 0, lateMin = 0, remarks = 0;
  for (const d of days) {
    if (SLOTS.some(s => d[s])) present++;
    if (d.remark) remarks++;
    const l = lateMinutes(d, sc);
    if (l) { lates++; lateMin += l; }
  }
  return { present, lates, lateMin, remarks };
}

/* ---------- one time per slot, in order ---------- */
export const recIdx = e => { let l = -1; SLOTS.forEach((s, i) => { if (e?.[s]) l = i; }); return l; };

/** Can this slot be recorded now? A slot is taken once; and never after a later slot. */
export function canRecord(e, slot) {
  const i = SLOTS.indexOf(slot);
  if (e?.[slot]) return { ok: false, reason: 'SLOT_TAKEN', why: `<b>${SLOT_LABEL[slot]}</b> is already recorded (${t12(e[slot])})` };
  for (let j = i + 1; j < 4; j++) if (e?.[SLOTS[j]]) return { ok: false, reason: 'OUT_OF_ORDER', why: `Can't record <b>${SLOT_LABEL[slot]}</b> after <b>${SLOT_LABEL[SLOTS[j]]}</b> (${t12(e[SLOTS[j]])})` };
  return { ok: true };
}

/** Which tile to pre-select: by time of day, but never earlier than what is already recorded. null = day complete. */
export function suggest(e, time) {
  const t = m(time), byTime = t < m('11:00') ? 0 : t < m('12:30') ? 1 : t < m('14:00') ? 2 : 3;
  const last = recIdx(e);
  if (last === 3) return null;
  return SLOTS[Math.min(3, Math.max(byTime, last + 1))];
}

/** Editing a time must keep the four times in order. Returns an HTML message or null. */
export function orderError(e, slot, time) {
  const i = SLOTS.indexOf(slot);
  for (let j = 0; j < 4; j++) {
    const o = SLOTS[j];
    if (j === i || !e[o]) continue;
    if (j < i && m(e[o]) > m(time)) return `<b>${SLOT_LABEL[slot]}</b> can't be earlier than <b>${SLOT_LABEL[o]}</b> (${t12(e[o])})`;
    if (j > i && m(e[o]) < m(time)) return `<b>${SLOT_LABEL[slot]}</b> can't be later than <b>${SLOT_LABEL[o]}</b> (${t12(e[o])})`;
  }
  return null;
}

/** Same check for a whole day typed into the editor: { am_in, am_out, pm_in, pm_out }. */
export function sequenceError(vals) {
  let last = null;
  for (const k of SLOTS) {
    if (!vals[k]) continue;
    if (last && m(vals[k]) < m(vals[last])) return `<b>${SLOT_LABEL[k]}</b> can't be earlier than <b>${SLOT_LABEL[last]}</b> (${t12(vals[last])})`;
    last = k;
  }
  return null;
}

/** State of a day: has the person clocked in? are they away (leave/day-off/holiday)? */
export function dayState(e) {
  return { e, hasTimes: !!e && SLOTS.some(s => e[s]), away: e?.remark && AWAY.includes(e.remark.code) ? e.remark.code : null };
}

/** Leave / day-off / holiday can't be put on a day that has times. */
export const awayConflicts = e => !!e && SLOTS.some(s => e[s]);

/** Reasons this person typed for "Others", most used first, then most recent. days: [{date, remark}] */
export function remarkHistory(days, limit = 6) {
  const c = new Map();
  for (const d of days) {
    if (d.remark?.code !== 'OTHER' || !d.remark.text) continue;
    const r = c.get(d.remark.text) ?? { n: 0, last: '' };
    r.n++; if (d.date > r.last) r.last = d.date;
    c.set(d.remark.text, r);
  }
  return [...c].sort((a, b) => b[1].n - a[1].n || b[1].last.localeCompare(a[1].last)).slice(0, limit).map(x => x[0]);
}

/** Calendar colour class for a day. */
/** Minutes worked on a day, or null if it cannot be told. Four times: the two stretches. Arrival and departure only: that span less the lunch hour. */
export function workedMinutes(e) {
  if (!e?.am_in || !e?.pm_out) return null;
  if (e.am_out && e.pm_in) return (m(e.am_out) - m(e.am_in)) + (m(e.pm_out) - m(e.pm_in));
  return Math.max(0, m(e.pm_out) - m(e.am_in) - (m(LUNCH_END) - m(LUNCH_START)));
}
/** For a month's days: total worked minutes, how many days that covers, and the average arrival (minutes since midnight). */
export function monthSummary(days) {
  let total = 0, counted = 0, arr = 0, arrN = 0;
  for (const e of days) {
    const w = workedMinutes(e); if (w != null) { total += w; counted++; }
    if (e.am_in) { arr += m(e.am_in); arrN++; }
  }
  return { total, counted, avgIn: arrN ? Math.round(arr / arrN) : null };
}

/** Which of the four times are missing from a day. */
export const missingSlots = e => SLOTS.filter(s => !e?.[s]);
/** A day before today with some times but not all four, and no remark that explains it (leave, "field work"…). */
export const isIncomplete = (e, date, today) => !!e && date < today && SLOTS.some(s => e[s]) && missingSlots(e).length > 0 && !e.remark;
/** "no PM OUT", "no AM OUT, PM IN" */
export const missingText = e => 'no ' + missingSlots(e).map(s => SLOT_LABEL[s]).join(', ');

export function dayClass(e, ds, wd, sc, today) {
  const has = e && SLOTS.some(s => e[s]);
  if (e?.remark && !has) return e.remark.code === 'HOLIDAY' ? 'hol' : 'rm';
  if (has) {
    if (lateMinutes(e, sc)) return 'lt';
    if (isIncomplete(e, ds, today)) return 'inc';
    return e.remark ? (e.remark.code === 'HOLIDAY' ? 'hol' : 'rm') : 'ok';
  }
  return (wd === 0 || wd === 6) ? 'we' : '';
}
