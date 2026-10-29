/*
 * Public frontend configuration. This file is served to every visitor — NEVER put secrets here.
 *
 * apiBaseUrl
 *   ""  (default)  → the API is on the SAME origin as this page (https://<service>/api).
 *                    This is the case when the Render web service also serves the frontend (default setup).
 *   "https://your-backend.onrender.com"  → use this when the frontend is hosted on a different origin
 *                    (static host). Then set FRONTEND_ORIGIN on the backend to this page's origin.
 *
 * Local development: run the backend (npm run dev) and open http://localhost:3001 — the backend serves this
 * frontend, so the default "" works. If you serve the frontend separately (e.g. a static dev server on another
 * port), set apiBaseUrl to "http://localhost:3001" and add that origin to FRONTEND_ORIGIN (localhost origins
 * are allowed automatically when NODE_ENV is not "production").
 */
window.HC_CONFIG = {
  apiBaseUrl: '',
  // Optional social profile URLs shown in the Contact section. Leave '' to show the icon as unavailable.
  socialLinks: { facebook: '', whatsapp: '', instagram: '', linkedin: '' },
  // Optional public contact e-mail address (renders a mailto: link). Leave '' if you do not want one.
  contactEmail: '',
};
