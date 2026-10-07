# DTRV — Daily Time Record Web App: Product Plan (v3)

Output: **Civil Service Form No. 48 (Daily Time Record)** on **A4**, two copies side by side.
Purpose: **personal records only.** It does **not** replace the office biometric, which stays the official record. Each employee keeps their own copy of their times here, matches it to the biometric when needed, and prints their DTR.

Scale: **one Dexie Cloud user (the admin)**. Employees are **records** in the database, not accounts.

Prototype: [`../mockup/index.html`](../mockup/index.html) — fully clickable, style **Rail · dark** (variation 3 of the B + C set), runs in the browser with demo data. On a phone it opens full screen.

### v3 decisions (2026-10-07)
| Topic | Decision |
|-------|----------|
| Visual style | **Rail · dark** (B + C variation 3): dark screen, centred big clock, 4 coloured slot tiles in one row showing today's times, round dialer, bottom-sheet confirmation, calendar My DTR |
| Mobile spacing | Content respects the phone's **safe areas**: nothing under the notch/status bar or the home/gesture bar. Layout steps down for short phones (iPhone SE) so the keypad never gets cut off |
| Holiday | **Quick button** on the main screen next to Leave / Day-off / Others |
| Users | **1 Dexie Cloud user** (admin). No per-employee or per-office accounts |
| Hosting | Vercel (personal use, so the free Hobby plan is fine) + Dexie Cloud |

---

## 1. What changed from v1 (owner decisions, 2026-10-07)

| Topic | v1 | v2 (now) |
|-------|----|----------|
| Employee login | 2-digit PIN | **3-digit employee code** typed on a keypad (2-digit employee numbers start with 0: 47 → `047`). Records automatically on the 3rd digit. No separate PIN. |
| Recording | Log in → pick slot → confirm | Pick one of **4 toggles** (AM IN, AM OUT, PM IN, PM OUT) → type 3-digit code → **recorded instantly**; notification has **Undo** for a mistyped code |
| Correcting time | Admin only | **Employee taps the notification** (or a day in My DTR) to change the time, e.g. to match the biometric. Changes are marked "edited". |
| Remarks | Separate screen | **On the main screen**: *On leave · Day-off · Others…* chips, plus in My DTR |
| Undertime column | Computed hours/minutes | **Remarks only.** No numbers. Total row blank. |
| "Regular days" / "Saturdays" on print | Office hours text | **Blank** lines |
| Weekends on print | "SATURDAY"/"SUNDAY" label | Label **only if no time recorded**; if the employee worked, the actual times print |
| Working hours | Used for undertime | Used **only for late alerts and the monthly late count**. Admin sets **fixed** or **flexi-time**, office-wide with per-employee override |
| IP restriction | Optional | **Removed** |
| Admin | 6-digit PIN | Unchanged |

---

## 2. Roles

| Role | Identifies with | Can do |
|------|-----------------|--------|
| **Employee** | 3-digit code `000`–`999`, unique, stored as text so the leading 0 is kept | Record the 4 daily times; change their own times; add/remove remarks (single day or date range); view their month with late count; print own DTR |
| **Admin** | 6-digit PIN | Dashboard of lates per employee; add/edit/deactivate employees; set office working hours (fixed / flexi) and per-employee overrides; set signatory; edit any record; print any or all DTRs |

---

## 3. Employee app (style Rail · dark, phone-first)

### 3.1 Record screen
```
┌──────────────────────────────┐
│ ░░ status bar / notch ░░     │  ← safe area top (never used for content)
│ ● SYNCED                 ⚙   │  ← ⚙ = admin (PIN)
│      WED · OCT 7 · 2026      │
│          8:20 AM             │  ← centred, large
│ Today · JUAN A. DELA CRUZ  not you?
│ ┌────┐┌────┐┌────┐┌────┐     │
│ │ ☀  ││ 🍴 ││ ☕ ││ ⌂  │     │  ← 4 tiles in a row: orange / yellow / teal / indigo
│ │AM  ││AM  ││PM  ││PM  │     │
│ │IN  ││OUT ││IN  ││OUT │     │
│ │7:58││Lunch│Back││Home│     │  ← recorded time replaces the subtitle
│ └────┘└────┘└────┘└────┘     │
│ (Leave)(Day-off)(Holiday)(Others)
│          ●  ●  ○             │  ← 3 glowing dots
│   CODE TO RECORD AM OUT      │
│                              │
│      (1)   (2)   (3)         │  ← round dialer, pinned to the bottom
│      (4)   (5)   (6)         │
│      (7)   (8)   (9)         │
│    My DTR  (0)    ⌫          │
│ ░░ home / gesture bar ░░     │  ← safe area bottom
└──────────────────────────────┘
```
- **Rail shows today's times** of the **last code used on this phone** (remembered on the device; on a personal phone that's you). "not you?" clears it. Typing any other code switches to that person.
- One tile is **pre-selected by time of day** (before 11:00 AM IN · to 12:29 AM OUT · to 1:59 PM IN · after PM OUT). Tap another to change it.
- Type the **3-digit code**: the dots fill and it records **on the 3rd digit**. Unknown code → dots shake red, "Code not found".
- Already recorded → the sheet says "Already done" with the existing time; nothing is overwritten.

### 3.2 Confirmation sheet (slides up from the bottom, dark)
- Coloured slot icon + greeting: *Good morning, Juan!* / *Enjoy your lunch* / *Welcome back* / *Ingat pauwi*
- The time in large digits (56 px)
- AM IN late → **⚠ Late by 20 min · 3rd late this October** with a lateness bar; on time → **✓ On time · 2 lates this month**
- Flexi → **Your time out today: 5:20 PM**
- **Today's progress**: 4 segments (AM IN 8:20 · AM OUT — · PM IN — · PM OUT —)
- Buttons: **Undo** (only right after recording) · **Change time** (to match the biometric) · **Done**
- Closes by itself after **5 s** so the next person can type; touching the sheet keeps it open.

