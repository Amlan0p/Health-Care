import { byId, prefersReducedMotion } from '../../utils/dom.js';
import { icon } from '../../components/icons.js';

export function initHero() {
  const reduce = prefersReducedMotion();
  const hero = byId('home');

  // Service cards fade in on scroll (skipped entirely when the user prefers reduced motion).
  document.querySelectorAll('.service-card').forEach((card, i) => {
    if (reduce) return;
    card.style.opacity = '0';
    card.style.transform = 'translateY(28px)';
    card.style.transition = `opacity 0.6s ${i * 0.1}s ease, transform 0.6s ${i * 0.1}s ease, box-shadow 0.3s, border-color 0.3s`;
  });

  if (hero && !reduce) {
    hero.addEventListener('mousemove', (e) => {
      const { width, height, left, top } = hero.getBoundingClientRect();
      const mx = (e.clientX - left) / width - 0.5;
      const my = (e.clientY - top) / height - 0.5;
      const move = (sel, x, y) => { const el = document.querySelector(sel); if (el) el.style.transform = `translate(${x}px,${y}px)`; };
      move('.virus-group', mx * 18, my * 14); move('.monitor', mx * -8, my * -6);
      move('.icon-cards', mx * 12, my * 10); move('.hero-right', mx * -6, my * -4);
    });
    hero.addEventListener('mouseleave', () => {
      ['.virus-group', '.monitor', '.icon-cards', '.hero-right'].forEach((s) => { const el = document.querySelector(s); if (el) el.style.transform = ''; });
    });
    const virus = document.querySelector('.virus-group');
    virus?.addEventListener('click', () => {
      virus.style.transition = 'transform 0.15s ease';
      virus.style.transform = 'scale(1.2) rotate(20deg)';
      setTimeout(() => { virus.style.transform = ''; }, 300);
    });
  }

  // Decorative stars + particles (static when reduced motion is requested; CSS also disables their animation).
  const stars = byId('stars');
  if (stars) {
    for (let i = 0; i < 60; i++) {
      const s = document.createElement('div'); s.classList.add('star');
      const sz = 1 + Math.random() * 3;
      s.style.cssText = `width:${sz}px;height:${sz}px;left:${Math.random() * 100}%;top:${Math.random() * 100}%;--d:${1.5 + Math.random() * 3}s;--dl:${Math.random() * 4}s;`;
      stars.appendChild(s);
    }
  }
  if (hero && !reduce) {
    for (let i = 0; i < 12; i++) {
      const p = document.createElement('div'); p.classList.add('particle');
      const size = 4 + Math.random() * 10;
      p.style.cssText = `width:${size}px;height:${size}px;left:${10 + Math.random() * 80}%;top:${20 + Math.random() * 70}%;--dur:${5 + Math.random() * 6}s;--delay:${Math.random() * 5}s;--tx:${(Math.random() - 0.5) * 120}px;`;
      hero.appendChild(p);
    }
  }

  // Typewriter headline (instant when reduced motion is requested). Leaf is an SVG icon appended at the end.
  const heading = byId('hero-heading');
  if (heading) {
    const full = 'Healthy Life Starts from Here';
    const textNode = heading.childNodes[0];
    heading.classList.add('visible');
    const finish = () => { textNode.textContent = full; heading.insertBefore(Object.assign(document.createElement('span'), { innerHTML: ' ' + icon('leaf') }), heading.querySelector('.cursor')); };
    if (reduce) finish();
    else {
      textNode.textContent = '';
      setTimeout(() => {
        let idx = 0;
        const iv = setInterval(() => {
          idx += 1; textNode.textContent = full.slice(0, idx);
          if (idx >= full.length) { clearInterval(iv); finish(); }
        }, 60);
      }, 600);
    }
  }
  document.querySelectorAll('.reveal').forEach((el) => setTimeout(() => el.classList.add('visible'), reduce ? 0 : 400));
}
