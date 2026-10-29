import { request } from './client.js';
export const listVitals = () => request('/vitals');
export const saveVital = (key, value) => request('/vitals', { method: 'PUT', body: { key, value } });
export const clearVital = (key) => request(`/vitals/${encodeURIComponent(key)}`, { method: 'DELETE' });
