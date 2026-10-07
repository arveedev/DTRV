# DTRV — Daily Time Record Web App: Product Plan

Output target: **Civil Service Form No. 48 (Daily Time Record)**, printed on **A4**, two copies side by side (as in the reference image).

---

## 1. Decisions that deviate from (or tighten) the original request

| # | Request | Decision | Why |
|---|---------|----------|-----|
| D1 | Login is a 2‑digit PIN | Kept, but PIN = identity, so PINs are **unique**, a **name confirmation** step is shown before each punch, **lockout after 5 wrong PINs per device for 60 s**, and an optional **office IP allowlist** for punching. | 100 possible PINs; without these anyone can punch for anyone in seconds. |
| D2 | Records can be updated or deleted | **Admin only** edits/deletes time entries. Employees may only punch and add/remove remarks on their own days. Every change is written to an **audit log**. Setting `allow_self_edit` (default OFF) lets employees edit their own times. | CS Form 48 certifies the record "was made daily at the time of arrival and departure". Freely editable records make that certification false. |
| D3 | Month and year automatic | Month/year **default** to the current month, but can be changed in the print screen. | DTRs are normally printed *after* the month closes (e.g. print September on Oct 1). |
| D4 | Admin uses a longer PIN | Admin PIN is **6 digits**, entered from a separate "Admin" button on the login screen. | The 2‑digit pad auto-submits after 2 digits, so a 6‑digit PIN can't share the same pad. |
| D5 | Time in / time out "simple" | One screen, **4 big buttons** (AM In, AM Out, PM In, PM Out). The app **highlights the expected next one**, filled slots are disabled. | A single "next" toggle breaks on half-days, forgotten punches and lunch skips; 4 buttons with a suggestion stays simple and never guesses wrong silently. |
| D6 | Time source | **Server clock** (Asia/Manila), never the browser's clock. | Browser time is trivially changed by the user. |

---

## 2. Users and roles

| Role | Login | Can do |
|------|-------|--------|
| **Employee** | 2‑digit PIN | Time in/out for today; view own month; add/remove remarks on own days (single day or date range); print own DTR. |
| **Admin** | 6‑digit PIN | Everything above for **any** employee; add/edit/deactivate employees and reset PINs; edit/delete any time entry; manage signatories & office hours; batch‑print all DTRs for a month; view audit log; download backup. |

Admins do not have a DTR of their own. If the admin also needs a DTR, they get a separate employee account.

---

## 3. Features

