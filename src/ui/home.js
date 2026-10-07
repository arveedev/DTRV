/* The home screen: clock, the four tiles, Leave/Day-off/Holiday/Others pills, the PIN keypad,
   and the sheet that follows a recording. */
import { $, $$, isOn, t12, tPrint, store, phFlag, ordinal, MONTHS, fmtDate, esc } from '../lib/util.js';
import { now } from '../lib/clock.js';
import { SLOT_LABEL, REMARK_LABEL, AWAY, canRecord, suggest, lateMinutes, expectedOut, dayState, nickOf } from '../lib/rules.js';
import { S, hasAdminPin, get, emp, schedOf, monthStats, ensureMonth, recordTime, undoRecord, setTime } from '../data/repo.js';
import { ICONS, buildKeys, openSheet, closeSheet, toast, shake, countUp, burst, pickTime, SLOT_PRESETS, onSheetClose } from './core.js';
import { openMy } from './my.js';
import { openRemarkSheet } from './remarks.js';
import { openGate } from './admin.js';
import { cloudInfo } from './cloud.js';
import { afterChange } from './app.js';

const SLOT_UI = {
  am_in: { g: 'g1', ic: 'sun', greet: 'Good morning' },
  am_out: { g: 'g2', ic: 'fork', greet: 'Enjoy your lunch' },
  pm_in: { g: 'g3', ic: 'cup', greet: 'Welcome back' },
  pm_out: { g: 'g4', ic: 'home', greet: 'Ingat pauwi' },
};
export const SLOT_G = k => SLOT_UI[k].g;
const AWAY_MSG = { LEAVE: ['🌴', 'Enjoy your leave'], DAYOFF: ['🏠', 'Enjoy your day-off'], HOLIDAY: [phFlag(92), 'Enjoy the holiday'] };
const DEFAULT_SUB = { am_in: 'Arrive', am_out: 'Lunch', pm_in: 'Back', pm_out: 'Home' };

let selSlot = 'am_in', selRemark = null, typed = '', pendingMy = false;
let lastCode = store.get('dtrv.lastCode');
let lastH = '', lastM = '', lastDate = '';

export const rememberedUser = () => lastCode;
export function forgetUser() { lastCode = null; store.set('dtrv.lastCode', null); autoToggle(); }

const entryOf = no => no ? get(no, now().date) : undefined;
const stateOf = no => dayState(entryOf(no));

/* ---------- clock ---------- */
export function tick() {
  const { date, time, d } = now(), [h, mi] = time.split(':'), hh = String(+h % 12 || 12), ap = +h < 12 ? 'AM' : 'PM';
  $('#hDate').textContent = d.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).replace(/,/g, ' ·');
  if (date !== lastDate) {                      // a new day (or first run): make sure its month is loaded, re-pick the tile
    const first = !lastDate; lastDate = date;
    ensureMonth(date.slice(0, 7)).then(() => { if (!first) { autoToggle(); afterChange(); } });
  }
  if (hh === lastH && mi === lastM) return;
  const first = !lastH;
  $('#hTime').innerHTML = `<span class="${!first && hh !== lastH ? 'bump' : ''}">${hh}</span><span class="colon">:</span><span class="${!first ? 'bump' : ''}">${mi}</span><small>${ap}</small>`;
  lastH = hh; lastM = mi;
}

/* ---------- tiles, pills, dots ---------- */
export function autoToggle() {
  const st = stateOf(lastCode);
  selSlot = st.away ? null : suggest(st.e, now().time);
  selRemark = null; pendingMy = false; paintToggles();
}
export function paintToggles() {
  const { e, hasTimes, away } = stateOf(lastCode);
  $('#welcome').hidden = S.emps.length > 0;
  if (!$('#welcome').hidden) {
    const pin = hasAdminPin(), cloud = cloudInfo().on;
    $('#welcome p').textContent = pin
      ? `No people on this phone yet. ${cloud ? 'If you already added people on another device, wait a few seconds for sync, or reload. ' : ''}Otherwise tap the button and enter your PIN to add the first person.`
      : `Create your admin PIN, then add the first person. ${cloud ? 'Set up on one device only; the others will receive it by sync.' : 'Everything stays on this phone.'}`;
    $('#startSetup').textContent = pin ? 'Open admin' : 'Set up';
  } $('#toggles').hidden = $('#chips').hidden = S.emps.length === 0;
  $('#toggles').classList.toggle('away', !!away);
  $$('.tg').forEach(b => {
    const k = b.dataset.s, t = e?.[k], chk = canRecord(e, k), st = b.querySelector('.st');
    b.classList.toggle('on', !away && !selRemark && !pendingMy && k === selSlot && !t);
    b.classList.toggle('done', !!t && !away); b.classList.toggle('lock', !!away || (!t && !chk.ok));
    const want = away ? '—' : t ? tPrint(t) : DEFAULT_SUB[k];
    if (st.textContent !== want) { st.textContent = want; st.className = 'st' + (t && !away ? ' tm chipin' : ''); }
  });
  $$('.chip').forEach(b => { b.classList.toggle('on', b.dataset.r === selRemark); b.classList.toggle('off', AWAY.includes(b.dataset.r) && hasTimes); });
  const pin = pendingMy || !!selRemark;       // My DTR or an armed pill: ask for the PIN again
  $('#keys').classList.toggle('pin', pin); $('#empno').classList.toggle('pin', pin);
  const L = $('#keys [data-k="L"]'); L.textContent = pin ? 'Cancel' : 'My DTR'; L.classList.toggle('on', pin);
}
function paintDots(n = typed.length) { $$('#empno div').forEach((d, i) => d.classList.toggle('f', i < n)); }
function dotsFlash(box, kind) {
  box.classList.remove('ok', 'err', 'shake'); void box.offsetWidth; box.classList.add(kind); if (kind === 'err') box.classList.add('shake');
  setTimeout(() => { box.classList.remove('ok', 'err', 'shake'); paintDots(); }, 520);
}

