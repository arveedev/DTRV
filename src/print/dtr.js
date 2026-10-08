/* One copy of Civil Service Form No. 48 as HTML (two copies per A4 page are laid out by the caller). */
import { pad, tPrint, MONTHS, daysInMonth, esc } from '../lib/util.js';
import { SLOTS, remarkText } from '../lib/rules.js';

/**
 * @param p      {name}
 * @param ym     'YYYY-MM'
 * @param dayOf  date => {am_in,am_out,pm_in,pm_out,remark} | undefined
 * @param sign   {name,title,label}
 * @param lateOf e => { am_in:boolean, pm_in:boolean }  (those arrivals print in red)
 */
/** Keep long names on one line: step the size down instead of cutting letters off. */
const fit = (s, big, mid, small, a, b) => { const n = String(s).length; return n > b ? small : n > a ? mid : big; };

export function dtrCopy(p, ym, dayOf, sign, lateOf = () => ({})) {
  const [Y, M] = ym.split('-').map(Number), n = daysInMonth(ym);
  let rows = '';
  for (let d = 1; d <= 31; d++) {
    if (d > n) { rows += `<tr><td class="dn">${d}</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`; continue; }
    const ds = `${ym}-${pad(d)}`, wd = new Date(Y, M - 1, d).getDay(), e = dayOf(ds), has = e && SLOTS.some(s => e[s]);
    const rem = esc(remarkText(e?.remark));
    const rtext = remarkText(e?.remark), ut = rem ? `<td colspan="2" class="rmk${rtext.length > 30 ? ' long xlong' : rtext.length > 17 ? ' long' : ''}">${rem}</td>` : '<td></td><td></td>';
    const lt = has ? lateOf(e) : {};
    if (has) rows += `<tr><td class="dn">${d}</td>${SLOTS.map(s => `<td${lt[s] ? ' class="late"' : ''}>${tPrint(e[s])}</td>`).join('')}${ut}</tr>`;
    else if (rem) rows += `<tr><td class="dn">${d}</td><td></td><td></td><td></td><td></td>${ut}</tr>`;
    else if (wd === 0 || wd === 6) rows += `<tr><td class="dn">${d}</td><td colspan="4" class="across">${wd === 0 ? 'SUNDAY' : 'SATURDAY'}</td><td></td><td></td></tr>`;
    else rows += `<tr><td class="dn">${d}</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`;
  }
  return `<div class="dtr">
    <div class="formno">Civil Service Form No. 48</div>
    <div class="title">DAILY TIME RECORD</div><div class="ooo">-----o0o-----</div>
    <div class="name" style="font-size:${fit(p.name, 12, 10.5, 9, 27, 34)}pt">${esc(p.name)}</div><div class="cap">(Name)</div>
    <table class="meta">
      <tr><td style="width:34%"><i>For the month of</i></td><td class="u" style="width:46%">${MONTHS[M - 1].toUpperCase()}</td><td class="u" style="width:20%">${Y}</td></tr>
      <tr><td rowspan="2"><i>Official hours for arrival<br>and departure</i></td><td><i>Regular days</i> <span class="blank"></span></td><td></td></tr>
      <tr><td><i>Saturdays</i> <span class="blank"></span></td><td></td></tr>
    </table>
    <table class="grid">
      <colgroup><col style="width:9%"><col style="width:14%"><col style="width:14%"><col style="width:14%"><col style="width:14%"><col style="width:17.5%"><col style="width:17.5%"></colgroup>
      <tr><th rowspan="2">Day</th><th colspan="2" class="big">A.M.</th><th colspan="2" class="big">P.M.</th><th colspan="2" class="big">Undertime</th></tr>
      <tr><th>Arrival</th><th>Depar-<br>ture</th><th>Arrival</th><th>Depar-<br>ture</th><th>Hours</th><th>Min-<br>utes</th></tr>
      ${rows}
      <tr class="tot"><td colspan="5" style="text-align:right;padding-right:1mm">Total</td><td class="b"></td><td class="b"></td></tr>
    </table>
    <div class="cert">I certify on my honor that the above is a true and correct report of the hours of work performed, record of which was made daily at the time of arrival and departure from office.</div>
    <div class="sigline"></div>
    <div class="verified">VERIFIED as to the prescribed office hours:</div>
    <div class="sup"><div class="n" style="font-size:${fit(sign.name, 10.5, 9.5, 8.5, 26, 33)}pt">${esc(sign.name)}</div><div class="t">${esc(sign.title)}</div><div class="l">${esc(sign.label)}</div></div>
  </div>`;
}
