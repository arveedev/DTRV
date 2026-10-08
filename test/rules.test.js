import { describe, it, expect } from 'vitest';
import { lateMinutes, expectedOut, clockOutWindow, statsOf, canRecord, suggest, orderError, sequenceError, dayState, awayConflicts, remarkHistory, remarkText, nickOf, dayClass } from '../src/lib/rules.js';

const fixed = { mode: 'fixed', amIn: '08:00', flexStart: '07:00', flexEnd: '09:00', req: 8, pmLate: false };
const flexi = { ...fixed, mode: 'flexi' };

describe('lateness', () => {
  it('on time and exactly at the limit is not late', () => {
    expect(lateMinutes({ am_in: '07:55' }, fixed)).toBe(0);
    expect(lateMinutes({ am_in: '08:00' }, fixed)).toBe(0);
  });
  it('1 minute over is late (no grace period); minutes count from the limit', () => {
    expect(lateMinutes({ am_in: '08:01' }, fixed)).toBe(1);
    expect(lateMinutes({ am_in: '08:20' }, fixed)).toBe(20);
  });
  it('flexi is late only after the latest clock-in', () => {
    expect(lateMinutes({ am_in: '08:50' }, flexi)).toBe(0);
    expect(lateMinutes({ am_in: '09:00' }, flexi)).toBe(0);
    expect(lateMinutes({ am_in: '09:10' }, flexi)).toBe(10);
  });
  it('a late return from lunch counts only when the switch is on, and adds up', () => {
    const d = { am_in: '08:10', pm_in: '13:20' };
    expect(lateMinutes(d, fixed)).toBe(10);
    expect(lateMinutes(d, { ...fixed, pmLate: true })).toBe(30);
    expect(lateMinutes({ am_in: '07:50', pm_in: '13:05' }, { ...fixed, pmLate: true })).toBe(5);
  });
  it('no entry = on time', () => { expect(lateMinutes(undefined, fixed)).toBe(0); });
});

describe('flexi out time (lunch fixed 12-1)', () => {
  it('clock-out = clock-in + hours + 1h lunch; early arrivals start at the earliest clock-in', () => {
    expect(expectedOut({ am_in: '08:30' }, flexi)).toBe('17:30');
    expect(expectedOut({ am_in: '06:00' }, flexi)).toBe('16:00');
    expect(expectedOut({ am_in: '08:30' }, fixed)).toBeNull();
    expect(expectedOut({}, flexi)).toBeNull();
  });
  it('window', () => {
    expect(clockOutWindow(flexi)).toEqual(['16:00', '18:00']);
    expect(clockOutWindow({ ...flexi, req: 9 })).toEqual(['17:00', '19:00']);
    expect(clockOutWindow(fixed)).toBeNull();
  });
});

describe('month stats', () => {
  it('counts present days, lates, minutes, remarks', () => {
    const days = [
      { am_in: '08:10', am_out: '12:00', pm_in: '13:00', pm_out: '17:00' },
      { am_in: '07:55' },
      { am_in: null, am_out: null, pm_in: null, pm_out: null, remark: { code: 'LEAVE' } },
      { am_in: '08:30', remark: { code: 'OTHER', text: 'FIELD WORK' } },
    ];
    expect(statsOf(days, fixed)).toEqual({ present: 3, lates: 2, lateMin: 40, remarks: 2 });
  });
});

describe('one time per slot, in order', () => {
  it('allows an empty slot, refuses a taken one', () => {
    expect(canRecord({}, 'am_in').ok).toBe(true);
    const r = canRecord({ am_in: '08:17' }, 'am_in');
    expect(r.ok).toBe(false); expect(r.reason).toBe('SLOT_TAKEN'); expect(r.why).toContain('8:17 AM');
  });
  it('refuses a slot after a later one (AM IN after PM OUT)', () => {
    const r = canRecord({ pm_out: '08:15' }, 'am_in');
    expect(r.reason).toBe('OUT_OF_ORDER'); expect(r.why).toContain('PM OUT');
  });
  it('a forgotten AM OUT can still be recorded until PM IN exists', () => {
    expect(canRecord({ am_in: '08:00' }, 'am_out').ok).toBe(true);
    expect(canRecord({ am_in: '08:00', pm_in: '13:00' }, 'am_out').ok).toBe(false);
  });
});

describe('suggest the next tile', () => {
  const t = (e, time) => suggest(e, time);
  it('by time of day', () => {
    expect(t({}, '07:59')).toBe('am_in'); expect(t({}, '10:59')).toBe('am_in');
    expect(t({}, '11:00')).toBe('am_out'); expect(t({}, '12:29')).toBe('am_out');
    expect(t({}, '12:30')).toBe('pm_in'); expect(t({}, '13:59')).toBe('pm_in');
    expect(t({}, '14:00')).toBe('pm_out');
  });
  it('never earlier than what is already recorded; null when the day is full', () => {
    expect(t({ am_in: '08:00' }, '08:30')).toBe('am_out');
    expect(t({ am_in: '08:00', am_out: '12:00' }, '12:10')).toBe('pm_in');
    expect(t({ pm_out: '17:00' }, '08:00')).toBeNull();
    expect(t({ am_in: '8', am_out: '9', pm_in: '10', pm_out: '11' }, '08:00')).toBeNull();
  });
});

describe('editing keeps times in order', () => {
  const day = { am_in: '08:00', am_out: '12:00', pm_in: '13:00', pm_out: '17:00' };
  it('single slot', () => {
    expect(orderError(day, 'am_in', '07:30')).toBeNull();
    expect(orderError(day, 'am_in', '12:30')).toContain("can't be later than");
    expect(orderError(day, 'pm_out', '12:30')).toContain("can't be earlier than");
  });
  it('whole day', () => {
    expect(sequenceError(day)).toBeNull();
    expect(sequenceError({ am_in: '09:00', am_out: '08:00' })).toContain("can't be earlier");
    expect(sequenceError({ am_in: null, pm_out: '17:00' })).toBeNull();
  });
});

