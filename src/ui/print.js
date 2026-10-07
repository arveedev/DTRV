/* Print preview (one person from My DTR, or many from the admin list) and the real-size pages for window.print(). */
import { $, shiftYM, MONTHS, esc } from '../lib/util.js';
import { nickOf } from '../lib/rules.js';
import { S, get, emp, ensureMonth } from '../data/repo.js';
import { dtrCopy } from '../print/dtr.js';
import { go, stagger, toast } from './core.js';
import { renderAdmin } from './admin.js';

let zoomPrev = false, curPrintSt = null, printFrom = 'my', printReady = false;
const copy = (no, ym) => dtrCopy(emp(no), ym, d => get(no, d), S.sign);
const pages = st => st.nos.map(no => { const c = copy(no, st.ym); return `<div class="a4">${c}${c}</div>`; }).join('');

/** The admin list keeps this up to date so Ctrl+P prints exactly what is selected. */
export const setPrintSel = st => { curPrintSt = st; };

/* Real-size pages are only built when needed (preview open, Print), so 50+ people stay fast. */
export async function doPrint(st) {
  if (!st.nos.length) return;
  curPrintSt = st; await ensureMonth(st.ym);
  $('#printRoot').innerHTML = pages(st); printReady = true; window.print();
}

export function initPrint() {
  /* Ctrl+P / browser menu: rebuild from the current selection right before printing, so it is never stale. */
  window.addEventListener('beforeprint', () => { if (!printReady && curPrintSt?.nos.length) $('#printRoot').innerHTML = pages(curPrintSt); });
  window.addEventListener('afterprint', () => { printReady = false; $('#printRoot').innerHTML = ''; });
  $('#printBack').onclick = () => { if (printFrom === 'admin') { go('p-admin', 'l'); renderAdmin(); } else go('p-my', 'l'); };
}

export async function openPreview(st, from) {
  st.page = 0; curPrintSt = st; printFrom = from; await ensureMonth(st.ym); go('p-print', 'r');
  setTimeout(() => renderPreview(st), 60);
}

/* Every lookup below is scoped to #printBody: the preview and the admin list must never share element ids. */
function renderPreview(st) {
  const host = $('#printBody'), q = sel => host.querySelector(sel);
  const label = () => MONTHS[+st.ym.slice(5) - 1] + ' ' + st.ym.slice(0, 4);
  host.innerHTML = `<div class="pctl" data-st><div class="pname">${st.nos.length > 1 ? st.nos.length + ' people' : esc(emp(st.nos[0]).name)}</div>
    <div class="mnav"><button class="pPrev">‹</button><span class="pLbl">${label()}</span><button class="pNext">›</button></div></div>
    <div class="pager"><button class="pgPrev">‹</button><span class="pgLbl"></span><button class="pgNext">›</button></div>
    <div class="prev"></div><div class="tap">Tap the paper to zoom</div>
    <button class="bigbtn"></button>`;
  const draw = () => {
    try {
      const n = st.nos.length; st.page = Math.max(0, Math.min(st.page || 0, n - 1));
      q('.pLbl').textContent = label();
      q('.pager').style.display = n > 1 ? 'flex' : 'none';
      if (n > 1) q('.pgLbl').textContent = `${nickOf(emp(st.nos[st.page]))} · ${st.page + 1} of ${n}`;
      q('.bigbtn').textContent = n > 1 ? `Print ${n} DTRs (${n} pages)` : 'Print / Save as PDF';
      const box = q('.prev'), w = (box.clientWidth || 340) - 20, h = (box.clientHeight || 0) - 20;
      const sc = zoomPrev ? 1.1 : Math.min(w / 793.7, h > 60 ? h / 1122.5 : 9), c = copy(st.nos[st.page], st.ym);
      box.classList.toggle('zoom', zoomPrev);
      box.innerHTML = `<div class="paper" style="width:${793.7 * sc}px;height:${1122.5 * sc}px"><div class="a4" style="transform:scale(${sc})">${c}${c}</div></div>`;
      box.querySelector('.paper').onclick = () => { zoomPrev = !zoomPrev; draw(); };
    } catch (err) { q('.prev').innerHTML = `<div class="emptyprev">Couldn't build the preview<br><small>${esc(err.message)}</small></div>`; }
  };
  const month = async n => { st.ym = shiftYM(st.ym, n); await ensureMonth(st.ym); draw(); };
  q('.pgPrev').onclick = () => { st.page = (st.page - 1 + st.nos.length) % st.nos.length; draw(); };
  q('.pgNext').onclick = () => { st.page = (st.page + 1) % st.nos.length; draw(); };
  q('.pPrev').onclick = () => month(-1);
  q('.pNext').onclick = () => month(1);
  q('.bigbtn').onclick = () => doPrint(st).catch(e => toast(esc(e.message), 'err'));
  stagger(host, 60); draw();
}
