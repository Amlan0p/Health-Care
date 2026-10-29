// Session state. The JWT lives in localStorage (see README → Security trade-offs); user info is kept in memory.
import * as authApi from '../api/auth.js';
import { tokenStore } from '../api/client.js';

let currentUser = null;
export const getUser = () => currentUser;
export const isDemo = () => Boolean(currentUser?.isDemo);
export const setUser = (user) => { currentUser = user; };

export async function logout() {
  await authApi.signOut();
  currentUser = null;
}
export function dropLocalSession() {
  tokenStore.clear();
  currentUser = null;
}

/** Validates a stored token with the backend. Returns the user, or null if there is no valid session. */
export async function restore() {
  if (!tokenStore.get()) return null;
  try {
    currentUser = await authApi.getMe();
    return currentUser;
  } catch (err) {
    if (err.status === 401) { dropLocalSession(); return null; }
    throw err; // network/server problem: let the caller show a real error instead of pretending we are signed out
  }
}