describe('away days', () => {
  it('dayState', () => {
    expect(dayState(undefined)).toMatchObject({ hasTimes: false, away: null });
    expect(dayState({ am_in: '08:00' })).toMatchObject({ hasTimes: true, away: null });
    expect(dayState({ remark: { code: 'DAYOFF' } }).away).toBe('DAYOFF');
    expect(dayState({ remark: { code: 'OTHER', text: 'X' } }).away).toBeNull();
  });
  it('leave/day-off/holiday conflict with times; Others never does', () => {
    expect(awayConflicts({ pm_out: '17:00' })).toBe(true);
    expect(awayConflicts({})).toBe(false);
    expect(awayConflicts(undefined)).toBe(false);
  });
});

describe('remark suggestions come from the person own history', () => {
  const days = [
    { date: '2026-10-02', remark: { code: 'OTHER', text: 'FIELD WORK – CITY HALL' } },
    { date: '2026-10-04', remark: { code: 'OTHER', text: 'MEETING' } },
    { date: '2026-10-05', remark: { code: 'OTHER', text: 'FIELD WORK – CITY HALL' } },
    { date: '2026-10-06', remark: { code: 'LEAVE' } },
  ];
  it('most used first, then most recent; only OTHER; max 6', () => {
    expect(remarkHistory(days)).toEqual(['FIELD WORK – CITY HALL', 'MEETING']);
    expect(remarkHistory([])).toEqual([]);
    const many = Array.from({ length: 9 }, (_, i) => ({ date: `2026-10-0${i + 1}`, remark: { code: 'OTHER', text: 'R' + i } }));
    expect(remarkHistory(many)).toHaveLength(6);
  });
});

describe('text', () => {
  it('printed remark text', () => {
    expect(remarkText({ code: 'LEAVE' })).toBe('ON LEAVE');
    expect(remarkText({ code: 'HOLIDAY', text: '' })).toBe('HOLIDAY');
    expect(remarkText({ code: 'HOLIDAY', text: 'RIZAL DAY' })).toBe('HOLIDAY – RIZAL DAY');
    expect(remarkText({ code: 'OTHER', text: 'SITE VISIT' })).toBe('SITE VISIT');
    expect(remarkText(null)).toBe('');
  });
  it('nickname falls back to the first name', () => {
    expect(nickOf({ name: 'JUAN A. DELA CRUZ', nick: '' })).toBe('Juan');
    expect(nickOf({ name: 'JUAN A. DELA CRUZ', nick: 'Johnny' })).toBe('Johnny');
  });
  it('calendar colours', () => {
    expect(dayClass({ am_in: '07:50', am_out: '12:00', pm_in: '13:00', pm_out: '17:00' }, '2026-10-06', 2, fixed, '2026-10-07')).toBe('ok');
    expect(dayClass({ am_in: '08:30' }, '2026-10-06', 2, fixed, '2026-10-07')).toBe('lt');
    expect(dayClass({ am_in: '07:50' }, '2026-10-06', 2, fixed, '2026-10-07')).toBe('inc');
    expect(dayClass({ remark: { code: 'HOLIDAY' } }, '2026-10-06', 2, fixed, '2026-10-07')).toBe('hol');
    expect(dayClass(undefined, '2026-10-10', 6, fixed, '2026-10-07')).toBe('we');
  });
});

describe('lateSlots', () => {
  const fixed = { mode: 'fixed', amIn: '08:00', pmLate: false };
  it('flags a late AM IN, not an on-time one', async () => {
    const { lateSlots } = await import('../src/lib/rules.js');
    expect(lateSlots({ am_in: '08:01' }, fixed).am_in).toBe(true);
    expect(lateSlots({ am_in: '08:00' }, fixed).am_in).toBe(false);
  });
  it('flags PM IN only when the late-return setting is on', async () => {
    const { lateSlots } = await import('../src/lib/rules.js');
    expect(lateSlots({ pm_in: '13:10' }, fixed).pm_in).toBe(false);
    expect(lateSlots({ pm_in: '13:10' }, { ...fixed, pmLate: true }).pm_in).toBe(true);
    expect(lateSlots({ pm_in: '13:00' }, { ...fixed, pmLate: true }).pm_in).toBe(false);
  });
});

describe('incomplete days', () => {
  it('a past day with some times and no remark is incomplete; today, empty days and explained days are not', async () => {
    const { isIncomplete, missingText } = await import('../src/lib/rules.js');
    const full = { am_in: '08:00', am_out: '12:00', pm_in: '13:00', pm_out: '17:00', remark: null };
    expect(isIncomplete({ ...full, pm_out: null }, '2026-10-07', '2026-10-08')).toBe(true);
    expect(isIncomplete({ ...full, pm_out: null }, '2026-10-08', '2026-10-08')).toBe(false);   // today: still in progress
    expect(isIncomplete(full, '2026-10-07', '2026-10-08')).toBe(false);
    expect(isIncomplete({ am_in: null, am_out: null, pm_in: null, pm_out: null, remark: { code: 'LEAVE' } }, '2026-10-07', '2026-10-08')).toBe(false);
    expect(isIncomplete({ ...full, pm_out: null, remark: { code: 'OTHER', text: 'FIELD' } }, '2026-10-07', '2026-10-08')).toBe(false);
    expect(missingText({ ...full, am_out: null, pm_out: null })).toBe('no AM OUT, PM OUT');
  });
});
