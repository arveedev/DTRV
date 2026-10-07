/* The home screen: clock, the four tiles, Leave/Day-off/Holiday/Others pills, the PIN keypad,
   and the sheet that follows a recording. */
import { $, $$, isOn, t12, tPrint, store, phFlag, ordinal, MONTHS, fmtDate, esc } from '../lib/util.js';
import { now } from '../lib/clock.js';
import { SLOT_LABEL, REMARK_LABEL, AWAY, canRecord, suggest, lateMinutes, expectedOut, dayState, nickOf } from '../lib/rules.js';
import { S, hasAdminPin, get, emp, schedOf, monthStats, ensureMonth, recordTime, undoRecord, setTime } from '../data/repo.js';
import { ICONS, stagger, buildKeys, openSheet, closeSheet, toast, shake, countUp, burst, pickTime, SLOT_PRESETS, onSheetClose } from './core.js';
import { openMy } from './my.js';
import { openRemarkSheet } from './remarks.js';
import { openGate } from './admin.js';
import { cloudInfo, saveKeyFrom, setSyncKey } from './cloud.js';
import { sync } from '../data/db.js';
import { bioInit, bioAvailable, bioFor, bioClear, bioEnroll, bioVerify, bioSkip, bioSkipped } from './bio.js';
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

const KEY_CAL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M8 14h2M12 14h2M8 17h2" /></svg>';
const KEY_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
let keysWerePin = null, swapT = 0;
let selSlot = 'am_in', selRemark = null, typed = '', pendingMy = false;
let lastCode = store.get('dtrv.lastCode');
let lastH = '', lastM = '', lastDate = '';

export const rememberedUser = () => lastCode;
export function forgetUser() { bioClear(); lastCode = null; store.set('dtrv.lastCode', null); autoToggle(); }

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


/* ---------- the card shown while there is nobody to clock in yet ---------- */
const WICONS = {
  link: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/></svg>',
  sync: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 0 0-14-5.3L4 9"/><path d="M4 4v5h5"/><path d="M4 12a8 8 0 0 0 14 5.3L20 15"/><path d="M20 20v-5h-5"/></svg>',
  user: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/></svg>',
};
let wState = '', wSig = '', connecting = false;
function welcomeState() {
  if (S.emps.length) return '';
  const ci = cloudInfo();
  if (connecting) return 'connecting';
  if (ci.on && !ci.hasKey) return 'connect';
  if (ci.on && ['error', 'offline'].includes(sync.phase)) return 'trouble';
  if (ci.on && sync.phase !== 'in-sync') return 'syncing';
  return hasAdminPin() ? 'empty' : 'setup';
}
export function paintWelcome() {
  const st = welcomeState(), w = $('#welcome'), scr = $('#p-record');
  scr.classList.toggle('setup', !!st); w.hidden = !st;
  if (!st) { if (wState) { wState = ''; wSig = ''; stagger(scr, 40); } return; }
  const sig = [st, sync.phase, cloudInfo().error].join('|'); if (sig === wSig) return; wSig = sig;
  const set = (icon, title, text, btn, opts = {}) => {
    $('#wIc').innerHTML = icon; $('#welcome b').textContent = title; $('#welcome p').textContent = text;
    $('#keyIn').hidden = !opts.input; const b = $('#startSetup'); b.hidden = !btn; b.textContent = btn || '';
    const alt = $('#wAlt'); alt.hidden = !opts.alt; alt.textContent = opts.alt || '';
    let sp = $('#wSpin');
    if (opts.busy && !sp) { sp = document.createElement('div'); sp.id = 'wSpin'; sp.className = 'wspin'; w.append(sp); }
    if (!opts.busy && sp) sp.remove();
  };
  if (st === 'connect') set(WICONS.link, 'Connect this phone', 'Paste the sync key or setup link from your admin. This brings your people and PIN to this phone.', 'Connect', { input: true });
  else if (st === 'connecting') set(WICONS.link, 'Connecting…', 'Saving the key and starting sync.', '', { busy: true });
  else if (st === 'syncing') set(WICONS.sync, 'Syncing your data…', 'Getting your people and settings. This takes a few seconds.', '', { busy: true });
  else if (st === 'trouble') set(WICONS.sync, sync.phase === 'offline' ? "You're offline" : "Couldn't sync", sync.phase === 'offline' ? 'Connect to the internet and this continues by itself.' : (cloudInfo().error || sync.error || 'Check the sync key.'), '', { alt: 'Use a different key' });
  else if (st === 'empty') set(WICONS.user, 'No people yet', 'Open the admin area (✦ at the top right) and add the first person.', 'Open admin');
  else set(WICONS.user, 'Welcome to DTRV', 'Create your admin PIN, then add the first person.', 'Set up');
  if (st !== wState) { wState = st; w.classList.remove('pop'); void w.offsetWidth; w.classList.add('pop'); stagger(w, 70); }
}

