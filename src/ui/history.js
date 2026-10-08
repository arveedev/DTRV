/* Edit history: who changed what, from the audit log the app already keeps. Read a page at a time. */
import { $, $$, t12, fmtDate, esc } from '../lib/util.js';
import { SLOTS, SLOT_LABEL, remarkText, nickOf } from '../lib/rules.js';
import { emp, auditPage } from '../data/repo.js';
import { openSheet, closeSheet, stagger } from './core.js';

const PAGE = 25;
const rem = r => r ? (remarkText(r) || 'remark') : 'none';
/** One plain sentence (or a few) for an audit row. */
export function describe(a) {
  const b = a.before || {}, n = a.after || {};
  switch (a.action) {
    case 'time.set': case 'day.save': {
      const out = [];
      for (const s of SLOTS) {
        const x = b[s] || null, y = n[s] || null; if (x === y) continue;
        out.push(`${SLOT_LABEL[s]} ${x && y ? `${t12(x)} → ${t12(y)}` : y ? `added ${t12(y)}` : `cleared (was ${t12(x)})`}`);
      }
      if (a.action === 'day.save' && rem(b.remark) !== rem(n.remark)) out.push(`Remark: ${rem(b.remark)} → ${rem(n.remark)}`);
      return out.length ? out : ['Saved without changes'];
    }
    case 'day.delete': return ['Day deleted' + (SLOTS.some(s => b[s]) ? ' (had ' + SLOTS.filter(s => b[s]).map(s => `${SLOT_LABEL[s]} ${t12(b[s])}`).join(', ') + ')' : '')];
    case 'remark.set': return [`Remark: ${rem(n.remark)}${n.dates > 1 ? ` · ${n.dates} days` : ''}`];
    case 'holiday.add': return [`Holiday added${n.name ? ': ' + n.name : ''} · ${n.hit ?? 0} people`];
    case 'holiday.remove': return ['Holiday removed'];
    case 'person.add': return ['Person added'];
    case 'person.edit': return ['Person edited'];
    default: return [a.action];
  }
}

export function openHistory({ no = null } = {}) {
  const who = no ? emp(no) : null; let offset = 0, done = false;
  openSheet(`<h3 data-st>Edit history${who ? ' · ' + esc(nickOf(who)) : ''}</h3>
    <div class="hlist hx" id="hxList" data-st style="margin-top:10px"><div class="emptyl">Loading…</div></div>
    <div class="btns" data-st><button class="btn" id="hxMore">Load more</button><button class="btn primary" id="hxClose">Close</button></div>`);
  $('#hxClose').onclick = closeSheet;
  const load = async () => {
    const rows = await auditPage({ offset, limit: PAGE, no }), box = $('#hxList');
    if (!offset) box.innerHTML = '';
    if (!rows.length && !offset) box.innerHTML = '<div class="emptyl">Nothing has been edited yet</div>';
    offset += rows.length; if (rows.length < PAGE) { done = true; $('#hxMore').style.display = 'none'; }
    box.insertAdjacentHTML('beforeend', rows.map(a => {
      const p = a.employeeId ? emp(a.employeeId) : null, d = new Date(a.at);
      return `<div class="hrow"><div><b>${p ? esc(nickOf(p)) : 'Everyone'}${a.date ? ' · ' + esc(fmtDate(a.date)) : ''}</b>${describe(a).map(t => `<small>${esc(t)}</small>`).join('')}</div>
        <small class="when">${esc(d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }))}<br>${esc(d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }))}</small></div>`;
    }).join(''));
    stagger(box, 25);
  };
  $('#hxMore').onclick = load; load();
}
