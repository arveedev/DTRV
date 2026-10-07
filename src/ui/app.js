/* Boot, and the one place that refreshes whatever is on screen after data changed. */
import { $, isOn } from '../lib/util.js';
import { init, onExternalChange } from '../data/repo.js';
import { stagger } from './core.js';
import { initHome, paintToggles, autoToggle, tick } from './home.js';
import { initMy, refreshMy, myOpen } from './my.js';
import { initPrint } from './print.js';
import { initAdmin, refreshAdmin } from './admin.js';
import { cloudUrl, fetchTokens } from './cloud.js';

/** Repaint what is visible. Cheap; call after any write. */
export function afterChange() {
  paintToggles();
  if (isOn('p-my') && myOpen()) refreshMy();
  refreshAdmin();
}

export async function boot() {
  await init({ cloudUrl, fetchTokens });
  initHome(); initMy(); initPrint(); initAdmin();
  onExternalChange(() => { autoToggle(); afterChange(); });     // another tab / phone changed something
  stagger($('#p-record'));
  document.documentElement.dataset.ready = '1';
  if (new URLSearchParams(location.search).has('demo')) (await import('../demo.js')).seed().then(() => { autoToggle(); afterChange(); });
  tick();
}
