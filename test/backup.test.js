import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setClock } from '../src/lib/clock.js';
import * as repo from '../src/data/repo.js';
import { autoBackup, takeSnapshot, listSnapshots, restoreSnapshot, retained, _reset } from '../src/data/backup.js';

const mem = {}; globalThis.localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
let n = 0;
const at = iso => setClock(() => new Date(iso));
beforeEach(async () => {
  _reset(); await new Promise(r => { const q = indexedDB.deleteDatabase('dtrv-backups'); q.onsuccess = q.onerror = q.onblocked = () => r(); });
  at('2026-10-07T08:20:00');
  await repo.init({ name: 'bk-' + (++n), cloudUrl: '' });
  await repo.saveEmployee({ no: '024', name: 'JUAN A. DELA CRUZ', nick: 'Juan', pos: '', sched: null }, true);
  await repo.recordTime('024', 'am_in', '08:05', '2026-10-07');
});
afterEach(() => { setClock(null); repo.shutdown(); });

describe('automatic backups', () => {
  it('makes one snapshot a day, not one per call', async () => {
    expect(await autoBackup()).toBe(true);
    expect(await autoBackup()).toBe(false);
    expect((await listSnapshots()).filter(s => s.id === '2026-10-07')).toHaveLength(1);
  });
  it('does nothing while there is no data', async () => {
    repo.S.emps = []; expect(await autoBackup()).toBe(false);
  });
  it('prunes by the policy: 30 daily days, weekly to 6 months, monthly to 2 years', async () => {
    for (const id of ['2026-09-20', '2026-08-05', '2026-03-01']) await takeSnapshot(id);
    const ids = (await listSnapshots()).map(s => s.id);
    expect(ids).toEqual(expect.arrayContaining(['2026-09-20', '2026-08-05', '2026-03-01']));    // all inside the windows
  });
  it('restores an older state and saves the current one first', async () => {
    await takeSnapshot('2026-10-06');
    await repo.recordTime('024', 'am_out', '12:01', '2026-10-07');
    await repo.saveEmployee({ no: '331', name: 'PEDRO R. REYES', nick: 'Pedro', pos: '', sched: null }, true);
    await restoreSnapshot('2026-10-06');
    expect(repo.emp('331')).toBeUndefined();
    expect(repo.get('024', '2026-10-07').am_out).toBeNull();
    expect((await listSnapshots()).some(s => s.id.startsWith('before-restore-'))).toBe(true);
  });
});

describe('retention policy', () => {
  const day = (n, from = '2026-10-07') => new Date(Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10) - n)).toISOString().slice(0, 10);
  const ids = Array.from({ length: 800 }, (_, i) => day(i));
  const kept = retained(ids, '2026-10-07');
  it('keeps every day for the last 30 days', () => { for (let i = 0; i <= 30; i++) expect(kept.has(day(i))).toBe(true); });
  it('then one per week up to about 6 months', () => {
    const wk = [...kept].filter(id => { const a = Math.round((Date.UTC(2026, 9, 7) - Date.parse(id)) / 86400000); return a > 30 && a <= 183; });
    expect(wk.length).toBeGreaterThanOrEqual(21); expect(wk.length).toBeLessThanOrEqual(24);
  });
  it('then one per month up to 2 years, nothing older', () => {
    const mo = [...kept].filter(id => { const a = Math.round((Date.UTC(2026, 9, 7) - Date.parse(id)) / 86400000); return a > 183; });
    expect(mo.length).toBeGreaterThanOrEqual(17); expect(mo.length).toBeLessThanOrEqual(20);
    expect(kept.has(day(731))).toBe(false); expect(kept.size).toBeLessThan(80);
  });
  it('covers at least 3 months back', () => { expect([...kept].some(id => id <= '2026-07-01')).toBe(true); });
});

describe('when a backup is due', () => {
  it('first one as soon as there is data, then only after a change, and only after working hours', async () => {
    at('2026-10-07T10:00:00');
    expect(await autoBackup()).toBe(true);                       // the first ever: any hour
    await repo.recordTime('024', 'am_out', '12:01', '2026-10-07');   // something changed
    expect(await autoBackup()).toBe(false);                      // 10:00: working hours, not overdue
    at('2026-10-07T19:00:00');
    expect(await autoBackup()).toBe(true);                       // evening and changed: due
    expect(await autoBackup()).toBe(false);                      // unchanged since: costs nothing
  });
  it('an unchanged day is skipped even in the evening', async () => {
    at('2026-10-07T20:00:00'); await autoBackup();
    const before = (await listSnapshots()).find(s => s.id === '2026-10-07').at;
    await new Promise(r => setTimeout(r, 15));
    expect(await autoBackup()).toBe(false);
    expect((await listSnapshots()).find(s => s.id === '2026-10-07').at).toBe(before);
  });
});
