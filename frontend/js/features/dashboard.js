import { byId, $, $$, esc } from '../utils/dom.js';
import { icon } from '../components/icons.js';
import { openModal, closeModal } from '../components/modal.js';
import { loadData } from '../utils/data.js';
import { isDemo, getUser } from '../auth/session.js';
import * as meds from './medications/medications.js';
import * as appts from './appointments/appointments.js';
import * as vitals from './vitals/vitals.js';
import * as symptoms from './symptoms/symptoms.js';
import * as chat from './chat/chat.js';
import * as map from './hospitals/map.js';

export function showPage(id) {
  ['page-home', 'page-dashboard'].forEach((pid) => { const el = byId(pid); if (el) el.style.display = pid === id ? 'block' : 'none'; });
  window.scrollTo(0, 0);
}

export function showPanel(name) {
  $$('.panels').forEach((p) => p.classList.remove('active'));
  $$('.dash-nav-tabs button').forEach((b) => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
  byId(`panel-${name}`)?.classList.add('active');
  const tab = $(`.dash-nav-tabs button[data-arg="${name}"]`);
  if (tab) { tab.classList.add('active'); tab.setAttribute('aria-selected', 'true'); tab.scrollIntoView?.({ block: 'nearest', inline: 'center' }); }
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (name === 'hospitals') setTimeout(map.initMap, 100);
}

const sosModal = () => byId('sosModal');
export const openSOS = () => openModal(sosModal(), 'show');
export const closeSOS = () => closeModal(sosModal());

async function showTip() {
  try {
    const { tips } = await loadData('tips');
    const day = Math.floor(Date.now() / 86400000);
    byId('tipText').textContent = ` ${tips[day % tips.length]}`;
  } catch { byId('tipText').textContent = ' Stay hydrated and call 112 in an emergency.'; }
}

/** Entered after a successful sign-in / restored session. Every list loads from the backend (per-user). */
export async function enterDashboard() {
  showPage('page-dashboard');
  const user = getUser();
  const btn = byId('userBtn');
  if (btn) {
    const name = user?.name || 'Account';
    btn.innerHTML = `${icon('user')} ${esc(name)}`;
    btn.title = 'Sign out'; btn.setAttribute('aria-label', `Sign out (${name})`);
  }
  byId('demoBanner').style.display = isDemo() ? 'flex' : 'none';
  showPanel('home');
  showTip();
  symptoms.loadRisks();
  await Promise.allSettled([meds.loadMedications(), appts.loadAppointments(), vitals.loadVitals(), symptoms.loadSymptoms(), chat.loadChatHistory()]);
}

export function leaveDashboard() {
  meds.resetMedications(); appts.resetAppointments(); vitals.resetVitals(); chat.resetChatView();
  byId('symptomResult').innerHTML = ''; byId('symptomResult').classList.remove('show');
  showPage('page-home');
}

export const retry = ({ arg }) => ({
  medications: meds.loadMedications, appointments: appts.loadAppointments, vitals: vitals.loadVitals,
  symptoms: symptoms.loadSymptoms, doctors: appts.openBook,
}[arg] || (() => {}))();
