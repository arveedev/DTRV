/* "My DTR": month calendar, stats and a day detail. Opened from the PIN pad (employee) or the admin overview. */
import { $, $$, pad, t12, tPrint, shiftYM, MONTHS, esc } from '../lib/util.js';
import { now } from '../lib/clock.js';
import { SLOTS, SLOT_LABEL, remarkText, lateMinutes, lateSlots, lateSlotsRaw, dayClass, isIncomplete, monthSummary } from '../lib/rules.js';
import { get, emp, schedOf, monthStats, monthDays, ensureMonth, yearRemarkCounts } from '../data/repo.js';
import { go, countUp, toast } from './core.js';
import { SLOT_G, autoToggle } from './home.js';
import { openRemarkSheet, openDaySheet } from './remarks.js';
import * as lazy from './lazy.js';
import { openHistory } from './history.js';

let myNo = null, myYM = null, mySel = null, myFrom = 'rec';
export const myOpen = () => myNo;

export async function openMy(no, from = 'rec', fixDate = null) {
  myNo = no; myFrom = from; myYM = (fixDate || now().date).slice(0, 7); mySel = fixDate;
  await ensureMonth(myYM);
  go('p-my', 'r'); paintMy({ anim: true });
  if (fixDate) setTimeout(() => openDaySheet(no, fixDate), 450);          // straight to the day that needs a time
}
export const refreshMy = () => { if (myNo) paintMy({ sel: true }); };

export function initMy() {
  $('#myBack').onclick = () => { if (myFrom === 'admin') { go('p-admin', 'l'); lazy.mods.admin?.renderAdmin(); } else { go('p-record', 'l'); autoToggle(); } };
  /* swipe the month left or right (mostly sideways, long enough, not a tap) */
  let sx = 0, sy = 0, sid = null; const pm = $('#p-my');
  pm.addEventListener('pointerdown', e => { sx = e.clientX; sy = e.clientY; sid = e.pointerId; });
  pm.addEventListener('pointerup', e => {
    if (e.pointerId !== sid) return; sid = null; const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.6 && !$('#sheet').classList.contains('show')) monthTo(dx < 0 ? 1 : -1);
  });
  $('#mPrev').onclick = () => monthTo(-1);
  $('#mNext').onclick = () => monthTo(1);
  $('#myRemark').onclick = () => openRemarkSheet(myNo, 'OTHER', mySel || now().date);
  $('#myPrint').onclick = () => lazy.printer().then(m => m.openPreview({ nos: [myNo], ym: myYM, span: 1, page: 0 }, 'my'));
}
async function monthTo(n) { myYM = shiftYM(myYM, n); await ensureMonth(myYM); paintMy({ dir: n < 0 ? 'L' : 'R' }); }

