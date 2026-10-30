import { byId, esc } from '../../utils/dom.js';
import { icon } from '../../components/icons.js';
import { openModal, closeModal } from '../../components/modal.js';
import { toast } from '../../components/toast.js';
import { loadData } from '../../utils/data.js';
import { loadingHtml, errorHtml, emptyHtml } from '../../utils/states.js';
import * as api from '../../api/medications.js';

const DOT = { taken: '#6ec25b', pending: '#e6a817', missed: '#e53e3e' };
const LABEL = { taken: 'Taken', pending: 'Pending', missed: 'Missed' };
const NEXT = { pending: 'taken', taken: 'missed', missed: 'pending' };
let meds = [];

const targets = () => [byId('medicationsContainer'), byId('recordsMedicationsContainer')];
const paint = (html) => targets().forEach((c) => { if (c) c.innerHTML = html; });

function render() {
  paint(meds.length === 0
    ? emptyHtml('No medications added yet.<br>Tap <strong>+ Add</strong> to add one.')
    : meds.map((m) => `
    <div class="med-item" style="position:relative;">
      <div class="med-dot" style="background:${DOT[m.status]}"></div>
      <div class="med-info"><div class="med-name">${esc(m.name)}</div><div class="med-time">${esc(m.time)}</div></div>
      <div class="med-status ${esc(m.status)}" data-action="cycle-med" data-arg="${m.id}" title="Click to change status" aria-label="${esc(m.name)}: ${LABEL[m.status]}. Click to change status">${LABEL[m.status]}</div>
      <button type="button" class="row-del" data-action="delete-med" data-arg="${m.id}" aria-label="Remove ${esc(m.name)}" title="Remove">${icon('x')}</button>
    </div>`).join(''));
}

export async function loadMedications() {
  paint(loadingHtml('Loading medications…'));
  try { meds = await api.listMedications(); render(); }
  catch (err) { paint(errorHtml(`Could not load medications. ${err.message}`, 'medications')); }
}
export const resetMedications = () => { meds = []; };

export async function cycleMed(id) {
  const med = meds.find((m) => m.id === Number(id));
  if (!med) return;
  try { const updated = await api.updateMedication(med.id, { status: NEXT[med.status] }); Object.assign(med, updated); render(); }
  catch (err) { toast(err.message, 'error'); }
}
export async function deleteMed(id) {
  try { await api.deleteMedication(Number(id)); meds = meds.filter((m) => m.id !== Number(id)); render(); }
  catch (err) { toast(err.message, 'error'); }
}

// ── Add-medication modal ──
const modal = () => byId('addMedModal');
export async function openAddMed() {
  byId('newMedName').value = ''; byId('newMedTime').value = ''; byId('newMedStatus').value = 'pending';
  byId('addMedError').style.display = 'none';
  openModal(modal(), 'show');
  try {
    const { medications } = await loadData('med-suggestions');
    byId('medSuggestions').innerHTML = medications.map((m) => `<option value="${esc(m.name)}">`).join('');
  } catch { /* suggestions are optional */ }
}
export const closeAddMed = () => closeModal(modal());

export async function confirmAddMed() {
  const name = byId('newMedName').value.trim();
  const time = byId('newMedTime').value.trim();
  const status = byId('newMedStatus').value;
  const err = byId('addMedError');
  const fail = (m) => { err.textContent = m; err.style.display = 'block'; };
  err.style.display = 'none';
  if (!name) return fail('Please enter a medication name.');
  if (!time) return fail('Please enter when to take this medication.');
  try {
    const newMed = await api.createMedication({ name, time, status });
    meds.push(newMed);
    render();
    closeAddMed();
    toast(`Added "${name}" to your medication schedule!`, 'success');
  } catch (e) {
    fail(e.message || 'Failed to add medication.');
  }
}
