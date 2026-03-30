// user.js
// Utility helpers that work alongside the backend-powered auth system.

/**
 * Returns the currently logged-in user object, or null if not logged in.
 * currentUser is set in-memory by setSession() after a successful API auth call.
 */
function getCurrentUser() {
  return (typeof currentUser !== 'undefined') ? currentUser : null;
}

/**
 * Logs the user out: clears the JWT token and returns to the home page.
 */
function logout() {
  if (typeof signOut === 'function') {
    signOut();
  } else {
    if (window.HC_API) HC_API.signOut();
    if (typeof goHome === 'function') goHome();
  }
}

window.getCurrentUser = getCurrentUser;
window.logout = logout;
