/* Shared UI building blocks: animation helpers, toast, bottom sheets, and the themed time/date pickers.
   Nothing here knows about people or days. */
import { $, $$, pad, t12, ymd, addDays, mondayOf, shiftYM, spanDays, fmtDate, fmtRange, MONTHS, esc } from '../lib/util.js';
import { now } from '../lib/clock.js';
import { logError } from '../lib/errlog.js';

/* =================== animation helpers =================== */
export function stagger(root, step){
  let i = 0;
  root.querySelectorAll('[data-st]').forEach(el => {
    el.style.setProperty('--i', Math.min(i++, 12)); if(step) el.style.setProperty('--s', step+'ms');
    el.classList.remove('st'); void el.offsetWidth; el.classList.add('st');
    el.addEventListener('animationend', function done(ev){ if(ev.target !== el) return; el.removeEventListener('animationend', done); el.classList.remove('st'); });
  });
}
export function go(id, dir='r'){
  const cur = $('.scr:not(.hide)'), nxt = $('#'+id); if(cur === nxt) return;
  if(cur){ cur.classList.add(dir==='r'?'leave-l':'leave-r'); setTimeout(()=>{ cur.classList.add('hide'); cur.classList.remove('leave-l','leave-r'); }, 280); }
  nxt.classList.remove('hide'); nxt.classList.add(dir==='r'?'enter-r':'enter-l'); setTimeout(()=>nxt.classList.remove('enter-r','enter-l'), 520);
  stagger(nxt);
}
export function countUp(el, to, ms=700){
  if(!el) return; const t0 = performance.now();
  (function f(t){ const p = Math.min(1,(t-t0)/ms); el.textContent = Math.round(to*(1-Math.pow(1-p,3))); if(p<1) requestAnimationFrame(f); })(t0);
}
export function burst(host){
  const b = document.createElement('div'); b.className='burst';
  const cols = ['#ff9a3c','#f6c445','#2ec4b6','#6d6df0','#fff','#5eead4'];
  for(let k=0;k<16;k++){ const a = k/16*Math.PI*2 + Math.random()*.4, r = 46+Math.random()*34, i = document.createElement('i');
    i.style.cssText = `background:${cols[k%cols.length]};--dx:${Math.cos(a)*r}px;--dy:${Math.sin(a)*r}px;animation-delay:${Math.random()*80}ms`; b.appendChild(i); }
  host.appendChild(b); setTimeout(()=>b.remove(), 1100);
}
export function shake(el){ el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); setTimeout(()=>el.classList.remove('shake'),450); }

/* =================== icons =================== */
export const ICONS = {
  sun:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  fork:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"><path d="M7 2v8a2 2 0 0 0 4 0V2M9 10v12M17 2c-2 2-2 6 0 8v12"/></svg>',
  cup:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"><path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9zM17 10h2a2 2 0 0 1 0 4h-2M8 2v3M12 2v3"/></svg>',
  home:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8M5 10v10h14V10"/></svg>',
};

/* =================== themed pickers =================== */
export function openPicker(html){ const el = $('#picker'); el.innerHTML = '<div class="grab"></div>'+html; el.scrollTop = 0; const show = () => el.classList.add('show'); requestAnimationFrame(show); setTimeout(show, 90); $('#pkScrim').classList.add('show'); }
export function closePicker(){ $('#picker').classList.remove('show'); $('#pkScrim').classList.remove('show'); }
$('#pkScrim').onclick = closePicker;

