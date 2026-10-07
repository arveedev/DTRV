import { describe, it, expect } from 'vitest';
import { easter, nthWeekday, builtIn, holidaysOn, upcoming, repeatOptions, ruleMatches, ruleId, describeRule } from '../src/lib/holidays.js';

describe('Easter and moving holidays', () => {
  it('computes Easter Sunday', () => {
    expect(easter(2024)).toEqual([3, 31]); expect(easter(2025)).toEqual([4, 20]); expect(easter(2026)).toEqual([4, 5]);
    expect(easter(2027)).toEqual([3, 28]); expect(easter(2030)).toEqual([4, 21]);
  });
  it('Holy Week follows Easter', () => {
    const d = n => builtIn(2026).find(h => h.name === n).date;
    expect(d('Maundy Thursday')).toBe('2026-04-02'); expect(d('Good Friday')).toBe('2026-04-03');
    expect(d('Black Saturday')).toBe('2026-04-04'); expect(d('Easter Sunday')).toBe('2026-04-05');
  });
  it('nth weekday of a month', () => {
    expect(nthWeekday(2026, 5, 2, 0)).toBe(10);       // Mother's Day 2026: May 10
    expect(nthWeekday(2026, 6, 3, 0)).toBe(21);       // Father's Day 2026: Jun 21
    expect(nthWeekday(2026, 8, -1, 1)).toBe(31);      // National Heroes Day 2026: last Monday of August
    expect(nthWeekday(2025, 8, -1, 1)).toBe(25);
  });
  it('works for any year, with no table', () => {
    for (const y of [2020, 2026, 2031, 2044]) expect(builtIn(y).some(h => h.name === 'Christmas Day' && h.date === `${y}-12-25`)).toBe(true);
  });
});

describe('what is known on a date', () => {
  it('suggests Christmas on Dec 25 and nothing on a plain day', () => {
    expect(holidaysOn('2026-12-25').map(h => h.name)).toContain('Christmas Day');
    expect(holidaysOn('2026-03-11')).toEqual([]);
  });
  it('a remembered fiesta comes back every year, ahead of the built-in ones', () => {
    const rule = { type: 'date', month: 12, day: 25, name: 'TOWN FIESTA' };
    expect(holidaysOn('2031-12-25', [rule])[0].name).toBe('TOWN FIESTA');
    expect(holidaysOn('2031-12-26', [rule])).toEqual([]);
  });
  it('a remembered weekday rule moves with the calendar', () => {
    const r = { type: 'nth', month: 5, nth: 2, wd: 0, name: 'FAMILY DAY' };
    expect(ruleMatches(r, '2026-05-10')).toBe(true); expect(ruleMatches(r, '2027-05-09')).toBe(true); expect(ruleMatches(r, '2026-05-17')).toBe(false);
  });
  it('offers both ways to repeat a date', () => {
    const [byDate, byDay] = repeatOptions('2026-05-10');
    expect(byDate.label).toBe('Every May 10'); expect(byDay.label).toBe('Every 2nd Sunday of May');
    expect(repeatOptions('2026-08-31')[1].rule).toMatchObject({ nth: -1, wd: 1 });
    expect(describeRule(byDay.rule)).toBe('Every 2nd Sunday of May'); expect(ruleId(byDate.rule, 'X')).toBe('date:5:10:X');
  });
  it('lists what is coming up, skipping dates already marked and observances', () => {
    const up = upcoming('2026-12-01', [], { n: 10, within: 40, skip: new Set(['2026-12-25']) });
    expect(up.map(h => h.name)).toContain('Immaculate Conception');
    expect(up.map(h => h.name)).not.toContain('Christmas Day');
    expect(up.some(h => h.kind === 'observance')).toBe(false);
  });
  it('upcoming looks across the new year', () => {
    expect(upcoming('2026-12-28', [], { n: 5, within: 10 }).map(h => h.name)).toEqual(expect.arrayContaining(["New Year's Eve", "New Year's Day"]));
  });
});
