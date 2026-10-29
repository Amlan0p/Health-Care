'use strict';

function createAiController({ ai }) {
  return {
    async chat(req, res) {
      const { reply, emergency } = await ai.chat({
        userId: req.auth.userId, message: req.body.message, includeVitals: req.body.includeVitals,
      });
      res.json({ reply, emergency });
    },
    async history(req, res) { res.json({ messages: await ai.history(req.auth.userId) }); },
    async clearHistory(req, res) { res.json({ success: true, deleted: await ai.clearHistory(req.auth.userId) }); },
    async symptoms(req, res) {
      const { result, emergency } = await ai.analyzeSymptoms({ symptomIds: req.body.symptoms });
      res.json({
        result, emergency,
        disclaimer: 'AI-generated possibilities for general information only. This is not a diagnosis. Please consult a qualified doctor.',
      });
    },
  };
}

module.exports = { createAiController };
