// Accessible modal helper: focus moves into the dialog, Tab is trapped, Esc closes, focus returns on close.
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const stack = [];

function focusables(root) {
  return [...root.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
}

/**
 * @param overlay   overlay element (the one that gets the open class)
 * @param openClass 'open' | 'show' — the class the existing CSS uses
 */
export function openModal(overlay, openClass = 'show', { onClose } = {}) {
  if (!overlay) return;
  const entry = { overlay, openClass, onClose, opener: document.activeElement };
  stack.push(entry);
  overlay.classList.add(openClass);
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => {
    const dialog = overlay.querySelector('[role="dialog"]') || overlay;
    const first = dialog.querySelector('input:not([type="hidden"]), select, textarea') || focusables(dialog)[0];
    if (first) first.focus({ preventScroll: true });
  });
}

export function closeModal(overlay) {
  const i = stack.findIndex((e) => e.overlay === overlay);
  if (i === -1) { overlay?.classList.remove('show', 'open'); return; }
  const [entry] = stack.splice(i, 1);
  entry.overlay.classList.remove(entry.openClass);
  if (!stack.length) document.body.style.overflow = '';
  if (entry.opener && document.contains(entry.opener)) entry.opener.focus({ preventScroll: true });
  if (entry.onClose) entry.onClose();
}

document.addEventListener('keydown', (e) => {
  const top = stack[stack.length - 1];
  if (!top) return;
  if (e.key === 'Escape') { e.preventDefault(); closeModal(top.overlay); return; }
  if (e.key === 'Tab') {
    const dialog = top.overlay.querySelector('[role="dialog"]') || top.overlay;
    const items = focusables(dialog);
    if (!items.length) return;
    const first = items[0]; const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});