### 3.3 Quick buttons: Leave · Day-off · Holiday · Others
Tap one → type the code → sheet with type (pre-filled), From/To (default today), "Skip Sundays", and for **Others** the text to print (max 24 chars). Save → top message "Saved · HOLIDAY · 1 day".
Printed text: Leave → `ON LEAVE`, Day-off → `DAY-OFF`, **Holiday → `HOLIDAY`**, Others → the typed text.

### 3.4 My DTR
Tap **My DTR** → type the code:
- Month switcher, name, code and schedule.
- **Big late number** card (orange when there are lates): "2 lates in October · 16 min total · 6 days present · 1 remark".
- **Calendar**: green on time, orange late (with a dot), purple remark, red holiday, yellow incomplete, faded weekends; today outlined.
- Tap a day → detail under the calendar: the 4 times as coloured chips, remark/late badge, ✎ if edited, **Edit** (times + remark, or delete the day).
- **Print DTR** → print preview for the month. **No admin PIN needed** for your own DTR.

### 3.5 Mobile spacing rules
- `viewport-fit=cover`; top padding = `safe-area-inset-top + 10px`, bottom = `safe-area-inset-bottom + 14px` (min 16px each when the phone reports 0). Sheets add the bottom safe area too.
- Height steps for the round dialer: > 800 px keys 66 px · ≤ 800 px keys 58 px · ≤ 720 px keys 50 px (tile subtitles hidden) · ≤ 620 px keys 44 px.
- Tested at 568, 640, 664, 701, 740, 780, 844 and 932 px heights: the keypad always ends 30 px above the bottom edge (16 px safe area + 14 px padding).

---

## 4. Admin (desktop)

| Page | Contents |
|------|----------|
| **Dashboard** | Month picker; tiles: employees, days present, **lates this month**, **most lates**; table per employee: schedule, present, **lates**, late minutes, remarks, Print |
| **Employees** | List; add/edit: 3-digit code (unique; app suggests `0`+number for 2-digit employee numbers), full name as printed, position, working hours = *Office default / Custom fixed / Custom flexi*; deactivate (never delete — old DTRs stay printable) |
| **Working hours** | **Fixed**: time in (late after). **Flexi**: earliest in, latest in (late after), required hours/day. Both: lunch break, grace minutes, "also count late after lunch" (PM IN after lunch end). Live preview sentence of the rule. |
| **Signatory** | Name (AL MARTIN A. MENES), title (Acting Branch Manager), label (In Charge); change admin PIN |
| **Print DTR** | Employee or **All employees**, month (defaults to current), Print / Save PDF |
| **Records** (via employee row) | Same day editor as My DTR, for any employee |

---

## 5. Lateness rules

- **Late** = AM IN later than the limit **+ grace**. Limit = *time in* (fixed) or *latest time in* (flexi).
- Late minutes are counted from the limit (in at 8:20 with an 8:00 limit = 20 min, even with a 5-min grace).
- Optional: PM IN later than lunch end + grace also counts. A day with both counts as **one** late day; the minutes add up.
- **Late count** for a month = number of days with late > 0. Shown in the notification, My DTR and the dashboard.
- Lateness uses the **final** time, so a time corrected to match the biometric updates the count. Edited days carry an *edited* badge.
- Flexi expected time out = max(arrival, earliest in) + required hours + lunch length.
- Nothing about lateness is printed on the DTR.

---

## 6. Print rules (CS Form 48, A4)

- Name = employee's full name; month + year from the selected month (defaults to current).
- **Regular days** and **Saturdays**: blank underlines.
- Rows:
  1. Any time recorded → print the 4 times (`8:06`, `12:03`, `12:53`, `5:00` — no AM/PM). Remark (if any) goes in Undertime.
  2. No times, has remark → time cells blank, remark in Undertime.
  3. No times, no remark, Saturday/Sunday → `SATURDAY` / `SUNDAY` across the 4 time cells.
  4. Otherwise blank.
- **Undertime** column: only the remark text, merged across Hours + Minutes. Never numbers.
- **Total** row: blank.
- Signatory from settings. Two identical copies side by side on one A4 page.

---

## 7. Phases

| Phase | Scope | Done when |
|-------|-------|-----------|
| **P1** | DB, employees, Record screen + instant record, notification + change time, print | An employee records a month on their phone and prints a correct DTR |
| **P2** | Remarks (chips + ranges), My DTR with edits, working hours (fixed/flexi), late badges + counts, admin dashboard | Late counts match a hand count for 3 employees over a month |
| **P3** | Print all employees, backup/restore, install guide, PWA "Add to Home Screen" | Admin prints everyone in one go; restore tested |

---

## 8. Risks (accepted by owner unless noted)

| Risk | Effect | Handling |
|------|--------|----------|
| 3-digit codes aren't secret → anyone can record or edit for another person | Wrong entries | **Accepted.** Personal records only; the biometric is the official record. Every change keeps the original time and marks the day *edited*. |
| One shared Dexie Cloud user on every device | Admin PIN is an app lock, not real security | **Accepted** for personal use. Admin screens ask for the 6-digit PIN. |
| Phone clock vs server clock | Different times | Time always comes from the **server**; employee can correct it via the notification. |
| Employees edit times to avoid lates | Late count understates | Edited days are visible to admin (badge + original time kept). |
| Printed form says "made daily at the time of arrival" | Edited times are certified as daily | The employee signs it; that's their responsibility. Out of app scope. |
| Single SQLite file | Data loss | Nightly backup, admin download. |
