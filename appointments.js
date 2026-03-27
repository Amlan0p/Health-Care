// appointments.js
// Appointment persistence — stores appointments per logged-in user.
// Uses the key  hc_appointments_<email>  so each account is isolated.
// The full rich appointment object is stored:
//   { id, doctor, spec, hospital, day, mon, time, dateRaw }

function _apptKey() {
  const user = (typeof currentUser !== 'undefined' && currentUser) ? currentUser : null;
  return 'hc_appointments_' + (user ? user.email : 'guest');
}

function loadUserAppointments() {
  try {
    const raw = localStorage.getItem(_apptKey());
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveUserAppointments(appts) {
  try {
    localStorage.setItem(_apptKey(), JSON.stringify(appts));
  } catch(e) {}
}

function addUserAppointment(appt) {
  const appts = loadUserAppointments();
  appt.id = appt.id || (Date.now() + Math.random());
  appts.push(appt);
  saveUserAppointments(appts);
}

function removeUserAppointment(idx) {
  const appts = loadUserAppointments();
  appts.splice(idx, 1);
  saveUserAppointments(appts);
}

window.loadUserAppointments  = loadUserAppointments;
window.saveUserAppointments  = saveUserAppointments;
window.addUserAppointment    = addUserAppointment;
window.removeUserAppointment = removeUserAppointment;
