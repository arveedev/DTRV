# DTRV — Daily Time Record Web App: Product Plan (v3)

Output: **Civil Service Form No. 48 (Daily Time Record)** on **A4**, two copies side by side.
Purpose: **personal records only.** It does **not** replace the office biometric, which stays the official record. Each employee keeps their own copy of their times here, matches it to the biometric when needed, and prints their DTR.

Scale: **one Dexie Cloud user (the admin)**. Employees are **records** in the database, not accounts.

Prototype: [`../mockup/index.html`](../mockup/index.html) — fully clickable (employee **and** admin), style **Rail · dark**, runs in the browser with demo data. On a phone it opens full screen.

### v3 decisions (2026-10-07)
| Topic | Decision |
|-------|----------|
| Visual style | **Rail · dark** (B + C variation 3): dark screen, centred big clock, 4 coloured slot tiles in one row showing today's times, round dialer, bottom-sheet confirmation, calendar My DTR |
| Mobile spacing | Content respects the phone's **safe areas**: nothing under the notch/status bar or the home/gesture bar. Layout steps down for short phones (iPhone SE) so the keypad never gets cut off |
| Holiday | **Quick button** on the main screen next to Leave / Day-off / Others |
| Users | **1 Dexie Cloud user** (admin). No per-employee or per-office accounts |
| Hosting | Vercel (personal use, so the free Hobby plan is fine) + Dexie Cloud |
| Time source | **The phone's own clock** (device time). No server time |
| Big keypad | Fills all free space; larger digits |
| Tap a tile = edit | Tapping one of the 4 tiles edits that slot's time for the phone's user |
| Secret admin | A faint ✦ replaces the settings icon |
| Flexi | Affects **clock in & out only**; lunch is identical in fixed and flexi |
| Print | Admin can print **many people at once** |
| One time per slot | Each of AM IN / AM OUT / PM IN / PM OUT can be recorded **once a day**, and **in order** (a slot can't be recorded after a later one). Mistakes are fixed with *Change time* / My DTR, not by recording again |
| Nicknames | Admin sets a **nickname** per person; greetings use it ("Good morning, Juan!") |
| Quiet home screen | No sync indicator, no user name, no "not you". The phone silently remembers its user so the tiles show *their* times |
| Others | A **reason for today** (e.g. field work, where you went). No dates |
| Admin | A **phone screen set** (PIN → Overview · People · Hours · Print · Settings), not a desktop page |
| Motion | Lively animations throughout (see 3.6) |

---

## 1. What changed from v1 (owner decisions, 2026-10-07)

| Topic | v1 | v2 (now) |
|-------|----|----------|
| Employee login | 2-digit PIN | **3-digit employee code** typed on a keypad (2-digit employee numbers start with 0: 47 → `047`). Records automatically on the 3rd digit. No separate PIN. |
| Recording | Log in → pick slot → confirm | Pick one of **4 toggles** (AM IN, AM OUT, PM IN, PM OUT) → type 3-digit code → **recorded instantly**; notification has **Undo** for a mistyped code |
| Correcting time | Admin only | **Employee taps the notification** (or a day in My DTR) to change the time, e.g. to match the biometric. Changes are marked "edited". |
| Remarks | Separate screen | **On the main screen**: *Leave · Day-off · Holiday · Others* pills, plus in My DTR |
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
| **Employee** | 3-digit code `000`–`999` (stored as text so the leading 0 stays) | Record the 4 daily times (once each, in order); change a time; add remarks; see their month, lates and calendar; print their own DTR |
| **Admin** | 6-digit PIN (typed after tapping a **faint ✦** at the top right of the home screen) | Overview of lates; add/edit/deactivate people (code, nickname, full name, position, schedule); working hours (fixed / flexi); signatory; edit any person's days; print any DTR |

---

## 3. Employee app (style Rail · dark, phone-first)

### 3.1 Home (record) screen
```
┌──────────────────────────────┐
│ ░░ status bar / notch ░░     │  ← safe area top
│                          ✦   │  ← faint, almost invisible: opens the admin PIN
│      WED · OCT 7 · 2026      │
│          8:20 AM             │  ← centred, large, device time
│ ┌────┐┌────┐┌────┐┌────┐     │
│ │ ☀  ││ 🍴 ││ ☕ ││ ⌂  │     │  ← 4 tiles: orange / yellow / teal / indigo
│ │AM  ││AM  ││PM  ││PM  │     │
│ │IN  ││OUT ││IN  ││OUT │     │
│ │7:58││Lunch│Back││Home│     │  ← a recorded tile shows its time
│ └────┘└────┘└────┘└────┘     │
│ (Leave)(Day-off)(Holiday)(Others)
│          ●  ●  ○             │  ← 3 dots, nothing else above the keypad
│  [ 1 ]  [ 2 ]  [ 3 ]         │  ← big rounded keys that fill all the free space
│  [ 4 ]  [ 5 ]  [ 6 ]         │
│  [ 7 ]  [ 8 ]  [ 9 ]         │
│  My DTR [ 0 ]    ⌫           │
│ ░░ home / gesture bar ░░     │  ← safe area bottom
└──────────────────────────────┘
```
- **No text above the keypad.** Only the 3 dots; the selected tile and highlighted pill show what the code will do.
- **The phone remembers its user** (the last code typed), silently, so the tiles show *that person's* times for today. Nothing says whose they are. "Reset device" clears it. Typing a different code switches to that person.
- The tile for the **next slot is pre-selected** (by the time of day, and never earlier than what's already recorded).
- Type the **3-digit code**: the dots fill with a pop and a wave, and it records on the 3rd digit. Unknown code → red dots shake, "Code not found".

### 3.2 One time per slot, in order
| Rule | What the user sees |
|------|--------------------|
| A slot already recorded is **locked** | Tile dimmed with its time; tapping it shows *"AM IN is already recorded (8:17 AM)"* with a shake; typing a code with it selected does the same and records nothing |
| A slot **can't be recorded after a later one** | e.g. AM IN after PM OUT → *"Can't record AM IN after PM OUT (8:15 AM)"* |
| Earlier empty slots stay open only if no later slot exists | A forgotten AM OUT can still be recorded before PM IN; once PM IN exists it's locked |
| All four recorded | *"All 4 times are already recorded today"* |
| Fixing a mistake | **Tap a tile** to edit that time (recorded tiles show ✎; so do blocked empty tiles, which open "Add"), or **Change time** on the sheet, or My DTR → day → Edit. Edits must stay in order (AM IN can't be later than AM OUT, etc.) |
Time = **the phone's clock**. If it's wrong, use Change time.

### 3.3 Confirmation sheet (slides up from the bottom, dark)
- Coloured slot icon + greeting with the **nickname**: *Good morning, Juan!* / *Enjoy your lunch, Juan!* / *Welcome back, Juan!* / *Ingat pauwi, Juan!*. **No sub-line** under it.
- The time in large digits (60 px), rolling in digit by digit.
- AM IN late → **⚠ Late by 20 min · 3rd late this October** with the lateness bar filling; on time → ✓ draws itself + **On time · 2 lates this month** + a small confetti burst.
- Flexi → **Your time out today: 5:20 PM**.
- Buttons: **Undo** (only right after recording) · **Change time** · **Done**.
- **Does not auto-close.** Close with Done, the dim area or Esc.
- (Removed: the 4-slot progress strip. The home tiles already show it.)

### 3.4 Quick buttons: Leave · Day-off · Holiday · Others
Tap one → type the code → a sheet with a 4-way switch (Leave · Day-off · Holiday · Others).
- **Leave / Day-off / Holiday**: From / To dates (default today), "Skip Sundays". Prints `ON LEAVE` / `DAY-OFF` / `HOLIDAY` in the Undertime column for each day.
- **Others** = a **reason** for one day (e.g. clocked in AM, then out in the field). Type where you went or why (max 40 chars) and pick the **date** (default today; one day, no range). **Suggestions are the person's own past reasons**, most used first (up to 6), so "FIELD WORK – CITY HALL" is one tap the second time. Nothing is suggested until they've typed something. No explanatory subtext on the sheet; it prints in the Undertime column beside the times.

### 3.5 My DTR
Tap **My DTR** on the keypad → type the code:
- Month switcher, name, code, schedule.
- **Big late number** card (orange when there are lates; a light sweep animates across it).
- **Calendar**: green on time · orange late (dot) · purple remark · red holiday · yellow incomplete · faded weekends; today outlined; months slide in.
- Tap a day → detail card: the 4 times as coloured chips, remark text, ✎ if edited, **Edit** (times, remark, or delete the day).
- **+ Remark** (for the selected day) and **Print DTR** (own DTR, no admin PIN).

### 3.6 Motion (all of it respects "reduce motion")
Screen changes slide + fade (direction follows navigation) · tiles, pills, dots and keys rise in with a stagger · aurora glows drift behind the clock · clock digits roll when the minute changes, the colon blinks · selected tile springs up and breathes · recorded time chip pops in · keys squish on press · dots pop, then ripple on success or shake red on error · toast drops in with a spring (error shakes) · sheet slides up; icon bounces, time rolls in, late bar fills, numbers count up · calendar cells pop in one by one · admin tab bar has a sliding indicator, bars grow, switches spring, the segmented control slides, print paper lands with a tilt · lock icon floats and "unlocks" on the right PIN.

### 3.7 Mobile spacing rules
- `viewport-fit=cover`; top padding = `safe-area-inset-top + 10px`, bottom = `safe-area-inset-bottom + 14px` (min 16px each when the phone reports 0). Sheets add the bottom safe area too.
- The keypad is a **grid that fills the screen** between the dots and the bottom safe area: 3 columns × 4 rows of rounded keys, each ~100 × 100 px on a tall phone and ~70 px high on an iPhone SE. Digits scale with the key (28–54 px). No fixed key size, so there is never an empty gap.
- Tested at 568, 640, 667, 700, 740, 780, 844 and 932 px heights: the keypad always ends ≥ 30 px above the bottom edge and never touches the dots.

---

## 4. Admin (phone)

Tap the faint **✦** (top right of the home screen) → 6-digit PIN (lock icon floats; right PIN → it "unlocks") → the admin app, with a floating tab bar:

| Tab | Contents |
|-----|----------|
| **Overview** | Month switcher; big **lates this month** card; one card per person: initial avatar, nickname, full name, a lateness bar, lates badge, days present. Tap a person → their calendar (same as My DTR, with Edit and Print) |
| **People** | List with schedule badge; **+ Add person** and tap-to-edit sheet: code (3 digits, unique), **nickname**, full name (printed), position, working hours (Default / Custom fixed / Custom flexi); Deactivate/Reactivate |
| **Hours** | Fixed-time / Flexi-time switch (sliding). **Fixed**: time in. **Flexi (clock in & out only)**: earliest clock in, latest clock in, hours to work → shows the **clock-out window** (e.g. 4:00–6:00 PM). **Lunch is the same for both** (own card: from / to). Late rules: grace minutes, "count late return from lunch". A live sentence explains the rule |
| **Print** | Month switcher; **pick one, several or All people** (name chips); A4 preview with a pager (‹ Juan · 1 of 3 ›), tap the paper to zoom; **Print 3 DTRs (3 pages)** / Save as PDF: one A4 page per person |
| **Settings** | Signatory (name, title, label), change PIN, "times come from the phone's clock" note, **Lock admin** |

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