/* ---------- tiles, pills, dots ---------- */
export function autoToggle() {
  const st = stateOf(lastCode);
  selSlot = st.away ? null : suggest(st.e, now().time);
  selRemark = null; pendingMy = false; paintToggles();
}
export function paintToggles() {
  const { e, hasTimes, away } = stateOf(lastCode);
  if (selSlot && e?.[selSlot] && !away) selSlot = suggest(e, now().time);     // that slot was just recorded elsewhere: move on
  paintWelcome();
  { const b = bioFor(); $('#bioBtn').hidden = !(bioAvailable() && b && lastCode && b.code === lastCode && emp(b.code)); }
  { const p = lastCode && emp(lastCode), ym = now().date.slice(0, 7), n = p ? monthStats(lastCode, ym).lates : 0, chip = $('#lateChip');
    const txt = n ? `⚠ ${n} late${n === 1 ? '' : 's'} in ${MONTHS[+ym.slice(5) - 1]}` : '';
    if (chip.textContent !== txt) { chip.textContent = txt; chip.hidden = !n; if (n) { chip.style.animation = 'none'; void chip.offsetWidth; chip.style.animation = ''; } } }
  $('#toggles').classList.toggle('away', !!away);
  $$('.tg').forEach(b => {
    const k = b.dataset.s, t = e?.[k], chk = canRecord(e, k), st = b.querySelector('.st');
    b.classList.toggle('on', !away && !selRemark && !pendingMy && k === selSlot && !t);
    b.classList.toggle('done', !!t && !away); b.classList.toggle('lock', !!away || (!t && !chk.ok));
    const want = away ? '—' : t ? tPrint(t) : DEFAULT_SUB[k];
    if (st.textContent !== want) { st.textContent = want; st.className = 'st' + (t && !away ? ' tm chipin' : ''); }
  });
  $('#remarkBtn').classList.toggle('on', !!selRemark);
  const pin = pendingMy || !!selRemark;       // My DTR or an armed pill: ask for the PIN again
  $('#keys').classList.toggle('pin', pin); $('#empno').classList.toggle('pin', pin);
  const L = $('#keys [data-k="L"]');
  if (L.dataset.mode !== (pin ? 'x' : 'cal')) {
    L.dataset.mode = pin ? 'x' : 'cal'; L.innerHTML = pin ? KEY_X : KEY_CAL; L.classList.toggle('on', pin);
    L.setAttribute('aria-label', pin ? 'Cancel' : 'My DTR');
    if (keysWerePin !== null && keysWerePin !== pin) { const k = $('#keys'); k.classList.remove('swap'); void k.offsetWidth; k.classList.add('swap'); clearTimeout(swapT); swapT = setTimeout(() => k.classList.remove('swap'), 900); }
    keysWerePin = pin;
  }
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
    ${bioAvailable() && opt.fresh && !(bioFor()?.code === no) && !bioSkipped(no) ? `<div class="bioask" data-st>Use your face or fingerprint next time, instead of typing your code?<div class="row"><button id="rsBioNo">Not now</button><button class="p" id="rsBioYes">Turn on</button></div></div>` : ''}
    <div class="act" data-st>${opt.fresh ? '<button id="rsUndo">Undo</button>' : ''}<button id="rsChange">Change time</button><button class="p" id="rsDone">Done</button></div>`, 'res');
  setTimeout(() => { countUp($('#lateN'), late); if (!late && slot === 'am_in') burst($('#rsIc').parentElement); }, 250);
  $('#rsDone').onclick = closeSheet;
  if ($('#rsBioYes')) {
    $('#rsBioNo').onclick = () => { bioSkip(no); $('.bioask').remove(); };
    $('#rsBioYes').onclick = async () => {
      try { await bioEnroll(no, p.name); $('.bioask').remove(); paintToggles(); toast('Face / fingerprint is on for this phone'); }
      catch (e) { if (e?.name !== 'NotAllowedError' && e?.name !== 'AbortError') toast(esc(e?.message || 'Could not turn it on'), 'err'); }
    };
  }
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
  return proceed(p);
}
/** Everything that follows once we know who it is: typed code or face / fingerprint. */
async function proceed(p) {
  if (pendingMy) { pendingMy = false; paintToggles(); setTimeout(() => openMy(p.no, 'rec'), 420); return; }   // just looking: never changes whose phone this is
  const switched = p.no !== lastCode; lastCode = p.no; store.set('dtrv.lastCode', p.no);
  const st = stateOf(p.no);
  if (switched || !selSlot) selSlot = st.away ? null : suggest(st.e, now().time);       // a different person: pick *their* next slot
  if (selRemark) {                              // Remark button was armed: show the remark sheet (Leave/Day-off/Holiday only if nothing is clocked yet)
    setTimeout(() => openRemarkSheet(p.no, st.hasTimes ? 'OTHER' : 'LEAVE', now().date, { lockAway: st.hasTimes }), 420); return;
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
  if (lastCode && !emp(lastCode)) lastCode = null;
  $$('.tg').forEach(b => b.onclick = () => {
    const k = b.dataset.s, st = stateOf(lastCode), p = lastCode && emp(lastCode);
    if (st.away) { enjoy(p, st.away); shake(b); return; }
    const chk = canRecord(st.e, k);
    if (lastCode && (st.e?.[k] || !chk.ok)) { openTimeSheet(lastCode, now().date, k, 'tile'); return; }     // recorded, or blocked: edit the time
    selSlot = k; selRemark = null; pendingMy = false; paintToggles();
  });
  $('#remarkBtn').onclick = () => { selRemark = selRemark ? null : 'ASK'; pendingMy = false; typed = ''; paintDots(); paintToggles(); };
  buildKeys($('#keys'), KEY_CAL, () => { if (pendingMy || selRemark) { pendingMy = false; selRemark = null; } else pendingMy = true; typed = ''; paintDots(); paintToggles(); },
    pressDigit, () => { typed = typed.slice(0, -1); paintDots(); });
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape') { $('#picker').classList.contains('show') ? $('#pkScrim').click() : closeSheet(); }
    if (ev.target.closest?.('input,textarea')) return;                 // typing in a field is not the keypad
    if (!isOn('p-record') || $('#sheet').classList.contains('show')) return;
    if (/^\d$/.test(ev.key)) pressDigit(ev.key);
    if (ev.key === 'Backspace') { typed = typed.slice(0, -1); paintDots(); }
  });
  onSheetClose(() => { if (selRemark) { selRemark = null; paintToggles(); } });   // dismissing a remark sheet also un-arms the pill
  $('#toAdmin').onclick = () => openGate();
  $('#startSetup').onclick = () => {
    if (!$('#keyIn').hidden) {
      if (!saveKeyFrom($('#keyIn').value)) { shake($('#keyIn')); return; }
      document.activeElement?.blur();              // close the keyboard first: iOS keeps a shrunken screen after a reload otherwise
      connecting = true; paintWelcome();
      setTimeout(() => { $('#app').classList.add('fading'); setTimeout(() => location.replace(location.pathname), 300); }, 900);   // fade out, then restart cleanly with the key
      return;
    }
    openGate();
  };
  $('#bioBtn').onclick = async () => {
    const btn = $('#bioBtn'); btn.classList.add('busy');
    try {
      const code = await bioVerify(), p = emp(code);
      if (!p || p.active === false) { toast('This person is no longer on the list', 'err'); return; }
      await proceed(p);
    } catch (e) { if (e?.name !== 'NotAllowedError' && e?.name !== 'AbortError') toast(esc(e?.message || 'Could not check face / fingerprint'), 'err'); }
    finally { btn.classList.remove('busy'); }
  };
  bioInit().then(paintToggles);
  $('#wAlt').onclick = () => { setSyncKey(null); location.reload(); };
  tick(); autoToggle(); paintDots();
  setInterval(tick, 1000);
}
