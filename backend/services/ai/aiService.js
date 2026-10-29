'use strict';
const { HttpError } = require('../errors');
const { HEALTH_CHAT_SYSTEM_PROMPT, SYMPTOM_SYSTEM_PROMPT } = require('./prompts');
const { detectEmergency, symptomEmergency } = require('./emergency');
const { symptomsById, vitalsByKey, emergencySymptomIds } = require('../content');

const MAX_STORED_MESSAGES_PER_USER = 200;
const SEVERITIES = new Set(['high', 'medium', 'low']);

const clip = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

/** Extracts and validates the JSON object the symptom prompt asks for. Returns null if unusable. */
function parseSymptomJson(raw) {
  let s = String(raw).replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const first = s.indexOf('{'); const last = s.lastIndexOf('}');
  if (first === -1 || last <= first) return null;
  s = s.slice(first, last + 1);
  let obj;
  try { obj = JSON.parse(s); } catch { return null; }
  const m = obj && obj.mostLikely;
  if (!m || typeof m.name !== 'string' || !m.name.trim()) return null;
  const severity = SEVERITIES.has(m.severity) ? m.severity : 'low';
  return {
    mostLikely: { name: clip(m.name, 120), severity, advice: clip(m.advice, 700) },
    alsoConsider: Array.isArray(obj.alsoConsider)
      ? obj.alsoConsider.filter((x) => typeof x === 'string' && x.trim()).slice(0, 3).map((x) => clip(x, 80))
      : [],
    warning: clip(obj.warning, 300),
  };
}

function createAiService({ db, groq, config }) {
  async function vitalsContext(userId) {
    const { rows } = await db.query('SELECT key, value FROM vitals WHERE user_id = $1', [userId]);
    const parts = rows
      .filter((r) => vitalsByKey.has(r.key))
      .map((r) => `${vitalsByKey.get(r.key).label}: ${r.value} ${vitalsByKey.get(r.key).unit}`);
    return parts.length
      ? `The user chose to share these self-entered, unverified vitals for this question: ${parts.join('; ')}.`
      : 'The user asked about their vitals but has not recorded any yet. Ask them to add readings in the app (Records tab) and give only general guidance.';
  }

  return {
    isConfigured: groq.isConfigured,

    async chat({ userId, message, includeVitals }) {
      const { rows: recent } = await db.query(
        `SELECT role, content FROM (
           SELECT id, role, content FROM chat_messages WHERE user_id = $1 ORDER BY id DESC LIMIT $2
         ) t ORDER BY id ASC`,
        [userId, config.ai.historyLimit],
      );
      const messages = [{ role: 'system', content: HEALTH_CHAT_SYSTEM_PROMPT }];
      if (includeVitals) messages.push({ role: 'system', content: await vitalsContext(userId) });
      for (const m of recent) messages.push({ role: m.role, content: m.content });
      messages.push({ role: 'user', content: message });

      const reply = await groq.complete({ messages, temperature: 0.7, maxTokens: 1024 });

      // Persist only after a successful provider response so history never contains dangling turns.
      await db.tx(async (c) => {
        await c.query('INSERT INTO chat_messages (user_id, role, content) VALUES ($1, $2, $3), ($1, $4, $5)',
          [userId, 'user', message, 'assistant', reply]);
        await c.query(
          `DELETE FROM chat_messages WHERE user_id = $1 AND id NOT IN (
             SELECT id FROM chat_messages WHERE user_id = $1 ORDER BY id DESC LIMIT $2)`,
          [userId, MAX_STORED_MESSAGES_PER_USER],
        );
      });

      return { reply, emergency: detectEmergency(message) };
    },

    async history(userId, limit = 50) {
      const { rows } = await db.query(
        `SELECT role, content, created_at FROM (
           SELECT id, role, content, created_at FROM chat_messages WHERE user_id = $1 ORDER BY id DESC LIMIT $2
         ) t ORDER BY id ASC`,
        [userId, limit],
      );
      return rows.map((r) => ({ role: r.role, content: r.content, createdAt: r.created_at }));
    },

    async clearHistory(userId) {
      const r = await db.query('DELETE FROM chat_messages WHERE user_id = $1', [userId]);
      return r.rowCount;
    },

    async analyzeSymptoms({ symptomIds }) {
      const names = symptomIds.map((id) => symptomsById.get(id).label);
      const emergency = symptomIds.some((id) => emergencySymptomIds.includes(id)) ? symptomEmergency() : null;
      const raw = await groq.complete({
        messages: [
          { role: 'system', content: SYMPTOM_SYSTEM_PROMPT },
          { role: 'user', content: `The person reports these symptoms: ${names.join(', ')}. Respond with the JSON object as instructed.` },
        ],
        temperature: 0.3,
        maxTokens: 512,
      });
      const result = parseSymptomJson(raw);
      if (!result) throw new HttpError(502, 'ai_invalid_response', 'The AI service returned an unexpected format. Please try again.');
      return { result, emergency };
    },
  };
}

module.exports = { createAiService, parseSymptomJson };
