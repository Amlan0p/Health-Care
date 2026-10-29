'use strict';
// Static, non-user content shipped with the backend (see backend/content/*.json).
const doctorsFile = require('../content/doctors.json');
const symptomsFile = require('../content/symptoms.json');
const vitalsFile = require('../content/vitals.json');

const doctorsById = new Map(doctorsFile.doctors.map((d) => [d.id, d]));
const symptomsById = new Map(symptomsFile.symptoms.map((s) => [s.id, s]));
const vitalsByKey = new Map(vitalsFile.vitals.map((v) => [v.key, v]));

module.exports = {
  doctorsFile, symptomsFile, vitalsFile,
  doctorsById, symptomsById, vitalsByKey,
  slots: doctorsFile.slots,
  emergencySymptomIds: symptomsFile.emergencySymptomIds,
};
