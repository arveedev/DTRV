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
import { loadAddon, syncNote } from '../data/db.js';

/** Repaint what is visible. Cheap; call after any write. */
export function afterChange() {
  paintToggles();
  if (isOn('p-my') && myOpen()) refreshMy();
  refreshAdmin();
}

/** The sync add-on arrived late: reopen the database with sync, once nothing is being saved or edited. */
async function switchToSync() {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 90 && !(idle() && !$('#sheet').classList.contains('show') && !$('#picker').classList.contains('show')); i++) await wait(1000);
  try { await init({ cloudUrl, fetchTokens }); syncNote.text = ''; watchSync(() => paintToggles()); afterChange(); }
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
  if (cloudUrl && !withSync) loadAddon().then(() => switchToSync(), () => {});
  initHome(); initMy(); initPrint(); initAdmin();
  onExternalChange(afterChange);                  // another tab / phone / sync changed something: repaint, but never reset the keypad or a pending PIN
  watchSync(() => paintToggles());
  stagger($('#p-record'));
  document.documentElement.dataset.ready = '1';
  if (new URLSearchParams(location.search).has('demo')) (await import('../demo.js')).seed().then(() => { autoToggle(); afterChange(); });
  tick();
}
