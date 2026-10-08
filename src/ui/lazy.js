/* The admin area and the print screens are used by a few people a few times a month, so they are loaded the first time they
   are opened and not with the home screen. `mods` holds what has already arrived, for code that only wants to refresh a
   screen if it is there. */
export const mods = {};
const once = {};
const load = (key, fn) => (once[key] ||= fn().then(m => (mods[key] = m)));

export const admin = () => load('admin', async () => { const m = await import('./admin.js'); m.initAdmin(); return m; });
export const printer = () => load('print', async () => { const m = await import('./print.js'); m.initPrint(); return m; });
