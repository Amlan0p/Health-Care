import { request } from './client.js';
export const listMedications = () => request('/medications');
export const createMedication = ({ name, time, status }) => request('/medications', { method: 'POST', body: { name, time, status } });
export const updateMedication = (id, patch) => request(`/medications/${id}`, { method: 'PATCH', body: patch });
export const deleteMedication = (id) => request(`/medications/${id}`, { method: 'DELETE' });
