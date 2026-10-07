/* Boot, and the one place that refreshes whatever is on screen after data changed. */
import { $, isOn } from '../lib/util.js';
import { init, onExternalChange } from '../data/repo.js';
import { watchSync } from '../data/db.js';
import { stagger, toast } from './core.js';
import { initHome, paintToggles, autoToggle, tick } from './home.js';
import { initMy, refreshMy, myOpen } from './my.js';
import { initPrint } from './print.js';
import { initAdmin, refreshAdmin } from './admin.js';
import { cloudUrl, fetchTokens, takeKeyFromLink } from './cloud.js';

/** Repaint what is visible. Cheap; call after any write. */
export function afterChange() {
  paintToggles();
  if (isOn('p-my') && myOpen()) refreshMy();
  refreshAdmin();
}

function lateSync() {
  if (document.getElementById('updBar')) return;
  const b = document.createElement('button'); b.id = 'updBar'; b.textContent = 'Sync is ready · tap to connect'; b.onclick = () => location.reload();
  (document.getElementById('app') || document.body).append(b);
}

export async function boot() {
  takeKeyFromLink();
  /* Sync must never keep the app from opening: on a slow connection its add-on can take a minute to arrive.
     Wait a few seconds for it, then start on this phone's own data; sync joins on the next start. */
  let timer; const slow = new Promise((_, no) => { timer = setTimeout(() => no(new Error('slow')), 3500); }); slow.catch(() => {});
  const first = init({ cloudUrl, fetchTokens });
  first.catch(e => { if (e.message === 'superseded') lateSync(); });          // the add-on arrived after we gave up: offer to connect now
  try { await Promise.race([first, cloudUrl ? slow : new Promise(() => {})]); }
  catch (e) {
    if (!cloudUrl) throw e;
    console.warn('Starting without sync:', e.message);
    await init({ cloudUrl: '', fetchTokens });
    setTimeout(() => toast('Slow connection: running without sync for now', 'err'), 800);
  } finally { clearTimeout(timer); }
  initHome(); initMy(); initPrint(); initAdmin();
  onExternalChange(afterChange);                  // another tab / phone / sync changed something: repaint, but never reset the keypad or a pending PIN
  watchSync(() => paintToggles());
  stagger($('#p-record'));
  document.documentElement.dataset.ready = '1';
  if (new URLSearchParams(location.search).has('demo')) (await import('../demo.js')).seed().then(() => { autoToggle(); afterChange(); });
  tick();
}