/* time: tap the hour, then the minute (5-min steps), fine-tune with ±1 / ±5, or jump with Now and presets */
export function pickTime({title='Time', value=null, presets=[], clearable=false}, done){
  const [H0,M0] = (value || now().time).split(':').map(Number);
  let h12 = H0%12||12, min = M0, ap = H0>=12?'PM':'AM', field = 'h';
  const h24 = () => (h12%12) + (ap==='PM'?12:0);
  const setT = t => { t = ((t%1440)+1440)%1440; const H = Math.floor(t/60); ap = H>=12?'PM':'AM'; h12 = H%12||12; min = t%60; };
  openPicker(`<h3 class="pk-title">${title}</h3>
    <div class="tp-top"><div class="tp-disp"><button id="tpH"></button><i>:</i><button id="tpM"></button></div>
      <div class="tp-ap" id="tpAp" style="--p:0"><i class="th"></i><button data-a="AM">AM</button><button data-a="PM">PM</button></div></div>
    <div class="tp-grid" id="tpGrid"></div>
    <div class="tp-tools"><button data-d="-5">−5</button><button data-d="-1">−1</button><button class="now" id="tpNow">Now</button><button data-d="1">+1</button><button data-d="5">+5</button></div>
    ${presets.length ? `<div class="sugg" id="tpPre">${presets.map(x=>`<button data-t="${x}">${t12(x)}</button>`).join('')}</div>` : ''}
    <div class="btns">${clearable?'<button class="btn danger" id="tpClr">Clear</button>':'<button class="btn" id="tpCan">Cancel</button>'}<button class="btn primary" id="tpOk">Set</button></div>`);
  let prevDisp = '';
  const paint = (animateGrid) => {
    const dh = pad(h12), dm = pad(min);
    $('#tpH').textContent = dh; $('#tpM').textContent = dm;
    $('#tpH').classList.toggle('on', field==='h'); $('#tpM').classList.toggle('on', field==='m');
    if(prevDisp !== dh+dm){ const el = prevDisp.slice(0,2)!==dh ? $('#tpH') : $('#tpM'); el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); prevDisp = dh+dm; }
    $('#tpAp').style.setProperty('--p', ap==='PM'?1:0); $$('#tpAp button').forEach(b=>b.classList.toggle('on', b.dataset.a===ap));
    if(animateGrid){
      const vals = field==='h' ? [1,2,3,4,5,6,7,8,9,10,11,12] : [0,5,10,15,20,25,30,35,40,45,50,55];
      $('#tpGrid').innerHTML = vals.map((v,i)=>`<button style="--i:${i}" data-v="${v}" class="${(field==='h'?v===h12:v===min)?'on':''}">${field==='h'?v:pad(v)}</button>`).join('');
    } else $$('#tpGrid button').forEach(b => b.classList.toggle('on', +b.dataset.v === (field==='h'?h12:min)));
  };
  paint(true);
  $('#tpGrid').onclick = e => { const b = e.target.closest('button'); if(!b) return;
    if(field==='h'){ h12 = +b.dataset.v; field = 'm'; paint(true); } else { min = +b.dataset.v; paint(false); } };
  $('#tpH').onclick = () => { field = 'h'; paint(true); };
  $('#tpM').onclick = () => { field = 'm'; paint(true); };
  $$('#tpAp button').forEach(b => b.onclick = () => { ap = b.dataset.a; paint(false); });
  $$('.tp-tools [data-d]').forEach(b => b.onclick = () => { setT(h24()*60 + min + +b.dataset.d); paint(false); });
  $('#tpNow').onclick = () => { const [h,mi] = now().time.split(':').map(Number); setT(h*60+mi); field = 'm'; paint(true); };
  $$('#tpPre button').forEach(b => b.onclick = () => { const [h,mi] = b.dataset.t.split(':').map(Number); setT(h*60+mi); field = 'm'; paint(true); });
  $('#tpOk').onclick = () => { closePicker(); done(pad(h24())+':'+pad(min)); };
  if(clearable) $('#tpClr').onclick = () => { closePicker(); done(null); }; else $('#tpCan').onclick = closePicker;
}

