import { byId, esc } from '../../utils/dom.js';
import { icon } from '../../components/icons.js';
import { openModal, closeModal } from '../../components/modal.js';
import { toast } from '../../components/toast.js';
import { dateParts, timeLabel, localDate } from '../../utils/format.js';
import { loadingHtml, errorHtml, emptyHtml } from '../../utils/states.js';
import * as api from '../../api/appointments.js';
import { getDoctors } from '../../api/content.js';

let appointments = [];
let doctors = null;
let selected = null;

export async function loadAppointments() {
  const box = byId('appointmentsContainer');
  box.innerHTML = loadingHtml('Loading appointments…');
  try { appointments = await api.listAppointments(); render(); }
  catch (err) { box.innerHTML = errorHtml(`Could not load appointments. ${err.message}`, 'appointments'); }
}
export const resetAppointments = () => { appointments = []; };

function render() {
  const box = byId('appointmentsContainer');
  if (!appointments.length) { box.innerHTML = emptyHtml('No appointments saved.<br>Tap <strong>+ Book Appointment</strong> to add one.'); return; }
  box.innerHTML = appointments.map((a) => {
    const { day, mon } = dateParts(a.date);
    return `
    <div class="appt-item" style="position:relative;">
      <div class="appt-date"><span class="appt-day">${esc(day)}</span><span class="appt-mon">${esc(mon)}</span></div>
      <div class="appt-info"><div class="appt-doc">${esc(a.doctor)}</div><div class="appt-spec">${esc(a.spec)} — ${esc(a.hospital)}</div></div>
      <div class="appt-time">${esc(timeLabel(a.time))}</div>
      <button type="button" class="row-del appt-del" data-action="remove-appt" data-arg="${a.id}" aria-label="Remove appointment with ${esc(a.doctor)}" title="Remove">${icon('x')}</button>
    </div>`;
  }).join('');
}

export async function removeAppt(id) {
  try { await api.deleteAppointment(Number(id)); appointments = appointments.filter((a) => a.id !== Number(id)); render(); }
  catch (err) { toast(err.message, 'error'); }
}

// ── Booking modal ──
const modal = () => byId('bookApptModal');
const setError = (m) => { const e = byId('apptError'); e.textContent = m || ''; e.classList.toggle('show', Boolean(m)); };

export async function openBook() {
  selected = null; setError('');
  byId('apptStep1').style.display = 'block'; byId('apptStep2').style.display = 'none';
  const list = byId('doctorList');
  list.innerHTML = loadingHtml('Loading doctors…');
  openModal(modal(), 'show');
  byId('apptDateInput').min = localDate(0);
  byId('apptDateInput').value = localDate(1);
  try {
    doctors = await getDoctors();
    byId('doctorNotice').textContent = doctors.notice;
    byId('apptTimeInput').innerHTML = doctors.slots.map((s) => `<option value="${esc(s)}">${esc(timeLabel(s))}</option>`).join('');
    list.innerHTML = doctors.doctors.map((d) => `
      <button type="button" class="doctor-row" data-action="select-doctor" data-arg="${esc(d.id)}">
        <span class="doctor-ico">${icon(d.icon)}</span>
        <span class="doctor-meta"><span class="doctor-name">${esc(d.name)}</span><span class="doctor-sub">${esc(d.spec)} · ${esc(d.hospital)}</span></span>
        <span class="doctor-select">Select ${icon('arrow-right')}</span>
      </button>`).join('');
  } catch (err) { list.innerHTML = errorHtml(`Could not load the doctor list. ${err.message}`, 'doctors'); }
}
export const closeBook = () => closeModal(modal());

export function selectDoctor(id) {
  selected = doctors?.doctors.find((d) => d.id === id);
  if (!selected) return;
  byId('apptStep1').style.display = 'none'; byId('apptStep2').style.display = 'block';
  byId('selectedDoctorPreview').innerHTML = `
    <div style="font-size:1.5rem;">${icon(selected.icon)}</div>
    <div><div style="font-family:'Nunito',sans-serif;font-weight:700;color:var(--text-dark);font-size:0.9rem;">${esc(selected.name)}</div>
    <div style="font-size:0.78rem;color:var(--text-body);">${esc(selected.spec)} · ${esc(selected.hospital)}</div></div>`;
}
export function apptBack() { byId('apptStep2').style.display = 'none'; byId('apptStep1').style.display = 'block'; setError(''); }

export async function confirmAppt() {
  if (!selected) return;
  const date = byId('apptDateInput').value; const time = byId('apptTimeInput').value;
  if (!date) return setError('Please select a date.');
  const btn = byId('confirmApptBtn'); btn.disabled = true; setError('');
  try { appointments.push(await api.createAppointment({ doctorId: selected.id, date, time })); appointments.sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)); render(); closeBook(); toast('Appointment saved to your account.'); }
  catch (err) { setError(err.message || 'Could not save the appointment.'); }
  finally { btn.disabled = false; }
}
