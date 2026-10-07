# DTRV — Technical Specification

Companion to [`01-PLAN.md`](01-PLAN.md). UI reference: [`../mockup/index.html`](../mockup/index.html) (open in Chrome; screen 10 prints a real A4).

---

## 1. Architecture

```
┌──────────────── Office LAN ────────────────┐
│  Kiosk PC / phones / admin PC  (Chrome/Edge)│
│        │  HTTP(S), same-origin cookies      │
│        ▼                                    │
│  Node.js 22 + Express  (single process)     │
│   ├─ /api/*     JSON API                    │
│   ├─ /print     server-rendered A4 DTR HTML │
│   └─ /          static SPA (vanilla JS)     │
│        │                                    │
│        ▼                                    │
│  SQLite (better-sqlite3, WAL)  data/dtr.db  │
│  backups/ dtr-YYYYMMDD.db  (nightly, keep 30)│
└─────────────────────────────────────────────┘
```

### Stack choice

| Layer | Choice | Reason |
|-------|--------|--------|
| Runtime | **Node.js 22 LTS** | Runs on the office Windows PC or a small Linux VPS; one install. |
| Server | **Express 5** | Small, well known, enough for ~20 endpoints. |
| DB | **SQLite** via `better-sqlite3`, WAL mode | One file, zero admin, synchronous API, handles a branch office's write volume easily (≤ 100 users × 4 punches/day). |
| Frontend | **Vanilla HTML/CSS/JS, no build step** | Five screens. A framework adds a build chain the office can't maintain. |
| Print | **Server-rendered HTML + CSS `@page`**, browser prints/saves PDF | Exact mm layout, no PDF library, works offline. |
| Sessions | `express-session` + `better-sqlite3-session-store` | Server-side sessions, HttpOnly cookie. |
| Validation | `zod` | Request schemas in one place. |
| Tests | `node:test` + `supertest`; Playwright for print snapshot | Built in / already used for PDF. |
| Process | Windows: NSSM service · Linux: systemd | Auto-start on boot. |

Rejected alternatives: PHP + MySQL (two services to manage); Firebase/Supabase (needs internet, client-side clock risk); React/Vite (build tooling with no benefit at this size).

---

## 2. Project layout

```
dtrv/
├─ package.json
├─ .env.example              # PORT, SESSION_SECRET, PIN_PEPPER, TZ=Asia/Manila
├─ src/
│  ├─ server.js              # express app, middleware, routes mount
│  ├─ db.js                  # open DB, pragmas, run migrations
│  ├─ migrations/001_init.sql
│  ├─ auth.js                # pin hashing, login, lockout, requireRole()
│  ├─ time.js                # now() in Asia/Manila, date helpers
│  ├─ dtr.js                 # undertime calc, slot suggestion, month builder (PURE)
│  ├─ audit.js               # writeAudit(actor, entity, before, after, reason)
│  ├─ routes/
│  │  ├─ auth.routes.js
│  │  ├─ punch.routes.js
│  │  ├─ entries.routes.js
│  │  ├─ remarks.routes.js
│  │  ├─ users.routes.js
│  │  ├─ settings.routes.js
│  │  ├─ audit.routes.js
│  │  └─ print.routes.js     # GET /print → HTML
│  ├─ views/dtr.html.js      # template function → CS Form 48 markup
│  └─ jobs/backup.js         # nightly copy via db.backup()
├─ public/
│  ├─ index.html             # SPA shell
│  ├─ app.js                 # router + screens
│  ├─ app.css
│  └─ print.css              # A4 rules (shared with /print)
├─ data/                     # dtr.db (gitignored)
├─ backups/                  # gitignored
└─ test/
   ├─ dtr.test.js            # unit: undertime, slot suggestion, month build
   ├─ api.test.js            # integration via supertest on in-memory DB
   └─ print.spec.js          # Playwright: 1 page, A4, snapshot
```

---

## 3. Data model (SQLite)

`migrations/001_init.sql`

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id               INTEGER PRIMARY KEY,
  full_name        TEXT    NOT NULL,            -- printed on DTR, e.g. 'JUAN A. DELA CRUZ'
  position         TEXT,
  role             TEXT    NOT NULL CHECK (role IN ('employee','admin')),
  pin_lookup       TEXT    NOT NULL UNIQUE,     -- HMAC-SHA256(PIN_PEPPER, role||':'||pin), hex
  pin_hash         TEXT,                        -- admin only: scrypt hash (defence in depth)
  incharge_name    TEXT,                        -- optional per-user signatory override
  incharge_title   TEXT,
  is_active        INTEGER NOT NULL DEFAULT 1,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- One row per employee per calendar day.
