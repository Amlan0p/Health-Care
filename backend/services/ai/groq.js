'use strict';

const { HttpError } = require('../errors');

/**
 * Server-side Groq client. The API key is read from validated config (GROQ_API_KEY)
 * and is only ever placed in the Authorization header of the outbound request.
 * It is never returned to callers, logged, or included in error messages.
 */
function createGroqClient(config, fetchImpl = globalThis.fetch) {
  const { apiKey, apiUrl, model, timeoutMs } = config.ai;
  const geminiApiKey = process.env.GEMINI_API_KEY || '';

  const candidateModels = [
    model || 'openai/gpt-oss-120b',
    'openai/gpt-oss-120b',
    'openai/gpt-oss-20b',
    'llama-3.3-70b-versatile',
    'qwen/qwen3.8-27b',
  ].filter((m, idx, arr) => Boolean(m) && arr.indexOf(m) === idx);

  async function complete({ messages, temperature = 0.7, maxTokens = 1024 }) {
    // 1. If Groq API key is present, try Groq
    if (apiKey) {
      let lastError = null;
      for (const currentModel of candidateModels) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        let res;
        try {
          res = await fetchImpl(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({ model: currentModel, messages, temperature, max_tokens: maxTokens }),
            signal: controller.signal,
          });
        } catch (err) {
          if (err && err.name === 'AbortError') {
            throw new HttpError(504, 'ai_timeout', 'The AI service took too long to respond. Please try again.');
          }
          console.error('[ai] provider unreachable:', err?.message);
          throw new HttpError(502, 'ai_unreachable', 'Could not reach the AI service. Please try again shortly.');
        } finally {
          clearTimeout(timer);
        }

        let data = null;
        try { data = await res.json(); } catch { /* ignore */ }

        if (res.status === 404 && data?.error?.code === 'model_not_found') {
          console.warn(`[ai] Model ${currentModel} not available on this Groq account, trying next fallback...`);
          lastError = data?.error;
          continue;
        }

        if (!res.ok) {
          console.error(`[ai] provider returned HTTP ${res.status}:`, data?.error?.message || res.statusText);
          if (res.status === 401) {
            throw new HttpError(502, 'ai_unavailable', 'The configured Groq API key is invalid. Please check your GROQ_API_KEY.');
          }
          if (res.status === 429) {
            const retry = Number(res.headers?.get?.('retry-after'));
            throw new HttpError(429, 'ai_provider_rate_limited', 'The AI service is busy right now. Please try again in a moment.',
              Number.isFinite(retry) && retry > 0 ? { retryAfterSeconds: Math.ceil(retry) } : {});
          }
          throw new HttpError(502, 'ai_unavailable', 'The AI service is unavailable right now. Please try again later.');
        }

        const content = data?.choices?.[0]?.message?.content;
        if (typeof content !== 'string' || !content.trim()) {
          throw new HttpError(502, 'ai_invalid_response', 'The AI service returned an empty response. Please try again.');
        }
        return content.trim();
      }
    }

    // 2. If Gemini API key is present, use Gemini
    if (geminiApiKey) {
      try {
        const { GoogleGenAI } = require('@google/genai');
        const ai = new GoogleGenAI({ apiKey: geminiApiKey });
        let systemPrompt = '';
        const userAndModelMessages = [];

        for (const msg of messages) {
          if (msg.role === 'system') {
            systemPrompt += (systemPrompt ? '\n\n' : '') + msg.content;
          } else {
            userAndModelMessages.push({
              role: msg.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: msg.content }],
            });
          }
        }

        const candidateGeminiModels = ['gemini-3.8-flash', 'gemini-2.5-flash'];
        for (const gModel of candidateGeminiModels) {
          try {
            const response = await ai.models.generateContent({
              model: gModel,
              contents: userAndModelMessages,
              config: {
                systemInstruction: systemPrompt || undefined,
                temperature,
                maxOutputTokens: maxTokens,
              },
            });
            if (response && response.text) {
              return response.text.trim();
            }
          } catch (mErr) {
            console.warn(`[ai] Gemini model ${gModel} error:`, mErr?.message);
          }
        }
      } catch (gemErr) {
        console.error('[ai] Gemini call failed:', gemErr?.message);
      }
    }

    if (!apiKey && !geminiApiKey) {
      throw new HttpError(503, 'ai_not_configured', 'The AI service is not configured on this server yet. Add GROQ_API_KEY or GEMINI_API_KEY to your environment.');
    }

    throw new HttpError(502, 'ai_unavailable', 'The AI service is unavailable right now. Please try again later.');
  }

  return { complete, isConfigured: () => Boolean(apiKey || geminiApiKey) };
}

module.exports = { createGroqClient };
