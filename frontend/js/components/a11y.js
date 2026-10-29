// Makes non-button elements that carry data-action keyboard-operable (role, tabindex, Enter/Space).
const NATIVE = new Set(['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA', 'SUMMARY']);

export function enhanceActionElements(root = document) {
  root.querySelectorAll('[data-action]').forEach((el) => {
    if (NATIVE.has(el.tagName) || el.dataset.action.startsWith('overlay-')) return;
    if (!el.hasAttribute('role')) el.setAttribute('role', 'button');
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
  });
}

export function initA11y() {
  enhanceActionElements();
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = e.target;
    if (!(el instanceof HTMLElement) || NATIVE.has(el.tagName) || !el.dataset.action || el.dataset.action.startsWith('overlay-')) return;
    e.preventDefault();
    el.click();
  });
  // Re-apply after dynamic renders.
  new MutationObserver((muts) => {
    for (const m of muts) m.addedNodes.forEach((n) => { if (n.nodeType === 1) enhanceActionElements(n); });
  }).observe(document.body, { childList: true, subtree: true });
}
