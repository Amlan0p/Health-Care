# HealthCare — full-stack health information & tracking app

A vanilla-JavaScript frontend (ES modules, no build step) served by a Node/Express API backed by **PostgreSQL**.
AI chat and symptom information are proxied through the backend to **Groq**; the API key never reaches the browser.

> **Important:** this app provides general health information only. It is not a medical device, does not diagnose, and
> does not replace a qualified healthcare professional. News articles and the doctor directory are **sample content**.
> See `AUDIT.md` for what was changed and why, and `VALIDATION.md` for what was actually tested.

## Project structure

```
healthcare-fullstack/
├── README.md · AUDIT.md · VALIDATION.md · render.yaml · .gitignore
├── scripts/build-icon-sprite.js        # regenerates frontend/assets/icons/sprite.svg
├── backend/
│   ├── server.js                       # entry point: config → DB → migrate → listen
│   ├── app.js                          # Express app factory (testable)
│   ├── config/                         # env parsing + startup validation (fails fast in production)
│   ├── db/                             # pg pool, migration runner, migrations/*.sql, demo seed
│   ├── middleware/                     # auth (JWT + revocation), security headers/CORS, rate limits, errors
│   ├── routes/ controllers/ services/  # HTTP wiring · request handlers · AI/Groq, emergency detection, tokens
│   ├── validators/                     # zod schemas for every input
│   ├── content/                        # doctor directory (SAMPLE), symptom list, vital definitions
│   ├── scripts/                        # SQLite→Postgres data migration, syntax checker
│   └── tests/                          # node:test suite (needs a PostgreSQL test database)
└── frontend/
    ├── index.html · config.js          # markup · public runtime config (no secrets)
    ├── assets/css/                     # original stylesheet split by section + icons.css + responsive.css
    ├── assets/icons/                   # Lucide SVGs + generated sprite.svg   (ISC licence)
    ├── assets/vendor/leaflet/          # Leaflet, vendored (no unpkg at runtime)
    └── js/
        ├── app.js                      # bootstrap + action registry
        ├── api/                        # HTTP client + one module per resource
        ├── auth/ components/ utils/    # session & auth modal · icons/modal/theme/nav · helpers
        ├── features/                   # appointments, medications, vitals, symptoms, chat, hospitals, news, contact…
        └── data/*.json                 # sample articles, tips, risks, legal text, medicine-name suggestions
```

**Why no framework migration?** The original app was plain HTML/CSS/JS with a small Express API. That stack organises
cleanly into ES modules, so a framework would add a build pipeline and risk visual drift without solving any problem here.

## Run locally

Requirements: Node.js ≥ 20 and a PostgreSQL ≥ 13 database.

```bash
# 1. create a local database
createdb healthcare

# 2. configure
cd backend
cp .env.example .env
#   edit .env:  DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/healthcare
#               GROQ_API_KEY=<your key>   (optional; without it AI features return a clear 503)
#   JWT_SECRET is optional in development (a random one is used per run); set it to keep logins across restarts.

# 3. install and start (migrations run automatically on start)
npm install
npm run dev            # or: npm start

# 4. open the app (the backend also serves the frontend)
open http://localhost:3001
```

If you serve the frontend separately (another port), set `apiBaseUrl: "http://localhost:3001"` in `frontend/config.js`;
localhost origins are accepted by CORS automatically outside production.

### Tests and checks

```bash
cd backend
createdb healthcare_test                       # the name MUST contain "test": the suite drops and recreates its schema
export TEST_DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/healthcare_test
npm test                                       # DB tests are skipped (and reported as skipped) if this is unset
npm run check                                  # syntax-checks every backend and frontend .js file
```

## Configuration reference (environment variables)

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | **yes** | PostgreSQL connection string. On Render this is injected from the database. |
| `JWT_SECRET` | **yes in production** | ≥ 32 random chars. Production start-up **fails** if missing, short, or a placeholder. |
| `GROQ_API_KEY` | for AI features | Server-side only. Without it chat/symptom endpoints return `503 ai_not_configured`. |
| `NODE_ENV` | recommended | `production` on Render (enables strict checks, trust-proxy, no localhost CORS). |
| `PORT` | no | Defaults to `3001`; Render sets it automatically. |
| `FRONTEND_ORIGIN` | only for split hosting | Comma-separated allowed browser origins, e.g. `https://app.example.com` (no path). |
| `DATABASE_SSL` | no | `auto` (default) / `true` / `false`. Auto = TLS for public hostnames in production, off for Render's internal URL. |
| `ENABLE_DEMO` | no | Read-only demo account with synthetic data (default `true`). |
| `GROQ_MODEL`, `GROQ_TIMEOUT_MS` | no | Default `llama-3.3-70b-versatile`, `20000`. |
| `JWT_EXPIRES_IN`, `BCRYPT_ROUNDS` | no | Default `24h`, `12`. |
| `AUTH_RATE_LIMIT_MAX`, `AI_RATE_LIMIT_MAX`, `API_RATE_LIMIT_MAX`, `PUBLIC_FORM_RATE_LIMIT_MAX` | no | See `.env.example`. |
| `SERVE_FRONTEND`, `FRONTEND_DIR`, `APP_TIMEZONE`, `TRUST_PROXY`, `DB_POOL_MAX` | no | See `.env.example`. |

