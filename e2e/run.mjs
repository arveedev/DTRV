/* End-to-end checks in a real Chromium against `vite preview`. Run: npm run build && npm run e2e */
import { createRequire } from 'module';
import { spawn } from 'child_process';
const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');
const PORT = 4179, URL = `http://localhost:${PORT}/`;
const srv = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
for (let i = 0; i < 40; i++) { try { if ((await fetch(URL)).ok) break; } catch {} await new Promise(r => setTimeout(r, 250)); }
const b = await chromium.launch(); let fails = 0;
const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) fails++; };
const fresh = async (time = '2026-10-07T08:05:00', q = '') => {
  const ctx = await b.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true }), pg = await ctx.newPage();
  pg.errs = []; pg.on('pageerror', e => pg.errs.push(e.message)); pg.on('console', m => m.type() === 'error' && pg.errs.push(m.text()));
  await pg.clock.install({ time: new Date(time) }); await pg.goto(URL + q); await pg.waitForSelector('html[data-ready]'); if (q) await pg.waitForTimeout(1000); return pg;
};
const keys = async (pg, s, id = '#keys') => { for (const d of s) await pg.click(`${id} [data-d="${d}"]`); };
/* fake clock for timers, plus short real pauses for IndexedDB / WebCrypto promises */
const wait = async (pg, ms = 900) => { for (let i = 0; i < 3; i++) { await pg.clock.runFor(ms / 3); await pg.waitForTimeout(120); } };

