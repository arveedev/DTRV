import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setClock } from '../src/lib/clock.js';
import * as repo from '../src/data/repo.js';
import { db } from '../src/data/db.js';

let n = 0;
const at = (iso) => setClock(() => new Date(iso));
beforeEach(async () => {
  at('2026-10-07T08:20:00');
  await repo.init({ name: 'test-' + (++n), cloudUrl: '' });
  await repo.saveEmployee({ no: '024', name: 'JUAN A. DELA CRUZ', nick: 'Juan', pos: 'Clerk', sched: null }, true);
  await repo.saveEmployee({ no: '205', name: 'MARIA L. SANTOS', nick: 'Maria', pos: '', sched: { mode: 'flexi', flexStart: '07:00', flexEnd: '09:00', req: 8, pmLate: false } }, true);
});
afterEach(() => { setClock(null); repo.shutdown(); });

describe('people', () => {
  it('codes must be 3 digits and unique; leading zero is kept', async () => {
    expect(repo.emp('024').name).toBe('JUAN A. DELA CRUZ');
    await expect(repo.saveEmployee({ no: '24', name: 'X' }, true)).rejects.toMatchObject({ code: 'BAD_CODE' });
    await expect(repo.saveEmployee({ no: '024', name: 'X' }, true)).rejects.toMatchObject({ code: 'CODE_TAKEN' });
    const row = await db.employees.get('emp:024'); expect(row.code).toBe('024');
  });
  it('edit keeps the same person', async () => {
    await repo.saveEmployee({ no: '024', name: 'JUAN DELA CRUZ JR', nick: 'JJ' }, false);
    expect(repo.S.emps.filter(p => p.no === '024')).toHaveLength(1);
    expect((await db.employees.get('emp:024')).nick).toBe('JJ');
  });
});

describe('recording', () => {
  it('records once per slot, in order, and persists to the database + punch log', async () => {
    await repo.recordTime('024', 'am_in', '08:20');
    expect(repo.get('024', '2026-10-07').am_in).toBe('08:20');
    const row = await db.days.get('day:024:2026-10-07'); expect(row.am_in).toBe('08:20');
    expect((await db.punches.toArray())).toHaveLength(1);
    await expect(repo.recordTime('024', 'am_in', '08:25')).rejects.toMatchObject({ code: 'SLOT_TAKEN' });
    await repo.recordTime('024', 'pm_out', '17:05');
    await expect(repo.recordTime('024', 'am_out', '12:00')).rejects.toMatchObject({ code: 'OUT_OF_ORDER' });
  });
  it('undo removes the time and leaves an undo punch', async () => {
    await repo.recordTime('024', 'am_in', '08:20');
    await repo.undoRecord('024', '2026-10-07', 'am_in');
    expect(repo.get('024', '2026-10-07')).toBeUndefined();
    expect(await db.days.get('day:024:2026-10-07')).toBeUndefined();
    expect((await db.punches.toArray()).map(p => p.kind).sort()).toEqual(['record', 'undo']);
  });
  it('setTime edits, marks the day edited, keeps order, and clearing the last time removes the day', async () => {
    await repo.recordTime('024', 'am_in', '08:20');
    await repo.setTime('024', '2026-10-07', 'am_in', '07:58');
    expect(repo.get('024', '2026-10-07')).toMatchObject({ am_in: '07:58', edited: true });
    await repo.recordTime('024', 'am_out', '12:00');
    await expect(repo.setTime('024', '2026-10-07', 'am_in', '12:30')).rejects.toMatchObject({ code: 'ORDER' });
    await repo.setTime('024', '2026-10-07', 'am_out', null); await repo.setTime('024', '2026-10-07', 'am_in', null);
    expect(repo.get('024', '2026-10-07')).toBeUndefined();
  });
  it('saveDay validates the sequence and never allows leave over clocked-in days', async () => {
    await expect(repo.saveDay('024', '2026-10-06', { am_in: '09:00', am_out: '08:00' })).rejects.toMatchObject({ code: 'ORDER' });
    await expect(repo.saveDay('024', '2026-10-06', { am_in: '08:00', remark: { code: 'LEAVE', text: '' } })).rejects.toMatchObject({ code: 'HAS_TIMES' });
    await repo.saveDay('024', '2026-10-06', { am_in: '08:00', am_out: '12:00', remark: { code: 'OTHER', text: 'FIELD WORK' } });
    expect(repo.get('024', '2026-10-06').remark.text).toBe('FIELD WORK');
    await repo.deleteDay('024', '2026-10-06');
    expect(await db.days.get('day:024:2026-10-06')).toBeUndefined();
  });
});

