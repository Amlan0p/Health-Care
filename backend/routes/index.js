'use strict';
const express = require('express');
const { validate, idParam } = require('../validators/common');
const v = {
  auth: require('../validators/auth'),
  appt: require('../validators/appointments'),
  med: require('../validators/medications'),
  vit: require('../validators/vitals'),
  ai: require('../validators/ai'),
  pub: require('../validators/public'),
};
const { createAuthController } = require('../controllers/authController');
const { createAppointmentsController } = require('../controllers/appointmentsController');
const { createMedicationsController } = require('../controllers/medicationsController');
const { createVitalsController } = require('../controllers/vitalsController');
const { createAiController } = require('../controllers/aiController');
const { createPublicController } = require('../controllers/publicController');
const { publicContentController } = require('../controllers/contentController');

// Wraps async handlers so rejected promises reach the error middleware.
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function buildApiRouter({ db, config, tokens, auth, ai, limiters }) {
  const api = express.Router();
  const authC = createAuthController({ db, tokens, config });
  const apptC = createAppointmentsController({ db, config });
  const medC = createMedicationsController({ db });
  const vitC = createVitalsController({ db });
  const aiC = createAiController({ ai });
  const pubC = createPublicController({ db });
  const { requireAuth, denyDemo } = auth;

  // Health check (suitable for Render). Exposes no configuration or user information.
  api.get('/health', wrap(async (_req, res) => {
    const dbUp = await db.ping();
    res.status(dbUp ? 200 : 503).json({ status: dbUp ? 'ok' : 'degraded', db: dbUp ? 'up' : 'down' });
  }));

  api.use(limiters.api);

  // Nearby hospitals via Geoapify. The provider key stays on the server and is never sent to browsers.
  api.get('/hospitals/nearby', wrap(async (req, res) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const radiusRaw = req.query.radius === undefined ? 10000 : Number(req.query.radius);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
      return res.status(400).json({ error: 'Provide valid latitude and longitude.' });
    }
    if (!Number.isInteger(radiusRaw) || radiusRaw < 500 || radiusRaw > 50000) {
      return res.status(400).json({ error: 'Radius must be between 500 and 50000 metres.' });
    }
    if (!config.places.apiKey) {
      return res.status(503).json({ error: 'Hospital search is not configured. Add GEOAPIFY_API_KEY to the service environment.' });
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.places.timeoutMs);
    try {
      const url = new URL(config.places.apiUrl);
      url.searchParams.set('categories', 'healthcare.hospital');
      url.searchParams.set('filter', `circle:${lng},${lat},${radiusRaw}`);
      url.searchParams.set('bias', `proximity:${lng},${lat}`);
      url.searchParams.set('limit', '50');
      url.searchParams.set('apiKey', config.places.apiKey);
      const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
      if (!response.ok) {
        console.error(`[hospitals] Geoapify returned HTTP ${response.status}`);
        return res.status(502).json({ error: 'The hospital data provider is temporarily unavailable.' });
      }
      const payload = await response.json();
      const distanceKm = (a, b, c, d) => {
        const r = Math.PI / 180;
        const dLat = (c - a) * r; const dLng = (d - b) * r;
        const x = Math.sin(dLat / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(dLng / 2) ** 2;
        return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(Math.max(0, 1 - x)));
      };
      const hospitals = (Array.isArray(payload.features) ? payload.features : []).map((feature) => {
        const p = feature.properties || {};
        const coords = feature.geometry && feature.geometry.coordinates;
        const hospitalLng = Number(p.lon ?? (coords && coords[0]));
        const hospitalLat = Number(p.lat ?? (coords && coords[1]));
        if (!Number.isFinite(hospitalLat) || !Number.isFinite(hospitalLng)) return null;
        return {
          name: String(p.name || p.address_line1 || 'Hospital').slice(0, 180),
          type: 'Hospital',
          lat: hospitalLat,
          lng: hospitalLng,
          phone: String(p.datasource?.raw?.phone || p.datasource?.raw?.['contact:phone'] || p.phone || '').slice(0, 60),
          address: String(p.formatted || p.address_line2 || '').slice(0, 240),
          website: String(p.datasource?.raw?.website || p.website || '').slice(0, 300),
          dist: Number(distanceKm(lat, lng, hospitalLat, hospitalLng).toFixed(2)),
        };
      }).filter(Boolean).sort((a, b) => a.dist - b.dist);
      return res.json({ hospitals, count: hospitals.length, source: 'Geoapify / OpenStreetMap', radius: radiusRaw });
    } catch (error) {
      if (error.name !== 'AbortError') console.error('[hospitals] Provider request failed:', error.message);
      return res.status(error.name === 'AbortError' ? 504 : 502).json({ error: error.name === 'AbortError' ? 'Hospital search timed out. Please try again.' : 'Could not load hospital data right now.' });
    } finally {
      clearTimeout(timer);
    }
  }));

  // Public content
  api.get('/content/doctors', publicContentController.doctors);
  api.get('/content/symptoms', publicContentController.symptoms);
  api.get('/content/vitals', publicContentController.vitals);

  // Public forms
  api.post('/contact', limiters.publicForm, validate(v.pub.contact), wrap(pubC.contact));
  api.post('/newsletter', limiters.publicForm, validate(v.pub.newsletter), wrap(pubC.newsletter));

  // Auth
  api.post('/auth/signup', limiters.auth, validate(v.auth.signup), wrap(authC.signup));
  api.post('/auth/signin', limiters.auth, validate(v.auth.signin), wrap(authC.signin));
  api.post('/auth/demo', limiters.auth, wrap(authC.demo));
  api.get('/auth/me', requireAuth(), wrap(authC.me));
  api.post('/auth/logout', requireAuth({ allowDemoWrites: true }), wrap(authC.logout));

  // Appointments
  api.get('/appointments', requireAuth(), wrap(apptC.list));
  api.post('/appointments', requireAuth({ allowDemoWrites: true }), validate(v.appt.create), wrap(apptC.create));
  api.patch('/appointments/:id', requireAuth({ allowDemoWrites: true }), validate(idParam, 'params'), validate(v.appt.update), wrap(apptC.update));
  api.delete('/appointments/:id', requireAuth({ allowDemoWrites: true }), validate(idParam, 'params'), wrap(apptC.remove));

  // Medications
  api.get('/medications', requireAuth(), wrap(medC.list));
  api.post('/medications', requireAuth({ allowDemoWrites: true }), validate(v.med.create), wrap(medC.create));
  api.patch('/medications/:id', requireAuth({ allowDemoWrites: true }), validate(idParam, 'params'), validate(v.med.update), wrap(medC.update));
  api.delete('/medications/:id', requireAuth({ allowDemoWrites: true }), validate(idParam, 'params'), wrap(medC.remove));

  // Vitals
  api.get('/vitals', requireAuth(), wrap(vitC.list));
  api.put('/vitals', requireAuth({ allowDemoWrites: true }), validate(v.vit.put), wrap(vitC.put));
  api.delete('/vitals/:key', requireAuth({ allowDemoWrites: true }), validate(v.vit.keyParam, 'params'), wrap(vitC.remove));

  // AI proxy (frontend → this API → Groq).
  const aiGuard = [requireAuth({ allowDemoWrites: true }), limiters.ai];
  api.post('/chat', ...aiGuard, validate(v.ai.chat), wrap(aiC.chat));
  api.get('/chat/history', requireAuth(), wrap(aiC.history));
  api.delete('/chat/history', requireAuth(), wrap(aiC.clearHistory));
  api.post('/symptoms/analyze', ...aiGuard, validate(v.ai.symptoms), wrap(aiC.symptoms));

  return api;
}

module.exports = { buildApiRouter };
