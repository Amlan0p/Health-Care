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
  api.post('/appointments', requireAuth(), validate(v.appt.create), wrap(apptC.create));
  api.patch('/appointments/:id', requireAuth(), validate(idParam, 'params'), validate(v.appt.update), wrap(apptC.update));
  api.delete('/appointments/:id', requireAuth(), validate(idParam, 'params'), wrap(apptC.remove));

  // Medications
  api.get('/medications', requireAuth(), wrap(medC.list));
  api.post('/medications', requireAuth(), validate(v.med.create), wrap(medC.create));
  api.patch('/medications/:id', requireAuth(), validate(idParam, 'params'), validate(v.med.update), wrap(medC.update));
  api.delete('/medications/:id', requireAuth(), validate(idParam, 'params'), wrap(medC.remove));

  // Vitals
  api.get('/vitals', requireAuth(), wrap(vitC.list));
  api.put('/vitals', requireAuth(), validate(v.vit.put), wrap(vitC.put));
  api.delete('/vitals/:key', requireAuth(), validate(v.vit.keyParam, 'params'), wrap(vitC.remove));

  // AI proxy (frontend → this API → Groq). Not available to demo sessions.
  const aiGuard = [requireAuth(), denyDemo, limiters.ai];
  api.post('/chat', ...aiGuard, validate(v.ai.chat), wrap(aiC.chat));
  api.get('/chat/history', requireAuth(), wrap(aiC.history));
  api.delete('/chat/history', requireAuth(), wrap(aiC.clearHistory));
  api.post('/symptoms/analyze', ...aiGuard, validate(v.ai.symptoms), wrap(aiC.symptoms));

  return api;
}

module.exports = { buildApiRouter };