describe('leave / day-off / holiday', () => {
  it('after a day-off, clock-in is refused; Others never blocks', async () => {
    await repo.setRemarks('024', ['2026-10-07'], { code: 'DAYOFF', text: '' });
    await expect(repo.recordTime('024', 'am_in', '08:20')).rejects.toMatchObject({ code: 'AWAY' });
    await repo.setRemarks('205', ['2026-10-07'], { code: 'OTHER', text: 'SITE VISIT' });
    await repo.recordTime('205', 'am_in', '08:10');
    expect(repo.get('205', '2026-10-07')).toMatchObject({ am_in: '08:10', remark: { code: 'OTHER' } });
  });
  it('a leave range over a day with times is refused as a whole', async () => {
    await repo.recordTime('024', 'am_in', '08:20');
    await expect(repo.setRemarks('024', ['2026-10-06', '2026-10-07'], { code: 'LEAVE', text: '' })).rejects.toMatchObject({ code: 'HAS_TIMES' });
    expect(repo.get('024', '2026-10-06')).toBeUndefined();
  });
  it('holiday for everyone: marks all active people, keeps people who clocked in, removable', async () => {
    await repo.saveEmployee({ no: '331', name: 'PEDRO R. REYES', active: true }, true);
    await repo.saveEmployee({ no: '402', name: 'GONE', active: false }, true);
    await repo.recordTime('024', 'am_in', '08:20');
    const r = await repo.applyHoliday('2026-10-07', 'RIZAL DAY');
    expect(r).toEqual({ hit: 2, kept: 1 });
    expect(repo.get('205', '2026-10-07').remark).toEqual({ code: 'HOLIDAY', text: 'RIZAL DAY' });
    expect(repo.get('024', '2026-10-07').remark).toBeNull();
    expect(repo.get('402', '2026-10-07')).toBeUndefined();
    expect((await db.holidays.toArray()).map(h => h.date)).toEqual(['2026-10-07']);
    await repo.removeHoliday('2026-10-07');
    expect(repo.get('205', '2026-10-07')).toBeUndefined();
    expect(repo.get('024', '2026-10-07').am_in).toBe('08:20');
    expect(await db.holidays.count()).toBe(0);
  });
});

describe('month loading and stats', () => {
  it('ensureMonth pulls another month from the database; stats use the person\'s schedule', async () => {
    await repo.saveDay('024', '2026-09-03', { am_in: '08:10', am_out: '12:00', pm_in: '13:00', pm_out: '17:00' });
    await repo.saveDay('205', '2026-09-03', { am_in: '08:50' });
    repo.shutdown(); await repo.init({ name: db.name, cloudUrl: '' });     // fresh start: only October is in memory
    expect(repo.get('024', '2026-09-03')).toBeUndefined();
    await repo.ensureMonth('2026-09');
    expect(repo.get('024', '2026-09-03').am_in).toBe('08:10');
    expect(repo.monthStats('024', '2026-09')).toMatchObject({ present: 1, lates: 1, lateMin: 10 });
    expect(repo.monthStats('205', '2026-09').lates).toBe(0);       // flexi: 08:50 is fine
  });
  it('remark suggestions come from the whole history of that person only', async () => {
    await repo.setRemarks('024', ['2026-08-03', '2026-09-04'], { code: 'OTHER', text: 'FIELD WORK – CITY HALL' });
    await repo.setRemarks('024', ['2026-09-10'], { code: 'OTHER', text: 'MEETING' });
    expect(await repo.remarkSuggestions('024')).toEqual(['FIELD WORK – CITY HALL', 'MEETING']);
    expect(await repo.remarkSuggestions('205')).toEqual([]);
  });
});

