# DTRV — Technical Specification (v3.1: Vercel + Dexie Cloud, single user)

Companion to [`01-PLAN.md`](01-PLAN.md).
Behaviour reference: [`../mockup/index.html`](../mockup/index.html) (working prototype).
Visual direction: **Rail · dark** (variation 3 in `ui-bc-variations.html`), implemented in the prototype (`mockup/index.html`).

> Owner decisions (2026-10-07): **Vercel** hosts the app, **Dexie Cloud** is the database, **personal use only** (the office biometric stays official), **one Dexie Cloud user** (the admin). Employees are records, not accounts.
> Items marked **[verify]** depend on Dexie Cloud or Vercel plan details to confirm before building.

---

## 1. Architecture

```
  Employee phone / shared PC / admin PC (browser, installable PWA)
  ┌──────────────────────────────────────────────────────────────┐
  │ UI (vanilla JS)  ──►  Dexie.js (IndexedDB, local copy)      │
  │                         │   dexie-cloud-addon: sync          │
  │ rules.js (late, stats)  │                                    │
  │ print.js (CS Form 48)   │                                    │
  └──────────┬──────────────┼────────────────────────────────────┘
             │ HTTPS        │ HTTPS / WebSocket
             ▼              ▼
  ┌────────────────────┐   ┌────────────────────────────┐
  │ Vercel             │   │ Dexie Cloud                │
  │  static files      │   │  stores + syncs all tables │
  │  /api/token        │   │  1 user: the admin         │
  │  /api/token  ──────┼──►│  /token (client secret)    │
  └────────────────────┘   └────────────────────────────┘
```

What changes compared with a normal server app:

| Concern | Where it lives now |
|---------|--------------------|
| Data | Dexie Cloud, plus a full local copy in each device's IndexedDB (synced) |
| Business rules (late, stats, print) | **In the browser** (`rules.js`, `print.js`) |
| Time | **The phone's own clock** (`new Date()`); there is no server time |
| Who can sync | Devices signed in as the **single** Dexie Cloud user; `/api/token` exchanges a one-time device setup code for that user's token |
| Offline | Works: records save locally and sync when back online |

### Trade-offs of this choice (accepted)
1. **The time is the phone's clock** (owner decision). A phone with a wrong clock records wrong times until its owner fixes the clock or uses *Change time*. Since the app already lets people edit their times, this adds no new weakness, and there is one less Vercel function to run.
2. **Every signed-in device holds a copy of all employees' records**, because every device signs in as the same single user. Fine for personal records (codes aren't secret anyway).
3. **No server-side validation, and no role separation.** Uniqueness relies on deterministic IDs. With one user, the admin PIN is an **app lock**, not a security boundary: someone who opens dev tools on a signed-in device could change any data. Accepted for personal use.
4. **Vercel Hobby (free)** fits, because this is personal, non-commercial use.

---

## 2. Project layout

```
dtrv/
├─ package.json            # dexie, dexie-cloud-addon, vite (build only)
├─ vercel.json
├─ dexie-cloud.json        # created by `npx dexie-cloud create` (DB URL) — not secret
├─ .env.example            # DEXIE_CLOUD_DB_URL, DEXIE_CLIENT_ID, DEXIE_CLIENT_SECRET,
│                          # DEVICE_SETUP_CODE, ADMIN_EMAIL, ADMIN_PIN_HASH (scrypt)
├─ api/
│  └─ token.js             # POST setup code → Dexie Cloud token for the single user
├─ src/
│  ├─ db.js                # Dexie schema + cloud.configure
│  ├─ clock.js             # now() = device clock → {date:'YYYY-MM-DD', time:'HH:MM'}
│  ├─ rules.js             # PURE: canRecord, suggest, lateMinutes, expectedOut, monthStats
│  ├─ repo.js              # record(), changeTime(), undo(), setRemark(), month()
│  ├─ print.js             # CS Form 48 HTML (port of prototype dtrCopy)
│  ├─ ui/record.js  ui/sheet.js  ui/my.js  ui/admin/*.js
│  └─ main.js
├─ public/                 # index.html, css, fonts, manifest.webmanifest, icons
└─ test/                   # vitest (rules, repo with fake-indexeddb), playwright (print, flows)
```

Vite is used only to bundle `dexie` + the addon. The output is static files, which Vercel serves as-is.

---

## 3. Data model (Dexie)

