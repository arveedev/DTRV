/* Holidays for any year, worked out by rule (no yearly table to maintain), plus the ones the admin chose to remember.
   Pure functions: no DOM, no database. Dates are 'YYYY-MM-DD'. */
import { pad } from './util.js';

/** Easter Sunday (Gregorian), by the anonymous algorithm. Returns [month, day]. */
export function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25),
    g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4,
    l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
    month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return [month, day];
}
const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const addDays = (y, m, d, n) => { const t = new Date(Date.UTC(y, m - 1, d + n)); return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()); };
const weekday = (y, m, d) => new Date(Date.UTC(y, m - 1, d)).getUTCDay();
const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** The nth (1..4) or last (-1) weekday `wd` (0=Sunday) of a month. */
export function nthWeekday(y, m, nth, wd) {
  if (nth > 0) { const first = weekday(y, m, 1); return 1 + ((wd - first + 7) % 7) + (nth - 1) * 7; }
  const n = daysIn(y, m), last = weekday(y, m, n); return n - ((last - wd + 7) % 7);
}

/* kind: regular (day off with pay) · special (special non-working day) · observance (a known day, not a day off) */
const FIXED = [
  [1, 1, "New Year's Day", 'regular'], [4, 9, 'Araw ng Kagitingan', 'regular'], [5, 1, 'Labor Day', 'regular'],
  [6, 12, 'Independence Day', 'regular'], [11, 30, 'Bonifacio Day', 'regular'], [12, 25, 'Christmas Day', 'regular'], [12, 30, 'Rizal Day', 'regular'],
  [8, 21, 'Ninoy Aquino Day', 'special'], [11, 1, "All Saints' Day", 'special'], [11, 2, "All Souls' Day", 'special'],
  [12, 8, 'Immaculate Conception', 'special'], [12, 24, 'Christmas Eve', 'special'], [12, 31, "New Year's Eve", 'special'],
  [2, 14, "Valentine's Day", 'observance'],
];

/** Every built-in holiday of a year as { date, name, kind }. */
export function builtIn(y) {
  const out = FIXED.map(([m, d, name, kind]) => ({ date: ymd(y, m, d), name, kind }));
  const [em, ed] = easter(y);
  out.push({ date: addDays(y, em, ed, -3), name: 'Maundy Thursday', kind: 'regular' }, { date: addDays(y, em, ed, -2), name: 'Good Friday', kind: 'regular' },
    { date: addDays(y, em, ed, -1), name: 'Black Saturday', kind: 'special' }, { date: ymd(y, em, ed), name: 'Easter Sunday', kind: 'observance' },
    { date: ymd(y, 8, nthWeekday(y, 8, -1, 1)), name: 'National Heroes Day', kind: 'regular' },
    { date: ymd(y, 5, nthWeekday(y, 5, 2, 0)), name: "Mother's Day", kind: 'observance' },
    { date: ymd(y, 6, nthWeekday(y, 6, 3, 0)), name: "Father's Day", kind: 'observance' });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

const ORDER = { saved: 0, regular: 1, special: 2, observance: 3 };
/** A remembered holiday matches a date by calendar date ('date' rule) or by weekday of the month ('nth' rule). */
export function ruleMatches(r, date) {
  const [y, m, d] = date.split('-').map(Number); if (r.month !== m) return false;
  return r.type === 'nth' ? nthWeekday(y, m, r.nth, r.wd) === d && weekday(y, m, d) === r.wd : r.day === d;
}
/** Everything known for one date: what the admin remembered first, then the built-in ones. */
export function holidaysOn(date, rules = []) {
  const y = +date.slice(0, 4);
  const saved = rules.filter(r => ruleMatches(r, date)).map(r => ({ name: r.name, kind: 'saved', ruleId: r.id }));
  const known = builtIn(y).filter(h => h.date === date).map(h => ({ name: h.name, kind: h.kind }));
  return [...saved, ...known].sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);
}
/** The next `n` known days from `from` (inclusive), within `within` days; `skip` is a Set of dates already marked. */
export function upcoming(from, rules = [], { n = 6, within = 120, skip = new Set() } = {}) {
  const out = [], y = +from.slice(0, 4), end = addDays(...from.split('-').map(Number), within);
  for (let yy = y; yy <= y + 1; yy++) {
    for (const h of builtIn(yy)) if (h.date >= from && h.date <= end && !skip.has(h.date) && h.kind !== 'observance') out.push({ ...h, kind: h.kind });
    for (const r of rules) {
      const day = r.type === 'nth' ? nthWeekday(yy, r.month, r.nth, r.wd) : Math.min(r.day, daysIn(yy, r.month)), date = ymd(yy, r.month, day);
      if (date >= from && date <= end && !skip.has(date)) out.push({ date, name: r.name, kind: 'saved', ruleId: r.id });
    }
  }
  const seen = new Set();
  return out.sort((a, b) => a.date.localeCompare(b.date) || ORDER[a.kind] - ORDER[b.kind]).filter(h => { const k = h.date + h.name; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, n);
}
const ORD = ['', '1st', '2nd', '3rd', '4th'];
const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** The two ways a chosen date can repeat each year, with plain-language labels. */
export function repeatOptions(date) {
  const [y, m, d] = date.split('-').map(Number), wd = weekday(y, m, d), nth = Math.ceil(d / 7), isLast = d + 7 > daysIn(y, m);
  const nthRule = isLast ? { type: 'nth', month: m, nth: -1, wd } : { type: 'nth', month: m, nth, wd };
  return [
    { label: `Every ${MON[m - 1]} ${d}`, rule: { type: 'date', month: m, day: d } },
    { label: `Every ${isLast ? 'last' : ORD[nth]} ${WD[wd]} of ${MON[m - 1]}`, rule: nthRule },
  ];
}
export const ruleId = (r, name) => `${r.type}:${r.month}:${r.type === 'nth' ? r.nth + ':' + r.wd : r.day}:${name}`;
export const describeRule = r => r.type === 'nth'
  ? `Every ${r.nth === -1 ? 'last' : ORD[r.nth]} ${WD[r.wd]} of ${MON[r.month - 1]}` : `Every ${MON[r.month - 1]} ${r.day}`;
export const KIND_LABEL = { regular: 'Regular holiday', special: 'Special non-working day', observance: 'Observance', saved: 'Saved by you' };
