import { byId } from '../utils/dom.js';
import { getHealth } from '../api/public.js';

/** Footer + chat badge reflect the REAL API health instead of a hardcoded "All Systems Operational". */
export async function refreshStatus() {
  const label = byId('apiStatus'); const dot = byId('apiDot'); const badge = byId('aiBadge');
  let ok = false;
  try { ok = (await getHealth()).status === 'ok'; } catch { ok = false; }
  if (label) label.textContent = ok ? 'Service online' : 'Service unavailable';
  if (dot) dot.style.background = ok ? '' : '#e53e3e';
  if (badge) badge.textContent = ok ? '● Online' : '● Offline';
  return ok;
}
