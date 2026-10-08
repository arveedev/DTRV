import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { setClock } from '../src/lib/clock.js';
import * as repo from '../src/data/repo.js';
import { db } from '../src/data/db.js';
import { takeSnapshot } from '../src/data/backup.js';

/* 60 people x a working year: how long does the backup hold the screen at a time? */
describe('backup cost on a big database', () => {
  it('works in short slices (no single step blocks for long)', async () => {
    setClock(() => new Date('2026-10-07T20:00:00'));
    await repo.init({ name: 'perf', cloudUrl: '' });
    const emps = [], days = [], punches = [];
    for (let p = 0; p < 60; p++) emps.push({ id: 'emp:' + String(p).padStart(3, '0'), code: String(p).padStart(3, '0'), name: 'PERSON ' + p, nick: '', pos: '', sched: null, active: true });
    for (let p = 0; p < 60; p++) for (let d = 0; d < 150; d++) {
      const date = new Date(Date.UTC(2026, 0, 1 + d)).toISOString().slice(0, 10), no = emps[p].code;
      days.push({ id: `day:${no}:${date}`, employeeId: no, date, am_in: '08:05', am_out: '12:01', pm_in: '12:58', pm_out: '17:03', remark: null, edited: false });
      for (const s of ['am_in', 'am_out', 'pm_in', 'pm_out']) punches.push({ id: `${no}${date}${s}`, employeeId: no, date, slot: s, time: '08:00', at: '2026-01-01T00:00:00Z', kind: 'record' });
    }
    await db.employees.bulkPut(emps); await db.days.bulkPut(days); await db.punches.bulkPut(punches);
    let worst = 0, last = performance.now();                           // the longest gap between turns of the event loop = the longest freeze
    const tick = setInterval(() => { const n = performance.now(); worst = Math.max(worst, n - last - 5); last = n; }, 5);
    const t0 = performance.now(); await takeSnapshot(); const total = performance.now() - t0;
    clearInterval(tick);
    console.log(`snapshot of ${days.length} days / ${punches.length} punches: ${Math.round(total)} ms in total, longest freeze ${Math.round(worst)} ms`);
    expect(worst).toBeLessThan(200);
    setClock(null); repo.shutdown();
  }, 60000);
});
