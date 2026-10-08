import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setClock } from '../src/lib/clock.js';
import * as repo from '../src/data/repo.js';
import { autoBackup, takeSnapshot, listSnapshots, restoreSnapshot } from '../src/data/backup.js';

let n = 0;
const at = iso => setClock(() => new Date(iso));
beforeEach(async () => {
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
  it('keeps only the last 14 days', async () => {
    for (let d = 1; d <= 20; d++) await takeSnapshot('2026-09-' + String(d).padStart(2, '0'));
    const days = (await listSnapshots()).filter(s => /^\d{4}-\d\d-\d\d$/.test(s.id));
    expect(days).toHaveLength(14);
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