```js
// src/db.js
import Dexie from 'dexie';
import dexieCloud from 'dexie-cloud-addon';

export const db = new Dexie('dtrv', { addons: [dexieCloud] });

db.version(1).stores({
  employees: 'id, code, isActive',               // id = 'emp:024'
  schedules: 'id',                                // id = 'sch:default' | 'sch:<uuid>'
  days:      'id, [employeeId+date], date',       // id = 'day:024:2026-10-07'
  punches:   '@id, [employeeId+date], at',        // append-only log; auto id
  settings:  'id',                                // id = 'set:signatory'
  audit:     '@id, at, employeeId',
});

db.cloud.configure({
  databaseUrl: import.meta.env.VITE_DEXIE_CLOUD_DB_URL,
  requireAuth: true,
  fetchTokens: (req) => fetch('/api/token', {           // custom auth via our Vercel function
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...req, setupCode: storedSetupCode() })   // entered once per device
  }).then(r => r.json()),
});
```

### Why deterministic IDs
Dexie Cloud has no server code to enforce `UNIQUE`. So uniqueness comes from the **primary key**:
- `employees.id = 'emp:' + code` → two employees can't share `024`. Creating one checks `db.employees.get('emp:024')` first; if two admins race, the second write updates the same object instead of creating a duplicate.
- `days.id = 'day:' + code + ':' + date` → exactly one row per employee per day, even when two devices record the same day offline. Updates are written with `db.days.update(id, { amIn })` (property-level), which Dexie Cloud merges per property **[verify]**, so AM IN from one device and PM OUT from another both survive.

### Objects

```ts
Employee { id:'emp:024', code:'024', fullName:'JUAN A. DELA CRUZ', nickname:'Juan', position?, scheduleId?:string|null,
           isActive:true }
Schedule { id, mode:'fixed'|'flexi', amIn?, flexStart?, flexEnd?, requiredHours?, lunchStart:'12:00',
           lunchEnd:'13:00', graceMin:0, countPmLate:false }
Day      { id:'day:024:2026-10-07', employeeId:'emp:024', date:'2026-10-07',
           amIn?:'08:20', amOut?, pmIn?, pmOut?,                  // 'HH:MM' 24h, final values
           remark?: { code:'LEAVE'|'DAYOFF'|'HOLIDAY'|'OTHER', text?:string, batch?:string },
           edited:boolean }
Punch    { id, employeeId, date, slot:'amIn'|'amOut'|'pmIn'|'pmOut', time:'08:20', at:ISO,
           undone:false, deviceId }
Settings { id:'set:signatory', name, title, label }
Audit    { id, at, actor:'emp:024'|'admin', action, employeeId?, date?, before?, after? }
```

No `realmId` is needed: with one user, everything lives in that user's private realm and syncs to every device signed in as them.

Printed remark text: `LEAVE` → `ON LEAVE`, `DAYOFF` → `DAY-OFF`, `HOLIDAY` → `HOLIDAY`, `OTHER` → the typed text (≤ 24 chars).

---

## 4. Access: one Dexie Cloud user

There is **exactly one Dexie Cloud user**: the admin (e.g. `ADMIN_EMAIL`). Every device that uses the app signs in **as that user**. Employees are only `employees` rows; they never have accounts.

| Layer | What protects it |
|-------|------------------|
| Who can sync data at all | Signing in as the single user (once per device, see below) |
| Employee actions (record, remarks, own month, print) | Nothing more: the 3-digit code picks the record |
| Admin screens (employees, schedules, signatory, dashboard, print all) | **6-digit admin PIN**, checked in the app (scrypt hash stored in `settings`). An app lock, not a security boundary |

### Signing a device in (once per device)
**Recommended — setup code via Vercel** (no email needed on each phone):
```
POST /api/token   { public_key, hints, setupCode }
  1. compare setupCode with DEVICE_SETUP_CODE (constant-time); 10 failures / IP / 10 min → 429
  2. POST {DEXIE_CLOUD_DB_URL}/token with client_id/secret,
     claims: { sub: ADMIN_EMAIL, email: ADMIN_EMAIL, name: 'DTRV' }, public_key
  3. return the Dexie Cloud tokens (client_secret never leaves Vercel)
```
The first open on a new phone shows "Device setup code". After that the device stays signed in, and day-to-day use is just the 3-digit code.

**Alternative — Dexie Cloud's built-in email OTP**: no Vercel token function at all, but each new device needs the one-time code sent to the admin's email. That's fine if only a few devices will ever be used.

**Licensing:** 1 Dexie Cloud user signed in on several devices. That's the normal "one person, many devices" case. Confirm the current free-plan limits on dexie.org. **[verify]**

