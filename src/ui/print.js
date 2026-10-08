/* Print preview (one person from My DTR, or many from the admin list) and the real-size pages for printing. */
import { $, shiftYM, MONTHS, esc } from '../lib/util.js';
import { nickOf, lateSlots } from '../lib/rules.js';
import { S, get, emp, schedOf, ensureMonth } from '../data/repo.js';
import { dtrCopy } from '../print/dtr.js';
import { go, stagger, toast } from './core.js';
import { renderAdmin } from './admin.js';

let curPrintSt = null, printFrom = 'my', printReady = false;
const copy = (no, ym) => dtrCopy(emp(no), ym, d => get(no, d), S.sign, e => lateSlots(e, schedOf(emp(no))));
/* One printed page per person per month. `st.span` months, ending at `st.ym` (1 = just that month). */
export const monthsOf = st => Array.from({ length: st.span || 1 }, (_, k) => shiftYM(st.ym, -((st.span || 1) - 1 - k)));
export const itemsOf = st => st.nos.flatMap(no => monthsOf(st).map(ym => ({ no, ym })));
const ensureAll = st => Promise.all(monthsOf(st).map(ensureMonth));
const pages = st => itemsOf(st).map(({ no, ym }) => { const c = copy(no, ym); return `<div class="a4">${c}${c}</div>`; }).join('');

/** The admin list keeps this up to date so Ctrl+P prints exactly what is selected. */
export const setPrintSel = st => { curPrintSt = st; };

/* The pages are written into a hidden frame and that frame is printed. That works the same on desktops, phones and installed
   apps, and the app screen itself (its glow, keypad, sheets) can never end up on the paper. */
const allCss = () => [...document.styleSheets].map(s => { try { return [...s.cssRules].map(r => r.cssText).join('\n'); } catch { return ''; } }).join('\n');
const frameDoc = html => `<!doctype html><html><head><meta charset="utf-8"><title>DTR</title><style>${allCss()}
@media screen{#printRoot{display:block!important}}</style></head><body><div id="printRoot">${html}</div></body></html>`;

export async function doPrint(st) {
  if (!st.nos.length) return;
  curPrintSt = st; await ensureAll(st);
  const html = pages(st);
  document.getElementById('printFrame')?.remove();
  const f = document.createElement('iframe');
  f.id = 'printFrame'; f.setAttribute('aria-hidden', 'true'); f.tabIndex = -1;
  f.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0;opacity:0;pointer-events:none';
  document.body.append(f);
  const d = f.contentDocument; d.open(); d.write(frameDoc(html)); d.close();
  await new Promise(r => setTimeout(r, 250));                       // let the frame lay out before the print dialog asks for it
  try { f.contentWindow.focus(); f.contentWindow.print(); }
  catch { $('#printRoot').innerHTML = html; printReady = true; window.print(); }   // last resort: print the page itself
}

/* ---- iPhone home-screen apps cannot open the print dialog from a web page. They can open the share sheet, which has Print. ---- */
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
const useShare = () => isIOS() && standalone();
const sigOf = st => st.ym + ':' + (st.span || 1) + ':' + st.nos.join(',') + ':' + JSON.stringify(S.sign);
let ready = null;      // { sig, file } the PDF made by the first tap, shared by the second

async function makePdf(st, progress) {
  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([import('jspdf'), import('html2canvas')]);
  await ensureAll(st);
  const items = itemsOf(st);
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  const host = document.createElement('div'); host.style.cssText = 'position:fixed;left:-10000px;top:0;background:#fff'; document.body.append(host);
  try {
    for (let i = 0; i < items.length; i++) {
      progress?.(i + 1, items.length);
      const c = copy(items[i].no, items[i].ym); host.innerHTML = `<div class="a4" style="box-shadow:none;margin:0">${c}${c}</div>`;
      const canvas = await html2canvas(host.firstElementChild, { scale: 2, backgroundColor: '#fff', logging: false });
      if (i) doc.addPage();
      doc.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297);
      await new Promise(r => setTimeout(r));                            // let the screen breathe between pages
    }
  } finally { host.remove(); }
  return new File([doc.output('blob')], `DTR-${st.ym}.pdf`, { type: 'application/pdf' });
}