function paintMy(o = {}) {
  const p = emp(myNo); if (!p) return;
  const sc = schedOf(p), [Y, M] = myYM.split('-').map(Number), n = new Date(Y, M, 0).getDate(), st = monthStats(myNo, myYM), today = now().date;
  if (!mySel || mySel.slice(0, 7) !== myYM) mySel = today.slice(0, 7) === myYM ? today : `${myYM}-01`;
  $('#myName').textContent = p.name;
  $('#myNo').textContent = '#' + p.no + ' · ' + (sc.mode === 'flexi' ? `Flexi ${t12(sc.flexStart)}–${t12(sc.flexEnd)}` : `Fixed ${t12(sc.amIn)}`);
  $('#mLabel').textContent = MONTHS[M - 1].slice(0, 3) + ' ' + Y;
  $('#myStats').innerHTML = `<div class="hero ${st.lates ? 'g1' : 'calm'}"><div class="n" id="heroN">${o.anim || o.dir ? 0 : st.lates}</div><div class="t"><b>late${st.lates === 1 ? '' : 's'} in ${MONTHS[M - 1]}</b><br>${st.lateMin} min total · ${st.present} days present · ${st.remarks} remark${st.remarks === 1 ? '' : 's'}</div></div>`;
  if (o.anim || o.dir) countUp($('#heroN'), st.lates, 800);
  /* leave / day-off / holiday days: this month now, this year as soon as it is read */
  const tally = c => ['LEAVE', 'DAYOFF', 'HOLIDAY', 'WFH'].filter(k => c[k]).map(k => `<i class="${k}">${{ LEAVE: 'Leave', DAYOFF: 'Day-off', HOLIDAY: 'Holiday', WFH: 'WFH' }[k]} ${c[k]}</i>`).join('') || '<em>no days off</em>';
  const mc = { LEAVE: 0, DAYOFF: 0, HOLIDAY: 0, WFH: 0 }; monthDays(myNo, myYM).forEach(d => { if (d.remark && mc[d.remark.code] !== undefined) mc[d.remark.code]++; });
  const bad = monthDays(myNo, myYM).filter(x => isIncomplete(x, x.date, today));
  const sm = monthSummary(monthDays(myNo, myYM)), hm = n => `${Math.floor(n / 60)}h ${String(n % 60).padStart(2, '0')}m`;
  const sumLine = sm.counted || sm.avgIn != null ? `<div class="sumline">${sm.counted ? `<span>≈ <b>${hm(sm.total)}</b> worked in ${sm.counted} day${sm.counted === 1 ? '' : 's'}</span>` : ''}${sm.avgIn != null ? `<span>usual arrival <b>${t12(String(Math.floor(sm.avgIn / 60)).padStart(2, '0') + ':' + String(sm.avgIn % 60).padStart(2, '0'))}</b></span>` : ''}</div>` : '';
  $('#myCnts').innerHTML = `${sumLine}${bad.length ? `<button class="needline" id="needBtn">⚠ ${bad.length} day${bad.length === 1 ? '' : 's'} missing a time · tap to fix</button>` : ''}<div><b>${MONTHS[M - 1].slice(0, 3)}</b>${tally(mc)}</div><div><b>${Y}</b><span id="myYear"><em>…</em></span></div>`;
  if ($('#needBtn')) $('#needBtn').onclick = () => { mySel = bad[0].date; paintMy({ sel: true }); openDaySheet(myNo, mySel); };
  const wantNo = myNo, wantY = Y; yearRemarkCounts(myNo, String(Y)).then(c => { if (myNo === wantNo && myYM.startsWith(wantY) && $('#myYear')) $('#myYear').innerHTML = tally(c); }).catch(() => {});
  let h = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'].map(d => `<div class="h">${d}</div>`).join('');
  h += '<button class="c pad"></button>'.repeat(new Date(Y, M - 1, 1).getDay());
  for (let d = 1; d <= n; d++) {
    const ds = `${myYM}-${pad(d)}`, wd = new Date(Y, M - 1, d).getDay();
    h += `<button class="c ${dayClass(get(myNo, ds), ds, wd, sc, today)} ${ds === today ? 'td' : ''} ${ds === mySel ? 'sel' : ''}" style="--i:${d}" data-d="${ds}">${d}</button>`;
  }
  const cal = $('#myDays'); cal.innerHTML = h; cal.classList.remove('slideL', 'slideR');
  if (o.dir) { void cal.offsetWidth; cal.classList.add('slide' + o.dir); }
  if (!o.anim && !o.dir) $$('#myDays .c').forEach(c => { c.style.animation = 'none'; });
  $$('#myDays .c[data-d]').forEach(c => { c.onclick = () => { mySel = c.dataset.d; paintMy({ sel: true }); }; });
  const e = get(myNo, mySel), wd = new Date(mySel + 'T00:00').getDay(), cls = dayClass(e, mySel, wd, sc, today), late = lateMinutes(e, sc);
  const badge = e?.remark ? `<em class="${e.remark.code === 'HOLIDAY' ? 'hol' : 'rm'}">${e.remark.code === 'OTHER' ? 'Remark' : esc(remarkText(e.remark))}</em>` : late ? `<em class="lt">Late ${late}m</em>` : cls === 'inc' ? '<em class="inc">Incomplete</em>' : '';
  const lateAt = lateSlots(e, sc), rawAt = lateSlotsRaw(e, sc);
  $('#myDetail').innerHTML = `<div class="detail"><div class="dh"><span>${new Date(mySel + 'T00:00').toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })}${e?.edited ? ' · ✎ edited' : ''}</span><span style="display:flex;gap:6px;align-items:center">${badge}${lazy.mods.admin?.isAdmin() ? '<button id="myHist">History</button>' : ''}<button id="myEdit">Edit</button></span></div>
    <div class="tchips">${SLOTS.map((s, i) => `<div style="--i:${i}" class="${e?.[s] ? SLOT_G(s) : 'e'}" ${lateAt[s] ? 'data-late' : e?.excused && rawAt[s] ? 'data-exc' : ''}>${e?.[s] ? tPrint(e[s]) : '—'}<small>${SLOT_LABEL[s]}</small></div>`).join('')}</div>
    ${e?.remark?.code === 'OTHER' ? `<div class="rmkline">✏️ ${esc(e.remark.text)}</div>` : ''}</div>`;
  $('#myEdit').onclick = () => openDaySheet(myNo, mySel);
  if ($('#myHist')) $('#myHist').onclick = () => openHistory({ no: myNo });
}
