# VALIDATION

What was actually run, where, and what happened. Environment: Linux sandbox, Node 22.22, PostgreSQL 16.15 (local),
Chromium 141 via Playwright. **Nothing was deployed to Render and no real Groq request was made.**

## 1. Passed

| Check | How | Result |
|---|---|---|
| Clean install | Copy of the project without `node_modules` → `cd backend && npm ci` | ✅ 133 packages, 2 s, `npm audit`: **0 vulnerabilities** (9 production deps; `dotenv` now declared) |
| Syntax | `npm run check` → `node --check` on every backend and frontend `.js` | ✅ 78 files, 0 failures |
| Imports / paths / icons / actions | `backend/scripts/check-paths.js` | ✅ all `index.html` references, 33 module imports, 82 referenced icons (88 in sprite), 38 `data-action`s and all `loadData()` files resolve |
| Backend automated tests | `npm test` against a real PostgreSQL test database, run from the clean copy | ✅ **65 / 65 passed**, 0 failed, 0 skipped (~5 s) |
| Production fail-safe start-up | Started `server.js` with `NODE_ENV=production` and: no `JWT_SECRET`; placeholder secret; short secret; no `DATABASE_URL`; unreachable DB | ✅ each exits with code 1 and a clear message (no fallback secret) |
| Healthy production boot | Fresh DB, strong random secret | ✅ migration applied, demo seeded, `/api/health` → `{"status":"ok","db":"up"}`, `/` → 200, unknown `/api/*` → JSON 404, HSTS + CSP headers present, foreign `Origin` gets no CORS headers, AI without key → `503 ai_not_configured` |
| Persistence across restart | Created a user, stopped the process, started again on the same DB | ✅ no migrations re-applied; sign-in still works (data lives in PostgreSQL) |
| SQLite → PostgreSQL migration | Fixture DB built with the **original** schema (2 users, bad rows included) | ✅ dry-run writes nothing; real run preserved ids + bcrypt hashes, lower-cased emails, converted `2:30 PM` → `14:30`; reported the 2 unusable rows; refused a second run; identity sequence reset (next id 10) |
| Browser end-to-end | `e2e/e2e.py` (Chromium, real backend + Postgres, Groq mock) | ✅ **50 / 50** (details below) |
| Horizontal overflow | `e2e/overflow.py` at 320×640, 360×740, 375×667, 390×844, 414×896, 768×1024, 820×1180, 1024×768, 1440×900, 667×375 (landscape), 844×390 (landscape) | ✅ home page: 11/11 no horizontal scroll and no off-screen elements; dashboard (home, AI, symptoms, hospitals, SOS, records): **66/66** |
| Secret scan | Regex scan of the project files (Groq-style keys, JWT-shaped tokens, private keys, passwords in URLs, long secret-like assignments), repeated on the final ZIP extract (214 files) | ✅ no real secrets. One pattern match remains, in `backend/tests/auth.test.js`: the deliberately fake legacy `demo-session-…` string used to prove the old fake token is rejected. No `.env`, `*.db`, keys or `node_modules` are in the delivered ZIP |
| Final ZIP | Fresh extract → `npm ci` → `npm run check` → production boot on an empty DB → static assets 200, `/.env` and `/server.js` 404 | ✅ |
| `render.yaml` | Parsed as YAML; field names checked against Render's published Blueprint reference | ✅ syntactically valid. **Not** validated by Render's own validator |

**Backend test coverage (65):** config validation (production secret rules, DB/port/origin parsing, TLS auto-detect);
signup/login/validation/normalisation; wrong password vs unknown user; forged/expired/`alg:none`/wrong-issuer tokens;
logout revocation; demo account (read-only, no AI, cannot password-login, can be disabled); auth rate limiting and
per-user AI rate limiting; appointments/medications/vitals CRUD and validation; **cross-user isolation** (read, patch,
delete by id; body `user_id` ignored); SQL-injection strings; AI proxy (key sent upstream, never returned; history scoped
per user; failed calls leave no history; vitals shared only on request and only the caller's; provider 429/401/500/bad
JSON/empty/timeout mapping; input validation; emergency detection; malformed model output); missing `GROQ_API_KEY`;
health check; JSON 404s; security headers; CORS allow/deny incl. preflight; contact + newsletter; migration idempotency;
forced DB failure → generic 500 without leaks; static serving never shadows `/api`.