/** The Print button. Desktops and Android print at once; on an iPhone app the first tap makes the pages, the second opens the share sheet. */
export async function printWith(btn, st) {
  if (!st.nos.length) return;
  if (!useShare()) return doPrint(st);
  const sig = sigOf(st);
  if (ready?.sig === sig) {                                             // second tap: a fresh tap is what the share sheet needs
    const { file } = ready; ready = null;
    try {
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: 'DTR' });
      else window.open(URL.createObjectURL(file), '_blank');
    } catch (e) { if (e.name !== 'AbortError') toast(esc(e.message), 'err'); }
    return;
  }
  const label = btn.textContent; btn.disabled = true;
  try {
    const file = await makePdf(st, (i, n) => { btn.textContent = n > 1 ? `Preparing ${i} of ${n}…` : 'Preparing…'; });
    ready = { sig, file }; btn.textContent = 'Tap again, then choose Print';
    setTimeout(() => { if (ready?.file === file && btn.isConnected) btn.textContent = label, ready = null; }, 60000);
  } catch (e) { btn.textContent = label; toast(esc(e.message || 'Could not prepare the pages'), 'err'); }
  finally { btn.disabled = false; }
}

export function initPrint() {
  /* Ctrl+P / browser menu: rebuild from the current selection right before printing, so it is never stale. */
  window.addEventListener('beforeprint', () => { if (!printReady && curPrintSt?.nos.length) $('#printRoot').innerHTML = pages(curPrintSt); });
  window.addEventListener('afterprint', () => { printReady = false; });      // pages stay in the (hidden) root: some phones fire this before the sheet has rendered
  $('#printBack').onclick = () => { $('#printRoot').innerHTML = ''; if (printFrom === 'admin') { go('p-admin', 'l'); renderAdmin(); } else go('p-my', 'l'); };
}

export async function openPreview(st, from) {
  st.page = 0; st.span ||= 1; curPrintSt = st; printFrom = from; await ensureAll(st); go('p-print', 'r');
  setTimeout(() => renderPreview(st), 60);
}

