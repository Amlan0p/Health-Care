import { byId, $$ } from '../../utils/dom.js';
import { icon } from '../../components/icons.js';
import { sendContact, subscribeNewsletter } from '../../api/public.js';

const cfg = window.HC_CONFIG || {};
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

function initSocialLinks() {
  const links = { ...(cfg.socialLinks || {}), email: cfg.contactEmail ? `mailto:${cfg.contactEmail}` : '' };
  $$('[data-social]').forEach((a) => {
    const url = links[a.dataset.social];
    if (url) { a.href = url; if (!url.startsWith('mailto:')) { a.target = '_blank'; a.rel = 'noopener noreferrer'; } return; }
    // Not configured: keep the icon but make it clearly unavailable (no dead "#" link, no fake action).
    a.removeAttribute('href');
    a.setAttribute('aria-disabled', 'true');
    a.title = `${a.title} — not configured`;
    a.style.opacity = '0.45'; a.style.cursor = 'not-allowed';
  });
}

function status(el, msg, ok) { el.textContent = msg; el.className = `form-status ${ok ? 'ok' : 'err'}`; }

function initContactForm() {
  const form = byId('contactForm'); const out = byId('cfStatus'); const btn = byId('cfSend');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = { name: byId('cfName').value.trim(), email: byId('cfEmail').value.trim(), subject: byId('cfSubject').value.trim(), message: byId('cfMessage').value.trim() };
    if (!payload.name) return status(out, 'Please enter your name.', false);
    if (!isEmail(payload.email)) return status(out, 'Please enter a valid email address.', false);
    if (payload.message.length < 5) return status(out, 'Please write a message of at least 5 characters.', false);
    btn.disabled = true; out.textContent = 'Sending…'; out.className = 'form-status';
    try {
      await sendContact(payload);
      form.reset();
      status(out, 'Thank you. Your message has been received and stored for our team to read. We cannot promise a reply time, and this form is not for emergencies.', true);
    } catch (err) {
      status(out, err.message || 'Your message could not be sent. Please try again.', false);
    } finally { btn.disabled = false; }
  });
}

function initNewsletter() {
  const btn = byId('nlBtn'); const input = byId('nlEmail'); const note = byId('nlNote');
  btn.addEventListener('click', async () => {
    const email = input.value.trim();
    if (!isEmail(email)) { note.textContent = 'Please enter a valid email address.'; note.style.color = '#e53e3e'; return; }
    btn.disabled = true; note.style.color = '';
    try {
      const r = await subscribeNewsletter(email);
      input.value = '';
      note.textContent = r.status === 'already_subscribed' ? 'That address is already on the list.' : 'Your email address has been saved to the list. No emails are sent automatically yet.';
    } catch (err) {
      note.textContent = err.message || 'Could not subscribe. Please try again.'; note.style.color = '#e53e3e';
    } finally { btn.disabled = false; }
  });
}

export function initContact() { initSocialLinks(); initContactForm(); initNewsletter(); }
