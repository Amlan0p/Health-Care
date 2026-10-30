import { request } from './client.js';

export const sendContact = (payload) => request('/contact', { method: 'POST', body: payload, auth: false, retries: 0 });
export const subscribeNewsletter = (email) => request('/newsletter', { method: 'POST', body: { email }, auth: false, retries: 0 });
export const getHealth = () => request('/health', { auth: false, timeoutMs: 8000, retries: 1 });
export const getNearbyHospitals = (lat, lng, radius = 10000) =>
  request(`/hospitals/nearby?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}&radius=${encodeURIComponent(radius)}`, {
    auth: false,
    timeoutMs: 15000,
    retries: 1,
  });
