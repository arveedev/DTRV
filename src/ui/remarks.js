/* Remark sheet (Leave / Day-off / Holiday / Others) and the full-day editor. */
import { $, $$, fmtDate, fmtRange, spanDays, addDays, esc } from '../lib/util.js';
import { now } from '../lib/clock.js';
import { SLOTS, SLOT_LABEL, REMARKS, REMARK_LABEL, AWAY, awayConflicts } from '../lib/rules.js';
import { get, emp, setRemarks, remarkSuggestions, saveDay, deleteDay, ensureMonth } from '../data/repo.js';
import { stagger, shake, openSheet, closeSheet, toast, pickDate, pfDate, pfTime, bindDate, bindTime, SLOT_PRESETS } from './core.js';
import { enjoy, autoToggle } from './home.js';
import { afterChange } from './app.js';

const isSun = d => new Date(d + 'T00:00').getDay() === 0;
const attr = s => esc(s).replace(/"/g, '&quot;');

function remarkBody(code, date, sugg) {
  if (code === 'OTHER') return `
    <div class="field" data-st><label>Where did you go, or what's the reason?</label><input id="oTxt" maxlength="40" placeholder="e.g. FIELD WORK – CITY HALL" autocomplete="off"></div>
    ${sugg.length ? `<div class="sugg" data-st>${sugg.map(x => `<button data-t="${attr(x)}">${esc(x)}</button>`).join('')}</div>` : ''}
    <div data-st>${pfDate('oDate', 'Date', date)}</div>`;
  return `<div data-st><div class="field"><label>Dates</label><button type="button" class="pf" id="rRange" data-from="${date}" data-to="${date}">${fmtDate(date)}</button></div></div>
    <label class="check" data-st><input type="checkbox" id="rSkip" checked> Skip Sundays</label>`;
}
function bindRemarkBody() {
  $$('#rBody .sugg button').forEach(b => b.onclick = () => { $('#oTxt').value = b.dataset.t; $('#oTxt').focus(); });
  if ($('#oDate')) bindDate('oDate', { title: 'Date' });
  const r = $('#rRange');
  if (r) r.onclick = () => pickDate({ title: 'Dates', mode: 'range', from: r.dataset.from, to: r.dataset.to }, ([a, b]) => {
    r.dataset.from = a; r.dataset.to = b; r.textContent = `${fmtRange(a, b)} · ${spanDays(a, b)} day${spanDays(a, b) === 1 ? '' : 's'}`; });
}
function datesIn(a, b, skipSun) {
  const out = [];
  for (let d = a, n = 0; d <= b && n < 62; d = addDays(d, 1), n++) if (!(skipSun && isSun(d))) out.push(d);
  return out;
}

export async function openRemarkSheet(no, code = 'LEAVE', date = now().date) {
  const codes = Object.keys(REMARK_LABEL); let cur = code;
  const sugg = await remarkSuggestions(no);
  openSheet(`<h3 data-st style="margin-bottom:12px">Remark</h3>
    <div class="chooser" data-st style="--n:4;--p:${codes.indexOf(cur)}"><i class="th"></i>${codes.map(c => `<button data-c="${c}" class="${c === cur ? 'on' : ''}">${REMARK_LABEL[c]}</button>`).join('')}</div>
    <div id="rBody">${remarkBody(cur, date, sugg)}</div>
    <div class="btns" data-st><button class="btn" id="rCancel">Cancel</button><button class="btn primary" id="rOk">Save</button></div>`);
  bindRemarkBody();
  $$('.chooser button').forEach(b => b.onclick = () => {
    cur = b.dataset.c; $('.chooser').style.setProperty('--p', codes.indexOf(cur));
    $$('.chooser button').forEach(x => x.classList.toggle('on', x === b));
    $('#rBody').innerHTML = remarkBody(cur, date, sugg); stagger($('#rBody'), 55); bindRemarkBody();
  });
  $('#rCancel').onclick = closeSheet;
  $('#rOk').onclick = async () => {
    try {
      if (cur === 'OTHER') {
        const txt = $('#oTxt').value.trim().toUpperCase(); if (!txt) { shake($('#oTxt')); $('#oTxt').focus(); return; }
        const d = $('#oDate').dataset.v || date; await ensureMonth(d.slice(0, 7));
        await setRemarks(no, [d], { code: 'OTHER', text: txt }); closeSheet(); afterChange(); toast(`Saved · <b>${esc(txt)}</b>`); return;
      }
      const a = $('#rRange').dataset.from, b = $('#rRange').dataset.to, skip = $('#rSkip').checked, dates = datesIn(a, b, skip);
      for (const ym of new Set(dates.map(d => d.slice(0, 7)))) await ensureMonth(ym);
      const bad = AWAY.includes(cur) && dates.find(d => awayConflicts(get(no, d)));
      if (bad) { toast(`You clocked in on <b>${fmtDate(bad)}</b>, so it can't be ${REMARK_LABEL[cur]}. Use <b>Others</b> for a reason.`, 'err'); return; }
      if (!dates.length) { toast('Pick at least one day (Sundays are skipped)', 'err'); return; }
      await setRemarks(no, dates, { code: cur, text: '' });
      const today = now().date, covers = dates.includes(today), n = dates.length;
      closeSheet(); autoToggle(); afterChange();
      if (covers && AWAY.includes(cur)) setTimeout(() => enjoy(emp(no), cur, `${REMARKS[cur]} saved · ${n} day${n === 1 ? '' : 's'}`), 380);
      else toast(`Saved · <b>${REMARKS[cur]}</b> · ${n} day${n === 1 ? '' : 's'}`);
    } catch (err) { toast(err.html || esc(err.message), 'err'); }
  };
}

export async function openDaySheet(no, ds) {
  await ensureMonth(ds.slice(0, 7));
  const e = get(no, ds) || { am_in: null, am_out: null, pm_in: null, pm_out: null, remark: null };
  const opts = [['', 'None'], ...Object.entries(REMARK_LABEL)]; let rc = e.remark?.code || '';
  openSheet(`<h3 data-st>${new Date(ds + 'T00:00').toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' })}</h3>
    <div class="row2" data-st style="margin-top:10px">${SLOTS.slice(0, 2).map(s => pfTime('dt_' + s, SLOT_LABEL[s], e[s])).join('')}</div>
    <div class="row2" data-st>${SLOTS.slice(2).map(s => pfTime('dt_' + s, SLOT_LABEL[s], e[s])).join('')}</div>
    <div class="chooser" data-st style="--n:5;--p:${opts.findIndex(o => o[0] === rc)}"><i class="th"></i>${opts.map(([c, l]) => `<button data-c="${c}" class="${c === rc ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div class="field" id="dTxtF" data-st><label>Reason / where (max 40)</label><input id="dTxt" maxlength="40" value="${attr(e.remark?.text || '')}"></div>
    <div class="btns" data-st><button class="btn danger" id="dDel">Delete day</button><button class="btn primary" id="dOk">Save</button></div>`);
  SLOTS.forEach(s => bindTime('dt_' + s, { title: `${SLOT_LABEL[s]} · ${fmtDate(ds)}`, presets: SLOT_PRESETS[s], clearable: true }));
  const sync = () => { $('#dTxtF').style.display = rc === 'OTHER' ? '' : 'none'; }; sync();
  $$('.chooser button').forEach(b => b.onclick = () => {
    rc = b.dataset.c; $('.chooser').style.setProperty('--p', opts.findIndex(o => o[0] === rc));
    $$('.chooser button').forEach(x => x.classList.toggle('on', x === b)); sync();
  });
  $('#dOk').onclick = async () => {
    const vals = {}; SLOTS.forEach(s => { vals[s] = $('#dt_' + s).dataset.v || null; });
    if (rc === 'OTHER' && !$('#dTxt').value.trim()) { shake($('#dTxt')); return; }
    try {
      await saveDay(no, ds, { ...vals, remark: rc ? { code: rc, text: rc === 'OTHER' ? $('#dTxt').value.trim().toUpperCase() : '' } : null });
    } catch (err) { toast(err.html || esc(err.message), 'err'); return; }
    closeSheet(); autoToggle(); afterChange(); toast('Saved');
  };
  $('#dDel').onclick = async () => { await deleteDay(no, ds); closeSheet(); autoToggle(); afterChange(); toast('Day deleted'); };
}