/* Every lookup below is scoped to #printBody: the preview and the admin list must never share element ids. */
function renderPreview(st) {
  const host = $('#printBody'), q = sel => host.querySelector(sel);
  const mlabel = ym => MONTHS[+ym.slice(5) - 1].slice(0, 3) + ' ' + ym.slice(0, 4);
  const label = () => (st.span || 1) > 1 ? `${mlabel(monthsOf(st)[0])} – ${mlabel(st.ym)}` : MONTHS[+st.ym.slice(5) - 1] + ' ' + st.ym.slice(0, 4);
  host.innerHTML = `<div class="pctl" data-st><div class="pname">${st.nos.length > 1 ? st.nos.length + ' people' : esc(emp(st.nos[0]).name)}</div>
    <div class="mnav"><button class="pPrev">‹</button><span class="pLbl">${label()}</span><button class="pNext">›</button></div></div>
    <div class="spanrow" data-st><span>Months</span>${[1, 3, 6, 12].map(k => `<button data-k="${k}" class="${(st.span || 1) === k ? 'on' : ''}">${k}</button>`).join('')}</div>
    <div class="pager"><button class="pgPrev">‹</button><span class="pgLbl"></span><button class="pgNext">›</button></div>
    <div class="prev"><div class="zbar"><button class="zOut" aria-label="Zoom out">−</button><button class="zFit">Fit</button><button class="zIn" aria-label="Zoom in">+</button></div></div>
    <div class="tap">Pinch to zoom · drag to move · double-tap to zoom in</div>
    <button class="bigbtn"></button>`;
  const box = q('.prev');
  const view = { k: 1, tx: 0, ty: 0, pw: 0, ph: 0 };      // k: 1 = whole page fits the box
  const bounds = () => ({ w: box.clientWidth, h: box.clientHeight });
  const clamp = () => {
    const { w, h } = bounds(), W = view.pw * view.k, H = view.ph * view.k;
    view.tx = W <= w ? (w - W) / 2 : Math.min(0, Math.max(w - W, view.tx));
    view.ty = H <= h ? (h - H) / 2 : Math.min(0, Math.max(h - H, view.ty));
  };
  const apply = () => { clamp(); const p = box.querySelector('.paper'); if (p) p.style.transform = `translate(${view.tx}px,${view.ty}px) scale(${view.k})`; };
  const zoomAt = (px, py, k2) => {                         // keep the point under the finger fixed
    k2 = Math.max(1, Math.min(6, k2)); const r = k2 / view.k;
    view.tx = px - (px - view.tx) * r; view.ty = py - (py - view.ty) * r; view.k = k2; apply();
  };
  const centre = () => { const { w, h } = bounds(); return [w / 2, h / 2]; };

  const draw = (reset = true) => {
    try {
      const items = itemsOf(st), n = items.length; st.page = Math.max(0, Math.min(st.page || 0, n - 1));
      const it = items[st.page];
      q('.pLbl').textContent = label();
      q('.pager').style.display = n > 1 ? 'flex' : 'none';
      if (n > 1) q('.pgLbl').textContent = `${st.nos.length > 1 ? nickOf(emp(it.no)) + ' · ' : ''}${mlabel(it.ym)} · ${st.page + 1} of ${n}`;
      q('.bigbtn').textContent = n > 1 ? `Print ${n} pages` : 'Print';
      const { w, h } = bounds(), m = 12, sc = Math.min((w - 2 * m) / 793.7, h > 60 ? (h - 2 * m) / 1122.5 : 9), c = copy(it.no, it.ym);
      view.pw = 793.7 * sc; view.ph = 1122.5 * sc; if (reset) { view.k = 1; view.tx = view.ty = 0; }
      box.querySelector('.paper')?.remove();
      box.insertAdjacentHTML('afterbegin', `<div class="paper" style="width:${view.pw}px;height:${view.ph}px"><div class="a4" style="transform:scale(${sc})">${c}${c}</div></div>`);
      apply();
    } catch (err) { box.insertAdjacentHTML('afterbegin', `<div class="emptyprev">Couldn't build the preview<br><small>${esc(err.message)}</small></div>`); }
  };

  /* touch / mouse: one pointer drags, two pointers pinch */
  const ptrs = new Map(); let last = null;
  const local = e => { const r = box.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const gesture = () => {
    const pts = [...ptrs.values()]; if (pts.length === 1) return { x: pts[0][0], y: pts[0][1], d: 0 };
    return { x: (pts[0][0] + pts[1][0]) / 2, y: (pts[0][1] + pts[1][1]) / 2, d: Math.hypot(pts[0][0] - pts[1][0], pts[0][1] - pts[1][1]) };
  };
  box.addEventListener('pointerdown', e => { if (e.target.closest('.zbar')) return; box.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, local(e)); last = gesture(); box.classList.add('grab'); });
  box.addEventListener('pointermove', e => {
    if (!ptrs.has(e.pointerId)) return; ptrs.set(e.pointerId, local(e)); const g = gesture();
    if (last && g.d && last.d) { view.tx += g.x - last.x; view.ty += g.y - last.y; zoomAt(g.x, g.y, view.k * g.d / last.d); }
    else if (last) { view.tx += g.x - last.x; view.ty += g.y - last.y; apply(); }
    last = g;
  });
  const end = e => { ptrs.delete(e.pointerId); last = ptrs.size ? gesture() : null; if (!ptrs.size) box.classList.remove('grab'); };
  box.addEventListener('pointerup', end); box.addEventListener('pointercancel', end);
  box.addEventListener('wheel', e => { e.preventDefault(); const [x, y] = local(e); zoomAt(x, y, view.k * Math.exp(-e.deltaY * 0.0022)); }, { passive: false });
  box.addEventListener('dblclick', e => { if (e.target.closest('.zbar')) return; const [x, y] = local(e); view.k > 1.05 ? (view.k = 1, view.tx = view.ty = 0, apply()) : zoomAt(x, y, 2.6); });
  q('.zIn').onclick = () => zoomAt(...centre(), view.k * 1.5);
  q('.zOut').onclick = () => zoomAt(...centre(), view.k / 1.5);
  q('.zFit').onclick = () => { view.k = 1; view.tx = view.ty = 0; apply(); };

  const month = async n => { st.ym = shiftYM(st.ym, n); await ensureAll(st); draw(); };
  host.querySelectorAll('.spanrow button').forEach(b => { b.onclick = async () => {
    st.span = +b.dataset.k; st.page = 0; host.querySelectorAll('.spanrow button').forEach(x => x.classList.toggle('on', x === b)); await ensureAll(st); draw();
  }; });
  q('.pgPrev').onclick = () => { const n = itemsOf(st).length; st.page = (st.page - 1 + n) % n; draw(); };
  q('.pgNext').onclick = () => { const n = itemsOf(st).length; st.page = (st.page + 1) % n; draw(); };
  q('.pPrev').onclick = () => month(-1);
  q('.pNext').onclick = () => month(1);
  q('.bigbtn').onclick = () => printWith(q('.bigbtn'), st).catch(e => toast(esc(e.message), 'err'));
  stagger(host, 60); draw();
}
