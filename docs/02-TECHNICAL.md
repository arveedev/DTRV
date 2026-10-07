# DTRV — Technical Specification (v3: Vercel + Dexie Cloud)

Companion to [`01-PLAN.md`](01-PLAN.md).
Behaviour reference: [`../mockup/index.html`](../mockup/index.html) (working prototype).
Visual direction: [`../mockup/ui-bc-variations.html`](../mockup/ui-bc-variations.html) (B + C combined; variation still to be picked).

> Owner decision (2026-10-07): **Vercel** hosts the app, **Dexie Cloud** is the database.
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
  │  /api/time         │   │  realms / roles = access   │
  │  /api/token  ──────┼──►│  /token (client secret)    │
  └────────────────────┘   └────────────────────────────┘
```

What changes compared with a normal server app:

| Concern | Where it lives now |
|---------|--------------------|
| Data | Dexie Cloud, plus a full local copy in each device's IndexedDB (synced) |
| Business rules (late, stats, print) | **In the browser** (`rules.js`, `print.js`) |
| Server time | Vercel function `/api/time`; the client keeps an offset |
| Who can sync | Vercel function `/api/token` exchanges a setup code / admin PIN for a Dexie Cloud token |
| Offline | Works: records save locally and sync when back online |

### Trade-offs of this choice (accepted)
1. **The time is written by the browser.** The app uses server time (via the offset) when it has it, but a determined user could change it. The app already lets employees edit their times, so this adds no new weakness. Each record stores `timeSource: 'server'|'device'`.
2. **Every logged-in device holds a copy of all employees' records.** That's how a shared office realm works. Fine for this use (codes aren't secret anyway); not fine if records ever become confidential.
3. **No server-side validation.** Uniqueness and correctness rely on deterministic IDs and Dexie Cloud role permissions, not server code.
4. **Vercel Hobby plan is for non-commercial use.** An office staff tool may need Pro. **[verify]**

---

## 2. Project layout

```
dtrv/
├─ package.json            # dexie, dexie-cloud-addon, vite (build only)
├─ vercel.json
├─ dexie-cloud.json        # created by `npx dexie-cloud create` (DB URL) — not secret
├─ .env.example            # DEXIE_CLOUD_DB_URL, DEXIE_CLIENT_ID, DEXIE_CLIENT_SECRET,
│                          # OFFICE_SETUP_CODE, ADMIN_PIN_HASH (scrypt)
├─ api/
│  ├─ time.js              # GET  → { iso } (server UTC)
│  └─ token.js             # POST → Dexie Cloud tokens for 'office' or 'admin'
├─ src/
│  ├─ db.js                # Dexie schema + cloud.configure
│  ├─ clock.js             # server offset, nowManila()
│  ├─ rules.js             # PURE: lateMinutes, expectedOut, suggestSlot, monthStats
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
  schedules: 'id',                                // id = 'sch:office' | 'sch:<uuid>'
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
    body: JSON.stringify({ ...req, grant: sessionGrant() })   // setup code or admin PIN
  }).then(r => r.json()),
});
```

### Why deterministic IDs
Dexie Cloud has no server code to enforce `UNIQUE`. So uniqueness comes from the **primary key**:
- `employees.id = 'emp:' + code` → two employees can't share `024`. Creating one checks `db.employees.get('emp:024')` first; if two admins race, the second write updates the same object instead of creating a duplicate.
- `days.id = 'day:' + code + ':' + date` → exactly one row per employee per day, even when two devices record the same day offline. Updates are written with `db.days.update(id, { amIn })` (property-level), which Dexie Cloud merges per property **[verify]**, so AM IN from a phone and PM OUT from the office PC both survive.

### Objects

```ts
Employee { id:'emp:024', code:'024', fullName:'JUAN A. DELA CRUZ', position?, scheduleId?:string|null,
           isActive:true, realmId }
Schedule { id, mode:'fixed'|'flexi', amIn?, flexStart?, flexEnd?, requiredHours?, lunchStart:'12:00',
           lunchEnd:'13:00', graceMin:0, countPmLate:false, realmId }
Day      { id:'day:024:2026-10-07', employeeId:'emp:024', date:'2026-10-07',
           amIn?:'08:20', amOut?, pmIn?, pmOut?,                  // 'HH:MM' 24h, final values
           remark?: { code:'LEAVE'|'DAYOFF'|'OTHER', text?:string, batch?:string },
           edited:boolean, timeSource:'server'|'device', realmId }
