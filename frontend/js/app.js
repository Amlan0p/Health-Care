// Application bootstrap: wires modules together. No business logic lives here.
import { registerActions } from './utils/actions.js';
import { byId } from './utils/dom.js';
import { initTheme } from './components/theme.js';
import { initA11y } from './components/a11y.js';
import { initNav } from './components/nav.js';
import { refreshStatus } from './components/status.js';
import { closeModal } from './components/modal.js';
import { toast } from './components/toast.js';
import { restore, logout, dropLocalSession } from './auth/session.js';
import { initAuthUi, openAuth, closeAuth, switchTab, demoLogin, setAuthenticatedHandler } from './auth/authUi.js';
import { initHero } from './features/home/hero.js';
import { initNews, initLegal } from './features/news/news.js';
import { initContact } from './features/contact/contact.js';
import * as dash from './features/dashboard.js';
import * as meds from './features/medications/medications.js';
import * as appts from './features/appointments/appointments.js';
import * as vitals from './features/vitals/vitals.js';
import * as symptoms from './features/symptoms/symptoms.js';
import * as chat from './features/chat/chat.js';
import * as map from './features/hospitals/map.js';

const overlayClose = (modalId, fn) => ({ el, event }) => { if (event.target === el) fn(); };

registerActions({
  'go-home': () => { closeAuth(); dash.showPage('page-home'); },
  'go-to-auth': () => { dash.showPage('page-home'); openAuth('signin'); },
  'go-to-auth-signup': () => { dash.showPage('page-home'); openAuth('signup'); },
  'scroll-to': ({ arg }) => byId(arg)?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }),
  'close-auth': closeAuth,
  'overlay-auth': overlayClose('authModal', closeAuth),
  'auth-tab': ({ arg }) => switchTab(arg),
  'demo-login': demoLogin,
  'sign-out': async () => { await logout(); dash.leaveDashboard(); },
  'show-panel': ({ arg }) => dash.showPanel(arg),
  'open-sos': dash.openSOS,
  'close-sos': dash.closeSOS,
  'retry': dash.retry,
  // appointments
  'open-book-appt': appts.openBook, 'close-book-appt': appts.closeBook, 'select-doctor': ({ arg }) => appts.selectDoctor(arg),
  'appt-back': appts.apptBack, 'confirm-appt': appts.confirmAppt, 'remove-appt': ({ arg }) => appts.removeAppt(arg),
  // medications
  'open-add-med': meds.openAddMed, 'close-add-med': meds.closeAddMed, 'confirm-add-med': meds.confirmAddMed,
  'overlay-add-med': overlayClose('addMedModal', meds.closeAddMed),
  'cycle-med': ({ arg }) => meds.cycleMed(arg), 'delete-med': ({ arg }) => meds.deleteMed(arg),
  // vitals
  'edit-vital': ({ arg }) => vitals.openEdit(arg), 'close-edit-vital': vitals.closeEdit, 'save-vital': vitals.saveVital, 'clear-vital': vitals.clearVital,
  'overlay-edit-vital': overlayClose('editVitalModal', vitals.closeEdit),
  // symptoms / chat / map
  'toggle-symptom': ({ el }) => symptoms.toggleSymptom(el), 'check-symptoms': symptoms.checkSymptoms,
  'send-chat': () => chat.sendMsg(), 'ask-quick': chat.askQuick, 'clear-chat': chat.clearChat,
  'locate-user': map.locateUser, 'open-google-maps': map.openGoogleMaps,
});

// Close any dashboard overlay when clicking its backdrop (SOS and appointment overlays have no dedicated action).
for (const [id, fn] of [['sosModal', dash.closeSOS], ['bookApptModal', appts.closeBook]]) {
  byId(id)?.addEventListener('click', (e) => { if (e.target === e.currentTarget) fn(); });
}
byId('editVitalInput')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); vitals.saveVital(); } });

// Expired / revoked session: return to the sign-in form with an explanation.
window.addEventListener('hc:session-expired', () => {
  dropLocalSession(); dash.leaveDashboard();
  document.querySelectorAll('.sos-modal-overlay.show, .edit-vital-modal-overlay.show, .add-med-modal-overlay.show, .news-modal-overlay.open').forEach((m) => closeModal(m));
  openAuth('signin', 'Your session has expired. Please sign in again.');
});

setAuthenticatedHandler(dash.enterDashboard);

async function boot() {
  initTheme(); initA11y(); initNav(); initAuthUi(); initHero(); initContact(); initLegal(); chat.initChat();
  initNews();
  refreshStatus();

  try {
    if (await restore()) await dash.enterDashboard();
  } catch {
    toast('Could not reach the server to restore your session. Please check your connection.', 'error', 6000);
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

