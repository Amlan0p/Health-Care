// api.js — API client for HealthCare frontend
// Replaces all localStorage-based persistence with real HTTP calls to the backend.
//
// Usage: include this file BEFORE app.js and the inline scripts.
// All functions are exposed on window.HC_API.

(function () {
  'use strict';

  // ── Config ─────────────────────────────────────────────────────────────────
  // Change API_BASE to your deployed backend URL when deploying to production.
  // For local dev, make sure the backend is running on port 3001.
  const API_BASE = 'https://healthcare-backend-cxhj.onrender.com/api';

  // ── Token helpers ───────────────────────────────────────────────────────────
  function getToken()        { return localStorage.getItem('hc_token'); }
  function setToken(t)       { localStorage.setItem('hc_token', t); }
  function clearToken()      { localStorage.removeItem('hc_token'); }

  // ── Base fetch ──────────────────────────────────────────────────────────────
  async function apiFetch(path, opts = {}) {
    const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    const token = getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;

    const res = await fetch(API_BASE + path, { ...opts, headers });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      const msg = json.error || `Request failed (${res.status})`;
      throw new Error(msg);
    }
    return json;
  }

  // ── Auth ────────────────────────────────────────────────────────────────────
  async function signUp({ name, email, password }) {
    const data = await apiFetch('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    });
    setToken(data.token);
    return data.user;   // { id, name, email }
  }

  async function signIn({ email, password }) {
    const data = await apiFetch('/auth/signin', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setToken(data.token);
    return data.user;
  }

  async function getMe() {
    const data = await apiFetch('/auth/me');
    return data.user;
  }

  function signOut() {
    clearToken();
  }

  // ── Appointments ────────────────────────────────────────────────────────────
  async function getAppointments() {
    return apiFetch('/appointments');
  }

  async function addAppointment(appt) {
    return apiFetch('/appointments', { method: 'POST', body: JSON.stringify(appt) });
  }

  async function deleteAppointment(id) {
    return apiFetch('/appointments/' + id, { method: 'DELETE' });
  }

  // ── Medications ─────────────────────────────────────────────────────────────
  async function getMedications() {
    return apiFetch('/medications');
  }

  async function addMedication({ name, time, status }) {
    return apiFetch('/medications', { method: 'POST', body: JSON.stringify({ name, time, status }) });
  }

  async function updateMedicationStatus(id, status) {
    return apiFetch('/medications/' + id + '/status', {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  }

  async function deleteMedication(id) {
    return apiFetch('/medications/' + id, { method: 'DELETE' });
  }

  // ── Vitals ──────────────────────────────────────────────────────────────────
  async function getVitals() {
    return apiFetch('/vitals');
  }

  async function saveVital(key, value) {
    return apiFetch('/vitals', { method: 'PUT', body: JSON.stringify({ key, value }) });
  }

  // ── Expose ──────────────────────────────────────────────────────────────────
  window.HC_API = {
    signUp, signIn, getMe, signOut,
    getAppointments, addAppointment, deleteAppointment,
    getMedications, addMedication, updateMedicationStatus, deleteMedication,
    getVitals, saveVital,
    getToken, setToken, clearToken,
  };
})();