**Browser E2E (50):** sample-content labelling; real API status in footer; no inline handlers; signup validation and
success; empty states; no key/secret in DOM or storage; XSS payloads in medication names and in model replies not executed;
medication status cycle; vitals start empty, implausible value rejected, saved; doctor list/time slots from API; past date
rejected; appointment saved; **session restore + data after reload**; chat via backend; markdown/HTML escaped; emergency
alert for "severe chest pain"; chat history restored after reload; symptom tags as buttons with `aria-pressed`; AI result
labelling; red-flag symptom → emergency notice; clear chat; sign-out clears and **server-side revokes** the token; garbage
stored token → clean home; wrong password message; sign-in with different email casing shows persisted data; token
revoked mid-session → returned to sign-in with an explanation; demo read-only (write blocked, AI blocked, labelled data);
contact and newsletter persist; unconfigured social links disabled; Esc closes dialog; visible focus ring; legal modal;
`prefers-reduced-motion` shows the headline instantly and removes particles.

**Visual review (by me, looking at screenshots):** desktop hero 1440 px compared with the original; phone 375 px hero,
menu, sign-in dialog and dashboard; 320 px booking dialog. All other viewports were checked **programmatically** (overflow)
but not visually reviewed.

## 2. Failures found during validation (and fixed)

| Found by | Problem | Fix |
|---|---|---|
| Overflow check @320 px | News column grew to 333 px (grid `1fr` cannot shrink below content) | `minmax(0,1fr)` tracks + `min-width:0` children |
| Overflow/console check | **My** API-base heuristic pointed the page at `localhost:3001` when served from another local port, which CSP then blocked | Same-origin by default; explicit `apiBaseUrl` otherwise |
| `check-paths.js` | `pen-line` icon (article byline) was missing from the sprite → blank icon | Icon added, sprite rebuilt |
| Screenshot review | Touch-target rule inflated the theme switch; sun icon was dark on a dark thumb; logo icon too light | Pseudo-element tap area; icon colours tuned |
| Tests | Auth limiter (10/15 min) throttled the test suite itself; test helper sent raw bodies without `Content-Type`; two assertions were wrong (CSS-uppercased label; demo AI call blocked by the read-only guard first) | Test defaults/assertions corrected — no product change |
| Test harness | Postgres/servers started in one tool call were reaped before the next; `time` is not a command in `sh` (false "npm ci failed") | Harness fixed; rerun from scratch |

## 3. Not performed / cannot be claimed

* **No Render deployment**, no Render Blueprint validation, no test against Render's managed Postgres (TLS path
  `DATABASE_SSL=true` unexercised), no backup/restore drill.
* **No live Groq call**: the proxy was tested against a local mock; prompt behaviour with the real model is unverified.
* Browsers other than Chromium, and real phones/tablets, were not used; viewport emulation is not a substitute.
* No automated accessibility audit (axe/Lighthouse) and no screen-reader testing; keyboard behaviour was checked only for
  the dialogs, focus ring and card/tag controls listed above.
* No load/performance testing; rate limiting is per instance (in-memory).
* E-mail delivery does not exist (contact/newsletter are stored only).
* Clinical/legal review of prompts, emergency wording, the SOS numbers (other than poison control) and the Privacy Notice
  has not been done.

## 4. Manual checklist for you (after deploying)

1. `curl https://<service>/api/health` → `{"status":"ok","db":"up"}`.
2. Sign up, add a medication/vital/appointment, **redeploy**, sign in: data still present.
3. Sign out and replay the old token with `curl` → 401.
4. With your new Groq key set: chat and symptom checker return answers; with it removed they show a clear unavailable message.
5. Open the site on a real phone (portrait + landscape) and a tablet: no sideways scrolling, menu and dashboard tabs usable,
   dialogs scroll, keyboard Tab shows a focus ring on a laptop.
6. Confirm the Groq key from the original code is revoked in the Groq console.

## 5. Re-running everything

```bash
cd backend && npm ci && npm run check
TEST_DATABASE_URL=postgresql://USER:PASS@localhost:5432/healthcare_test npm test
# browser checks: see e2e/README.md
```