CREATE TABLE dtr_entries (
  id               INTEGER PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(id),
  work_date        TEXT    NOT NULL,            -- 'YYYY-MM-DD' (Asia/Manila)
  am_in            TEXT,                        -- 'HH:MM' 24h
  am_out           TEXT,
  pm_in            TEXT,
  pm_out           TEXT,
  undertime_override_min INTEGER,               -- admin manual value; NULL = compute
  remark_code      TEXT REFERENCES remark_types(code),
  remark_text      TEXT,                        -- note; printed only for OTHER
  remark_batch_id  TEXT,                        -- uuid shared by a date-range remark
  created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, work_date)
);
CREATE INDEX idx_entries_user_month ON dtr_entries(user_id, work_date);

-- Raw, append-only punch log (source of truth for "made daily at time of arrival").
CREATE TABLE punches (
  id               INTEGER PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(id),
  slot             TEXT    NOT NULL CHECK (slot IN ('am_in','am_out','pm_in','pm_out')),
  punched_at_utc   TEXT    NOT NULL,            -- ISO 8601 UTC
  local_date       TEXT    NOT NULL,            -- 'YYYY-MM-DD' Asia/Manila
  local_time       TEXT    NOT NULL,            -- 'HH:MM'
  ip               TEXT,
  user_agent       TEXT
);

CREATE TABLE remark_types (
  code             TEXT PRIMARY KEY,            -- 'LEAVE','DAYOFF','OB','HOLIDAY','NO_OUT','NO_LUNCH','OTHER'
  print_text       TEXT NOT NULL,               -- 'ON LEAVE' (max 24 chars)
  whole_day        INTEGER NOT NULL DEFAULT 0,  -- eligible for "print across row"
  sort             INTEGER NOT NULL DEFAULT 0,
  is_active        INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL                            -- JSON-encoded
);

CREATE TABLE audit_log (
  id          INTEGER PRIMARY KEY,
  at_utc      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  actor_id    INTEGER REFERENCES users(id),
  action      TEXT NOT NULL,                     -- 'entry.update','entry.delete','remark.create',...
  entity      TEXT NOT NULL,                     -- 'dtr_entries','users','settings',...
  entity_id   TEXT,
  subject_user_id INTEGER,                       -- whose DTR was affected
  before_json TEXT,
  after_json  TEXT,
  reason      TEXT,
  ip          TEXT
);

CREATE TABLE login_attempts (
  key         TEXT PRIMARY KEY,                  -- client IP (+ device cookie id)
  failures    INTEGER NOT NULL DEFAULT 0,
  locked_until_utc TEXT
);

INSERT INTO remark_types(code,print_text,whole_day,sort) VALUES
 ('LEAVE','ON LEAVE',1,1),('DAYOFF','DAY-OFF',1,2),('OB','OFFICIAL BUSINESS',1,3),
 ('HOLIDAY','HOLIDAY',1,4),('NO_OUT','NO TIME-OUT',0,5),('NO_LUNCH','NO LUNCH PUNCH',0,6),
 ('OTHER','',0,99);
