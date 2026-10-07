# DTRV — Daily Time Record Web App: Product Plan (v2)

Output: **Civil Service Form No. 48 (Daily Time Record)** on **A4**, two copies side by side.
Purpose: **employees' personal time recording**. The office biometric stays the official record. This app is each employee's own copy, which they can match to the biometric.

Prototype: [`../mockup/index.html`](../mockup/index.html) — fully clickable, runs in the browser with demo data.

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

## 3. Employee app (phone-first, works on a shared PC too)

### 3.1 Record screen — the whole app for 95% of uses
```
┌────────────────────────────┐
│ Wednesday, October 7, 2026 │
│ 7:58 AM          (big)     │
├─────────────┬──────────────┤
│  AM IN  ●   │   AM OUT     │   ← 4 toggles; one pre-selected by time of day
│  PM IN      │   PM OUT     │
├────────────────────────────┤
│ Not working today?         │
│ [On leave] [Day-off] [Others…]
├────────────────────────────┤
│ 3-digit employee code [0 2 4]│
│  1  2  3                   │
│  4  5  6                   │
│  7  8  9                   │
│  ⌫  0  [Record]            │
│ My DTR & lates     Admin › │
└────────────────────────────┘
```
- **Pre-selected toggle** by time of day: before 11:00 → AM IN, 11:00–12:29 → AM OUT, 12:30–13:59 → PM IN, from 14:00 → PM OUT. One tap changes it.
- **Record**: type the 3-digit code. On the **3rd digit** it saves immediately with the server time (no button needed), then the field clears for the next person.
- Unknown code → field shakes, "Not found", clears.
- Mistyped someone else's code → the notification shows *their* name; tap **Not you? Undo** (9 s) to remove the record.
- Slot already filled today → notification "Already recorded 7:58 AM — tap to change". The time is **not** overwritten.

### 3.2 Notification (drops from the top, stays 9 s)
- Line 1: `Recorded ✓ · JUAN A. DELA CRUZ`
- Line 2: `AM IN · 8:20 AM`
- Badges:
  - AM IN late → **⚠ Late 20 min** · **3rd late this October**
  - AM IN on time → **On time** · `2 lates this month`
  - Flexi employee on AM IN → **Flexi · out at 5:20 PM** (expected time out)
  - Previously edited → **edited**
- **"Not you? Undo"** removes the record just made.
- **"Tap to change the time ›"** opens a time picker (bottom sheet) with Save / Clear. Saving re-checks lateness and re-shows the notification.

### 3.3 Remarks from the main screen
Tap **On leave**, **Day-off** or **Others…** → type the 3-digit code → sheet:
- Type (pre-filled from the chip), text to print (Others only, max 24 chars, e.g. `NO TIME-OUT`, `OB`, `HOLIDAY`, `SICK LEAVE`)
- From / To dates (default today), "Skip Sundays in the range" (on by default)
- Save → notification "ON LEAVE · 3 days"

### 3.4 My DTR & lates
Tap **My DTR & lates** → type the 3-digit code:
- Header: name, employee no., schedule (e.g. "Flexi 7:00–9:00").
- Month switcher.
- 3 stat cards: **Days present**, **Lates (count · total minutes)**, **Remarks**.
- Day list: times, badges *Late 12m*, remark, *Incomplete* (past day with a missing time and no remark), *edited*.
- Tap a day → edit all 4 times + remark, or **Delete day**.
- **Print DTR** → print preview for that month.

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
| 3-digit codes aren't secret → anyone can record or edit for another person | Wrong entries | **Accepted.** Personal-use tool; the biometric is the official record. Every change keeps the original time and marks the day *edited*. |
| Phone clock vs server clock | Different times | Time always comes from the **server**; employee can correct it via the notification. |
| Employees edit times to avoid lates | Late count understates | Edited days are visible to admin (badge + original time kept). |
| Printed form says "made daily at the time of arrival" | Edited times are certified as daily | The employee signs it; that's their responsibility. Out of app scope. |
| Single SQLite file | Data loss | Nightly backup, admin download. |
