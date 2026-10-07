# DTRV — Daily Time Record (CS Form 48)

A small personal-records web app: employees record their time in/out with a 3-digit code and print the monthly Civil Service Form No. 48 on A4. It does not replace the office biometric.

- **Plan & features:** [`docs/01-PLAN.md`](docs/01-PLAN.md)
- **Technical specification:** [`docs/02-TECHNICAL.md`](docs/02-TECHNICAL.md)
- **Working prototype (style Rail · dark):** open [`mockup/index.html`](mockup/index.html), on desktop or a phone (it goes full screen). Demo codes `024` (fixed), `205` (flexi), `331`; admin PIN `123456`.
- Earlier UI explorations: [`mockup/ui-options.html`](mockup/ui-options.html), [`mockup/ui-bc-variations.html`](mockup/ui-bc-variations.html)

Stack: Vercel (static + 2 functions) + Dexie Cloud (synced IndexedDB, **one user**: the admin).

Status: design phase. No application code yet.