try {
  /* first run: welcome → create PIN → add person */
  let pg = await fresh();
  ok(await pg.isVisible('#welcome'), 'first run shows the welcome card');
  await pg.click('#startSetup'); await wait(pg, 600);
  ok(/Create/.test(await pg.textContent('#gateTitle')), 'gate asks to create a PIN');
  await keys(pg, '482916', '#gkeys'); await wait(pg, 600); await keys(pg, '482916', '#gkeys'); await wait(pg, 1500);
  ok(await pg.isVisible('#fSave'), 'PIN created, add-person sheet opens');
  await pg.fill('#fNo', '047'); await pg.fill('#fName', 'ana b. garcia'); await pg.fill('#fNick', 'Ana'); await pg.click('#fSave'); await wait(pg, 600);
  ok((await pg.textContent('#plist')).includes('ANA B. GARCIA'), 'person added and listed');
  await pg.click('#aLock'); await wait(pg, 800);
  ok(await pg.isHidden('#welcome'), 'welcome card gone once someone exists');
  await keys(pg, '047'); await wait(pg, 1200);
  ok((await pg.textContent('#sheet')).includes('Good morning, Ana'), 'AM IN recorded with nickname greeting');
  await pg.reload(); await pg.waitForSelector('html[data-ready]');
  await pg.click('#toAdmin'); await wait(pg, 500); await keys(pg, '482916', '#gkeys'); await wait(pg, 1600);
  ok(!(await pg.textContent('#aBody')).includes('0 days present'), 'data survives a reload');
  ok(pg.errs.length === 0, 'no console errors (first run) ' + pg.errs.join('|')); await pg.context().close();

  /* demo data */
  pg = await fresh('2026-10-07T08:05:00', '?demo=1');
  await keys(pg, '205'); await wait(pg, 1200);
  ok((await pg.textContent('#sheet')).includes('Good morning, Maria'), 'flexi person records AM IN');
  await pg.click('#rsDone'); await wait(pg, 500);
  const before = await pg.evaluate(() => localStorage.getItem('dtrv.lastCode'));
  await pg.click('#keys [data-k="L"]'); await keys(pg, '024'); await wait(pg, 1200);
  ok(await pg.isVisible('#myName'), 'My DTR opens after PIN');
  await pg.click('#myBack'); await wait(pg, 700);
  ok(before === await pg.evaluate(() => localStorage.getItem('dtrv.lastCode')), 'My DTR does not change the phone\'s remembered user');
  ok(!(await pg.$eval('#toggles', e => e.classList.contains('away'))), 'tiles not locked after My DTR');
  const doneAm = await pg.$eval('.tg[data-s="am_in"]', e => e.classList.contains('done'));
  ok(doneAm, 'Maria\'s AM IN tile shows done');
  await pg.click('#remarkBtn'); await keys(pg, '205'); await wait(pg, 1000);
  ok(await pg.isVisible('.chooser button[data-c="OTHER"].on') && await pg.isVisible('.chooser button[data-c="LEAVE"].off'), 'after clocking in, the remark sheet opens on Others with Leave locked');
  await pg.click('#rCancel'); await wait(pg, 500);
  /* day-off locks the day (a phone that has not clocked in today) */
  const p2 = await fresh('2026-10-07T09:00:00', '?demo=1');
  await p2.click('#remarkBtn'); await keys(p2, '331'); await wait(p2, 1000);
  await p2.click('.chooser button[data-c="DAYOFF"]'); await wait(p2, 300);
  await p2.click('#rOk'); await wait(p2, 900);
  ok((await p2.textContent('#sheet')).includes('Enjoy your day-off, Pedro'), 'day-off shows the Enjoy sheet right away');
  await p2.click('#joyDone'); await wait(p2, 500);
  ok(await p2.$eval('#toggles', e => e.classList.contains('away')), 'tiles locked on a day-off');
  await p2.click('.tg[data-s="am_in"]'); await wait(p2, 600);
  ok((await p2.textContent('#sheet')).includes('Enjoy'), 'tapping a locked tile says enjoy again');
  ok(p2.errs.length === 0, 'no console errors (day-off) ' + p2.errs.join('|'));
  /* two quick touch taps on the keypad are two digits (no double-tap zoom) */
  const p3 = await fresh('2026-10-07T09:00:00', '?demo=1');
  const k1 = await p3.$('#keys [data-d="1"]'), bx = await k1.boundingBox();
  await p3.touchscreen.tap(bx.x + bx.width / 2, bx.y + bx.height / 2); await p3.touchscreen.tap(bx.x + bx.width / 2, bx.y + bx.height / 2);
  ok(await p3.$$eval('#empno div.f', d => d.length) === 2, 'two fast touch taps register as two digits');
  /* a change arriving from elsewhere (another tab / sync) must not undo an armed PIN keypad */
  const pA = await fresh('2026-10-07T09:00:00', '?demo=1'), pB = await pA.context().newPage();
  await pB.clock.install({ time: new Date('2026-10-07T09:00:00') }); await pB.goto(URL); await pB.waitForSelector('html[data-ready]'); await pB.waitForTimeout(800);
  await pA.click('#remarkBtn'); await wait(pA, 600);
  ok(await pA.$eval('#keys', k => k.classList.contains('pin')), 'keypad armed (teal) before the outside change');
  await keys(pB, '331'); await wait(pB, 1200);                                    // someone records on another tab
  await pA.waitForTimeout(900); await wait(pA, 900);
  ok(await pA.$eval('#keys', k => k.classList.contains('pin')), 'armed keypad survives a change from another tab / sync');
  /* face / fingerprint (a virtual platform authenticator stands in for the phone's sensor) */
  const pF = await fresh('2026-10-07T08:05:00', '?demo=1');
  const cdp = await pF.context().newCDPSession(pF); await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await pF.reload(); await pF.waitForSelector('html[data-ready]'); await pF.waitForTimeout(1200);
  await keys(pF, '205'); await wait(pF, 1200);
  ok(await pF.isVisible('#rsBioYes'), 'after a clock-in the sheet offers face / fingerprint');
  await pF.click('#rsBioYes'); await wait(pF, 800);
  ok(!(await pF.isVisible('#rsBioYes')) && await pF.evaluate(() => !!localStorage.getItem('dtrv.bio')), 'face / fingerprint turned on for this phone');
  await pF.click('#rsDone'); await wait(pF, 600);
  ok(await pF.$eval('#keys [data-k="D"]', k => k.classList.contains('bio')), 'the backspace key becomes the face / fingerprint key for the remembered user');
  await pF.click('#keys [data-d="1"]'); await wait(pF, 300);
  ok(await pF.$eval('#keys [data-k="D"]', k => !k.classList.contains('bio')), 'it turns back into backspace as soon as digits are typed');
  await pF.click('#keys [data-k="D"]'); await wait(pF, 300);
  ok(await pF.$eval('#keys [data-k="D"]', k => k.classList.contains('bio')), 'and back to face / fingerprint once the digits are cleared');
  await pF.click('#keys [data-k="D"]'); await wait(pF, 2200);
  ok((await pF.textContent('#sheet')).includes('Enjoy your lunch, Maria'), 'the button clocks in the next time with no code typed');
  ok(pF.errs.length === 0, 'no console errors (face / fingerprint) ' + pF.errs.join('|'));
  /* the keypad must not replay its entrance when it flips between normal and PIN mode */
  const pK = await fresh('2026-10-07T09:00:00', '?demo=1'); await wait(pK, 2500);
  await pK.evaluate(() => { window.__anims = []; document.addEventListener('animationstart', e => window.__anims.push(e.animationName), true); });
  await pK.click('#remarkBtn'); await wait(pK, 1500); await pK.click('#remarkBtn'); await wait(pK, 1500);
  const names = await pK.evaluate(() => window.__anims);
  ok(!names.includes('rise'), 'no entrance animation replays after the keypad flips (' + [...new Set(names)].join(',') + ')');
  /* multi print */
  await pg.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed = document.querySelectorAll('#printRoot .a4').length; }; });
  await pg.click('#toAdmin'); await wait(pg, 500); await keys(pg, '123456', '#gkeys'); await wait(pg, 1600);
  await pg.click('#aTabs button[data-t="3"]'); await wait(pg, 700); await pg.click('#pAll');
  await pg.click('#pGo'); await wait(pg, 700);
  ok(await pg.evaluate(() => document.getElementById('printFrame')?.contentDocument.querySelectorAll('#printRoot .a4').length) === 3, 'multi print puts 3 A4 pages in the print frame');
  await pg.click('#pView'); await wait(pg, 900);
  ok(await pg.isVisible('#printBody .paper'), 'preview shows the paper');
  ok(pg.errs.length === 0, 'no console errors (demo) ' + pg.errs.join('|'));
} catch (e) { console.log('FAIL exception', e.message); fails++; }
await b.close(); srv.kill(); console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0);
