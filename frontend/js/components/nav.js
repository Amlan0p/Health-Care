import { byId } from '../utils/dom.js';
import { icon } from './icons.js';

function setMenu(open) {
  const nav = byId('homeNav'); const btn = byId('navToggle');
  if (!nav || !btn) return;
  nav.classList.toggle('nav-open', open);
  btn.setAttribute('aria-expanded', String(open));
  btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  btn.innerHTML = icon(open ? 'x' : 'menu');
}

function revealOnScroll() {
  const threshold = window.innerHeight * 0.88;
  for (const id of ['newsHeader', 'servicesHeader', 'tickerWrap', 'filterRow']) {
    const el = byId(id);
    if (el && el.getBoundingClientRect().top < threshold) el.classList.add('visible');
  }
  document.querySelectorAll('.news-card, .s-card').forEach((c) => { if (c.getBoundingClientRect().top < threshold) c.classList.add('card-visible'); });
  document.querySelectorAll('.service-card').forEach((c) => {
    if (c.getBoundingClientRect().top < threshold) { c.style.opacity = '1'; c.style.transform = 'translateY(0)'; }
  });
}
export { revealOnScroll };

export function initNav() {
  byId('navToggle')?.addEventListener('click', () => setMenu(!byId('homeNav').classList.contains('nav-open')));
  byId('navLinks')?.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });
  window.addEventListener('resize', () => { if (window.innerWidth > 960) setMenu(false); });

  const sections = [['#home', 'home'], ['#services', 'services'], ['#news-section', 'news'], ['#contact', 'contact']];
  let ticking = false;
  const onScroll = () => {
    ticking = false;
    const total = document.body.scrollHeight - window.innerHeight;
    if (total > 0) byId('readProgress').style.width = `${(window.scrollY / total) * 100}%`;
    byId('homeNav')?.classList.toggle('scrolled', window.scrollY > 30);
    byId('backTop')?.classList.toggle('show', window.scrollY > 400);
    revealOnScroll();
    let active = 0;
    sections.forEach(([sel], i) => { const el = document.querySelector(sel); if (el && el.getBoundingClientRect().top <= 120) active = i; });
    document.querySelectorAll('.nav-links a[data-section]').forEach((a) => {
      const on = a.dataset.section === sections[active][1];
      a.classList.toggle('active', on);
      if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
    });
  };
  window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  byId('backTop')?.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  onScroll();
}
