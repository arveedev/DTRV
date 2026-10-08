import { describe, it, expect } from 'vitest';
import { monthCsv, HEADER } from '../src/lib/csv.js';

const people = [{ no: '205', name: 'MARIA, L. SANTOS' }, { no: '024', name: 'JUAN "JJ" DELA CRUZ' }];
const days = {
  '024|2026-10-02': { am_in: '08:12', am_out: '12:01', pm_in: '12:58', pm_out: '17:03', remark: null, edited: false },
  '024|2026-10-05': { am_in: null, am_out: null, pm_in: null, pm_out: null, remark: { code: 'LEAVE', text: '' } },
  '205|2026-10-03': { am_in: '07:00', am_out: null, pm_in: null, pm_out: '16:00', remark: { code: 'OTHER', text: 'FIELD, WORK' }, edited: true },
};
const sc = { mode: 'fixed', amIn: '08:00', pmLate: false };
const csv = monthCsv(people, '2026-10', (no, d) => days[no + '|' + d], () => sc);
const lines = csv.replace('﻿', '').trim().split('\r\n');

describe('monthly CSV', () => {
  it('starts with the header and a byte-order mark for Excel', () => { expect(csv.charCodeAt(0)).toBe(0xFEFF); expect(lines[0]).toBe(HEADER.join(',')); });
  it('lists people in code order, one row per day that has something', () => { expect(lines).toHaveLength(4); expect(lines[1].startsWith('024,')).toBe(true); expect(lines[3].startsWith('205,')).toBe(true); });
  it('writes times in 24 hours, late minutes and the remark text', () => {
    expect(lines[1]).toContain('2026-10-02,Fri,08:12,12:01,12:58,17:03,,12,');
    expect(lines[2]).toContain('ON LEAVE');
  });
  it('quotes commas and quotes, and marks edited days', () => {
    expect(lines[1]).toContain('"JUAN ""JJ"" DELA CRUZ"'); expect(lines[3]).toContain('"MARIA, L. SANTOS"'); expect(lines[3]).toContain('"FIELD, WORK"'); expect(lines[3].endsWith(',yes')).toBe(true);
  });
});
