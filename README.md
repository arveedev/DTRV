# DTRV — Daily Time Record (CS Form 48)

A small personal-records web app: employees record their time in/out with a 3-digit code and print the monthly Civil Service Form No. 48 on A4. It does not replace the office biometric.

- **Plan & features:** [`docs/01-PLAN.md`](docs/01-PLAN.md)
- **Technical specification:** [`docs/02-TECHNICAL.md`](docs/02-TECHNICAL.md)
- **Working prototype (style Rail · dark):** open [`mockup/index.html`](mockup/index.html), on desktop or a phone (it goes full screen). Demo codes `024` (fixed), `205` (flexi), `331`; admin PIN `123456` (⚙ top right: the admin is a phone app too).
- Earlier UI explorations: [`mockup/ui-options.html`](mockup/ui-options.html), [`mockup/ui-bc-variations.html`](mockup/ui-bc-variations.html)

Stack: Vite + vanilla JS, Dexie (IndexedDB), optional Dexie Cloud sync, Vercel hosting (static + 1 function). Installable PWA, works offline.

## Run

```
npm install
npm run dev            # http://localhost:5173 ; add ?demo=1 on an empty database for sample people (codes 024, 205, 331; admin PIN 123456)
npm test               # unit tests
npm run build && npm run e2e
```

The first time the app opens on an empty database it asks for an admin PIN (tap the faint ✦ at the top right of the home screen), then for the first person.

## Deploy (Vercel)

Import the repo; defaults work (`vercel.json`). The app is local-first and fully usable with no further setup. To sync between phones with Dexie Cloud, set the variables in `.env.example` (client `VITE_DEXIE_CLOUD_DB_URL`, and server `DEXIE_CLOUD_*`, `SYNC_KEY`, `ADMIN_EMAIL` for `api/token.js`).

Status: the app and its tests run, and sync through Dexie Cloud has been confirmed working on a live deployment (Vercel). Setup: create the database with `npx dexie-cloud create`, run `npx dexie-cloud whitelist https://<your-app>.vercel.app`, set the six variables, then open `https://<your-app>.vercel.app/#key=<SYNC_KEY>` once; Settings has a "Copy setup link" button for the other phones.
