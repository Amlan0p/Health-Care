// app.js — entry point

console.log('HealthCare app loaded.');

// showPage is already defined in the inline script inside Index.html.
// Redefining it here would override that version and break navigation,
// so it is intentionally NOT redefined.
//
// If you need to call it from outside:  showPage('page-dashboard')
// If you need to check the current user: getCurrentUser()

document.addEventListener('DOMContentLoaded', function () {
  // Restore session on page load (handled by restoreSession() in the
  // inline script, but we call it here as a safety net in case the
  // inline call fires before the DOM is ready).
  if (typeof restoreSession === 'function') {
    restoreSession();
  }
});