/* date / range: one calendar; in range mode tap the first day, then the last */
export function pickDate({title='Date', mode='single', from=null, to=null}, done){
  let a = from || now().date, b = mode==='range' ? (to||a) : a, step = 0, view = a.slice(0,7);
  const today = now().date;
  const quick = mode==='range'
    ? [['Today',()=>[today,today]],['Tomorrow',()=>[addDays(today,1),addDays(today,1)]],['This week',()=>{const m_=mondayOf(today);return [m_,addDays(m_,4)]}],['Next week',()=>{const m_=addDays(mondayOf(today),7);return [m_,addDays(m_,4)]}]]
    : [['Yesterday',()=>[addDays(today,-1)]],['Today',()=>[today]],['Tomorrow',()=>[addDays(today,1)]]];
  openPicker(`<h3 class="pk-title">${title}</h3>
    <div class="dp-head"><button id="dpPrev">‹</button><span id="dpLbl"></span><button id="dpNext">›</button></div>
    <div class="dp-dow">${['SU','MO','TU','WE','TH','FR','SA'].map(d=>`<span>${d}</span>`).join('')}</div>
    <div class="dp-grid" id="dpGrid"></div>
    <div class="sugg" style="margin-top:8px" id="dpQuick">${quick.map(([l],i)=>`<button data-i="${i}">${l}</button>`).join('')}</div>
    <div class="dp-sum" id="dpSum"></div>
    <div class="btns"><button class="btn" id="dpCan">Cancel</button><button class="btn primary" id="dpOk">Set</button></div>`);
  const paint = (anim=true) => {
    const [Y,M] = view.split('-').map(Number), n = new Date(Y,M,0).getDate(); $('#dpLbl').textContent = MONTHS[M-1]+' '+Y;
    let h = '<button class="pad"></button>'.repeat(new Date(Y,M-1,1).getDay());
    for(let d=1; d<=n; d++){ const ds = `${view}-${pad(d)}`, wd = new Date(Y,M-1,d).getDay();
      h += `<button data-d="${ds}" class="${wd%6===0?'we':''} ${ds===today?'td':''} ${mode==='range'&&ds>a&&ds<b?'in':''} ${ds===a?'st1':''} ${ds===b&&b!==a?'en':''}">${d}</button>`; }
    const g = $('#dpGrid'); g.innerHTML = h; if(anim){ g.style.animation='none'; void g.offsetWidth; g.style.animation=''; }
    $('#dpSum').innerHTML = mode==='range' ? `<b>${fmtRange(a,b)}</b> · ${spanDays(a,b)} day${spanDays(a,b)===1?'':'s'}${step===1?' · now tap the last day':''}` : `<b>${fmtDate(a)}</b>`;
  };
  paint();
  $('#dpGrid').onclick = e => { const x = e.target.closest('button[data-d]'); if(!x) return; const d = x.dataset.d;
    if(mode==='single'){ a = b = d; } else if(step===0){ a = b = d; step = 1; } else { if(d >= a) b = d; else { b = a; a = d; } step = 0; }
    paint(false); };
  $('#dpPrev').onclick = () => { view = shiftYM(view,-1); paint(); }; $('#dpNext').onclick = () => { view = shiftYM(view,1); paint(); };
  $$('#dpQuick button').forEach(x => x.onclick = () => { const r = quick[+x.dataset.i][1](); a = r[0]; b = r[1]||r[0]; step = 0; view = a.slice(0,7); paint(); });
  $('#dpOk').onclick = () => { closePicker(); done(mode==='range' ? [a,b] : a); };
  $('#dpCan').onclick = closePicker;
}

/* tappable field buttons that open the pickers */
export const pfTime = (id, label, v) => `<div class="field"><label>${label}</label><button type="button" class="pf ${v?'':'empty'}" id="${id}" data-v="${v||''}">${v?t12(v):'Set time'}</button></div>`;
export const pfDate = (id, label, v) => `<div class="field"><label>${label}</label><button type="button" class="pf" id="${id}" data-v="${v}">${fmtDate(v)}</button></div>`;
export function bindTime(id, opts, after){ const el = $('#'+id); el.onclick = () => pickTime({...opts, value:el.dataset.v||null, clearable:!!opts.clearable}, v => { el.dataset.v = v||''; el.textContent = v ? t12(v) : 'Set time'; el.classList.toggle('empty', !v); after && after(v); }); }
export function bindDate(id, opts, after){ const el = $('#'+id); el.onclick = () => pickDate({...opts, from:el.dataset.v}, v => { el.dataset.v = v; el.textContent = fmtDate(v); after && after(v); }); }
export const SLOT_PRESETS = { am_in:['07:30','07:45','08:00','08:15'], am_out:['11:55','12:00','12:05'], pm_in:['12:55','13:00','13:05'], pm_out:['16:55','17:00','17:30'] };


