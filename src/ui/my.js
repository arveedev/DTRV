/* "My DTR": month calendar, stats and a day detail. Opened from the PIN pad (employee) or the admin overview. */
import { $, $$, pad, t12, tPrint, shiftYM, MONTHS, esc } from '../lib/util.js';
import { now } from '../lib/clock.js';
import { SLOTS, SLOT_LABEL, remarkText, lateMinutes, dayClass } from '../lib/rules.js';
import { get, emp, schedOf, monthStats, ensureMonth } from '../data/repo.js';
import { go, countUp, toast } from './core.js';
import { SLOT_G, autoToggle } from './home.js';
import { openRemarkSheet, openDaySheet } from './remarks.js';
import { openPreview } from './print.js';
import { renderAdmin } from './admin.js';
import { bioFor, bioClear } from './bio.js';
import { afterChange } from './app.js';

let myNo = null, myYM = null, mySel = null, myFrom = 'rec';
export const myOpen = () => myNo;

export async function openMy(no, from = 'rec') {
  myNo = no; myFrom = from; myYM = now().date.slice(0, 7); mySel = null;
  await ensureMonth(myYM);
  go('p-my', 'r'); paintMy({ anim: true });
}
export const refreshMy = () => { if (myNo) paintMy({ sel: true }); };

export function initMy() {
  $('#myBack').onclick = () => { if (myFrom === 'admin') { go('p-admin', 'l'); renderAdmin(); } else { go('p-record', 'l'); autoToggle(); } };
  $('#mPrev').onclick = () => monthTo(-1);
  $('#mNext').onclick = () => monthTo(1);
  $('#bioOff').onclick = () => { bioClear(); $('#bioOff').hidden = true; afterChange(); toast('Face / fingerprint turned off on this phone'); };
  $('#myRemark').onclick = () => openRemarkSheet(myNo, 'OTHER', mySel || now().date);
  $('#myPrint').onclick = () => openPreview({ nos: [myNo], ym: myYM, page: 0 }, 'my');
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
  const lateAm = e?.am_in && lateMinutes({ am_in: e.am_in }, { ...sc, pmLate: false });
  $('#myDetail').innerHTML = `<div class="detail"><div class="dh"><span>${new Date(mySel + 'T00:00').toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })}${e?.edited ? ' · ✎ edited' : ''}</span><span style="display:flex;gap:6px;align-items:center">${badge}<button id="myEdit">Edit</button></span></div>
    <div class="tchips">${SLOTS.map((s, i) => `<div style="--i:${i}" class="${e?.[s] ? SLOT_G(s) : 'e'}" ${s === 'am_in' && lateAm ? 'data-late' : ''}>${e?.[s] ? tPrint(e[s]) : '—'}<small>${SLOT_LABEL[s]}</small></div>`).join('')}</div>
    ${e?.remark?.code === 'OTHER' ? `<div class="rmkline">✏️ ${esc(e.remark.text)}</div>` : ''}</div>`;
  $('#myEdit').onclick = () => openDaySheet(myNo, mySel);
  $('#bioOff').hidden = !(bioFor() && bioFor().code === myNo);
}