---

## 5. Time (`src/clock.js`) — device clock

```js
export function now() {                       // the phone's own clock, local time zone
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return { date: `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`, time: `${p(d.getHours())}:${p(d.getMinutes())}` };
}
```
- Dates and times are stored as plain `'YYYY-MM-DD'` / `'HH:MM'` strings in the phone's local time, so there's no time-zone conversion anywhere and the printed DTR shows exactly what the phone showed.
- A phone on automatic time (the default) is right. If someone turned it off, they correct times with **Change time**.
- Clock UI: ticks every second, the minute digits roll, the colon blinks.

---

## 6. Rules (`src/rules.js`, pure — already running in the prototype)

```js
const m = t => { const [h, mi] = t.split(':'); return +h * 60 + +mi; };

const lateLimit = sc => sc.mode === 'flexi' ? sc.flexEnd : sc.amIn;

const SLOTS = ['amIn','amOut','pmIn','pmOut'];
export function canRecord(day, slot) {          // one time per slot, in order
  const i = SLOTS.indexOf(slot);
  if (day?.[slot]) return { ok:false, why:'SLOT_TAKEN', at:day[slot] };
  for (let j = i + 1; j < 4; j++) if (day?.[SLOTS[j]]) return { ok:false, why:'OUT_OF_ORDER', after:SLOTS[j], at:day[SLOTS[j]] };
  return { ok:true };
}
export function suggest(day, nowTime) {          // next tile to pre-select; null when the day is full
  const byTime = m(nowTime) < m('11:00') ? 0 : m(nowTime) < m('12:30') ? 1 : m(nowTime) < m('14:00') ? 2 : 3;
  const last = SLOTS.reduce((l, s, i) => day?.[s] ? i : l, -1);
  return last === 3 ? null : SLOTS[Math.min(3, Math.max(byTime, last + 1))];
}

export function lateMinutes(day, sc) {          // 0 = on time; minutes counted from the limit
  let late = 0;
  if (day.amIn) { const o = m(day.amIn) - m(lateLimit(sc)); if (o > sc.graceMin) late += o; }
  if (sc.countPmLate && day.pmIn) { const o = m(day.pmIn) - m(sc.lunchEnd); if (o > sc.graceMin) late += o; }
  return late;
}

export function expectedOut(day, sc) {          // flexi only
  if (sc.mode !== 'flexi' || !day.amIn) return null;
  const start = Math.max(m(day.amIn), m(sc.flexStart));
  return hhmm(start + sc.requiredHours * 60 + m(sc.lunchEnd) - m(sc.lunchStart));
}

// What this person typed before for "Others", most used first, then most recent.
export function remarkHistory(days /* this employee's days */, limit = 6) {
  const c = new Map();
  for (const d of days) if (d.remark?.code === 'OTHER') { const r = c.get(d.remark.text) ?? { n:0, last:'' }; r.n++; if (d.date > r.last) r.last = d.date; c.set(d.remark.text, r); }
  return [...c].sort((a, b) => b[1].n - a[1].n || b[1].last.localeCompare(a[1].last)).slice(0, limit).map(x => x[0]);
}

// Flexi covers clock in & out only; lunch is the same in fixed and flexi.
export const clockOutWindow = sc => sc.mode !== 'flexi' ? null :
  [hhmm(m(sc.flexStart) + sc.requiredHours*60 + m(sc.lunchEnd) - m(sc.lunchStart)),
   hhmm(m(sc.flexEnd)   + sc.requiredHours*60 + m(sc.lunchEnd) - m(sc.lunchStart))];

export function monthStats(days, sc) {
  let present = 0, lates = 0, lateMin = 0, remarks = 0;
  for (const d of days) {
    if (d.amIn || d.amOut || d.pmIn || d.pmOut) present++;
    if (d.remark) remarks++;
    const l = lateMinutes(d, sc); if (l) { lates++; lateMin += l; }
  }
  return { present, lates, lateMin, remarks };
}
```
The schedule in force **now** applies to past days too (simple; can be versioned later).

---

## 7. Operations (`src/repo.js`) — these replace a REST API

All run locally against Dexie and sync automatically.

