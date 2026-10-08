/* ?demo=1 : fill an empty database with sample people and a few days, for trying the app. Never overwrites real data. */
import { S, saveEmployee, saveSchedule, setAdminPin, recordTime, setRemarks, ensureMonth, hasAdminPin } from './data/repo.js';
import { now } from './lib/clock.js';
import { addDays } from './lib/util.js';

export async function seed() {
  if (S.emps.length) return;
  await saveEmployee({ no: '024', name: 'JUAN M. DELA CRUZ', nick: 'Juan', pos: 'Clerk', sched: null }, true);
  await saveEmployee({ no: '205', name: 'MARIA L. SANTOS', nick: 'Maria', pos: 'Technician', sched: { ...S.sched, mode: 'flexi' } }, true);
  await saveEmployee({ no: '331', name: 'PEDRO R. REYES', nick: 'Pedro', pos: 'Driver', sched: null }, true);
  if (!hasAdminPin()) await setAdminPin('123456');
  saveSchedule({});
  const today = now().date;
  await ensureMonth(today.slice(0, 7));
  for (let i = 1; i <= 5; i++) {
    const d = addDays(today, -i), wd = new Date(d + 'T00:00').getDay();
    if (d.slice(0, 7) !== today.slice(0, 7) || wd === 0 || wd === 6) continue;
    await recordTime('024', 'am_in', i % 2 ? '08:12' : '07:55', d); await recordTime('024', 'am_out', '12:01', d);
    await recordTime('024', 'pm_in', '12:58', d); if (i !== 1) await recordTime('024', 'pm_out', '17:03', d);   // yesterday: a forgotten clock-out, to show the finder
  }
}
export { setRemarks };
