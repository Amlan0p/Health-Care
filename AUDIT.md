# AUDIT

Scope: the uploaded `healthcare-fullstack.zip` (15 files: an Express + SQLite backend of ~340 lines, and a frontend whose
`index.html` held ~1,300 lines of CSS, ~830 lines of markup and ~1,400 lines of inline JavaScript).

Every finding below was **verified against the code before changing it**. "Status" says what the delivered project does now.
Where the original was already correct, that is stated too. Nothing here claims a deployment: the project was tested
locally (see `VALIDATION.md`) and has not been deployed to Render by me.

## 1. Security vulnerabilities

| # | Finding (verified in original) | Status |
|---|---|---|
| S1 | **A Groq API key was hard-coded in `frontend/index.html`** and the browser called Groq directly. Only one occurrence, in that file. | **Fixed in code.** Key removed; the browser now calls `POST /api/chat` and `/api/symptoms/analyze`; the backend reads `GROQ_API_KEY` from the environment. **Action for owner: revoke the exposed key** (it remains valid and visible in any copy/Git history of the old code). |
| S2 | `backend/middleware/auth.js` fell back to a hard-coded JWT secret when `JWT_SECRET` was unset. | **Fixed.** No fallback. Production start-up fails if the secret is missing, < 32 chars, a placeholder, or low-variety (tested). Dev/test use a random per-process secret. |
| S3 | CORS defaulted to `*` (`FRONTEND_ORIGIN \|\| '*'`). | **Fixed.** Only configured origins (plus localhost outside production); same-origin deploy needs none. |
| S4 | No rate limiting, no security headers, no request-size limit (default body parser), no request timeout. | **Fixed.** `helmet` + strict CSP (`script-src 'self'`), per-IP auth/form limits, per-user AI limit, 32 kB body limit, 30 s request timeout. |
| S5 | Sign-up required only 6-character passwords; no max (bcrypt silently truncates at 72 bytes); no name/email length validation. | **Fixed.** zod validation everywhere; 8–72-byte passwords on signup (sign-in still accepts legacy 6–7 char passwords); lengths and control characters checked. |
| S6 | JWT had no revocation: "logout" only deleted the token in the browser. | **Fixed.** Per-token `jti` revocation table; logout invalidates that token server-side (tested). Algorithm and issuer are pinned on verify. |
| S7 | **XSS:** the frontend built HTML with `innerHTML` from user data (medication names, appointment fields) and from AI output (`formatGeminiResponse`). | **Fixed.** All dynamic text is escaped (`esc()`); AI output is escaped first, then a tiny markdown subset is applied. Tested end-to-end with `<img onerror>` payloads in medication names and model replies. |
| S8 | The client chose what to store for appointments (doctor, specialty, hospital, day, month strings). | **Fixed.** The client sends only `doctorId`, `date`, `time`; the server resolves doctor details from its catalogue and validates the slot. |
| S9 | Login timing/enumeration: unknown-user vs wrong-password paths differed in cost. | **Mitigated.** A dummy bcrypt comparison equalises timing; identical error text. (Signup still reveals duplicate emails — documented trade-off.) |
| S10 | JWT stored in `localStorage`. | **Kept (documented).** Replacing it is a breaking auth rewrite (cookies + CSRF). Mitigated with CSP, no inline handlers and escaping. See README → Security notes. |
| S11 | Demo mode was a **client-side fake**: `handleDemoLogin()` created a `demo-session-<timestamp>` string and switched the UI to the dashboard. | **Verified not a real session**: the backend rejected that token (401), and the frontend swallowed the errors, showing empty data. **Replaced** by a genuine read-only demo: backend-issued 1 h token for a seeded, passwordless demo account, writes blocked server-side (403), AI blocked, all data labelled "demo data". Can be disabled with `ENABLE_DEMO=false`. |
| S12 | Chat history (`groqHistory`) was one module-level array, not scoped to a user and **not cleared on sign-out**, so a second account signing in on the same page load inherited the first user's conversation context. | **Fixed.** History is stored per user in the DB; the AI context is built server-side from that user's rows only (tested with two users). |

**Already correct in the original (kept):** SQL used bound parameters; every user-data query filtered by `user_id`
(so cross-user access was already prevented); passwords were bcrypt-hashed. These properties are now covered by tests.