/* ---------- the celebratory sheet for leave / day-off / holiday ---------- */
export function enjoy(p, code, note = '') {
  const [emo, msg] = AWAY_MSG[code], hol = code === 'HOLIDAY' ? (S.holidays.find(h => h.date === now().date)?.name || '') : '';
  openSheet(`<div class="joy" data-st><div class="emo">${emo}</div><b>${msg}, ${esc(nickOf(p))}!</b><p>No clock-in needed today.</p>${hol || note ? `<small>${esc([hol, note].filter(Boolean).join(' · '))}</small>` : ''}</div>
    <div class="act" data-st><button class="p" id="joyDone">Done</button></div>`, 'res');
  $('#joyDone').onclick = closeSheet; setTimeout(() => burst($('.joy')), 250);
}

/* ---------- after recording ---------- */
export function showResult(no, date, slot, opt = {}) {
  const p = emp(no), e = get(no, date), sc = schedOf(p), ym = date.slice(0, 7), u = SLOT_UI[slot];
  const late = slot === 'am_in' ? lateMinutes({ am_in: e.am_in }, { ...sc, pmLate: false }) : (slot === 'pm_in' && sc.pmLate) ? lateMinutes({ pm_in: e.pm_in }, sc) : 0;
  const st = monthStats(no, ym), exp = slot === 'am_in' ? expectedOut(e, sc) : null;
  const chars = [...t12(e[slot])].map((c, i) => `<span class="ch" style="--i:${i}">${c === ' ' ? '&nbsp;' : c}</span>`).join('');
  openSheet(`
    <div class="hd" data-st><div class="ic ${u.g}" id="rsIc">${ICONS[u.ic]}</div><b>${u.greet}, ${esc(nickOf(p))}!</b></div>
    <div class="bigt">${chars}</div>
    ${late ? `<div class="late" data-st><div class="r"><span>⚠ Late by <b id="lateN">0</b> min</span><span><b>${ordinal(st.lates)}</b> late this ${MONTHS[+ym.slice(5) - 1]}</span></div><div class="bar"><i style="--w:${Math.min(100, Math.max(8, late / 60 * 100))}%"></i></div></div>`
      : slot === 'am_in' ? `<div class="ok" data-st><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.8 2.8L16 9.5"/></svg><span>On time · ${st.lates} late${st.lates === 1 ? '' : 's'} this month</span></div>` : ''}
    ${exp ? `<div class="note" data-st>Your time out today: <b>${t12(exp)}</b> (flexi)</div>` : ''}
    <div class="act" data-st>${opt.fresh ? '<button id="rsUndo">Undo</button>' : ''}<button id="rsChange">Change time</button><button class="p" id="rsDone">Done</button></div>`, 'res');
  setTimeout(() => { countUp($('#lateN'), late); if (!late && slot === 'am_in') burst($('#rsIc').parentElement); }, 250);
  $('#rsDone').onclick = closeSheet;
  $('#rsChange').onclick = () => openTimeSheet(no, date, slot, 'result');
  if (opt.fresh) $('#rsUndo').onclick = async () => {
    await undoRecord(no, date, slot); closeSheet(); autoToggle(); afterChange(); toast(`Undone · <b>${SLOT_LABEL[slot]}</b> removed`);
  };
}

/** Edit (or add / clear) one time. `from` is 'tile' (tapped on the home screen) or 'result' (Change time on the sheet). */
export function openTimeSheet(no, date, slot, from = 'result') {
  const e = get(no, date) || {};
  pickTime({ title: `${e[slot] ? 'Edit' : 'Add'} ${SLOT_LABEL[slot]} · ${fmtDate(date)}`, value: e[slot] || null, presets: SLOT_PRESETS[slot], clearable: !!e[slot] }, async v => {
    try { await setTime(no, date, slot, v); } catch (err) { toast(err.html || err.message, 'err'); return; }
    if (v === null) { closeSheet(); autoToggle(); afterChange(); toast(`<b>${SLOT_LABEL[slot]}</b> cleared`); return; }
    afterChange();
    if (from === 'result') showResult(no, date, slot, {}); else { closeSheet(); autoToggle(); toast(`<b>${SLOT_LABEL[slot]}</b> set to ${t12(v)}`); }
  });
}

/* ---------- keypad ---------- */
function pressDigit(d) {
  if (typed.length >= 3) return;
  typed += d; paintDots();
  if (typed.length === 3) setTimeout(submit, 240);
}
async function submit() {
  const p = emp(typed); typed = ''; const box = $('#empno'); paintDots(3);
  if (!p || p.active === false) { dotsFlash(box, 'err'); toast('Code not found', 'err'); return; }
  dotsFlash(box, 'ok');
  if (pendingMy) { pendingMy = false; paintToggles(); setTimeout(() => openMy(p.no, 'rec'), 420); return; }   // just looking: never changes whose phone this is
  const switched = p.no !== lastCode; lastCode = p.no; store.set('dtrv.lastCode', p.no);
  const st = stateOf(p.no);
  if (switched || !selSlot) selSlot = st.away ? null : suggest(st.e, now().time);       // a different person: pick *their* next slot
  if (selRemark) {
    const c = selRemark;
    if (AWAY.includes(c) && st.hasTimes) { toast(`You've already clocked in today, so <b>${REMARK_LABEL[c]}</b> isn't available. Use <b>Others</b> for a reason.`, 'err'); selRemark = null; paintToggles(); return; }
    setTimeout(() => openRemarkSheet(p.no, c, now().date), 420); return;
  }
  if (st.away) { enjoy(p, st.away); autoToggle(); return; }
  const { date, time } = now();
  if (!selSlot) { toast('All 4 times are already recorded today', 'err'); autoToggle(); return; }
  const slot = selSlot;
  try { await recordTime(p.no, slot, time, date); } catch (err) { toast(err.html || err.message, 'err'); autoToggle(); return; }
  autoToggle(); afterChange();
  setTimeout(() => showResult(p.no, date, slot, { fresh: true }), 420);
}

/* ---------- wiring ---------- */
export function initHome() {
  $$('[data-ic]').forEach(el => { el.innerHTML = ICONS[el.dataset.ic]; });
  $$('.phf').forEach(el => { el.innerHTML = phFlag(18); });
  if (lastCode && !emp(lastCode)) lastCode = null;
  $$('.tg').forEach(b => b.onclick = () => {
    const k = b.dataset.s, st = stateOf(lastCode), p = lastCode && emp(lastCode);
    if (st.away) { enjoy(p, st.away); shake(b); return; }
    const chk = canRecord(st.e, k);
    if (lastCode && (st.e?.[k] || !chk.ok)) { openTimeSheet(lastCode, now().date, k, 'tile'); return; }     // recorded, or blocked: edit the time
    selSlot = k; selRemark = null; pendingMy = false; paintToggles();
  });
  $$('.chip').forEach(b => b.onclick = () => {
    const r = b.dataset.r;
    if (AWAY.includes(r) && stateOf(lastCode).hasTimes) { toast(`You've already clocked in today, so <b>${REMARK_LABEL[r]}</b> isn't available. Use <b>Others</b> for a reason.`, 'err'); shake(b); return; }
    selRemark = selRemark === r ? null : r; pendingMy = false; paintToggles();
  });
  buildKeys($('#keys'), 'My DTR', () => { if (pendingMy || selRemark) { pendingMy = false; selRemark = null; } else pendingMy = true; typed = ''; paintDots(); paintToggles(); },
    pressDigit, () => { typed = typed.slice(0, -1); paintDots(); });
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape') { $('#picker').classList.contains('show') ? $('#pkScrim').click() : closeSheet(); }
    if (!isOn('p-record') || $('#sheet').classList.contains('show')) return;
    if (/^\d$/.test(ev.key)) pressDigit(ev.key);
    if (ev.key === 'Backspace') { typed = typed.slice(0, -1); paintDots(); }
  });
  onSheetClose(() => { if (selRemark) { selRemark = null; paintToggles(); } });   // dismissing a remark sheet also un-arms the pill
  $('#toAdmin').onclick = () => openGate();
  $('#startSetup').onclick = () => openGate();
  tick(); autoToggle(); paintDots();
  setInterval(tick, 1000);
}
