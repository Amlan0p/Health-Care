// Small DOM helpers shared across features.
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const byId = (id) => document.getElementById(id);

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** Escapes text for safe insertion into HTML (element content AND attribute values). */
export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export function show(el, display = '') { if (el) el.style.display = display; }
export function hide(el) { if (el) el.style.display = 'none'; }
export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