## 2. Broken or incomplete features

| Item | Finding | Status |
|---|---|---|
| `handleSocialLogin()` | Defined but **never called** (no button); only showed "not available". | Removed. |
| `handleContactForm()` | `alert('Thank you…')` and form reset — **message was discarded** (fake success). | Real `POST /api/contact` → stored in `contact_messages`; success shown only after the DB write. No e-mail is sent (documented). |
| Newsletter | Showed "Subscribed!" without sending anything anywhere. | Real `POST /api/newsletter` (stored, idempotent); UI text states that nothing is e-mailed automatically yet. |
| `generateAIResponse()` | Returned a canned "connection issue" string (dead fallback path). | Removed; AI failures show the real error (429/502/503/504 messages) and never a fake answer. |
| `loadUserAppointments` / `saveUserAppointments` / `removeUserAppointment` | **Not present** in the uploaded code (stale names). Appointments already used the API. | n/a — appointments rewritten against the new API with loading/error/retry states. |
| `renderMedications()` | When a signed-in user had zero medications it called `loadUserMedications()`, whose completion called `renderMedications()` again — an **unbounded request loop**. | Fixed by design (explicit load → render). |
| Dashboard tabs on mobile | CSS hid `.dash-nav-tabs` at ≤ 900 px with no replacement: **dashboard navigation was unreachable on phones/tablets.** | Scrollable tab strip. |
| Home navigation on mobile | No menu at all. | Hamburger menu (keyboard + `aria-expanded`). |
| Vitals | Cards were pre-filled with invented "default" readings (e.g. 76 bpm) that a user could save as their own. | Inputs start empty; examples are placeholders only; server validates ranges. |
| Appointment date picker | Min date built with `getDate()+1` (invalid at month end); dates parsed in UTC. | Fixed with calendar-safe helpers; server validates real dates and rejects the past (in `APP_TIMEZONE`). |
| Symptom checker | Called Groq from the browser, accepted arbitrary text, labelled output "Most Likely Condition". | Server validates symptom ids, requests JSON, validates the reply shape; label is "Possible condition (AI suggestion)" with a fixed not-a-diagnosis disclaimer. |
| Emergency handling | None beyond a static SOS list. | Deterministic (non-AI) emergency detector for chat (chest pain, can't breathe, stroke signs, self-harm, overdose, seizure…) and red-flag symptoms, showing tel: links (112/102, Tele-MANAS 14416, iCall) even if the AI is down. |
| Footer "All Systems Operational", chat "● Online" | Hard-coded. | Driven by the real `/api/health` result. |
| Dead links | Footer links to `#`; social icons `javascript:void(0)`. | Footer links point to real sections / modals; unconfigured social links are rendered disabled (configurable in `frontend/config.js`). About/Careers/Team/Terms/Cookie entries (no pages exist) removed; Privacy Notice and Medical Disclaimer added. |
| SOS list | Poison-control number `1860-599-0019` could not be verified. | Replaced with **1800-116-117**, the AIIMS National Poisons Information Centre toll-free number (checked on aiims.edu). Other numbers (112, 102, 100, 101, 1097, 14567, iCall) were left as in the original, not independently re-verified. |

## 3. Hardcoded content — classification and result

| Category | Items | Result |
|---|---|---|
| **A — static configuration** | theme key, month names, nav/tabs, quick questions, UI labels | `utils/format.js`, markup + `data-action` attributes, `frontend/config.js`. |
| **B — content / seed data** | `articles`, `trending`, ticker headlines, `MED_POOL`, health-risk cards, tips, legal text → `frontend/js/data/*.json`. `DOCTOR_LIST`, symptom list, `VITALS_CONFIG` → `backend/content/*.json`, served by `/api/content/*` and used for **server-side validation** | All sample content is labelled. See "Synthetic / invented content" below. |
| **C — user-specific / changing** | appointments, medications, vitals, profiles, sessions, chat history | PostgreSQL, always scoped to the authenticated user id. No persistent user data lives only in JS memory. |

**Synthetic / invented content (safety):**
* All 8 articles invented statistics, researchers and institutions (journals, universities, health agencies) as if real
  findings; the trending list had invented view counts; the ticker was labelled "BREAKING". These were **rewritten as
  generic, hedged explainers, labelled "Sample"** on every card, in the modal, in the ticker and on the page. No invented
  citations remain.
* The doctor directory paired fictional names with real hospitals; it is labelled sample/fictional in the API response,
  the booking dialog and the legal text, and appointments are described as personal records, not bookings.
* Claims about features that do not exist were corrected: "secure video calls", "lab test booking … digital results",
  "refill alerts", "expert health coaches", "98% Accuracy" (hero stat), "50+ Nearby Hospitals", "health journalism
  since 2020", "Health Tip — Today" (static weather claim → rotating general tips).

## 4. Backend / database / deployment problems

| Finding | Status |
|---|---|
| `dotenv` was `require`d but missing from `package.json` (verified: deps were bcryptjs, better-sqlite3, cors, express, jsonwebtoken, nodemon). | Fixed; clean `npm ci` verified. |
| SQLite file on a web service's ephemeral disk = data loss on redeploy; `better-sqlite3` needs native compilation. | **Migrated to PostgreSQL** (`pg`), SQL migrations, `render.yaml` with managed DB, and a tested SQLite→Postgres data-migration script. |
| `app.get('*')` returned `index.html` for unknown `/api/*` paths. | Fixed: unknown `/api/*` → JSON 404 (tested). |
| Health endpoint did not check the DB. | `/api/health` → `{status, db}` (200/503), no sensitive data. |
| `frontend/api.js` defaulted to `http://localhost:3001/api`. | Same-origin by default; explicit `apiBaseUrl` for split hosting (no silent localhost default in production). |
| Four extra script files (`api.js`, `user.js`, `appointments.js`, `app.js`) with duplicated/overlapping logic loaded after the inline script (`app.js` was a 19-line stub). | Replaced by the module structure; no duplicates or compatibility shims. |
| No tests. | Verified none existed; 65 backend tests + 50 browser end-to-end checks added. |
| No `render.yaml`, README gave no deployment path. | Added. |
| Leaflet loaded from `unpkg.com` at runtime. | Vendored locally. |

## 5. File organisation

`index.html` mixed ~1,300 lines of CSS, markup and ~1,400 lines of JS with ~60 inline `onclick=` handlers. Now: CSS split by
section (same cascade order), markup only in `index.html`, JS as ES modules by feature, data in JSON, central click
delegation via `data-action`. Backend split into config/db/middleware/routes/controllers/services/validators/tests.

## 6. UI: responsive design, icons, accessibility

* **Responsive:** one breakpoint (≤ 900 px) existed before. Added layered breakpoints (1024/960/768/600/480/380),
  landscape handling, touch targets, scrollable dashboard tabs, hamburger nav, hero illustration scaled as a unit,
  dialogs that scroll when taller than the screen, `minmax(0,1fr)` grids. No desktop (≥ 1025 px) layout rules were changed; the desktop hero was
  screenshot-compared against the original and differs only in icon rendering.
* **Icons:** ~90 emoji/symbol uses replaced with Lucide SVGs from a local sprite (`assets/icons/`), inheriting size
  (`1em`) and colour (`currentColor`). **Intentionally kept emoji:** 🙏 in the chat greeting, and any emoji the AI itself
  writes in replies (chat content). Symptom/doctor/article icons were mapped to semantically similar Lucide icons (Lucide
  has no lungs or brand icons; the contact section's brand SVGs were already vector and are untouched).
* **Accessibility:** visible focus rings, focus trap + Esc + focus restore in dialogs, labelled form controls,
  `role="dialog"`/`aria-live` regions, keyboard-operable cards and tags (real `<button>`s for symptoms), and
  `prefers-reduced-motion` (no typewriter/particles/marquee motion).

## 7. Known limitations of this audit

* Not deployed to Render by me; deployment steps are documented, not exercised.
* Real Groq was **not** called (no key available): the proxy was tested against a local mock that checks the
  `Authorization` header, error mapping, timeouts and history scoping. Prompt quality with the live model is untested.
* Only Chromium was used for browser checks; Safari/Firefox were not tested.
* Clinical content (prompts, emergency wording, SOS numbers) should be reviewed by a qualified person before public launch.
