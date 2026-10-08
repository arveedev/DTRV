/* Background work that must never be felt. Jobs run only when the person is not using the app (hidden, or no touch for a
   while), in an idle moment of the browser, one at a time. Nothing here runs a job on a timer the user can see. */
let lastInput = Date.now();
if (typeof window !== 'undefined') ['pointerdown', 'keydown', 'touchstart', 'wheel'].forEach(t => window.addEventListener(t, () => { lastInput = Date.now(); }, { passive: true, capture: true }));

export const quietFor = () => Date.now() - lastInput;
/** True when nobody is using the app right now: it is in the background, or untouched for `ms`. */
export const isQuiet = (ms = 60000) => (typeof document !== 'undefined' && document.hidden) || quietFor() >= ms;

/** Let the browser draw / respond between slices of a long job. */
export const yieldToMain = () => (globalThis.scheduler?.yield ? globalThis.scheduler.yield() : new Promise(r => setTimeout(r, 0)));
const whenIdle = fn => (globalThis.requestIdleCallback ? requestIdleCallback(fn, { timeout: 15000 }) : setTimeout(fn, 300));

/**
 * Check every `every` ms (a very cheap test) and when `shouldRun()` is true and the app is quiet, run `job` in an idle moment.
 * Never overlaps itself. Also checks when the app goes to the background, which is the best moment of all.
 * Returns a function that checks right now.
 */
export function backgroundJob({ shouldRun, job, every = 120000, quietMs = 60000 }) {
  let running = false;
  const check = () => {
    if (running || !isQuiet(quietMs)) return;
    let go = false; try { go = shouldRun(); } catch { go = false; }
    if (!go) return;
    running = true;
    whenIdle(async () => { try { await job(); } catch (e) { console.warn('background job failed', e); } finally { running = false; } });
  };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (document.hidden) check(); });
  setInterval(check, every);
  return check;
}
