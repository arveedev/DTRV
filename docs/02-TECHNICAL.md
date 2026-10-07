# DTRV — Technical Specification (v2)

Companion to [`01-PLAN.md`](01-PLAN.md). Behaviour reference: [`../mockup/index.html`](../mockup/index.html). The prototype runs the real lateness, remark and print logic on in-memory demo data. Port those functions to the server as-is.

---

## 1. Architecture

```
 Employees' phones / shared PC         Admin PC
        (Chrome, Safari, Edge)          (Chrome/Edge)
                 │  HTTPS, JSON            │
                 ▼                         ▼
        ┌────────────────────────────────────────┐
        │ Node.js 22 + Express 5 (one process)   │
        │  /api/*   JSON API                     │
        │  /print   server-rendered A4 HTML      │
        │  /        static PWA (vanilla JS)      │
        └───────────────┬────────────────────────┘
                        ▼
          SQLite (better-sqlite3, WAL)  data/dtr.db
          backups/dtr-YYYYMMDD.db  (nightly, keep 30)
```

Employees record from their **own phones**, so the server must be reachable from outside the office LAN. Recommended: a small VPS (or the office PC behind a Cloudflare Tunnel) with HTTPS.

| Layer | Choice | Reason |
|-------|--------|--------|
| Runtime | Node.js 22 LTS | One install; same language front and back |
| Server | Express 5 + `zod` validation + `helmet` | ~20 endpoints; small and well known |
| DB | SQLite via `better-sqlite3`, WAL | Single file; ≤ 1,000 employees × 4 writes/day is trivial |
| Front-end | Vanilla HTML/CSS/JS, **PWA** (manifest + service worker for the app shell) | "Add to Home Screen" on phones; no build step |
| Print | HTML + CSS `@page`, browser Print / Save as PDF | Exact mm layout, verified to fit one A4 page |
| Sessions | `express-session` + SQLite store (admin only) | Employees don't keep sessions — each request carries the code |
| HTTPS | Caddy (auto TLS) in front of Node | Needed for PWA install and for phones over the internet |
| Tests | `node:test`, `supertest`, Playwright | Unit, API, print |

---

## 2. Project layout

```
dtrv/
├─ package.json
├─ .env.example            # PORT, SESSION_SECRET, TZ=Asia/Manila, FIRST_ADMIN_PIN
├─ src/
│  ├─ server.js
│  ├─ db.js                # open, pragmas, migrations
│  ├─ migrations/001_init.sql
│  ├─ time.js              # nowManila() → {date:'YYYY-MM-DD', time:'HH:MM', iso}
│  ├─ rules.js             # PURE: lateMinutes, expectedOut, suggestSlot, monthStats, buildMonth
│  ├─ audit.js
│  ├─ routes/
│  │  ├─ kiosk.routes.js   # record, change, undo, remark, my-month (code-based)
│  │  ├─ admin.routes.js   # login, employees, schedule, signatory, records, dashboard
│  │  └─ print.routes.js
│  ├─ views/dtr.js         # CS Form 48 template (port of dtrCopy() in the prototype)
│  └─ jobs/backup.js
├─ public/                 # index.html, app.js, app.css, print.css, manifest.webmanifest, sw.js, icons/
└─ test/
   ├─ rules.test.js
   ├─ api.test.js
   └─ print.spec.js
```

---