```

### Settings keys (defaults)

| key | default | used by |
|-----|---------|---------|
| `incharge_name` | `"AL MARTIN A. MENES"` | print |
| `incharge_title` | `"Acting Branch Manager"` | print |
| `incharge_label` | `"In Charge"` | print |
| `hours_regular` | `{"amIn":"08:00","amOut":"12:00","pmIn":"13:00","pmOut":"17:00"}` | undertime |
| `hours_regular_text` | `"8:00-12:00 / 1:00-5:00"` | print |
| `hours_saturday` | `null` | undertime (Sat treated as non-workday when null) |
| `hours_saturday_text` | `""` | print |
| `grace_minutes` | `0` | undertime |
| `noon_cutoff` | `"12:00"` | slot suggestion |
| `auto_weekend_label` | `true` | print |
| `remark_across_row` | `false` | print |
| `allow_self_edit` | `false` | entries API |
| `punch_ip_allowlist` | `[]` (CIDR strings) | punch API |
| `lockout` | `{"max":5,"seconds":60}` | auth |
| `idle_logout_seconds` | `{"employee":30,"admin":900}` | SPA + session |

**Why both `punches` and `dtr_entries`:** `punches` is the append-only proof of when each button was pressed; `dtr_entries` is the editable monthly view that prints. An admin correction changes `dtr_entries` and the audit log, never `punches`. If a printed time doesn't match a raw punch, the audit log explains why.

---

## 4. Authentication & security

### PIN storage
- Employee PIN (2 digits) and admin PIN (6 digits) are both stored as
  `pin_lookup = HMAC_SHA256(PIN_PEPPER, role + ':' + pin)`. Deterministic → allows a UNIQUE index and O(1) lookup with no username.
- `PIN_PEPPER` is a 32-byte secret in `.env`, not in the DB. If only the DB file leaks, the PINs can't be brute-forced offline without it. (With only 100 possible employee PINs, plain bcrypt hashing adds nothing; the pepper is what protects them.)
- Admin additionally stores `pin_hash = scrypt(pin)` and verifies it after the lookup.
- First run: if no admin exists, the server prints a one-time setup URL to the console where the first admin PIN is set.

### Login
`POST /api/auth/login { pin, mode: 'employee'|'admin' }`
1. Check `login_attempts` for client key. If `locked_until_utc > now` → `429 {retryAfter}`.
2. Validate format: employee `^\d{2}$`, admin `^\d{6}$`.
3. Look up by `pin_lookup`, `is_active = 1`, matching role.
4. Fail → `failures++`; on reaching `lockout.max` set `locked_until`. Return `401`.
5. Success → reset failures, `req.session.regenerate()`, store `{userId, role}`; cookie `HttpOnly; SameSite=Strict; Secure` (when HTTPS).

### Authorization middleware
- `requireAuth`, `requireRole('admin')`.
- `ownOrAdmin(req.params.userId)` for read routes.
- Punch route checks `punch_ip_allowlist` (CIDR match on `req.ip`, with `trust proxy` set only if behind a known proxy).

### Other controls
- CSRF: `SameSite=Strict` cookie + require `Content-Type: application/json` on mutations (forms cannot send it cross-site without CORS preflight).
- Helmet default headers; CSP `default-src 'self'`.
- Server-side idle expiry: `rolling` session with `maxAge` per role.
- All times from server: `time.now()` uses `Intl.DateTimeFormat('en-PH', {timeZone:'Asia/Manila'})`. Client never sends a timestamp for punches.

---

## 5. Business logic (`src/dtr.js`, pure functions)

### 5.1 Slot suggestion
```js
// entry: {am_in, am_out, pm_in, pm_out}, now: 'HH:MM', cutoff: '12:00'
function suggestSlot(e, now, cutoff) {
  if (now < cutoff) {
    if (!e.am_in)  return 'am_in';
    if (!e.am_out) return 'am_out';
  } else {
    // came in this morning, still on AM, within 90 min after cutoff → this is the lunch-out
    if (e.am_in && !e.am_out && m(now) - m(cutoff) <= 90) return 'am_out';
    if (!e.pm_in)  return 'pm_in';               // also covers afternoon-only half day
    if (!e.pm_out) return 'pm_out';
  }
  return ['am_in','am_out','pm_in','pm_out'].find(s => !e[s]) ?? null;
}
```
The suggestion only highlights a button; the user can still tap any empty slot.

### 5.2 Punch rules (`POST /api/punch {slot}`)
1. Slot must be empty for today's entry → else `409 already_recorded`.
2. Last punch by this user < 120 s ago → `409 too_soon`.
3. Ordering sanity: the new time must be ≥ any filled earlier slot (`am_in ≤ am_out ≤ pm_in ≤ pm_out`) → else `422 out_of_order` (admin can still fix it).
4. In one transaction: insert into `punches`, upsert `dtr_entries` slot.

### 5.3 Undertime
```js
function undertimeMinutes(entry, hours, graceMin, isWorkday) {
  if (entry.undertime_override_min != null) return entry.undertime_override_min;
  if (entry.remark_code) return null;                 // remark replaces undertime
  if (!isWorkday) return null;
  const s = ['am_in','am_out','pm_in','pm_out'];
  if (s.some(k => !entry[k])) return null;            // incomplete → blank + flagged
  const late = (actual, sched) => Math.max(0, m(actual) - m(sched) - graceMin);
  const early = (actual, sched) => Math.max(0, m(sched) - m(actual));
  return late(entry.am_in, hours.amIn) + early(entry.am_out, hours.amOut)
       + late(entry.pm_in, hours.pmIn) + early(entry.pm_out, hours.pmOut);
}
```
- Grace applies to arrivals only. If your agency applies it differently, change it here.
- Printed as `Hours = floor(u/60)` (blank if 0), `Minutes = u % 60` (blank if 0).
- **Total** = sum of non-null values for the month.
- Workday = Mon–Fri, plus Saturday if `hours_saturday` is set, and the day has no `HOLIDAY` remark.

### 5.4 Month builder (used by screen and print)
`buildMonth(userId, 'YYYY-MM') → { user, monthName, year, days:[31 rows], totalMin, settings }`
Each row: `{ day, inMonth, weekday, am_in, am_out, pm_in, pm_out, undertime:{h,m}|null, remark:{code,text}|null, render: 'times'|'weekend'|'remark'|'remark_across'|'blank'|'incomplete' }`.
Days 29–31 that don't exist in the month are `inMonth:false` and printed as empty rows (as the paper form does).

### 5.5 Time display
Stored as 24h `HH:MM`; printed as 12h without AM/PM (`13:05 → 1:05`), because the column header already says A.M./P.M.

---

## 6. REST API

All JSON. `E` = employee (self), `A` = admin. Errors: `{ error: 'code', message }`.

| Method | Path | Who | Body / Query | Result |
|--------|------|-----|--------------|--------|
| POST | `/api/auth/login` | — | `{pin, mode}` | `{user:{id,full_name,role}}` |
| POST | `/api/auth/logout` | E A | — | `204` |
| GET  | `/api/me` | E A | — | current user + server time |
| GET  | `/api/time` | — | — | `{now:'2026-10-07T07:58:12+08:00'}` (kiosk clock sync) |
| GET  | `/api/punch/today` | E | — | today's entry + `suggested` slot |
| POST | `/api/punch` | E | `{slot}` | updated entry |
| GET  | `/api/users/:id/month` | E(self) A | `?month=2026-10` | month builder output |
| PATCH| `/api/entries/:userId/:date` | A (E if `allow_self_edit`) | `{am_in?,am_out?,pm_in?,pm_out?,undertime_override_min?, reason}` | entry |
| DELETE| `/api/entries/:userId/:date` | A | `{reason}` | `204` |
| POST | `/api/remarks` | E(self) A | `{userId, from, to?, code, text?, skipWeekends}` | `{batchId, dates:[...]}` |
| DELETE| `/api/remarks/:userId/:date` | E(self) A | `?batch=1` removes whole range | `204` |
| GET  | `/api/remark-types` | E A | — | list |
| PUT  | `/api/remark-types` | A | list | list |
| GET  | `/api/users` | A | `?active=1` | list (no PIN data) |
| POST | `/api/users` | A | `{full_name, position?, pin, incharge_name?, incharge_title?}` | user |
| PATCH| `/api/users/:id` | A | fields, `pin?`, `is_active?` | user |
| GET  | `/api/users/pin-suggest` | A | — | `{pin:'47'}` (random unused) |
| GET  | `/api/settings` | A | — | all settings |
| PUT  | `/api/settings` | A | partial settings | all settings |
| PUT  | `/api/admin/pin` | A | `{current, next}` | `204` |
| GET  | `/api/audit` | A | `?user=&from=&to=&page=` | paged list |
| GET  | `/api/backup` | A | — | `dtr-YYYYMMDD.db` download |
| GET  | `/print` | E(self) A | `?user=ID|all&month=YYYY-MM` | HTML page (A4) |

Validation highlights: `pin` unique per role (`409 pin_taken`); employee PIN `^\d{2}$`; time `^([01]\d|2[0-3]):[0-5]\d$`; remark range ≤ 31 days; `reason` required (min 3 chars) on admin edits/deletes; `full_name` ≤ 40 chars (fits the name line).

---

## 7. Print specification (CS Form 48 on A4)

Implemented and verified in `mockup/index.html` (screen 10): renders as **exactly one A4 page** in Chromium.

| Item | Value |
|------|-------|
| Page | `@page { size: A4 portrait; margin: 0 }` — 210 × 297 mm |
| Sheet padding | 8 mm top/bottom, 7 mm left/right |
| Copies | 2 identical copies side by side, `gap: 8 mm` → each ≈ 94 mm wide |
| Font | Arial/Helvetica; title 11 pt bold; body 7–7.5 pt; certification 6.3 pt italic |
| Grid rows | 31 day rows × 5 mm, header 2 rows, Total row |
| Column widths | Day 9% · AM Arr 14% · AM Dep 14% · PM Arr 14% · PM Dep 14% · UT Hrs 17.5% · UT Min 17.5% |
| Name | uppercase, bold, centred on underline, `(Name)` caption |
| Month / Year | month name uppercase in the long cell; year in the short cell (both from `?month=`) |
| Official hours | `hours_regular_text`, `hours_saturday_text` |
| Remark cell | `colspan=2` over Hours+Minutes, 5.2 pt, wraps ≤ 2 lines |
| Remark across | (setting) `colspan=4` over AM/PM columns, undertime cells blank |
| Weekend label | `colspan=4` "SATURDAY"/"SUNDAY" on empty weekend rows |
| Signatory | per-user override → else settings; name bold uppercase over underline, title, italic label |
| Batch | `?user=all` → one `.a4` per active employee with `page-break-after: always` |
| Browsers | Chrome / Edge (tested). Users print with "Margins: None", "Scale: 100%"; the page shows a reminder banner (hidden in print). |

---

## 8. Frontend (SPA)

- `public/app.js`: hash router `#/login`, `#/admin-login`, `#/clock`, `#/my?month=`, `#/admin/users`, `#/admin/records`, `#/admin/settings`, `#/admin/audit`, `#/admin/print`.
- On load: `GET /api/me` → route by role, else login.
- Kiosk clock: `GET /api/time` once and then ticks locally, re-syncing every 5 min, so the displayed time matches the server.
- Idle timer resets on pointer/key events; calls `/api/auth/logout` at timeout.
- Print buttons open `/print?...` in a new tab and call `window.print()` after load.
- Accessibility: keypad buttons ≥ 56 px, physical keyboard digits supported, focus states visible, toast messages in an `aria-live` region.
- Responsive: the clock and pad work on a phone; admin screens collapse the side menu under 700 px.