| Function | Does | Guards |
|----------|------|--------|
| `record(code, slot)` | `now()` → in one `db.transaction('rw', days, punches, audit)`: get/create `day:<code>:<date>`; `canRecord()`; set the slot; add `Punch` | unknown/inactive code → `NOT_FOUND`; **slot already filled → `SLOT_TAKEN`** (never overwrites); **any later slot filled → `OUT_OF_ORDER`**; all four filled → `DAY_FULL`. The UI shows these as toasts |
| `undo(punchId)` | clears the slot, `punch.undone = true` | only within 60 s, and only if the slot still holds that punch's time |
| `changeTime(code, date, slot, time\|null)` | sets the slot, `edited = true`, audit row | time format `^([01]\d|2[0-3]):[0-5]\d$` |
| `saveDay(code, date, {...})` | full-day edit from My DTR | same |
| `setRemark(code, from, to, {code,text}, skipSundays)` | one `days` row per date, shared `batch` uuid | ≤ 62 days; OTHER text ≤ 24 chars, uppercased |
| `clearRemarkBatch(batch)` | removes the remark from those days | — |
| `month(code, 'YYYY-MM')` | `days.where('[employeeId+date]').between(...)` + `monthStats` | — |
| `dashboard('YYYY-MM')` *(admin)* | stats per active employee | admin PIN |
| `upsertEmployee`, `saveSchedule`, `saveSignatory` *(admin)* | — | admin PIN in the app; code `^\d{3}$` |

Late notification data comes straight from `lateMinutes` + `monthStats` on the local copy. It's instant and works offline.

Sync status is shown subtly (a dot in the header: green synced / amber pending / grey offline) via `db.cloud.syncState`.

---

## 8. Print specification (CS Form 48, A4) — client-side

`print.js` renders into a print-only container and calls `window.print()`. Verified in the prototype: **one A4 page** in Chromium.

| Item | Value |
|------|-------|
| Page | `@page { size: A4; margin: 0 }`, padding 8 mm × 7 mm |
| Copies | 2 identical, side by side, gap 8 mm |
| Name / Month / Year | employee full name; selected month (default current) |
| Regular days / Saturdays | **blank underlines** |
| Rows (31) | times present → 4 times `h:mm`; else remark only; else Sat/Sun label across time cells; else blank |
| Undertime | remark text only (`colspan=2`); **never numbers** |
| Total | blank |
| Signatory | from `set:signatory` |
| Batch (admin) | all active employees, one page each |

---

## 9. UI implementation notes (style Rail · dark)

The prototype `mockup/index.html` is the reference (employee **and** admin screens, all animations): port its CSS and markup.
- **Palette**: background `#0a0f1c`, surface `#141b2d`, surface-2 `#1d2640`, lines `#26304a`, text `#eef2fa`, muted `#7c8aa8`, accent teal `#5eead4` on `#062a26`. Status: on time `#5eead4`/`#123b37`, late `#fb923c`/`#3d2312`, remark `#c4b5fd`/`#2a1f4a`, holiday `#fb7185`/`#4a1d2b`, incomplete `#facc15`/`#3b3410`.
- **Tiles** (row of 4): orange `#ff9a3c→#ff6a3d`, yellow `#f6c445→#f39c12`, teal `#2ec4b6→#1a9c8f`, indigo `#6d6df0→#3d3db8`. States: selected (100% + ✓ + breathing glow) · recorded (82%, time chip) · locked-empty (16%, greyscale) · other (36%).
- **Remembered user**: `localStorage['dtrv.lastCode']`, never displayed. A "Reset device" action (admin Settings) clears it.
- **Home**: no text above the keypad, only 3 dots. The keypad is `display:grid` (3×4, `flex:1`) with `container-type:size` and `font-size: clamp(28px, min(9.5cqh, 15cqw), 54px)`: keys fill all remaining height, digits scale with them. Admin entry is a 46 px transparent button with a ✦ at 16% opacity (`aria-label="·"`); no settings icon.
- **Tiles**: tap a recorded or blocked tile → `openTimeSheet(code, date, slot)` (time picker, Save/Clear, order check); tap an open tile → select it for recording. Recorded tiles show `7:58 ✎`.
- **Sheets**: result sheet has no auto-close and no sub-line; the greeting uses `employee.nickname`.
- **Remark sheet**: 4-way sliding switch, title only (no name/sub-line). Leave/Day-off/Holiday: From/To + skip Sundays. **Others**: text (max 40) + **suggestions from `remarkHistory(code)`** + a single **Date** field (default today or the selected day). Dismissing the sheet un-arms the pill.
- **Admin on the phone**: gate (6 dots) → `p-admin` with 5 tabs and a sliding indicator; list cards, bars, switches and the segmented control are the same components as the employee side.
- **Print on the phone**: hidden `#printRoot` holds one `.a4` per selected person (2 copies each, `break-after:page` except the last); `window.print()` prints exactly those. The on-screen preview is a scaled copy of the current page with a pager. Admin picks people with name chips (All / individual); employees print only themselves.
- **Safe areas**:
  ```css
  /* <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"> */
  :root { --sat: max(env(safe-area-inset-top), 16px); --sab: max(env(safe-area-inset-bottom), 16px); }
  .scr   { position:absolute; inset:0; padding: calc(var(--sat) + 10px) 16px calc(var(--sab) + 14px); }
  .sheet { padding-bottom: calc(var(--sab) + 16px); max-height: calc(100dvh - var(--sat) - 8px); }
  .toast { top: calc(var(--sat) + 6px); }
  ```
