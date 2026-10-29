import { byId, esc } from '../../utils/dom.js';
import { icon } from '../../components/icons.js';
import { openModal, closeModal } from '../../components/modal.js';
import { toast } from '../../components/toast.js';
import { loadingHtml, errorHtml } from '../../utils/states.js';
import * as api from '../../api/vitals.js';
import { getVitalDefs } from '../../api/content.js';

let defs = [];
let values = {};
let editingKey = null;
const GRIDS = ['vitalsGridAI', 'vitalsGridRecords'];

function render() {
  const html = defs.map((v) => {
    const has = values[v.key] !== undefined && values[v.key] !== '';
    return `
    <div class="vital-card" data-action="edit-vital" data-arg="${esc(v.key)}" title="Click to ${has ? 'edit' : 'add'}" aria-label="${esc(v.label)}: ${has ? esc(values[v.key]) + ' ' + esc(v.unit) : 'no reading'}. Click to ${has ? 'edit' : 'add'}">
      <div class="vital-icon">${icon(v.icon)}</div>
      <div class="vital-val${has ? '' : ' vital-val-empty'}">${has ? `${esc(values[v.key])} <span class="vital-unit">${esc(v.unit)}</span>` : '--'}</div>
      <div class="vital-label">${esc(v.label)}</div>
      <div class="vital-edit-hint">${has ? 'tap to edit' : 'tap to add'}</div>
    </div>`;
  }).join('');
  GRIDS.forEach((id) => { const el = byId(id); if (el) el.innerHTML = html; });
}

export async function loadVitals() {
  GRIDS.forEach((id) => { const el = byId(id); if (el) el.innerHTML = loadingHtml('Loading vitals…'); });
  try {
    const [d, v] = await Promise.all([getVitalDefs(), api.listVitals()]);
    defs = d.vitals; values = v || {}; render();
  } catch (err) {
    GRIDS.forEach((id) => { const el = byId(id); if (el) el.innerHTML = errorHtml(`Could not load vitals. ${err.message}`, 'vitals'); });
  }
}
export const resetVitals = () => { values = {}; };
export const getVitalValues = () => values;

const modal = () => byId('editVitalModal');
const setError = (m) => { const e = byId('editVitalError'); e.textContent = m || ''; e.classList.toggle('show', Boolean(m)); };

export function openEdit(key) {
  const def = defs.find((v) => v.key === key);
  if (!def) return;
  editingKey = key; setError('');
  byId('editVitalTitle').innerHTML = `${icon('pencil')} ${values[key] ? 'Edit' : 'Add'} ${esc(def.label)}`;
  byId('editVitalLabel').textContent = `${def.label} (${def.unit})`;
  // Empty by default: no invented "default" reading is ever pre-filled or saved on the user's behalf.
  byId('editVitalInput').value = values[key] || '';
  byId('editVitalInput').placeholder = `e.g. ${def.example}`;
  byId('editVitalHint').textContent = def.hint;
  byId('clearVitalBtn').style.display = values[key] ? '' : 'none';
  openModal(modal(), 'show');
}
export function closeEdit() { closeModal(modal()); editingKey = null; }

export async function saveVital() {
  if (!editingKey) return;
  const raw = byId('editVitalInput').value.trim();
  if (!raw) return setError('Please enter a value.');
  try { const r = await api.saveVital(editingKey, raw); values[editingKey] = r.value; render(); closeEdit(); }
  catch (err) { setError(err.message || 'Could not save this reading.'); }
}
export async function clearVital() {
  if (!editingKey) return;
  try { await api.clearVital(editingKey); delete values[editingKey]; render(); closeEdit(); }
  catch (err) { toast(err.message, 'error'); }
}
