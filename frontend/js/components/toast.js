let timer;
export function toast(message, type = 'info', ms = 4000) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  el.className = `toast${type === 'error' ? ' err' : ''}`;
  el.textContent = message;
  el.style.display = 'block';
  clearTimeout(timer);
  timer = setTimeout(() => { el.style.display = 'none'; }, ms);
}