### 3.1 Login (kiosk style)
- Numeric keypad, 2 dots. Auto-submits on 2nd digit.
- "Admin" link → 6‑dot keypad.
- Wrong PIN → shake + "Invalid PIN". 5 failures → keypad disabled 60 s.
- Session auto-logs out after **30 s of inactivity** on the clock screen (it's a shared device), 15 min for admin.

### 3.2 Clock screen (employee)
- Big greeting: **"Juan Dela Cruz"**, live server time, today's date.
- 4 buttons: **AM IN · AM OUT · PM IN · PM OUT**. Filled ones show the recorded time and are disabled. Suggested next one is highlighted.
- Tap → confirm dialog "Record **AM IN** at **7:58 AM** for **Juan Dela Cruz**?" → Saved toast → auto logout after 3 s.
- Guard: a punch within 2 minutes of the previous punch is rejected ("Already recorded").
- Link: "My records / Remarks / Print".

### 3.3 My records (employee)
- Month table (like the DTR) for current month, month switcher.
- Per day: times, computed undertime, remark.
- "Add remark" → choose date or date range, remark type, optional note.

### 3.4 Remarks (goes in the Undertime column)
Remark types (admin can edit the list):

| Code | Printed text (default) | Typical use |
|------|------------------------|-------------|
| `LEAVE` | ON LEAVE | Vacation/sick leave, multi-day |
| `DAYOFF` | DAY-OFF | Scheduled off |
| `OB` | OFFICIAL BUSINESS | Field work |
| `HOLIDAY` | HOLIDAY | Regular/special holiday |
| `NO_OUT` | NO TIME-OUT | Forgot to punch out |
| `NO_LUNCH` | NO LUNCH PUNCH | Didn't punch AM out / PM in |
| `OTHER` | *(free text)* | Anything else |

Rules:
- A remark **replaces the undertime hours/minutes** for that day on print (merged across both undertime cells, small font, wraps up to 2 lines, max 24 chars).
- Optional note (free text) is stored but **not printed** unless it's type `OTHER`.
- Range remarks (e.g. Oct 6–10 ON LEAVE) create one remark per day, linked by a `batch_id` so they can be removed together.
- Days with a remark are **excluded from the undertime total**.
- Setting `print_remark_across_row` (default OFF): for whole-day remarks (LEAVE, DAYOFF, HOLIDAY, OB) print the remark across the AM/PM columns instead of in Undertime. Many offices print leave this way; OFF follows the request exactly.
- Saturdays/Sundays: setting `auto_weekend_label` (default ON) prints "SATURDAY"/"SUNDAY" across the time columns on empty weekend days.

### 3.5 Undertime computation
- Official hours (settings): Regular days AM 8:00–12:00, PM 1:00–5:00; Saturdays optional.
- Per day: `late AM` (am_in − 8:00 if >0) + `early AM out` (12:00 − am_out if >0) + `late PM` + `early PM out`.
- A missing punch on a workday with no remark → undertime cells left **blank** and the day flagged in yellow on screen ("incomplete"). The system does not invent undertime for missing punches; a remark is the fix.
- Grace period setting (default 0 min).
- Total row = sum of all computed days, shown as hours + minutes.
- Per-day override: admin can type undertime manually (e.g. agency computes differently); overrides are audit-logged.

### 3.6 Admin: Employees
- List: name, position, PIN (masked, "reset" button), status, supervisor override.
- Add: full name (as printed on DTR, e.g. "JUAN A. DELA CRUZ"), position (optional), PIN (auto-suggest an unused 2‑digit PIN or choose), optional per-employee "In Charge" override.
- Deactivate (never hard-delete — their old DTRs must remain printable).

### 3.7 Admin: Records
- Pick employee + month → editable grid (same layout as DTR).
- Click a cell → edit time / clear it. Row menu → delete day, add remark, override undertime.
- Each save asks for a short reason (stored in audit log).

### 3.8 Admin: Settings
- **Signatories**: In-charge name (e.g. AL MARTIN A. MENES), title (Acting Branch Manager), label under it ("In Charge").
- **Office hours**: Regular days text + times, Saturdays text + times (blank allowed).
- Grace minutes, noon cutoff (used to suggest AM vs PM), auto weekend label, print remark across row, allow self-edit, IP allowlist.
- Remark types list.
- Admin PIN change.

### 3.9 Print DTR
- Inputs: employee (admin: one or **all active**), month (default current), year (auto from month picker).
- Renders A4 portrait page: **two identical copies side by side**, CS Form 48 layout.
- Name = employee name; "For the month of **October**" + year cell **2026**.
- Browser print (Ctrl+P) → "Save as PDF" or paper. CSS `@page { size: A4; margin: 0 }`.
- Batch print = one A4 page per employee.

### 3.10 Audit log & backup (admin)
- Every create/update/delete of entries, remarks, users, settings: who, when, before, after, reason.
- "Download backup" → the SQLite file. Nightly automatic copy to `backups/` (keep 30).

---

## 4. User flows

**Daily punch**
`Login pad → enter 2 digits → Clock screen (name shown) → tap highlighted button → confirm → saved → auto logout`

**Forgot to time out yesterday**
`Employee: My records → yesterday row (yellow) → Add remark → NO TIME-OUT → saved` *or* `Admin: Records → set PM OUT with reason`

**Leave for a week**
`My records → Add remark → range Oct 6–10 → ON LEAVE → saved (5 days)`

**Month end**
`Admin login → Print → All employees → September 2026 → Print`

---

## 5. Delivery phases

| Phase | Scope | Done when |
|-------|-------|-----------|
| **P1 Core** | DB schema, PIN login + lockout, clock screen, admin add employees, settings (signatories/hours), print single DTR | An employee can punch for a month and the admin prints a correct A4 DTR |
| **P2 Corrections** | Remarks (single + range), undertime calc, admin record editing, audit log | Leave/no-out cases print correctly; totals match hand computation |
| **P3 Operations** | Batch print, backup/restore, IP allowlist, inactivity logout tuning | Admin prints all DTRs in one go; backup restores cleanly |

---

## 6. Out of scope (explicitly)
- Biometrics, face capture, GPS.
- Overtime, payroll, leave-credit balances.
- Flexi-time / multiple shifts (single office schedule only; add later if needed).
- Multi-branch / multi-tenant.

---

## 7. Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Buddy punching via guessed 2‑digit PIN | False attendance | D1 measures; audit log; optional IP allowlist; admin reviews unusual punch times |
| PC clock wrong / power outage on server | Wrong times | Server syncs NTP; health page shows server time; admin can correct with logged reason |
| Print layout differs between browsers | Misaligned form | Target Chrome/Edge; layout in mm; Playwright PDF snapshot test |
| Data loss (single SQLite file) | Lost records | Nightly backups + manual download |
| 100‑user ceiling of 2‑digit PIN | Can't add user #100 | Fine for a branch office; documented hard limit |
