// Central click delegation: markup declares data-action="name" [data-arg="value"];
// features register handlers here. Replaces all inline onclick="" attributes (CSP-friendly).
const handlers = new Map();

export function registerActions(map) {
  for (const [name, fn] of Object.entries(map)) handlers.set(name, fn);
}

document.addEventListener('click', (event) => {
  const el = event.target.closest('[data-action]');
  if (!el) return;
  const fn = handlers.get(el.dataset.action);
  if (!fn) return;
  if (el.tagName === 'A') event.preventDefault();
  fn({ el, arg: el.dataset.arg, dataset: el.dataset, event });
});