- **Height steps** (non-keypad): clock 54 → 46 → 40 → 36 px, tiles 96 → 86 → 72 → 62 px, tile subtitles hidden ≤ 720 px, lock icon hidden ≤ 600 px on the PIN screen. The keypad needs no steps: it simply fills what's left. Verified 568 → 932 px.
- **Motion** (CSS only, plus tiny JS for counters and the burst): screen enter/leave slide+fade; `data-st` stagger (`--i` × 28–55 ms); spring easing `cubic-bezier(.3,1.5,.5,1)`; aurora `filter:blur` blobs; digit roll; count-up; confetti burst; sliding tab indicator. **Always** add `@media (prefers-reduced-motion: reduce)` to collapse durations. Use `animation-fill-mode: backwards` (not `both`) for entrances so final transforms (selected tile, pressed keys) aren't frozen.
- Never call `scrollIntoView` inside the app. Fonts: Poppins (UI), Space Grotesk (clock, digits), self-hosted in `/public/fonts`.

---

## 10. Hosting & deploy (Vercel)

1. `npx dexie-cloud create` → creates the DB and `dexie-cloud.json`; `npx dexie-cloud whitelist https://<app>.vercel.app` (and `http://localhost:5173`).
2. Create an API client in Dexie Cloud and copy its client_id/secret into Vercel env vars **[verify CLI steps]**.
3. Vercel project linked to the GitHub repo: build `vite build`, output `dist`, one function `/api/token` (Node runtime).
4. Env vars: `DEXIE_CLOUD_DB_URL`, `DEXIE_CLIENT_ID`, `DEXIE_CLIENT_SECRET`, `DEVICE_SETUP_CODE`, `ADMIN_EMAIL`, `VITE_DEXIE_CLOUD_DB_URL`.
5. First run: on the first device, enter the setup code, then set the 6-digit admin PIN → the app creates the default schedule and the signatory.
6. Backups: `npx dexie-cloud export` weekly **[verify command]**; the admin page also offers "Download JSON" from the local copy.

---

## 11. Tests

| Level | Cases |
|-------|-------|
| Unit (`rules.js`) | fixed/flexi late, grace boundary, minutes from limit, PM late on/off, expectedOut clamp, monthStats, suggestSlot boundaries |
| Repo (`fake-indexeddb`) | code `'024'` keeps leading 0; `record` twice → `already`; undo window 60 s; undo after change → rejected; remark range skips Sundays; same day recorded on two "devices" → one `days` row |
| Slot rules | `canRecord`: free slot ok; filled slot → SLOT_TAKEN; AM IN after PM OUT → OUT_OF_ORDER; AM OUT after PM IN blocked; `suggest` never returns a slot earlier than the last recorded one; day full → null |
| Token function | wrong setup code → 401; rate limit; client secret never in the response |
| Remarks | `remarkHistory` is per person (Maria never sees Juan's reasons), sorted by use then recency, max 6; Others saves to the chosen date |
| Print | 3 people selected → PDF has 3 A4 pages; 1 person → 1 page |
| Layout | Playwright at 390×568/664/844/932: keypad bottom ≤ viewport − 30 px; no horizontal scroll; sheets' buttons above the bottom safe area |
| E2E (Playwright) | record → sheet → change time; My DTR edit; print = 1 A4 page, blank Regular days, remark in Undertime, worked Saturday shows times |

---

## 12. Build order

1. **P1** — Vite + Dexie schema (local only, no cloud yet), `rules.js`, `repo.js`, clock, Record screen + sheet, print. *Usable offline on one device.*
2. **P2** — Dexie Cloud: `/api/token` (single user), device setup screen, sync indicator; My DTR; admin (employees, schedules, signatory, dashboard).
3. **P3** — PWA install, batch print, backups, Vercel production deploy.

Estimate: P1 3 days · P2 3–4 days · P3 1–2 days.
