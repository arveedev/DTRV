import './styles.css';
import '@fontsource/poppins/latin-400.css';
import '@fontsource/poppins/latin-500.css';
import '@fontsource/poppins/latin-600.css';
import '@fontsource/poppins/latin-700.css';
import '@fontsource/space-grotesk/latin-500.css';
import '@fontsource/space-grotesk/latin-600.css';
import '@fontsource/space-grotesk/latin-700.css';
import { registerSW } from 'virtual:pwa-register';
import { boot } from './ui/app.js';

/* A new version is fetched in the background. If the app is in the background we switch to it at once; otherwise we
   offer a tap, so nothing reloads in the middle of someone using the keypad. */
if ('serviceWorker' in navigator) {
  const offer = apply => {
    if (document.hidden) { apply(true); return; }
    if (document.getElementById('updBar')) return;
    const b = document.createElement('button'); b.id = 'updBar'; b.textContent = 'New version ready · tap to update'; b.onclick = () => apply(true);
    (document.getElementById('app') || document.body).append(b);
  };
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() { offer(updateSW); },
    onRegisteredSW(_, reg) { if (reg) document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); }); },
  });
}

boot().catch(err => {
  console.error(err);
  document.body.innerHTML = `<pre style="padding:24px;color:#f88;font:14px monospace;white-space:pre-wrap">DTRV could not start.\n\n${String(err?.message || err).replace(/[<&]/g, c => '&#' + c.charCodeAt(0) + ';')}</pre>`;
});
