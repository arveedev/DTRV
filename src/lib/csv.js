/* A month of clock times as a spreadsheet (CSV opens in Excel, Google Sheets and Numbers). Pure: no DOM, no database. */
import { pad, MONTHS, DOW, daysInMonth } from './util.js';
import { remarkText, lateMinutes } from './rules.js';

const cell = v => { const s = v == null ? '' : String(v); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
export const HEADER = ['Code', 'Name', 'Date', 'Day', 'AM IN', 'AM OUT', 'PM IN', 'PM OUT', 'Remark', 'Late (min)', 'Edited'];

/**
 * @param people [{no,name}]   @param ym 'YYYY-MM'   @param dayOf (no,date) => day|undefined   @param schedOf no => schedule
 * One row per person per day that has a time or a remark, in code order. Times are 24-hour (HH:MM) so nothing is ambiguous.
 */
export function monthCsv(people, ym, dayOf, schedOf) {
  const [Y, M] = ym.split('-').map(Number), n = daysInMonth(ym), rows = [HEADER];
  for (const p of [...people].sort((a, b) => a.no.localeCompare(b.no))) {
    for (let d = 1; d <= n; d++) {
      const date = `${ym}-${pad(d)}`, e = dayOf(p.no, date);
      if (!e || !(e.am_in || e.am_out || e.pm_in || e.pm_out || e.remark)) continue;
      rows.push([p.no, p.name, date, DOW[new Date(Y, M - 1, d).getDay()], e.am_in || '', e.am_out || '', e.pm_in || '', e.pm_out || '',
        remarkText(e.remark), lateMinutes(e, schedOf(p.no)) || '', e.edited ? 'yes' : '']);
    }
  }
  return '﻿' + rows.map(r => r.map(cell).join(',')).join('\r\n') + '\r\n';       // BOM: Excel reads the UTF-8 correctly
}
export const csvName = ym => `DTR-${MONTHS[+ym.slice(5) - 1]}-${ym.slice(0, 4)}.csv`;
