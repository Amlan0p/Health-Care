import { request } from './client.js';
export const listAppointments = () => request('/appointments');
export const createAppointment = ({ doctorId, date, time }) => request('/appointments', { method: 'POST', body: { doctorId, date, time } });
export const deleteAppointment = (id) => request(`/appointments/${id}`, { method: 'DELETE' });
