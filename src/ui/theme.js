/* Light or dark. Follows the phone until someone chooses; the choice is kept on that phone. */
import { $, store } from '../lib/util.js';

const KEY = 'dtrv.theme', mq = matchMedia('(prefers-color-scheme: light)');
const SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/></svg>';

export const pref = () => store.get(KEY) || 'auto';                            // 'auto' | 'light' | 'dark'
export const effective = () => (pref() === 'auto' ? (mq.matches ? 'light' : 'dark') : pref());

export function applyTheme(animate = true) {
  const t = effective(), app = $('#app');
  if (animate && app) { app.classList.add('theming'); setTimeout(() => app.classList.remove('theming'), 520); }
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', t === 'light' ? '#f3f6fb' : '#0a0f1c');
  const b = $('#themeBtn'); if (b) { b.innerHTML = t === 'light' ? MOON : SUN; b.setAttribute('aria-label', t === 'light' ? 'Switch to dark' : 'Switch to light'); }
}
export function setTheme(p, animate = true) { store.set(KEY, p === 'auto' ? null : p); applyTheme(animate); }
export const toggleTheme = () => setTheme(effective() === 'dark' ? 'light' : 'dark');
export function initTheme() {
  applyTheme(false); $('#themeBtn').onclick = toggleTheme;
  mq.addEventListener?.('change', () => { if (pref() === 'auto') applyTheme(true); });
}