---

## 9. Deployment

**Option A — Office Windows PC (recommended for one branch)**
1. Install Node 22 LTS.
2. Copy app folder → `npm ci --omit=dev`.
3. Copy `.env.example` → `.env`, set `SESSION_SECRET`, `PIN_PEPPER` (`node -e "console.log(crypto.randomBytes(32).toString('hex'))"`), `PORT=8080`.
4. `nssm install DTRV "C:\Program Files\nodejs\node.exe" "C:\dtrv\src\server.js"` → start service.
5. Give the PC a fixed LAN IP; open firewall for 8080 on the private network only. Bookmark `http://<ip>:8080` on the kiosk.
6. Set Windows time sync on (NTP).

**Option B — Linux VPS** (if staff must clock in from outside the LAN): systemd unit + Caddy for automatic HTTPS. Turn on the IP allowlist or remove it on purpose.

**Backups:** `jobs/backup.js` runs at 23:30 Asia/Manila using `db.backup()` (safe while running), keeps 30 days. Copy `backups/` to a USB/cloud folder weekly. Restore = stop service, replace `data/dtr.db`, start.

---

## 10. Testing

| Level | What | Tool |
|-------|------|------|
| Unit | `undertimeMinutes` (on time, late, early out, grace, override, remark, incomplete, Saturday), `suggestSlot` (morning, lunch, afternoon, half-day), month builder (Feb 28/29, 30/31-day months, weekends) | `node:test` |
| API | login success/fail/lockout; PIN uniqueness; punch twice → 409; punch too soon; employee can't PATCH another user; admin edit writes audit row; range remark skips weekends; batch delete | `supertest` + `:memory:` DB |
| Print | `/print` renders exactly 1 PDF page at A4; visual snapshot vs approved PNG; long name (40 chars) doesn't wrap; `?user=all` → N pages | Playwright `page.pdf()` |
| Manual UAT | One full month with real staff on a test DB; compare totals with hand computation for 3 employees | checklist |

Acceptance for go-live: all of the above green + BM signs off one printed month against paper.

---

## 11. Build order (maps to plan phases)

1. **P1**: `db.js` + migration → `auth.js` (login/lockout/first-admin) → `punch.routes` → `users.routes` → `settings.routes` → `dtr.js` month builder (times only) → `/print` → SPA login/clock/admin users/settings/print.
2. **P2**: remarks API + UI → undertime in builder/print → admin records grid + edits → audit log + viewer.
3. **P3**: batch print, backup job + download, IP allowlist, idle-logout polish, Playwright print test in CI.

Rough effort for one developer: P1 ≈ 3–4 days, P2 ≈ 2–3 days, P3 ≈ 1–2 days.

---

## 12. Open questions for the owner

1. Does your agency use a **grace period** for late arrival, and does undertime include lunch overstay (late PM in)? (Current spec: yes, lunch overstay counts.)
2. Are **Saturdays** ever workdays?
3. Should leave/holiday print **in the Undertime column** (your request) or **across the row** (common practice)? Both supported; default follows your request.
4. Will staff clock in **only from the office**? If yes, turn on the IP allowlist. It's the most effective protection against the 2‑digit PIN weakness.
