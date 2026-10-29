import { request } from './client.js';

// Server-provided reference content (doctor directory, symptom list, vital definitions). Cached after first success.
const cache = {};
const cached = (key, path) => async () => {
  if (!cache[key]) cache[key] = await request(path, { auth: false });
  return cache[key];
};
export const getDoctors = cached('doctors', '/content/doctors');
export const getSymptoms = cached('symptoms', '/content/symptoms');
export const getVitalDefs = cached('vitals', '/content/vitals');
