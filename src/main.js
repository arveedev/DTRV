import './styles.css';
import '@fontsource/poppins/latin-400.css';
import '@fontsource/poppins/latin-500.css';
import '@fontsource/poppins/latin-600.css';
import '@fontsource/poppins/latin-700.css';
import '@fontsource/poppins/latin-800.css';
import '@fontsource/space-grotesk/latin-500.css';
import '@fontsource/space-grotesk/latin-600.css';
import '@fontsource/space-grotesk/latin-700.css';
import { boot } from './ui/app.js';

boot().catch(err => {
  console.error(err);
  document.body.innerHTML = `<pre style="padding:24px;color:#f88;font:14px monospace;white-space:pre-wrap">DTRV could not start.\n\n${String(err?.message || err).replace(/[<&]/g, c => '&#' + c.charCodeAt(0) + ';')}</pre>`;
});
