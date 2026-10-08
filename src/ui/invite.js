/* "Invite someone": a QR code and short steps, so a new person can set up their own phone without help. */
import qrcode from 'qrcode-generator';
import { $, esc } from '../lib/util.js';
import { openSheet, closeSheet, toast } from './core.js';
import { setupLink } from './cloud.js';

export function qrSvg(text) {
  const q = qrcode(0, 'M'); q.addData(text); q.make();
  return q.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
}
export function openInvite() {
  const link = setupLink() || location.origin + '/';
  openSheet(`<h3 data-st>Invite someone</h3>
    <div class="qrbox" data-st>${qrSvg(link)}</div>
    <div class="qrlink" data-st>${esc(link.replace(/#key=.*/, '#key=…'))}</div>
    <ol class="steps" data-st>
      <li>Scan this with the phone's camera (or send them the link).</li>
      <li><b>iPhone:</b> Share ▸ <b>Add to Home Screen</b>. <b>Android:</b> ⋮ ▸ <b>Install app</b>.</li>
      <li>Open the app from the home screen. It connects by itself, then they use their 3-digit code.</li>
    </ol>
    <div class="btns" data-st><button class="btn" id="ivClose">Close</button><button class="btn primary" id="ivShare">Share link</button></div>`);
  $('#ivClose').onclick = closeSheet;
  $('#ivShare').onclick = async () => {
    try { if (navigator.share) await navigator.share({ title: 'DTRV', url: link }); else { await navigator.clipboard.writeText(link); toast('Link copied'); } }
    catch (e) { if (e.name !== 'AbortError') toast('Could not share', 'err'); }
  };
}
