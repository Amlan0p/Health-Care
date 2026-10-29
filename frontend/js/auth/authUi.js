import { byId } from '../utils/dom.js';
import { icon } from '../components/icons.js';
import { openModal, closeModal } from '../components/modal.js';
import * as authApi from '../api/auth.js';
import { setUser } from './session.js';

const modal = () => byId('authModal');
let onAuthenticated = () => {};
export const setAuthenticatedHandler = (fn) => { onAuthenticated = fn; };

export function openAuth(tab = 'signin', message = '') {
  openModal(modal(), 'open');
  switchTab(tab);
  if (message) showError(tab === 'signin' ? 'siError' : 'suError', message);
}
export const closeAuth = () => closeModal(modal());

export function switchTab(tab) {
  const signin = tab === 'signin';
  for (const [id, active] of [['tabSignIn', signin], ['tabSignUp', !signin]]) {
    const b = byId(id);
    b.classList.toggle('active', active);
    b.setAttribute('aria-selected', String(active));
  }
  byId('formSignIn').style.display = signin ? '' : 'none';
  byId('formSignUp').style.display = signin ? 'none' : '';
  for (const id of ['siError', 'suError', 'suSuccess']) byId(id).classList.remove('show');
}

function showError(id, msg) { const el = byId(id); el.textContent = msg; el.classList.add('show'); }
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

function setBusy(btn, busy, busyLabel, idleLabel) {
  btn.disabled = busy;
  btn.innerHTML = busy ? `${icon('loader-circle', 'icon-spin')} ${busyLabel}` : idleLabel;
}

async function handleSignIn(e) {
  e.preventDefault();
  const email = byId('siEmail').value.trim();
  const password = byId('siPassword').value;
  const err = byId('siError'); err.classList.remove('show');
  if (!isEmail(email)) return showError('siError', 'Please enter a valid email address.');
  if (!password) return showError('siError', 'Please enter your password.');
  const btn = byId('siSubmit');
  setBusy(btn, true, 'Signing in…', 'SIGN IN TO DASHBOARD');
  try {
    setUser(await authApi.signIn({ email, password }));
    byId('signInForm').reset();
    closeAuth();
    await onAuthenticated();
  } catch (ex) {
    showError('siError', ex.message || 'Sign in failed. Please try again.');
  } finally {
    setBusy(btn, false, '', 'SIGN IN TO DASHBOARD');
  }
}

async function handleSignUp(e) {
  e.preventDefault();
  const first = byId('suFirst').value.trim();
  const last = byId('suLast').value.trim();
  const email = byId('suEmail').value.trim();
  const password = byId('suPassword').value;
  const confirm = byId('suConfirm').value;
  byId('suError').classList.remove('show'); byId('suSuccess').classList.remove('show');
  if (!first) return showError('suError', 'Please enter your first name.');
  if (!isEmail(email)) return showError('suError', 'Please enter a valid email address.');
  if (password.length < 8) return showError('suError', 'Password must be at least 8 characters.');
  if (new TextEncoder().encode(password).length > 72) return showError('suError', 'Password must be at most 72 bytes.');
  if (password !== confirm) return showError('suError', 'Passwords do not match.');
  const btn = byId('suSubmit');
  setBusy(btn, true, 'Creating account…', 'CREATE ACCOUNT');
  try {
    setUser(await authApi.signUp({ name: `${first} ${last}`.trim(), email, password }));
    byId('signUpForm').reset();
    closeAuth();
    await onAuthenticated();
  } catch (ex) {
    showError('suError', ex.message || 'Sign up failed. Please try again.');
  } finally {
    setBusy(btn, false, '', 'CREATE ACCOUNT');
  }
}

export async function demoLogin() {
  const err = byId('siError'); err.classList.remove('show');
  try {
    setUser(await authApi.startDemo());
    closeAuth();
    await onAuthenticated();
  } catch (ex) {
    showError('siError', ex.status === 404 ? 'Demo mode is not available on this server.' : (ex.message || 'Could not start the demo.'));
  }
}

export function initAuthUi() {
  byId('signInForm').addEventListener('submit', handleSignIn);
  byId('signUpForm').addEventListener('submit', handleSignUp);
}