## 3. Data model

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE schedules (
  id           INTEGER PRIMARY KEY,
  mode         TEXT NOT NULL CHECK (mode IN ('fixed','flexi')),
  am_in        TEXT,               -- fixed: late after this   'HH:MM'
  flex_start   TEXT,               -- flexi: earliest time in
  flex_end     TEXT,               -- flexi: latest time in (late after this)
  required_hours REAL,             -- flexi: hours per day, excl. lunch
  lunch_start  TEXT NOT NULL DEFAULT '12:00',
  lunch_end    TEXT NOT NULL DEFAULT '13:00',
  grace_min    INTEGER NOT NULL DEFAULT 0,
  count_pm_late INTEGER NOT NULL DEFAULT 0,
  is_office_default INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX one_default ON schedules(is_office_default) WHERE is_office_default = 1;

CREATE TABLE employees (
  id           INTEGER PRIMARY KEY,
  code         TEXT NOT NULL UNIQUE CHECK (code GLOB '[0-9][0-9][0-9]'),  -- '047'; TEXT keeps the leading 0
  full_name    TEXT NOT NULL,      -- printed on DTR, ≤ 40 chars
  position     TEXT,
  schedule_id  INTEGER REFERENCES schedules(id),  -- NULL = office default
  is_active    INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE dtr_days (
  id            INTEGER PRIMARY KEY,
  employee_id   INTEGER NOT NULL REFERENCES employees(id),
  work_date     TEXT NOT NULL,     -- 'YYYY-MM-DD' Asia/Manila
  am_in TEXT, am_out TEXT, pm_in TEXT, pm_out TEXT,   -- 'HH:MM' 24h, final values
  remark_code   TEXT CHECK (remark_code IN ('LEAVE','DAYOFF','OTHER')),
  remark_text   TEXT,              -- printed for OTHER, ≤ 24 chars, uppercase
  remark_batch  TEXT,              -- uuid shared by a date-range remark
  edited        INTEGER NOT NULL DEFAULT 0,   -- any time changed after recording
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (employee_id, work_date)
);

-- Append-only: every press of Record, with the server time. Never updated.
CREATE TABLE punches (
  id           INTEGER PRIMARY KEY,
  employee_id  INTEGER NOT NULL REFERENCES employees(id),
  work_date    TEXT NOT NULL,
  slot         TEXT NOT NULL CHECK (slot IN ('am_in','am_out','pm_in','pm_out')),
  server_time  TEXT NOT NULL,      -- 'HH:MM'
  at_utc       TEXT NOT NULL,
  undone       INTEGER NOT NULL DEFAULT 0,
  ip TEXT, user_agent TEXT
);

CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);   -- JSON values
-- signatory_name, signatory_title, signatory_label, admin_pin_hash

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY,
  at_utc TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  actor TEXT NOT NULL,             -- 'emp:047' | 'admin'
  action TEXT NOT NULL,            -- 'time.change','time.undo','remark.set','day.delete','employee.create',...
  employee_id INTEGER, work_date TEXT,
  before_json TEXT, after_json TEXT, ip TEXT
);

CREATE TABLE login_attempts (ip TEXT PRIMARY KEY, failures INTEGER NOT NULL DEFAULT 0, locked_until_utc TEXT);
```

Seed: one office-default schedule `fixed 08:00, lunch 12:00–13:00, grace 0`; signatory `AL MARTIN A. MENES / Acting Branch Manager / In Charge`.

**Why `punches` and `dtr_days`:** `dtr_days` holds the final times that print and drive late counts. `punches` keeps the original server time of every Record press, so an admin can always compare an *edited* time with what was actually pressed.

---

## 4. Identity & security

- **Employee code**: exactly 3 digits, `^\d{3}$`, stored as TEXT (`'047'`). The admin form suggests `'0'+n` when given a 2-digit employee number. Codes are **not secret**; the owner accepted this for a personal-record tool.
- No employee sessions. Each kiosk request carries `{code}` and the server resolves the employee. This suits a shared device: nobody stays logged in.
- Rate limit on code lookups: 20 failed codes per IP per 5 min → `429`. This stops someone scripting all 1,000 codes, without bothering real users.
- **Admin**: 6-digit PIN, `scrypt` hash in `settings.admin_pin_hash`. 5 failures → 5-minute lockout per IP. Session cookie `HttpOnly; Secure; SameSite=Strict`, 15-min rolling expiry. First run takes `FIRST_ADMIN_PIN` from `.env`, then forces a change.
- All mutations require `Content-Type: application/json` (blocks cross-site form posts). `helmet` with CSP `default-src 'self'`.
- **Time source = server** (`Asia/Manila` via `Intl`). The client never sends the time for a new record, only for an explicit change.

---

## 5. Rules (`src/rules.js`, pure — ported from the prototype)

```js
const m = t => { const [h, mi] = t.split(':'); return +h * 60 + +mi; };

// Pre-select toggle by time of day (UI only).
const suggestSlot = now =>
  m(now) < m('11:00') ? 'am_in' : m(now) < m('12:30') ? 'am_out' : m(now) < m('14:00') ? 'pm_in' : 'pm_out';