---

## Deploying to GitHub and Render

### 1. Create or update the GitHub repository

Before anything else: **revoke the old Groq API key** in the Groq console. It was embedded in the original frontend
and must be treated as compromised.

```bash
cd healthcare-fullstack
git init -b main
git add .
git status                      # confirm there is NO .env file and no node_modules in the list
git commit -m "HealthCare: audited, refactored, PostgreSQL + server-side Groq"
```

**New repository:** create an empty repo on github.com (no README/licence), then:

```bash
git remote add origin https://github.com/<your-user>/<your-repo>.git
git push -u origin main
```

**Existing repository** that contains the old code: if the old Groq key was ever committed, it is still in Git history
even after this update. Revoking the key (above) is what actually protects you. To also purge history, either start a
fresh repository from this folder, or rewrite history with
[`git filter-repo`](https://github.com/newren/git-filter-repo) and force-push; anyone who already cloned or forked still
has the old history.

*Uploading through the web UI instead:* GitHub's "Add file → Upload files" accepts the unzipped folder contents. Check
that `.gitignore` is included and that no `.env` file is present.

### 2. Create the services on Render (Blueprint — recommended)

1. In Render: **New → Blueprint**, connect your GitHub repo, pick the branch. Render reads `render.yaml`.
2. It proposes one **web service** (`healthcare-app`, `rootDir: backend`, build `npm ci`, start `npm start`, health check
   `/api/health`) and one **PostgreSQL** database (`healthcare-db`).
3. When prompted for `GROQ_API_KEY`, paste your **new** key. `JWT_SECRET` is generated by Render; `DATABASE_URL` is
   injected automatically.
4. Click **Apply**. The first deploy runs `npm ci`, starts the server, which applies database migrations and creates
   the demo account.

*Manual alternative:* create a **PostgreSQL** instance, then a **Web Service** with: Root Directory `backend`, Build
`npm ci`, Start `npm start`, Health Check Path `/api/health`, same region as the database. Add the variables below.

### 3. Database

Render's *free* Postgres expires after 30 days (check current terms), so `render.yaml` uses a paid plan
(`basic-256mb`). Use the database's **Internal Database URL** for `DATABASE_URL` (the Blueprint does this for you).
Migrations (`backend/db/migrations`) run automatically on every start; they are idempotent. Enable Render's database
backups for real data, and test a restore before relying on it.

**Coming from the old SQLite version?** Your users' accounts and data can be moved (ids and password hashes are kept):

```bash
cd backend
npm install --no-save better-sqlite3                      # only needed for this one-off script
export DATABASE_URL="<External Database URL from Render>"  # run once from your computer
node scripts/migrate-sqlite-to-postgres.js --sqlite /path/to/healthcare.db --dry-run   # preview
node scripts/migrate-sqlite-to-postgres.js --sqlite /path/to/healthcare.db             # real run
```

The script lists every row it could not migrate (it never drops data silently) and refuses to run against a database that
already has users. Existing users keep their password hashes; passwords shorter than the new 8-character minimum still
work for sign-in. If the old app was never deployed with a real database, there is nothing to migrate.

### 4. Environment variables (set in Render → Service → Environment)

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | set by the Blueprint from the database (Internal URL) |
| `JWT_SECRET` | generated by the Blueprint (or: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`) |
| `GROQ_API_KEY` | **manual** — your new Groq key |
| `FRONTEND_ORIGIN` | **manual, only if** the frontend is hosted on a different origin |
| `ENABLE_DEMO` | `true` or `false` |

Rotating `JWT_SECRET` signs everyone out. Never put these values in the repo.

### 5. CORS

* **Default (recommended):** the web service serves the frontend, so browser requests are same-origin and need no CORS.
  Leave `FRONTEND_ORIGIN` unset; cross-origin browser access is then blocked.
* **Frontend on another host** (e.g. a static site): set `FRONTEND_ORIGIN=https://your-frontend.example.com` on the
  backend (exact origin, no trailing slash, comma-separate several) **and** set `apiBaseUrl` in `frontend/config.js`
  (next section). Also set `SERVE_FRONTEND=false` if you want an API-only service.

### 6. Deploy and check the backend

After the deploy finishes (replace the placeholder with the URL Render shows):

```bash
curl -s https://<your-service>.onrender.com/api/health
# → {"status":"ok","db":"up"}
curl -s -o /dev/null -w "%{http_code}\n" https://<your-service>.onrender.com/api/does-not-exist
# → 404   (JSON error, never the frontend HTML)
```

Open `https://<your-service>.onrender.com/` — the footer should read **Service online**. On the free web plan the first
request after idling can take ~30–60 s.

### 7. Point the frontend at the backend

* Served by the backend (default): nothing to do — `frontend/config.js` has `apiBaseUrl: ''` (same origin).
* Hosted elsewhere: edit `frontend/config.js` → `apiBaseUrl: 'https://<your-service>.onrender.com'`, then publish the
  `frontend/` folder to your static host and set `FRONTEND_ORIGIN` on the backend to that site's origin.

`config.js` is public; it must never contain a secret.

### 8. Verify authentication

1. Open the site → **Sign in / Sign up** → create an account (password ≥ 8 characters).
2. You land on the dashboard with your name in the top bar.
3. Click your name to sign out, then sign in again. Wrong passwords show "Invalid email or password".
4. Check that tokens are not usable after logout:
   ```bash
   TOKEN=<copy localStorage "hc_token" from your browser before signing out>
   curl -s -H "Authorization: Bearer $TOKEN" https://<your-service>.onrender.com/api/medications
   # after sign-out → 401 {"code":"revoked_token"}
   ```

### 9. Verify database persistence

1. Add a medication, a vital reading and an appointment.
2. **Manual deploy → Restart / Redeploy** the service in Render.
3. Sign in again: the data is still there. (It lives in PostgreSQL, not on the web service's disk.)
4. Optional: `psql "<External Database URL>" -c "select count(*) from medications"`.

### 10. Verify AI

Sign in with a real account (the demo account cannot use AI), open **AI Chat**, ask a health question. If the key is
missing/invalid you will see a clear "AI service … unavailable" message — never a fake answer. Check server logs for
`[ai] provider returned HTTP <status>` (status code only; keys and message contents are never logged).

### 11. Diagnosing deployment failures

| Symptom | Likely cause / fix |
|---|---|
| Deploy fails immediately with `Invalid configuration: JWT_SECRET …` | Missing/short/placeholder `JWT_SECRET` (≥ 32 random chars). |
| `DATABASE_URL is required` / `Could not connect to the database` | Variable missing, DB not finished provisioning, different region (internal URLs only resolve in-region), or an expired free DB. For an *external* URL set `DATABASE_SSL=true`. |
| Health check fails / service restarts | `/api/health` returns 503 when the DB is unreachable — fix the DB connection. Check **Logs**. |
| Browser: "CORS" error | Frontend on another origin: `FRONTEND_ORIGIN` must equal the exact origin (scheme + host, no slash). |
| Footer says "Service unavailable" | `apiBaseUrl` wrong, service asleep (free plan), or blocked by CORS. |
| AI replies "not configured" (503) | `GROQ_API_KEY` not set. "Unavailable" (502) → key rejected/provider outage; "busy" (429) → provider rate limit. |
| Too many sign-in attempts (429) | Per-IP limit (10 / 15 min by default); wait, or raise `AUTH_RATE_LIMIT_MAX`. |
| Sporadic 502s on Render | Keep-alive is already tuned (65 s). Check memory/cold starts on the free plan. |

---

## Security notes and trade-offs

* **Secrets** live only in environment variables. `.env` is git-ignored; `.env.example` has placeholders.
* **Groq key**: used only by `backend/services/ai/groq.js`; never sent to the browser, logged, or returned.
* **Passwords**: bcrypt (12 rounds); sign-in timing is equalised for unknown users; limits: 8–72 bytes on signup.
* **Tokens**: HS256 JWT (pinned algorithm + issuer), 24 h expiry, per-token revocation on logout (`revoked_tokens`).
  *Trade-off:* the token is kept in `localStorage` (as in the original app), so an XSS bug could steal it. Mitigations:
  strict CSP (`script-src 'self'`), no inline handlers, all dynamic text HTML-escaped. Moving to `HttpOnly` cookies
  would also require CSRF protection and was deliberately not done as part of this change.
* **Data isolation**: every user-data query includes `user_id = <authenticated user>`; verified by automated tests.
* **Rate limiting** is in-memory (per instance). If you scale beyond one instance, use a shared store.
* **Account enumeration**: signup reveals whether an email is registered (409). Rate limiting reduces abuse.
* **Privacy**: chat history is stored per user so conversations can continue; users can delete it ("Clear chat").
  Chat/symptom text is sent to Groq to produce replies — see the in-app Privacy Notice and review it before launch.
  Nearby-hospital search sends your coordinates to the public OpenStreetMap Overpass service.

## Remaining limitations

* Contact-form messages and newsletter e-mails are **stored in the database only**; no e-mail is sent. Read them with
  `select * from contact_messages;` / `select * from newsletter_subscribers;` or add an e-mail provider.
* Social-media links are disabled until URLs are set in `frontend/config.js`; the Privacy Notice is a template that needs
  legal review; there are no Terms/About pages.
* Appointments are personal records, not bookings; the doctor directory is fictional sample data.
* No password reset, e-mail verification, or account-deletion UI exists yet (deleting a `users` row cascades to all of
  that user's data).
* Google Fonts and map tiles/OSM services are third-party runtime dependencies.
* `npm test` covers the backend (API + database). Browser checks live in `e2e/` (Playwright, optional); see `e2e/README.md`.