Punch    { id, employeeId, date, slot:'amIn'|'amOut'|'pmIn'|'pmOut', time:'08:20', at:ISO,
           timeSource, undone:false, deviceId, realmId }
Settings { id:'set:signatory', name, title, label, realmId }
Audit    { id, at, actor:'emp:024'|'admin', action, employeeId?, date?, before?, after?, realmId }
```

Every object carries `realmId = 'rlm-dtrv-office'` (see §4) so all devices in the office see it.

---

## 4. Access control (Dexie Cloud realms + roles)

**One shared realm** `rlm-dtrv-office`, created once by the admin on first run.

| Identity (token `sub`) | Who | Role in realm | Table permissions |
|------------------------|-----|---------------|-------------------|
| `office` | Every employee device and shared PC | `recorder` | add/update: `days`, `punches`, `audit` · read: all |
| `admin` | Admin PC after entering the 6-digit PIN | owner | everything incl. `employees`, `schedules`, `settings`, delete |

Roles are defined in the realm's `roles` table, e.g. `{ name:'recorder', permissions:{ add:['days','punches','audit'], update:{ days:'*', punches:['undone'] } } }` **[verify exact syntax]**.

Result: an employee device **cannot** add employees, change schedules or change the signatory, even by editing the JavaScript, because Dexie Cloud rejects the sync.

### Token endpoint (`api/token.js`)

```
POST /api/token
  body: { public_key, hints, grant: { type:'office', setupCode } | { type:'admin', pin } }
  1. office: compare setupCode with OFFICE_SETUP_CODE (constant-time)    → sub='office'
     admin:  scrypt-verify pin against ADMIN_PIN_HASH                     → sub='admin'
  2. rate-limit: 10 failures / IP / 10 min → 429
  3. POST {DEXIE_CLOUD_DB_URL}/token with client_id/secret,
     claims:{ sub, name }, public_key  → returns Dexie Cloud tokens
  4. respond with those tokens (the client_secret never leaves Vercel)
```

The rate limit needs shared state across function calls. Use Vercel KV / Upstash (free tier), or accept per-instance memory as best-effort.

**Device setup (once per phone):** the first open shows "Office setup code". The admin shares it with staff (e.g. posted in the office). After that the device stays signed in as `office`, and only the 3-digit code is used day to day. Without the setup code, a stranger who finds the URL can't read or write anything.

**Licensing:** this uses **2 Dexie Cloud users** (`office`, `admin`) regardless of headcount. Check that Dexie Cloud's terms allow one user signed in on many devices, and which plan covers it. **[verify]**

---

## 5. Time (`src/clock.js`)

```js
let offsetMs = 0, synced = false;
export async function syncClock() {
  const t0 = Date.now();
  const { iso } = await fetch('/api/time').then(r => r.json());
  const t1 = Date.now();
  offsetMs = Date.parse(iso) - (t0 + t1) / 2;   // network delay halved
  synced = true;
}
export const nowManila = () => {
  const d = new Date(Date.now() + offsetMs);
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Manila',
    year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23' })
    .formatToParts(d).map(x => [x.type, x.value]));
  return { date:`${p.year}-${p.month}-${p.day}`, time:`${p.hour}:${p.minute}`, source: synced ? 'server' : 'device' };
};
```
Called on load, on `visibilitychange` → visible, and every 5 minutes. `api/time.js` returns `{ iso: new Date().toISOString() }` with `Cache-Control: no-store`.

---

## 6. Rules (`src/rules.js`, pure — already running in the prototype)

```js
const m = t => { const [h, mi] = t.split(':'); return +h * 60 + +mi; };

export const suggestSlot = now =>
  m(now) < m('11:00') ? 'amIn' : m(now) < m('12:30') ? 'amOut' : m(now) < m('14:00') ? 'pmIn' : 'pmOut';

