/* The admin phone app: PIN gate (behind the faint ✦), Overview / People / Hours / Print / Settings. */
import { $, $$, hm, m, t12, fmtDate, fmtRange, spanDays, addDays, shiftYM, MONTHS, GRAD, phFlag, esc } from '../lib/util.js';
import { now } from '../lib/clock.js';
import { LUNCH_START, LUNCH_END, nickOf } from '../lib/rules.js';
import { S, emp, monthStats, ensureMonth, saveEmployee, saveSchedule, saveSignatory, applyHoliday, removeHoliday,
  hasAdminPin, setAdminPin, saveHolidayRules, checkAdminPin, exportAll, importAll, settle } from '../data/repo.js';
import { go, stagger, fast, countUp, shake, buildKeys, openSheet, closeSheet, toast, pickDate, pfTime, bindTime } from './core.js';
import { openMy } from './my.js';
import { openPreview, printWith, setPrintSel } from './print.js';
import { autoToggle, forgetUser, rememberedUser } from './home.js';
import { afterChange } from './app.js';
import { cloudInfo, setSyncKey, setupLink } from './cloud.js';
import { holidaysOn, upcoming, repeatOptions, ruleId, describeRule, KIND_LABEL } from '../lib/holidays.js';

let adminOk = false, aTab = 0, aYM = now().date.slice(0, 7), gateTyped = '', gateMode = 'enter', gateFirst = '', aQ = '', aSort = 'lates', aPrintSt = null;
const TABICONS = [
  ['Overview','<path d="M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z"/>'],
  ['People','<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.3c2.2.7 3.5 2.6 3.5 5.7"/>'],
  ['Hours','<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'],
  ['Print','<path d="M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2"/><rect x="6" y="14" width="12" height="7" rx="1"/>'],
  ['Settings','<path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>'],
];
const TITLES = ['Overview', 'People', 'Working hours', 'Print DTR', 'Settings'];
const attr = s => esc(s).replace(/"/g, '&quot;');
const initial = p => (nickOf(p)[0] || '?').toUpperCase();
const matches = (p, q) => !q || (p.name + ' ' + nickOf(p) + ' ' + p.no + ' ' + (p.pos || '')).toLowerCase().includes(q.toLowerCase());
const searchHtml = (id, ph, val) => `<div class="searchrow" data-st><input id="${id}" type="search" placeholder="${ph}" value="${attr(val)}" autocomplete="off"></div>`;
const fail = err => toast(err.html || esc(err.message || String(err)), 'err');

/* ---------- gate ---------- */
const GATE = {
  enter: ['Admin', 'Enter your 6-digit PIN'],
  create: ['Create your PIN', 'Choose 6 digits for the admin'],
  confirm: ['Confirm your PIN', 'Enter the same 6 digits again'],
};
function paintGate() {
  $$('#gdots div').forEach((d, i) => d.classList.toggle('f', i < gateTyped.length));
  $('#gateTitle').textContent = GATE[gateMode][0]; $('#gateSub').textContent = GATE[gateMode][1];
}
export function openGate() {
  if (adminOk) { go('p-admin', 'r'); renderAdmin(); return; }
  gateMode = hasAdminPin() ? 'enter' : 'create'; gateTyped = ''; gateFirst = '';
  paintGate(); $('#gateLock').classList.remove('open'); go('p-gate', 'r');
}
async function gateDone() {
  const box = $('#gdots'), bad = msg => { box.classList.add('err', 'shake'); toast(msg, 'err'); setTimeout(() => { gateTyped = ''; box.classList.remove('err', 'shake'); paintGate(); }, 520); };
  if (gateMode === 'create') { gateFirst = gateTyped; gateTyped = ''; gateMode = 'confirm'; paintGate(); return; }
  if (gateMode === 'confirm') {
    if (gateTyped !== gateFirst) { gateMode = 'create'; gateFirst = ''; bad("PINs didn't match. Start again"); return; }
    try { await setAdminPin(gateTyped); } catch (e) { bad(e.message); return; }
  } else if (!(await checkAdminPin(gateTyped))) { bad('Wrong PIN'); return; }
  adminOk = true; box.classList.add('ok'); $('#gateLock').classList.add('open');
  setTimeout(() => { box.classList.remove('ok'); go('p-admin', 'r'); aTab = S.emps.length ? 0 : 1; renderAdmin(); if (!S.emps.length) openPersonSheet(null); }, 750);
}

export function initAdmin() {
  $('#gateBack').onclick = () => { go('p-record', 'l'); autoToggle(); };
  $('#aLock').onclick = () => { adminOk = false; go('p-record', 'l'); autoToggle(); };
  buildKeys($('#gkeys'), '', () => {}, d => {
    if (gateTyped.length >= 6) return; gateTyped += d; paintGate();
    if (gateTyped.length === 6) setTimeout(gateDone, 220);
  }, () => { gateTyped = gateTyped.slice(0, -1); paintGate(); });
  $('#gkeys').querySelector('[data-k="L"]').style.visibility = 'hidden';
  $('#aTabs').insertAdjacentHTML('beforeend', TABICONS.map(([n, p], i) => `<button data-t="${i}"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>${n}</button>`).join(''));
  $$('#aTabs button').forEach(b => { b.onclick = () => { aTab = +b.dataset.t; renderAdmin(); }; });
}

export const adminOpen = () => adminOk && $('#p-admin') && !$('#p-admin').classList.contains('hide');

export async function renderAdmin() {
  if (aTab === 0) await ensureMonth(aYM);
  $$('#aTabs button').forEach((b, i) => b.classList.toggle('on', i === aTab)); $('#aTabs').style.setProperty('--tab', aTab);
  $('#aTitle').textContent = TITLES[aTab]; const body = $('#aBody'); body.scrollTop = 0;
  body.classList.toggle('fill', aTab === 3);
  [aOver, aPeople, aHours, aPrint, aSet][aTab](body); stagger(body, 50);
}
/** Redraw the tabs that show data, keeping the scroll position. */
export function refreshAdmin() {
  if (!adminOpen() || aTab > 1) return;
  const y = $('#aBody').scrollTop; renderAdmin().then(() => { $('#aBody').scrollTop = y; });
}

/* ---------- overview ---------- */
function aOver(b) {
  const act = S.emps.filter(p => p.active !== false), all = act.map(p => ({ p, st: monthStats(p.no, aYM) }));
  const tl = all.reduce((a, r) => a + r.st.lates, 0), tp = all.reduce((a, r) => a + r.st.present, 0);
  const nextHol = upcoming(now().date, S.holidayRules, { n: 1, within: 14, skip: new Set(S.holidays.map(h => h.date)) })[0];
  b.innerHTML = `<div class="pctl" data-st><span style="font-weight:700">${MONTHS[+aYM.slice(5) - 1]} ${aYM.slice(0, 4)}</span><div class="mnav"><button id="oPrev">‹</button><button id="oNext">›</button></div></div>
    <div class="hero ${tl ? 'g1' : 'calm'}" style="margin-top:0" data-st><div class="n" id="oTot">0</div><div class="t"><b>late${tl === 1 ? '' : 's'} this month</b><br>${act.length} people · ${tp} days present</div></div>
    <button class="holbtn" id="holBtn" data-st>${phFlag(18)} ${nextHol ? `${esc(titleCase(nextHol.name))} · ${fmtDate(nextHol.date)}: mark it` : `Holidays · mark a day for everyone${S.holidays.length ? ` (${S.holidays.length})` : ''}`}</button>
    <div style="height:10px"></div>
    <div class="searchrow" data-st><input id="oq" type="search" placeholder="Search ${act.length} people" value="${attr(aQ)}" autocomplete="off"><button class="mini ${aSort === 'lates' ? 'on' : ''}" data-s="lates">Most lates</button><button class="mini ${aSort === 'az' ? 'on' : ''}" data-s="az">A–Z</button></div>
    <div class="plist" id="plist"></div>`;
  countUp($('#oTot'), tl, 800);
  const paint = animate => {
    const mx = Math.max(1, ...all.map(r => r.st.lateMin));
    const rows = all.filter(r => matches(r.p, aQ)).sort((a, b) => aSort === 'az' ? nickOf(a.p).localeCompare(nickOf(b.p)) : (b.st.lates - a.st.lates) || (b.st.lateMin - a.st.lateMin) || nickOf(a.p).localeCompare(nickOf(b.p)));
    $('#plist').innerHTML = rows.length ? rows.map(({ p, st }, i) => `<button class="prow" data-st data-no="${p.no}"><div class="av ${GRAD[i % 4]}">${esc(initial(p))}</div>
      <div class="pm"><b>${esc(nickOf(p))}</b><small>${esc(p.name)}</small><div class="lbar"><i style="--i:${Math.min(i, 8)};--w:${st.lateMin ? Math.max(6, st.lateMin / mx * 100) : 0}%"></i></div></div>
      <div class="pr"><span class="bd ${st.lates ? 'late' : 'ok'}">${st.lates} late${st.lates === 1 ? '' : 's'}</span><small>${st.present} days</small></div></button>`).join('') : '<div class="emptyl">No one matches</div>';
    if (animate) stagger($('#plist'), 40);
    $$('.prow[data-no]').forEach(r => { r.onclick = () => openMy(r.dataset.no, 'admin'); });
  };
  paint(false);
  $('#oq').oninput = e => { aQ = e.target.value; paint(true); };
  $$('.searchrow .mini').forEach(x => { x.onclick = () => { aSort = x.dataset.s; $$('.searchrow .mini').forEach(y => y.classList.toggle('on', y === x)); paint(true); }; });
  $('#oPrev').onclick = () => { aYM = shiftYM(aYM, -1); renderAdmin(); }; $('#oNext').onclick = () => { aYM = shiftYM(aYM, 1); renderAdmin(); };
  $('#holBtn').onclick = openHolidays;
}

/* ---------- holidays for everyone ---------- */
const kindDot = k => `<i class="kd ${k}"></i>`;
function openHolidays() {
  const list = [...S.holidays].sort((a, b) => b.date.localeCompare(a.date)), rules = S.holidayRules;
  openSheet(`<h3 data-st>${phFlag(22)} Holidays</h3>
    <div class="hlist" data-st style="margin-top:10px">${list.length ? list.map(h => `<div class="hrow"><div><b>${fmtDate(h.date)}</b><small>${esc(h.name || 'Holiday')}</small></div><button class="x" data-d="${h.date}" aria-label="Remove">✕</button></div>`).join('') : '<div class="emptyl">No holidays marked yet</div>'}</div>
    ${rules.length ? `<div class="hsub" data-st>Remembered every year</div><div class="hlist" data-st>${rules.map(r => `<div class="hrow"><div><b>${esc(r.name)}</b><small>${esc(describeRule(r))}</small></div><button class="x" data-r="${attr(r.id)}" aria-label="Forget">✕</button></div>`).join('')}</div>` : ''}
    <div class="btns" data-st><button class="btn" id="hClose">Close</button><button class="btn primary" id="hAdd">+ Add holiday</button></div>`);
  $$('.hrow .x[data-d]').forEach(x => {
    x.onclick = async () => { await ensureMonth(x.dataset.d.slice(0, 7)); await removeHoliday(x.dataset.d); afterChange(); openHolidays(); toast(`Holiday on <b>${fmtDate(x.dataset.d)}</b> removed`); };
  });
  $$('.hrow .x[data-r]').forEach(x => {
    x.onclick = async () => { await saveHolidayRules(S.holidayRules.filter(r => r.id !== x.dataset.r)); openHolidays(); toast('Forgotten. It will not be suggested again'); };
  });
  $('#hClose').onclick = closeSheet; $('#hAdd').onclick = () => openHolidayAdd();
}
const titleCase = s => s.replace(/\S+/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase());
function openHolidayAdd(prefill) {
  const today = now().date, marked = new Set(S.holidays.map(h => h.date));
  let from = prefill?.date || today, to = from, nameTouched = !!prefill?.name, repeat = 0;
  const up = upcoming(today, S.holidayRules, { n: 5, within: 150, skip: marked });
  openSheet(`<h3 data-st>Add holiday</h3>
    ${up.length ? `<div class="hsub" data-st>Coming up</div><div class="sugg hup" data-st>${up.map(h => `<button data-d="${h.date}" data-n="${attr(h.name)}">${fmtDate(h.date)} · ${esc(titleCase(h.name))}</button>`).join('')}</div>` : ''}
    <div data-st style="margin-top:6px"><div class="field"><label>Date(s)</label><button type="button" class="pf" id="hRange" data-from="${from}" data-to="${to}">${fmtDate(from)}</button></div></div>
    <div class="field" data-st><label>Name (printed after HOLIDAY)</label><input id="hName" maxlength="24" placeholder="e.g. TOWN FIESTA" value="${attr(prefill?.name || '')}" autocomplete="off"></div>
    <div class="sugg" id="hSug" data-st></div>
    <label class="check" data-st><input type="checkbox" id="hSkip" checked> Skip Sundays</label>
    <div id="hRemWrap"><label class="check" data-st><input type="checkbox" id="hRem"> Remember for every year</label>
      <div class="chooser" id="hRep" style="--n:2;--p:0;margin-top:8px;display:none"><i class="th"></i><button data-i="0" class="on"></button><button data-i="1"></button></div></div>
    <div class="btns" data-st><button class="btn" id="hBack">Back</button><button class="btn primary" id="hSave">Mark for everyone</button></div>`);
  const r = $('#hRange'), nameEl = $('#hName');
  const known = () => holidaysOn(from, S.holidayRules);
  /* suggestions and the "remember" choices follow the chosen date */
  const refresh = () => {
    const k = known(), single = from === to;
    $('#hSug').innerHTML = k.map(h => `<button data-n="${attr(h.name)}" title="${esc(KIND_LABEL[h.kind])}">${kindDot(h.kind)}${esc(titleCase(h.name))}</button>`).join('');
    $$('#hSug button').forEach(b => { b.onclick = () => { nameEl.value = b.dataset.n.toUpperCase(); nameTouched = true; }; });
    if (!nameTouched) nameEl.value = k.length ? k[0].name.toUpperCase().slice(0, 24) : '';
    const opts = repeatOptions(from), bs = $$('#hRep button');
    bs.forEach((b, i) => { b.textContent = opts[i].label; b.style.display = single || i === 0 ? '' : 'none'; });
    $('#hRep').style.setProperty('--n', single ? 2 : 1); if (!single) { repeat = 0; $('#hRep').style.setProperty('--p', 0); bs.forEach((b, i) => b.classList.toggle('on', i === 0)); }
    $('#hRemWrap').style.display = k.some(h => h.kind !== 'saved') && k.length && !$('#hRem').checked ? 'none' : '';    // already known to the app: nothing to remember
    if (!k.length && !$('#hRem').dataset.set) $('#hRem').checked = true;                                        // something new: remember by default
    $('#hRep').style.display = $('#hRem').checked ? '' : 'none';
  };
  nameEl.oninput = () => { nameTouched = true; };
  $('#hRem').onchange = () => { $('#hRem').dataset.set = '1'; $('#hRep').style.display = $('#hRem').checked ? '' : 'none'; };
  $$('#hRep button').forEach(b => { b.onclick = () => { repeat = +b.dataset.i; $('#hRep').style.setProperty('--p', repeat); $$('#hRep button').forEach(x => x.classList.toggle('on', x === b)); }; });
  const setDates = (a, b) => { from = a; to = b; r.dataset.from = a; r.dataset.to = b; r.textContent = a === b ? fmtDate(a) : `${fmtRange(a, b)} · ${spanDays(a, b)} day${spanDays(a, b) === 1 ? '' : 's'}`; refresh(); };
  r.onclick = () => pickDate({ title: 'Holiday dates', mode: 'range', from, to }, ([a, b]) => setDates(a, b));
  $$('.hup button').forEach(b => { b.onclick = () => { nameTouched = true; nameEl.value = b.dataset.n.toUpperCase().slice(0, 24); setDates(b.dataset.d, b.dataset.d); nameEl.value = b.dataset.n.toUpperCase().slice(0, 24); }; });
  $('#hBack').onclick = openHolidays;
  refresh();
  $('#hSave').onclick = async () => {
    const skip = $('#hSkip').checked, name = nameEl.value.trim().toUpperCase();
    let hit = 0, kept = 0, days = 0; const dates = [];
    try {
      for (let d = from, n = 0; d <= to && n < 62; d = addDays(d, 1), n++) {
        if (skip && new Date(d + 'T00:00').getDay() === 0) continue;
        await ensureMonth(d.slice(0, 7)); const x = await applyHoliday(d, name); hit += x.hit; kept += x.kept; days++; dates.push(d);
      }
      if ($('#hRem').checked && name && dates.length) {                                          // remember it for next year
        const list = [...S.holidayRules], add = rule => { const full = { ...rule, name, id: ruleId(rule, name) }; if (!list.some(x => x.id === full.id)) list.push(full); };
        if (dates.length === 1) add(repeatOptions(dates[0])[repeat].rule); else dates.forEach(d => add(repeatOptions(d)[0].rule));
        await saveHolidayRules(list);
      }
    } catch (e) { fail(e); return; }
    closeSheet(); autoToggle(); afterChange();
    toast(`${phFlag(16)} Holiday set: <b>${days} day${days === 1 ? '' : 's'}</b> for <b>${S.emps.filter(p => p.active !== false).length}</b> people${kept ? ` · ${kept} who already clocked in kept their times` : ''}${$('#hRem').checked ? ' · remembered for next year' : ''}`);
  };
}

/* ---------- people ---------- */
function aPeople(b) {
  b.innerHTML = `<div class="pctl" data-st><span id="pCnt" style="color:var(--rmuted);font-size:13px"></span><button class="addbtn" id="addP">+ Add person</button></div>
    ${searchHtml('pq', 'Search name, code or position', aQ)}<div class="plist" id="plist"></div>`;
  const paint = animate => {
    const rows = S.emps.filter(p => matches(p, aQ)).sort((a, b) => a.name.localeCompare(b.name));
    $('#pCnt').textContent = aQ ? `${rows.length} of ${S.emps.length}` : `${S.emps.length} people`;
    $('#plist').innerHTML = rows.length ? rows.map((p, i) => `<button class="prow ${p.active === false ? 'off' : ''}" data-st data-no="${p.no}"><div class="av ${GRAD[i % 4]}">${esc(initial(p))}</div>
      <div class="pm"><b>${esc(p.name)}</b><small>${esc(nickOf(p))} · code ${p.no}${p.pos ? ' · ' + esc(p.pos) : ''}</small></div>
      <div class="pr"><span class="bd sch">${p.active === false ? 'Inactive' : p.sched ? (p.sched.mode === 'flexi' ? 'Custom flexi' : 'Custom fixed') : 'Default hours'}</span></div></button>`).join('') : '<div class="emptyl">No one matches</div>';
    if (animate) stagger($('#plist'), 40);
    $$('.prow[data-no]').forEach(r => { r.onclick = () => openPersonSheet(emp(r.dataset.no)); });
  };
  paint(false);
  $('#pq').oninput = e => { aQ = e.target.value; paint(true); };
  $('#addP').onclick = () => openPersonSheet(null);
}
function openPersonSheet(p) {
  const isNew = !p; p = p || { no: '', name: '', nick: '', pos: '', sched: null, active: true };
  const modes = [['', 'Default'], ['fixed', 'Fixed'], ['flexi', 'Flexi']]; let md = p.sched ? p.sched.mode : '';
  openSheet(`<h3 data-st>${isNew ? 'Add person' : 'Edit person'}</h3><div class="sub" data-st>${isNew ? '3-digit code, e.g. 047 for employee no. 47. The nickname is used in greetings.' : 'Code ' + p.no + ' · the nickname is used in greetings'}</div>
    <div class="row2" data-st><div class="field"><label>Code (3 digits)</label><input id="fNo" maxlength="3" inputmode="numeric" value="${attr(p.no)}" ${isNew ? '' : 'disabled'}></div>
    <div class="field"><label>Nickname</label><input id="fNick" value="${attr(p.nick || '')}" placeholder="Juan"></div></div>
    <div class="field" data-st><label>Full name (printed on the DTR)</label><input id="fName" value="${attr(p.name)}" placeholder="ANA B. GARCIA"></div>
    <div class="field" data-st><label>Position</label><input id="fPos" value="${attr(p.pos || '')}"></div>
    <div class="field" data-st><label>Working hours</label><div class="chooser" style="--n:3;--p:${modes.findIndex(x => x[0] === md)};margin-bottom:0"><i class="th"></i>${modes.map(([v, l]) => `<button data-m="${v}" class="${v === md ? 'on' : ''}">${l}</button>`).join('')}</div></div>
    <div class="btns" data-st>${isNew ? '<button class="btn" id="fCancel">Cancel</button>' : `<button class="btn danger" id="fOff">${p.active === false ? 'Reactivate' : 'Deactivate'}</button>`}<button class="btn primary" id="fSave">Save</button></div>`);
  $$('.chooser button').forEach(bt => {
    bt.onclick = () => { md = bt.dataset.m; $('.chooser').style.setProperty('--p', modes.findIndex(x => x[0] === md)); $$('.chooser button').forEach(x => x.classList.toggle('on', x === bt)); };
  });
  if (isNew) $('#fCancel').onclick = closeSheet;
  else $('#fOff').onclick = async () => {
    const active = p.active === false;
    try { await fast(saveEmployee({ ...p, active }, false)); } catch (e) { fail(e); return; }
    closeSheet(); afterChange(); toast(active ? 'Reactivated' : 'Deactivated');
  };
  $('#fSave').onclick = async () => {
    const no = $('#fNo').value.trim(), name = $('#fName').value.trim().toUpperCase();
    if (isNew && (!/^\d{3}$/.test(no) || emp(no))) { shake($('#fNo')); toast('Code must be 3 digits and unique', 'err'); return; }
    if (!name) { shake($('#fName')); return; }
    const sched = md ? { ...(p.sched || S.sched), mode: md } : null;
    try { await fast(saveEmployee({ ...p, no: isNew ? no : p.no, name, nick: $('#fNick').value.trim(), pos: $('#fPos').value.trim(), sched }, isNew)); } catch (e) { fail(e); return; }
    closeSheet(); afterChange(); autoToggle(); toast(`Saved · <b>${esc(nickOf(emp(isNew ? no : p.no)))}</b>`);
    if (adminOpen()) renderAdmin();
  };
}

/* ---------- working hours ---------- */
function aHours(b) {
  const sc = S.sched, save = patch => { saveSchedule(patch); hoursPreview(); };
  b.innerHTML = `<div class="seg" id="hSeg" data-st style="--p:${sc.mode === 'flexi' ? 1 : 0}"><i class="th"></i><button data-m="fixed" class="${sc.mode === 'fixed' ? 'on' : ''}">Fixed time</button><button data-m="flexi" class="${sc.mode === 'flexi' ? 'on' : ''}">Flexi-time</button></div>
    <div class="card" id="fixedF" data-st ${sc.mode === 'fixed' ? '' : 'hidden'}><h4>Clock in</h4>${pfTime('hAmIn', 'Time in (late after this)', sc.amIn)}</div>
    <div class="card" id="flexiF" data-st ${sc.mode === 'flexi' ? '' : 'hidden'}><h4>Flexi · clock in &amp; out</h4>
      <div class="row2">${pfTime('hFs', 'Earliest clock in', sc.flexStart)}${pfTime('hFe', 'Latest clock in', sc.flexEnd)}</div>
      <div class="field"><label>Hours to work</label><div class="step"><button data-d="-1">−</button><b id="hReq">${sc.req}<small>hours</small></b><button data-d="1">+</button></div></div>
      <div class="rangeline" id="hRange"></div></div>
    <div class="card" data-st><div class="swrow"><span>Count a late return from lunch<br><small style="color:var(--rmuted)">PM IN after 1:00 PM</small></span><button class="swt ${sc.pmLate ? 'on' : ''}" id="hPm"><i></i></button></div></div>
    <div class="preview" id="hPrev" data-st></div>`;
  bindTime('hAmIn', { title: 'Time in', presets: ['07:30', '08:00', '08:30', '09:00'] }, v => { if (v) save({ amIn: v }); });
  bindTime('hFs', { title: 'Earliest clock in', presets: ['06:00', '06:30', '07:00', '07:30'] }, v => { if (v) save({ flexStart: v }); });
  bindTime('hFe', { title: 'Latest clock in', presets: ['08:30', '09:00', '09:30', '10:00'] }, v => { if (v) save({ flexEnd: v }); });
  $$('.step button').forEach(x => {
    x.onclick = () => {
      save({ req: Math.max(1, Math.min(12, S.sched.req + +x.dataset.d)) });
      const el = $('#hReq'); el.firstChild.nodeValue = S.sched.req; el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
    };
  });
  $('#hPm').onclick = e => { save({ pmLate: !S.sched.pmLate }); e.currentTarget.classList.toggle('on', S.sched.pmLate); };
  $$('#hSeg button').forEach(x => {
    x.onclick = () => {
      save({ mode: x.dataset.m }); const mode = S.sched.mode;
      $('#hSeg').style.setProperty('--p', mode === 'flexi' ? 1 : 0); $$('#hSeg button').forEach(y => y.classList.toggle('on', y === x));
      $('#fixedF').hidden = mode !== 'fixed'; $('#flexiF').hidden = mode !== 'flexi';
      const c = $(mode === 'fixed' ? '#fixedF' : '#flexiF'); c.classList.remove('st'); void c.offsetWidth; c.classList.add('st');
    };
  });
  hoursPreview();
}
function hoursPreview() {
  const s = S.sched, el = $('#hPrev'); if (!el) return;
  const lunchLen = m(LUNCH_END) - m(LUNCH_START), outA = hm(m(s.flexStart) + s.req * 60 + lunchLen), outB = hm(m(s.flexEnd) + s.req * 60 + lunchLen);
  if ($('#hRange')) $('#hRange').innerHTML = `Clock out between <b>${t12(outA)}</b> and <b>${t12(outB)}</b>`;
  el.innerHTML = s.mode === 'flexi'
    ? `Clock in from <b>${t12(s.flexStart)}</b> to <b>${t12(s.flexEnd)}</b>; late after <b>${t12(s.flexEnd)}</b>. Clock out after <b>${s.req} h</b> of work (in at 8:30 AM → out at <b>${t12(hm(m('08:30') + s.req * 60 + lunchLen))}</b>). Lunch is <b>12:00–1:00 PM</b> for everyone.`
    : `Late if AM IN is after <b>${t12(s.amIn)}</b>${s.pmLate ? ' or PM IN after <b>1:00 PM</b>' : ''}. Lunch is <b>12:00–1:00 PM</b> for everyone.`;
}

/* ---------- print many ---------- */
function aPrint(b) {
  const people = S.emps.filter(p => p.active !== false);
  aPrintSt ||= { sel: new Set(), ym: aYM, q: '' };
  const st = aPrintSt; st.sel = new Set([...st.sel].filter(no => people.some(p => p.no === no)));
  const label = () => MONTHS[+st.ym.slice(5) - 1] + ' ' + st.ym.slice(0, 4);
  const nos = () => people.map(p => p.no).filter(no => st.sel.has(no));
  b.innerHTML = `<div class="pctl" data-st><span style="font-weight:700">Who to print</span><div class="mnav"><button id="pPrev">‹</button><span id="pLbl">${label()}</span><button id="pNext">›</button></div></div>
    <div class="searchrow" data-st><input id="psq" type="search" placeholder="Search ${people.length} people" value="${attr(st.q)}" autocomplete="off"><button class="mini" id="pAll">All</button><button class="mini" id="pNone">None</button></div>
    <div class="cnt" id="pCount"></div>
    <div class="slist" id="slist"></div>
    <div class="pfoot" data-st><button class="btn" id="pView">Preview</button><button class="btn primary" id="pGo"></button></div>`;
  const shown = () => people.filter(p => matches(p, st.q));
  const counts = () => {
    const n = st.sel.size; $('#pCount').innerHTML = n ? `<b>${n}</b> selected${st.q ? ` · showing ${shown().length} of ${people.length}` : ''}` : `Pick who to print${st.q ? ` · showing ${shown().length} of ${people.length}` : ''}`;
    setPrintSel({ nos: nos(), ym: st.ym, page: 0 });
    $('#pGo').textContent = n ? `Print ${n} DTR${n === 1 ? '' : 's'}` : 'Print'; $('#pGo').style.opacity = $('#pView').style.opacity = n ? 1 : 0.4;
  };
  const paint = animate => {
    const rows = shown();
    $('#slist').innerHTML = rows.length ? rows.map((p, i) => `<button class="srow ${st.sel.has(p.no) ? 'on' : ''}" data-st data-no="${p.no}"><span class="chk">✓</span><div class="av ${GRAD[i % 4]}">${esc(initial(p))}</div><div class="pm"><b>${esc(nickOf(p))}</b><small>${esc(p.name)} · ${p.no}</small></div></button>`).join('') : '<div class="emptyl">No one matches</div>';
    if (animate) stagger($('#slist'), 30);
    counts();
  };
  $('#slist').onclick = e => {
    const r = e.target.closest('.srow'); if (!r) return; const no = r.dataset.no;
    st.sel.has(no) ? st.sel.delete(no) : st.sel.add(no); r.classList.toggle('on', st.sel.has(no)); counts();
  };
  $('#psq').oninput = e => { st.q = e.target.value; paint(true); };
  $('#pAll').onclick = () => { shown().forEach(p => st.sel.add(p.no)); paint(false); };
  $('#pNone').onclick = () => { st.sel.clear(); paint(false); };
  $('#pPrev').onclick = () => { st.ym = shiftYM(st.ym, -1); $('#pLbl').textContent = label(); counts(); };
  $('#pNext').onclick = () => { st.ym = shiftYM(st.ym, 1); $('#pLbl').textContent = label(); counts(); };
  $('#pView').onclick = () => { if (!st.sel.size) { toast('Pick at least one person', 'err'); return; } openPreview({ nos: nos(), ym: st.ym, page: 0 }, 'admin'); };
  $('#pGo').onclick = () => { if (!st.sel.size) { toast('Pick at least one person', 'err'); return; } printWith($('#pGo'), { nos: nos(), ym: st.ym, page: 0 }).catch(fail); };
  paint(false);
}

/* ---------- settings ---------- */
function aSet(b) {
  const cloud = cloudInfo();
  b.innerHTML = `<div class="card" data-st style="margin-top:0"><h4>Signatory on the DTR</h4>
      <div class="field"><label>Name</label><input id="gName" value="${attr(S.sign.name)}"></div><div class="field"><label>Title</label><input id="gTitle" value="${attr(S.sign.title)}"></div><div class="field"><label>Label under title</label><input id="gLabel" value="${attr(S.sign.label)}"></div></div>
    <div class="card" data-st><h4>Admin PIN</h4><div class="row2"><div class="field"><label>New PIN</label><input id="pin1" type="password" maxlength="6" inputmode="numeric"></div><div class="field"><label>Confirm</label><input id="pin2" type="password" maxlength="6" inputmode="numeric"></div></div><button class="btn" id="pinSave" style="width:100%">Change PIN</button></div>
    <div class="card" data-st><h4>Backup</h4><div style="font-size:13px;color:var(--rmuted);line-height:1.5;margin-bottom:10px">${cloud.on ? 'Your data also syncs through Dexie Cloud.' : 'Your data lives on this phone only. Keep a backup file.'}</div>
      <div class="row2"><button class="btn" id="bkSave">Download backup</button><button class="btn" id="bkLoad">Restore…</button></div><input type="file" id="bkFile" accept="application/json,.json" hidden></div>
    ${cloud.bad ? '<div class="card" data-st><h4>Sync is off</h4><div style="font-size:13px;color:var(--rmuted);line-height:1.5">The sync address saved in Vercel (<b style="color:var(--rink)">VITE_DEXIE_CLOUD_DB_URL</b>) is not a valid <b style="color:var(--rink)">https://…</b> address, so the app is running on this phone only.</div></div>' : ''}
    ${cloud.error ? `<div class="card" data-st><h4>Sync problem</h4><div style="font-size:13px;color:var(--rlate);line-height:1.5">${esc(cloud.error)}</div></div>` : ''}
    ${cloud.on ? `<div class="card" data-st><h4>Sync key</h4><div class="field"><label>Type it once on each phone</label><input id="syncKey" type="password" autocomplete="off" placeholder="${cloud.hasKey ? 'saved on this phone' : 'sync key'}"></div>
      <button class="btn" id="setupLink" style="width:100%">Copy setup link for other phones</button>
      <div style="font-size:12px;color:var(--rmuted);line-height:1.5;margin-top:8px">Send the link once. Opening it sets up sync on that phone, with nothing to type. Anyone with the link can sync, so share it only with your people.</div></div>` : ''}
    <div class="card" data-st><h4>This phone</h4><div style="font-size:13px;color:var(--rmuted);line-height:1.5">Times come from each person's <b style="color:var(--rink)">own phone clock</b>. If it is wrong, use <b style="color:var(--rink)">Change time</b>.</div>
      <button class="btn" id="forget" style="width:100%;margin-top:10px">Forget this phone's user${rememberedUser() ? '' : ' (none set)'}</button></div>
    <div class="ver" data-st>Version ${typeof __BUILD__ === 'undefined' ? 'dev' : __BUILD__}</div>
    <button class="bigbtn" id="sLock" data-st style="background:var(--rsurf);color:var(--rink);animation:none">Lock admin</button>`;
  [['gName', 'name'], ['gTitle', 'title'], ['gLabel', 'label']].forEach(([id, k]) => { $('#' + id).oninput = e => saveSignatory({ [k]: e.target.value }); });
  $('#pinSave').onclick = async () => {
    const a = $('#pin1').value, c = $('#pin2').value;
    if (!/^\d{6}$/.test(a)) { shake($('#pin1')); toast('PIN must be 6 digits', 'err'); return; }
    if (a !== c) { shake($('#pin2')); toast("PINs don't match", 'err'); return; }
    await setAdminPin(a); $('#pin1').value = $('#pin2').value = ''; toast('PIN changed');
  };
  $('#bkSave').onclick = async () => {
    await settle();
    const blob = new Blob([await exportAll()], { type: 'application/json' }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `dtrv-backup-${now().date}.json`; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  $('#bkLoad').onclick = () => $('#bkFile').click();
  $('#bkFile').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    if (!confirm('Replace everything on this phone with this backup?')) { e.target.value = ''; return; }
    try { const r = await importAll(await f.text()); await ensureMonth(now().date.slice(0, 7)); autoToggle(); afterChange(); toast(`Restored · <b>${r.people}</b> people, <b>${r.days}</b> days`); renderAdmin(); } catch (err) { fail(err); }
    e.target.value = '';
  };
  if (cloud.on) $('#syncKey').onchange = e => { setSyncKey(e.target.value.trim()); e.target.value = ''; toast('Sync key saved. Reload to sync'); };
  if (cloud.on) $('#setupLink').onclick = async () => {
    const link = setupLink(); if (!link) { toast('Type the sync key on this phone first', 'err'); return; }
    try { if (navigator.share) await navigator.share({ title: 'DTRV setup', url: link }); else { await navigator.clipboard.writeText(link); toast('Setup link copied'); } }
    catch (e) { if (e.name !== 'AbortError') toast('Could not copy. Long-press to copy: ' + esc(link), 'err'); }
  };
  $('#forget').onclick = () => { forgetUser(); toast('This phone no longer remembers a user'); };
  $('#sLock').onclick = () => $('#aLock').click();
}
