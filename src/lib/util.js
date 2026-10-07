/* Small shared helpers: dom, dates, times, formatting. No app state in here. */
export const $ = s => document.querySelector(s);
export const $$ = s => [...document.querySelectorAll(s)];
export const isOn = id => !$('#' + id).classList.contains('hide');

export const pad = n => String(n).padStart(2, '0');
/** 'HH:MM' -> minutes since midnight */
export const m = t => { const [a, b] = t.split(':'); return +a * 60 + +b; };
/** minutes since midnight -> 'HH:MM' */
export const hm = x => pad(Math.floor(x / 60)) + ':' + pad(x % 60);
/** '13:05' -> '1:05 PM' */
export const t12 = t => { if (!t) return ''; const [h, mi] = t.split(':'); return ((+h % 12) || 12) + ':' + mi + ' ' + (+h < 12 ? 'AM' : 'PM'); };
/** '13:05' -> '1:05' (as printed on the form: the column header already says A.M./P.M.) */
export const tPrint = t => { if (!t) return ''; const [h, mi] = t.split(':'); return (+h > 12 ? +h - 12 : +h) + ':' + mi; };

export const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
export const addDays = (d, n) => { const x = new Date(d + 'T00:00'); x.setDate(x.getDate() + n); return ymd(x); };
export const mondayOf = d => { const x = new Date(d + 'T00:00'); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return ymd(x); };
export const shiftYM = (ym, k) => { const d = new Date(ym + '-01T00:00'); d.setMonth(d.getMonth() + k); return ymd(d).slice(0, 7); };
export const spanDays = (a, b) => Math.round((new Date(b + 'T00:00') - new Date(a + 'T00:00')) / 864e5) + 1;
export const daysInMonth = ym => { const [Y, M] = ym.split('-').map(Number); return new Date(Y, M, 0).getDate(); };

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const fmtDate = d => d ? new Date(d + 'T00:00').toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' }) : 'Pick a date';
export const fmtRange = (a, b) => a === b ? fmtDate(a) : `${fmtDate(a)} → ${fmtDate(b)}`;
export const ordinal = n => n + ((n % 100 >= 11 && n % 100 <= 13) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'));
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** gradient classes cycled for avatars */
export const GRAD = ['g1', 'g3', 'g4', 'g2'];

/** Philippine flag as an SVG: the flag emoji shows as the letters "PH" on Windows. */
export function phFlag(w = 24) {
  const star = (cx, cy, R = 1.5, r = .6) => Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / 5, k = i % 2 ? r : R; return (cx + k * Math.cos(a)).toFixed(2) + ',' + (cy + k * Math.sin(a)).toFixed(2); }).join(' ');
  const rays = Array.from({ length: 8 }, (_, i) => { const a = i * Math.PI / 4; return `<line x1="${(4.6 + 2.3 * Math.cos(a)).toFixed(2)}" y1="${(8 + 2.3 * Math.sin(a)).toFixed(2)}" x2="${(4.6 + 3.3 * Math.cos(a)).toFixed(2)}" y2="${(8 + 3.3 * Math.sin(a)).toFixed(2)}"/>`; }).join('');
  return `<svg viewBox="0 0 32 16" width="${w}" height="${w / 2}" style="display:inline-block;vertical-align:-.2em;border-radius:${Math.max(2, w / 12)}px;box-shadow:0 0 0 1px rgba(255,255,255,.18)" aria-label="Philippine flag"><rect width="32" height="8" fill="#0038a8"/><rect y="8" width="32" height="8" fill="#ce1126"/><path d="M0 0 L14 8 L0 16Z" fill="#fff"/><circle cx="4.6" cy="8" r="1.7" fill="#fcd116"/><g stroke="#fcd116" stroke-width=".55" stroke-linecap="round">${rays}</g><g fill="#fcd116"><polygon points="${star(1.5, 2.9)}"/><polygon points="${star(1.5, 13.1)}"/><polygon points="${star(11.4, 8)}"/></g></svg>`;
}

/** localStorage that never throws (private windows, blocked storage). Device-local only: never synced. */
export const store = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* ignore */ } },
};
