// appointments.js
// All appointment persistence is now handled by the backend via HC_API (api.js).
// These stubs exist only so any external callers don't get ReferenceErrors.

function loadUserAppointments()       { return []; }
function saveUserAppointments(appts)  { /* no-op — use HC_API.addAppointment / deleteAppointment */ }
function addUserAppointment(appt)     { return HC_API.addAppointment(appt); }
function removeUserAppointment(idx)   { /* no-op — handled inside index.html removeAppt() */ }

window.loadUserAppointments  = loadUserAppointments;
window.saveUserAppointments  = saveUserAppointments;
window.addUserAppointment    = addUserAppointment;
window.removeUserAppointment = removeUserAppointment;