const lateLimit = sc => sc.mode === 'flexi' ? sc.flex_end : sc.am_in;

// Minutes late for a day (0 = on time). Counted from the limit once past limit + grace.
function lateMinutes(day, sc) {
  let late = 0;
  if (day.am_in) { const over = m(day.am_in) - m(lateLimit(sc)); if (over > sc.grace_min) late += over; }
  if (sc.count_pm_late && day.pm_in) { const over = m(day.pm_in) - m(sc.lunch_end); if (over > sc.grace_min) late += over; }
  return late;
}

// Flexi only: when the employee may leave.
function expectedOut(day, sc) {
  if (sc.mode !== 'flexi' || !day.am_in) return null;
  const start = Math.max(m(day.am_in), m(sc.flex_start));
  return toHHMM(start + sc.required_hours * 60 + (m(sc.lunch_end) - m(sc.lunch_start)));
}

// Month summary used by notification, My DTR and dashboard.
function monthStats(days, sc) {   // days: dtr_days rows for the month
  let present = 0, lates = 0, lateMin = 0, remarks = 0;
  for (const d of days) {
    if (d.am_in || d.am_out || d.pm_in || d.pm_out) present++;
    if (d.remark_code) remarks++;
    const l = lateMinutes(d, sc); if (l) { lates++; lateMin += l; }
  }
  return { present, lates, lateMin, remarks };
}
```

The schedule used is the one in force **now** (`employee.schedule_id ?? office default`). Changing a schedule recalculates past lates too. That keeps things simple; schedules can be versioned later if that's ever a problem.

---

## 6. API

`K` = kiosk (code in body), `A` = admin session. Errors: `{error, message}`.

| Method | Path | Who | Body / query | Response |
|--------|------|-----|--------------|----------|
| GET  | `/api/time` | — | — | `{date, time, iso}`; phone clock syncs to this |
| POST | `/api/record` | K | `{code, slot}` | `201 {employee:{code,name}, day, slot, time, late:{minutes, countThisMonth}, expectedOut, punchId}` · `200 {already:true, ...}` if slot filled · `404 code_not_found` |
| POST | `/api/record/:punchId/undo` | K | `{code}` | `204`; only within **60 s** and if that slot still holds the punch's time; marks `punches.undone=1` and clears the slot |
| PATCH| `/api/day` | K | `{code, date, slot, time|null}` | updated day + late info; sets `edited=1`; audit |
| PUT  | `/api/day` | K | `{code, date, am_in, am_out, pm_in, pm_out, remark_code, remark_text}` | full-day edit from My DTR |
| DELETE| `/api/day` | K | `{code, date}` | `204` |
| POST | `/api/remarks` | K | `{code, from, to, remark_code, remark_text?, skipSundays}` | `{batch, dates[]}`; max 62 days |
| DELETE| `/api/remarks/:batch` | K | `{code}` | `204` |
| POST | `/api/my-month` | K | `{code, month:'YYYY-MM'}` | `{employee, schedule, stats, days[]}` (POST so the code isn't in URLs or logs) |
| POST | `/api/admin/login` | — | `{pin}` | `204` + cookie |
| POST | `/api/admin/logout` | A | — | `204` |
| GET  | `/api/admin/dashboard` | A | `?month=` | per-employee stats + totals + most lates |
| GET/POST/PATCH | `/api/admin/employees[/:id]` | A | `{code, full_name, position, schedule}` | `409 code_taken` |
| GET/PUT | `/api/admin/schedule` | A | office default schedule | |
| GET/PUT | `/api/admin/signatory` | A | `{name,title,label}` | |
| PUT  | `/api/admin/pin` | A | `{current, next}` | `204` |
| PUT/DELETE | `/api/admin/day` | A | same as kiosk, by `employee_id` | |
| GET  | `/api/admin/audit` | A | `?employee=&from=&to=` | paged |
| GET  | `/api/admin/backup` | A | — | SQLite file |
| POST | `/print` | K or A | form `{code}` or admin session; `month`, `employee=ID|all` | A4 HTML |

Validation: time `^([01]\d|2[0-3]):[0-5]\d$`; date within ±400 days of today; remark text ≤ 24 chars, uppercased; full name ≤ 40 chars.

**Record flow (server, one transaction):**
1. Resolve `code` → active employee, else 404 (+ rate-limit counter).
2. `now = nowManila()`; upsert `dtr_days(employee, now.date)`.
3. If `slot` is already set → return `{already:true}` with the existing time.
4. Set slot = `now.time`; insert `punches`.
5. Compute `lateMinutes` (for `am_in`, or `pm_in` when PM lates count), `monthStats` and `expectedOut`; return them for the notification.

---

## 7. Front-end behaviour

- **Record screen**: 4 toggles, pre-selected by `suggestSlot(serverNow)`. Chips *On leave / Day-off / Others…* switch the keypad into remark mode. The 3-digit field **auto-submits on the 3rd digit**. Physical keyboard digits, Backspace and Enter work too.
- **Notification** (top, 9 s): name, slot + time, badges (*Late N min*, *Nth late this Month*, *On time · N lates this month*, *Flexi · out at …*, *edited*), **Tap to change the time**, **Not you? Undo**.
- **Change time sheet**: native `<input type=time>`, Save / Clear → `PATCH /api/day`.
- **My DTR**: code → month list, stats cards, day editor sheet, Print.
- Clock: fetch `/api/time` on load and every 5 min; tick locally in between.
- PWA: app shell cached; recording needs the network. If offline, show "No connection — not recorded" (no silent queueing, so records never arrive with the wrong time).
- Accessibility: keys ≥ 48 px, `aria-live` on the notification, visible focus.

---

## 8. Print specification (CS Form 48, A4)

Verified in the prototype with Chromium `page.pdf()`: **one A4 page**.

| Item | Value |
|------|-------|
| Page | `@page { size: A4; margin: 0 }`, sheet padding 8 mm × 7 mm |
| Copies | 2 identical, side by side, gap 8 mm |
| Name | full name, uppercase, bold, on underline |
| Month / Year | from selected month (default current) |
| Regular days / Saturdays | **blank underlines** |
| Rows (31) | times present → 4 times as `h:mm` (13:05 → `1:05`); else remark only; else Sat/Sun label across time cells; else blank |
| Undertime | remark text only (`colspan=2`, 5.4 pt, wraps 2 lines); **never numbers** |
| Total | blank cells |
| Signatory | name bold uppercase, title, italic label |
| Batch | `employee=all` → one page per active employee (`page-break-after`) |

---

## 9. Deployment

**Recommended — small VPS (₱300–500/month)**: Ubuntu, Node 22, app under systemd, **Caddy** for HTTPS on a domain. Phones reach it from anywhere.

**Alternative — office PC**: Node service (NSSM on Windows) + **Cloudflare Tunnel** for HTTPS without opening ports. Downside: the PC must stay on.

Backups: nightly `db.backup()` at 23:30 Manila, keep 30; admin can download anytime. Restore = stop, replace `data/dtr.db`, start.

---

## 10. Tests

| Level | Cases |
|-------|-------|
| Unit (`rules.js`) | fixed on time / late / exactly at limit / within grace / past grace (minutes from limit); flexi late after `flex_end`; flexi expected out (early arrival clamps to `flex_start`); PM late on/off; one late day with AM+PM counted once; monthStats; suggestSlot boundaries 10:59/11:00/12:29/12:30/13:59/14:00 |
| API | code `'047'` round-trips with leading 0; `47` and `0470` rejected; record twice → `already`; undo within 60 s ok, after → 409, after a manual change → 409; remark range skips Sundays; admin endpoints 401 without session; admin lockout |
| Print | 1 page A4; Regular days/Saturdays blank; worked Saturday shows times; leave day shows remark in Undertime and no times; Total blank; 40-char name fits one line |

---

## 11. Build order

1. **P1** — schema, `time.js`, `rules.js` + unit tests, `/api/time`, `/api/record`, undo, change time, Record screen + notification, print single.
2. **P2** — remarks, My DTR, schedules (fixed/flexi + per-employee), late badges, admin login/employees/schedule/signatory/dashboard.
3. **P3** — print all, backup, PWA manifest/service worker, deploy guide.

Estimate for one developer: P1 3 days · P2 3 days · P3 1–2 days.
