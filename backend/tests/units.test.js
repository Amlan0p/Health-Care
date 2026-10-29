'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { detectEmergency } = require('../services/ai/emergency');
const { parseSymptomJson } = require('../services/ai/aiService');
const { canonicalizeVital } = require('../validators/vitals');
const { vitalsByKey } = require('../services/content');
const { todayIn, addDays } = require('../services/dates');

test('emergency detection flags red-flag phrases and ignores ordinary questions', () => {
  assert.equal(detectEmergency('I have severe chest pain and sweating').category, 'cardiac_respiratory');
  assert.equal(detectEmergency("I can't breathe properly").category, 'cardiac_respiratory');
  assert.equal(detectEmergency('my father has slurred speech and face drooping').category, 'stroke');
  assert.equal(detectEmergency('I want to die').category, 'self_harm');
  assert.equal(detectEmergency('she took an overdose').category, 'urgent_other');
  assert.equal(detectEmergency('What are the benefits of regular exercise?'), null);
  assert.equal(detectEmergency(undefined), null);
});

test('emergency notices include tel actions for 112', () => {
  const e = detectEmergency('chest pain');
  assert.ok(e.actions.some((a) => a.tel === '112'));
});

test('parseSymptomJson accepts fenced JSON and normalises fields', () => {
  const raw = '```json\n{"mostLikely":{"name":"Viral fever","severity":"MEDIUM","advice":"Rest."},"alsoConsider":["Flu","Dengue","X","Y"],"warning":""}\n```';
  const r = parseSymptomJson(raw);
  assert.equal(r.mostLikely.name, 'Viral fever');
  assert.equal(r.mostLikely.severity, 'low', 'unknown severity casing falls back to low');
  assert.equal(r.alsoConsider.length, 3);
});

test('parseSymptomJson rejects unusable output', () => {
  assert.equal(parseSymptomJson('Sorry, I cannot help'), null);
  assert.equal(parseSymptomJson('{"mostLikely":{}}'), null);
  assert.equal(parseSymptomJson('{not json}'), null);
});

test('vital validation', () => {
  const v = (k) => vitalsByKey.get(k);
  assert.equal(canonicalizeVital(v('heartRate'), '72'), '72');
  assert.equal(canonicalizeVital(v('bloodPressure'), '120 / 80'), '120/80');
  assert.equal(canonicalizeVital(v('temperature'), '98.6'), '98.6');
  assert.equal(canonicalizeVital(v('spo2'), '97'), '97');
  assert.throws(() => canonicalizeVital(v('heartRate'), '9999'), /between 20 and 300/);
  assert.throws(() => canonicalizeVital(v('heartRate'), 'abc'), /whole number/);
  assert.throws(() => canonicalizeVital(v('bloodPressure'), '80/120'), /plausible/);
  assert.throws(() => canonicalizeVital(v('bloodPressure'), '120'), /120\/80/);
  assert.throws(() => canonicalizeVital(v('spo2'), '101'), /between 50 and 100/);
  assert.throws(() => canonicalizeVital(v('temperature'), '<script>'), /number/);
});

test('date helpers', () => {
  assert.equal(addDays('2026-02-27', 2), '2026-03-01');
  assert.match(todayIn('Asia/Kolkata'), /^\d{4}-\d{2}-\d{2}$/);
});
