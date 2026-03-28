// user.js
// Utility helpers that work alongside the inline auth system in Index.html.

/**
 * Returns the currently logged-in user object, or null if not logged in.
 * Reads from the same hc_user key used by the inline auth system.
 */
function getCurrentUser() {
  try {
    const raw = localStorage.getItem('hc_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Logs the user out and returns them to the home page.
 * Delegates to signOut() which is defined in the inline script.
 */
function logout() {
  if (typeof signOut === 'function') {
    signOut();
  } else {
    localStorage.removeItem('hc_token');
    localStorage.removeItem('hc_user');
    localStorage.removeItem('hc_demo');
    if (typeof goHome === 'function') goHome();
  }
}

window.getCurrentUser = getCurrentUser;
window.logout = logout;
