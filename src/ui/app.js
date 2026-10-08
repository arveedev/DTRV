/* Boot, and the one place that refreshes whatever is on screen after data changed. */
import { $, isOn } from '../lib/util.js';
import { init, idle, onExternalChange } from '../data/repo.js';
import { watchSync } from '../data/db.js';
import { stagger, toast } from './core.js';
import { initHome, paintToggles, autoToggle, tick } from './home.js';
import { initMy, refreshMy, myOpen } from './my.js';
import { initPrint } from './print.js';
import { initAdmin, refreshAdmin } from './admin.js';
import { cloudUrl, fetchTokens, takeKeyFromLink } from './cloud.js';
import { loadAddon, syncNote, syncNow, sync, cloudEnabled } from '../data/db.js';
import { startAutoBackup } from '../data/backup.js';
import { store } from '../lib/util.js';

/** Repaint what is visible. Cheap; call after any write. */
export function afterChange() {
  paintToggles();
  if (isOn('p-my') && myOpen()) refreshMy();
  refreshAdmin();
}

/** Never give up: keep asking the sync to run until it is up to date, and again whenever it falls behind.
 *  Backs off from 15 s to 2 min; any sign of life (back online, app brought forward) tries at once. */
let retryStarted = false;
function keepSyncing() {
  if (retryStarted) return; retryStarted = true;
  let delay = 15000, timer = 0;
  const step = async fast => {
    clearTimeout(timer);
    if (!store.get('dtrv.syncKey')) { timer = setTimeout(step, 30000); return; }       // nothing to try without the key
    if (sync.phase === 'in-sync') delay = 15000;
    else if (navigator.onLine !== false && cloudEnabled) { await syncNow(); delay = fast ? 6000 : Math.min(delay * 1.6, 120000); }
    timer = setTimeout(step, sync.phase === 'in-sync' ? 60000 : delay);
  };
  window.addEventListener('online', () => step(true));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) step(true); });
  step(true);
}

/** Load the add-on, however many tries it takes (a slow or dropped connection), then switch to the synced database. */
async function addonUntilItArrives() {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  for (let d = 3000; ; d = Math.min(d * 2, 60000)) {
    try { await loadAddon(); break; }
    catch (e) {
      syncNote.text = 'The sync part could not be downloaded yet; retrying'; paintToggles();
      await wait(d);
      /* a browser remembers a failed download until the page is reloaded, so when we are online again and idle, reload (at most once every 5 minutes) */
      const last = +store.get('dtrv.addonReload') || 0;
      if (navigator.onLine !== false && idle() && Date.now() - last > 300000) { store.set('dtrv.addonReload', String(Date.now())); location.reload(); return; }
    }
  }
  await switchToSync();
}

/** The sync add-on arrived late: reopen the database with sync, once nothing is being saved or edited. */
async function switchToSync() {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 90 && !(idle() && !$('#sheet').classList.contains('show') && !$('#picker').classList.contains('show')); i++) await wait(1000);
  try { await init({ cloudUrl, fetchTokens }); syncNote.text = ''; watchSync(() => paintToggles()); afterChange(); keepSyncing(); }
  catch (e) { syncNote.text = 'Sync could not start (' + (e?.message || e) + ')'; paintToggles(); }
}

export async function boot() {
  takeKeyFromLink();
  /* Sync must never keep the app from opening. Its add-on is a separate download that can be slow, so wait a few seconds,
     then start on this phone's own data. When the add-on arrives, switch to the synced database while the app is idle. */
  const wait = ms => new Promise(r => setTimeout(r, ms));
  let withSync = false;
  if (cloudUrl) withSync = await Promise.race([loadAddon().then(() => true, e => { syncNote.text = 'The sync part could not be downloaded (' + (e?.message || e) + ')'; return false; }), wait(3500).then(() => { syncNote.text = syncNote.text || 'The sync part is still downloading'; return false; })]);
  await init({ cloudUrl: withSync ? cloudUrl : '', fetchTokens });
  if (cloudUrl && !withSync) addonUntilItArrives();
  initHome(); initMy(); initPrint(); initAdmin();
  onExternalChange(afterChange);                  // another tab / phone / sync changed something: repaint, but never reset the keypad or a pending PIN
  watchSync(() => paintToggles());
  if (cloudUrl && withSync) keepSyncing();
  stagger($('#p-record'));
  /* automatic backups run on their own, only when the app is not being used (see src/lib/scheduler.js) */
  startAutoBackup();
  document.documentElement.dataset.ready = '1';
  if (new URLSearchParams(location.search).has('demo')) (await import('../demo.js')).seed().then(() => { autoToggle(); afterChange(); });
  tick();
}
