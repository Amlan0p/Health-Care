'use strict';
const { doctorsFile, symptomsFile, vitalsFile } = require('../services/content');

const publicContentController = {
  doctors: (_req, res) => res.json({ synthetic: true, notice: doctorsFile._meta.notice, slots: doctorsFile.slots, doctors: doctorsFile.doctors }),
  symptoms: (_req, res) => res.json({ symptoms: symptomsFile.symptoms, emergencySymptomIds: symptomsFile.emergencySymptomIds }),
  vitals: (_req, res) => res.json({ notice: vitalsFile._meta.notice, vitals: vitalsFile.vitals }),
};

module.exports = { publicContentController };