describe('settings, PIN, backup', () => {
  it('schedule and signatory persist (debounced, settle flushes)', async () => {
    repo.saveSchedule({ mode: 'flexi', req: 9 }); repo.saveSignatory({ name: 'NEW BOSS' });
    await repo.settle();
    expect((await db.settings.get('schedule')).req).toBe(9);
    expect((await db.settings.get('signatory')).name).toBe('NEW BOSS');
  });
  it('admin PIN is hashed, salted, and checked', async () => {
    expect(repo.hasAdminPin()).toBe(false);
    await repo.setAdminPin('123456');
    expect(repo.hasAdminPin()).toBe(true);
    const row = await db.settings.get('admin'); expect(JSON.stringify(row)).not.toContain('123456');
    expect(await repo.checkAdminPin('123456')).toBe(true);
    expect(await repo.checkAdminPin('654321')).toBe(false);
    expect(await repo.checkAdminPin('12')).toBe(false);
    await expect(repo.setAdminPin('12')).rejects.toMatchObject({ code: 'BAD_PIN' });
  });
  it('the app starts from what is saved', async () => {
    await repo.recordTime('024', 'am_in', '08:20'); await repo.setAdminPin('123456'); repo.saveSignatory({ title: 'Boss' }); await repo.settle();
    repo.shutdown(); await repo.init({ name: db.name, cloudUrl: '' });
    expect(repo.emp('205').sched.mode).toBe('flexi');
    expect(repo.get('024', '2026-10-07').am_in).toBe('08:20');
    expect(repo.hasAdminPin()).toBe(true); expect(repo.S.sign.title).toBe('Boss');
  });
  it('backup then restore into an empty database brings everything back', async () => {
    await repo.recordTime('024', 'am_in', '08:20'); await repo.applyHoliday('2026-10-12', 'X'); await repo.setAdminPin('123456');
    const file = await repo.exportAll();
    repo.shutdown(); await repo.init({ name: 'restore-' + n, cloudUrl: '' });
    expect(repo.S.emps).toHaveLength(0);
    const r = await repo.importAll(file);
    expect(r.people).toBe(2);
    expect(repo.emp('024').nick).toBe('Juan'); expect(repo.get('024', '2026-10-07').am_in).toBe('08:20');
    expect(repo.S.holidays.map(h => h.date)).toEqual(['2026-10-12']);
    expect(await repo.checkAdminPin('123456')).toBe(true);
    await expect(repo.importAll('nope')).rejects.toMatchObject({ code: 'BAD_BACKUP' });
    await expect(repo.importAll('{"app":"other"}')).rejects.toMatchObject({ code: 'BAD_BACKUP' });
  });
});

describe('late not counted', () => {
  it('marks existing days, marks days made later, and can be undone', async () => {
    await repo.ensureMonth('2026-10');
    await repo.recordTime('024', 'am_in', '08:40', '2026-10-09');
    await repo.excuseDays(['2026-10-09'], 'TYPHOON');
    expect(repo.get('024', '2026-10-09').excused).toBe(true);
    await repo.recordTime('205', 'am_in', '08:50', '2026-10-09');                 // clocks in after the mark was made
    expect(repo.get('205', '2026-10-09').excused).toBe(true);
    expect((await db.days.get('day:205:2026-10-09')).excused).toBe(true);        // and it is saved
    expect(repo.S.excused).toEqual([{ date: '2026-10-09', name: 'TYPHOON' }]);
    await repo.unexcuseDay('2026-10-09');
    expect(repo.get('024', '2026-10-09').excused).toBe(false); expect(repo.S.excused).toEqual([]);
  });
  it('one person one day, from the day editor', async () => {
    await repo.recordTime('024', 'am_in', '08:40', '2026-10-07');
    await repo.saveDay('024', '2026-10-07', { am_in: '08:40', excused: true });
    expect(repo.get('024', '2026-10-07').excused).toBe(true);
  });
});