const lateLimit = sc => sc.mode === 'flexi' ? sc.flexEnd : sc.amIn;

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
| `record(code, slot)` | `nowManila()` → in one `db.transaction('rw', days, punches, audit)`: get/create `day:<code>:<date>`; if slot is empty, set it; add `Punch` | unknown/inactive code → `NOT_FOUND`; slot filled → returns `{already:true, time}` and doesn't overwrite |
| `undo(punchId)` | clears the slot, `punch.undone = true` | only within 60 s, and only if the slot still holds that punch's time |
| `changeTime(code, date, slot, time\|null)` | sets the slot, `edited = true`, audit row | time format `^([01]\d|2[0-3]):[0-5]\d$` |
| `saveDay(code, date, {...})` | full-day edit from My DTR | same |
| `setRemark(code, from, to, {code,text}, skipSundays)` | one `days` row per date, shared `batch` uuid | ≤ 62 days; OTHER text ≤ 24 chars, uppercased |
| `clearRemarkBatch(batch)` | removes the remark from those days | — |
| `month(code, 'YYYY-MM')` | `days.where('[employeeId+date]').between(...)` + `monthStats` | — |
| `dashboard('YYYY-MM')` *(admin)* | stats per active employee | admin token |
| `upsertEmployee`, `saveSchedule`, `saveSignatory` *(admin)* | — | enforced by realm role; code `^\d{3}$` |

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

## 9. UI implementation notes

Visual direction is **B + C combined** (pick one of the three variations in `ui-bc-variations.html`). Shared building blocks:
- Slot tiles: gradients orange `#ff9a3c→#ff6a3d`, yellow `#f6c445→#f39c12`, teal `#2ec4b6→#1a9c8f`, indigo `#6d6df0→#3d3db8`; text labels always shown (colour is never the only cue).
- Round dialer keys ≥ 58 px; 3 dots fill as digits are typed; auto-submit on the 3rd digit.
- Bottom sheet after recording: greeting, big time, late box (+ bar), flexi out time, Undo / Change time / Done; auto-closes after 5–9 s.
- My DTR: colour stat cards, calendar (green on time / orange late / purple remark), tap a day → 4 colour time chips, edit sheet.
- The record screen never shows personal data (late counts etc.) until a code is entered.
- Fonts: Poppins (UI) and Space Grotesk (clock and digits), self-hosted in `/public/fonts` so they work offline.

---

## 10. Hosting & deploy (Vercel)

1. `npx dexie-cloud create` → creates the DB and `dexie-cloud.json`; `npx dexie-cloud whitelist https://<app>.vercel.app` (and `http://localhost:5173`).
2. Create an API client in Dexie Cloud and copy its client_id/secret into Vercel env vars **[verify CLI steps]**.
3. Vercel project linked to the GitHub repo: build `vite build`, output `dist`, functions in `/api` (Node runtime).
4. Env vars: `DEXIE_CLOUD_DB_URL`, `DEXIE_CLIENT_ID`, `DEXIE_CLIENT_SECRET`, `OFFICE_SETUP_CODE`, `ADMIN_PIN_HASH`, `VITE_DEXIE_CLOUD_DB_URL`.
5. First run: admin opens `/admin`, enters PIN → app creates realm `rlm-dtrv-office`, the `recorder` role, the `office` member, the office schedule and the signatory.
6. Backups: `npx dexie-cloud export` weekly **[verify command]**; the admin page also offers "Download JSON" from the local copy.

---

## 11. Tests

| Level | Cases |
|-------|-------|
| Unit (`rules.js`) | fixed/flexi late, grace boundary, minutes from limit, PM late on/off, expectedOut clamp, monthStats, suggestSlot boundaries |
| Repo (`fake-indexeddb`) | code `'024'` keeps leading 0; `record` twice → `already`; undo window 60 s; undo after change → rejected; remark range skips Sundays; same day recorded on two "devices" → one `days` row |
| Clock | offset maths; `source:'device'` when `/api/time` fails |
| Token function | wrong setup code → 401; rate limit; admin PIN; client secret never in the response |
| E2E (Playwright) | record → sheet → change time; My DTR edit; print = 1 A4 page, blank Regular days, remark in Undertime, worked Saturday shows times |

---

## 12. Build order

1. **P1** — Vite + Dexie schema (local only, no cloud yet), `rules.js`, `repo.js`, clock, Record screen + sheet, print. *Usable offline on one device.*
2. **P2** — Dexie Cloud: `/api/token`, realm + roles, device setup screen, sync indicator; My DTR; admin (employees, schedules, signatory, dashboard).
3. **P3** — PWA install, batch print, backups, Vercel production deploy.

Estimate: P1 3 days · P2 3–4 days · P3 1–2 days.
