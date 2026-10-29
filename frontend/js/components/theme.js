import { byId, prefersReducedMotion } from '../utils/dom.js';
import { icon } from './icons.js';

const KEY = 'mc-theme';
let isDark = false;

export function applyTheme(dark, animate = false) {
  isDark = dark;
  document.body.classList.toggle('dark', dark);
  ['toggleThumb1', 'toggleThumb3'].forEach((id) => {
    const el = byId(id);
    if (el) el.innerHTML = icon(dark ? 'moon' : 'sun');
  });
  document.querySelectorAll('.theme-toggle').forEach((b) => b.setAttribute('aria-pressed', String(dark)));
  try { localStorage.setItem(KEY, dark ? 'dark' : 'light'); } catch { /* storage may be unavailable */ }
  if (animate && !prefersReducedMotion()) {
    const flash = document.createElement('div');
    flash.style.cssText = `position:fixed;inset:0;z-index:9999;pointer-events:none;background:${dark ? 'rgba(15,23,42,0.15)' : 'rgba(255,255,255,0.2)'};transition:opacity 0.5s;`;
    document.body.appendChild(flash);
    setTimeout(() => { flash.style.opacity = '0'; setTimeout(() => flash.remove(), 500); }, 50);
  }
}

export function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch { /* ignore */ }
  applyTheme(saved === 'dark', false);
  ['themeToggle1', 'themeToggle3'].forEach((id) => {
    byId(id)?.addEventListener('click', () => applyTheme(!isDark, true));
  });
}
