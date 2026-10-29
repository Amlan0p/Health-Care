import { request, tokenStore } from './client.js';

export async function signUp({ name, email, password }) {
  const data = await request('/auth/signup', { method: 'POST', body: { name, email, password }, auth: false });
  tokenStore.set(data.token);
  return data.user;
}
export async function signIn({ email, password }) {
  const data = await request('/auth/signin', { method: 'POST', body: { email, password }, auth: false });
  tokenStore.set(data.token);
  return data.user;
}
export async function startDemo() {
  const data = await request('/auth/demo', { method: 'POST', auth: false });
  tokenStore.set(data.token);
  return data.user;
}
export async function getMe() { return (await request('/auth/me')).user; }

/** Revokes the token server-side (best effort) and always clears it locally. */
export async function signOut() {
  try { if (tokenStore.get()) await request('/auth/logout', { method: 'POST', timeoutMs: 5000 }); }
  catch { /* the local token is cleared regardless */ }
  tokenStore.clear();
}
