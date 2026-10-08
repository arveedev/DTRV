import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as repo from '../src/data/repo.js';
import { logError, listErrors, clearErrors, asText, pruneErrors } from '../src/lib/errlog.js';
import { db } from '../src/data/db.js';

const mem = {}; globalThis.localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
globalThis.navigator ??= { userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A) Chrome/120', onLine: true };
let n = 0;
beforeEach(async () => { await repo.init({ name: 'err-' + (++n), cloudUrl: '' }); delete mem['dtrv.errDay']; });
afterEach(() => repo.shutdown());

describe('error log', () => {
  it('saves a note with the device and version, and lists newest first', async () => {
    await logError('script', new Error('first problem')); await logError('sync', 'second problem');
    const rows = await listErrors();
    expect(rows).toHaveLength(2); expect(rows[0].msg).toBe('second problem'); expect(rows[1].what).toBe('script');
    expect(rows[0].device).toMatch(/^[a-z0-9]{1,4}$/); expect(rows[0].version).toBeTruthy();
    expect(asText(rows)).toContain('first problem');
  });
  it('does not repeat the same note, ignores noise, and limits a day', async () => {
    await logError('script', 'same'); await logError('script', 'same'); await logError('script', 'ResizeObserver loop limit exceeded');
    expect(await listErrors()).toHaveLength(1);
    for (let i = 0; i < 40; i++) await logError('script', 'many ' + i);
    expect((await listErrors()).length).toBeLessThanOrEqual(20);
  });
  it('is kept out of the people, days and settings the app reads', async () => {
    await logError('script', 'x'); expect(repo.S.sched.mode).toBeTruthy(); expect(repo.S.emps).toEqual([]);
  });
  it('clear removes the notes everywhere', async () => { await logError('script', 'y'); await clearErrors(); expect(await listErrors()).toEqual([]); });
  it('keeps the table small', async () => {
    const rows = Array.from({ length: 160 }, (_, i) => ({ id: 'err:2026-01-' + String(i).padStart(3, '0'), kind: 'error', at: '2026', msg: 'm' }));
    await db.settings.bulkPut(rows); await pruneErrors(); expect((await listErrors()).length).toBe(100);
  });
});
