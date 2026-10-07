import { pad, ymd } from './util.js';

/* The phone's own clock (device time). `setClock` exists only so tests can pin the time. */
let override = null;
export const setClock = fn => { override = fn; };
export function now() {
  const d = override ? override() : new Date();
  return { date: ymd(d), time: pad(d.getHours()) + ':' + pad(d.getMinutes()), d };
}