/* =================== keypad =================== */
export function buildKeys(el, leftLabel, leftFn, digitFn, delFn){
  el.innerHTML = [1,2,3,4,5,6,7,8,9].map((n,i)=>`<button data-st style="--k:${i}" data-d="${n}">${n}</button>`).join('')
    + `<button class="m" data-st style="--k:9" data-k="L">${leftLabel}</button><button data-st style="--k:10" data-d="0">0</button><button class="m del" data-st style="--k:11" data-k="D" aria-label="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6-7z"/><path d="M13 9.5l5 5M18 9.5l-5 5"/></svg></button>`;
  const press = b => { if(b.dataset.d !== undefined) digitFn(b.dataset.d); else if(b.dataset.k==='D') delFn(); else leftFn(); };
  /* Act the moment a finger goes down (every finger counts, however fast), never wait for the click: no lag, no lost taps, no double-tap zoom. */
  let lastDown = 0;
  el.addEventListener('pointerdown', ev => {
    const b = ev.target.closest('button'); if(!b || !el.contains(b)) return;
    ev.preventDefault(); lastDown = Date.now(); b.classList.add('down'); press(b);
    const up = () => { b.classList.remove('down'); b.removeEventListener('pointerup', up); b.removeEventListener('pointercancel', up); b.removeEventListener('pointerleave', up); };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
  });
  el.onclick = ev => { if(Date.now() - lastDown < 900) return; const b = ev.target.closest('button'); if(b) press(b); };   // keyboard / assistive "click" only; a real tap was already handled on pointerdown
}


/* =================== toast & sheet =================== */
let toastTimer;
export const closeHooks = [];
/** run `fn` whenever a sheet is dismissed (the home screen uses it to un-arm a Leave/Others pill) */
export const onSheetClose = fn => closeHooks.push(fn);
export function toast(html, kind=''){ const T=$('#toast'); T.className='toast '+kind; T.innerHTML=`<span class="ti">${html}</span>`; void T.offsetWidth; T.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>T.classList.remove('show'), kind==='err'?3400:2600); }
$('#toast').onclick = () => $('#toast').classList.remove('show');
export function openSheet(html, cls=''){ const sh=$('#sheet'); sh.className='sheet '+cls; sh.innerHTML='<div class="grab"></div>'+html; sh.scrollTop=0; const show = () => { if(!sh.classList.contains('show')){ sh.classList.add('show'); stagger(sh,55); } }; requestAnimationFrame(show); setTimeout(show, 90); $('#scrim').classList.add('show'); }
export function closeSheet(){ closePicker(); $('#sheet').classList.remove('show'); $('#scrim').classList.remove('show'); closeHooks.forEach(f => f()); }
$('#scrim').onclick = closeSheet;

/** Pull a sheet down by its handle to close it: it follows the finger, then either drops away or springs back. */
function dragToClose(el, close) {
  let id = null, y0 = 0, dy = 0, t0 = 0;
  el.addEventListener('pointerdown', ev => {
    if (!ev.target.closest('.grab')) return;
    id = ev.pointerId; y0 = ev.clientY; dy = 0; t0 = performance.now(); el.setPointerCapture(id); el.style.transition = 'none';
  });
  el.addEventListener('pointermove', ev => { if (ev.pointerId !== id) return; dy = Math.max(0, ev.clientY - y0); el.style.transform = `translateY(${dy}px)`; });
  const end = ev => {
    if (ev.pointerId !== id) return; id = null;
    const fast = dy / Math.max(1, performance.now() - t0) > 0.6 && dy > 30;
    el.style.transition = 'transform .3s cubic-bezier(.2,.9,.25,1)';
    if (dy > 110 || fast) {
      el.style.transform = 'translateY(110%)';
      setTimeout(() => { el.style.transition = 'none'; close(); el.style.transform = ''; void el.offsetWidth; el.style.transition = ''; }, 280);
    } else { el.style.transform = ''; setTimeout(() => { el.style.transition = ''; }, 320); }
  };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
}
dragToClose($('#sheet'), closeSheet); dragToClose($('#picker'), closePicker);



/** Wait for a database write only for a moment. Mistakes in the input come back at once; a slow write (the database can be
 *  busy while syncing) carries on in the background, and the screen does not wait for it. A late failure shows as a message. */
export async function fast(pr, what = 'Saving') {
  let early = null; pr.catch(e => { early = e; });
  await Promise.race([pr.then(() => {}, () => {}), new Promise(r => setTimeout(r, 30))]);
  if (early) throw early;
  pr.catch(e => { logError('save', e, { what }); toast(`${what} failed: ${esc(e.message || String(e))}`, 'err'); });
}
