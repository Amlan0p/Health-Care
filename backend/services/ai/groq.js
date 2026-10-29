'use strict';
const { HttpError } = require('../errors');

/**
 * Server-side Groq client. The API key is read from validated config (GROQ_API_KEY)
 * and is only ever placed in the Authorization header of the outbound request.
 * It is never returned to callers, logged, or included in error messages.
 */
function createGroqClient(config, fetchImpl = globalThis.fetch) {
  const { apiKey, apiUrl, model, timeoutMs } = config.ai;

  async function complete({ messages, temperature = 0.7, maxTokens = 1024 }) {
    if (!apiKey) {
      throw new HttpError(503, 'ai_not_configured', 'The AI service is not configured on this server yet.');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res;
    try {
      res = await fetchImpl(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens }),
        signal: controller.signal,
      });
    } catch (err) {
      if (err && err.name === 'AbortError') {
        throw new HttpError(504, 'ai_timeout', 'The AI service took too long to respond. Please try again.');
      }
      console.error('[ai] provider unreachable');
      throw new HttpError(502, 'ai_unreachable', 'Could not reach the AI service. Please try again shortly.');
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      console.error(`[ai] provider returned HTTP ${res.status}`);
      if (res.status === 429) {
        const retry = Number(res.headers?.get?.('retry-after'));
        throw new HttpError(429, 'ai_provider_rate_limited', 'The AI service is busy right now. Please try again in a moment.',
          Number.isFinite(retry) && retry > 0 ? { retryAfterSeconds: Math.ceil(retry) } : {});
      }
      // 401/403 (bad credentials), 400/404/422 (bad request/model) and 5xx are all "unavailable" to the user;
      // details stay in server logs (status only).
      throw new HttpError(502, 'ai_unavailable', 'The AI service is unavailable right now. Please try again later.');
    }

    let data;
    try { data = await res.json(); }
    catch { throw new HttpError(502, 'ai_invalid_response', 'The AI service returned an unreadable response. Please try again.'); }
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      throw new HttpError(502, 'ai_invalid_response', 'The AI service returned an empty response. Please try again.');
    }
    return content.trim();
  }

  return { complete, isConfigured: () => Boolean(apiKey) };
}

module.exports = { createGroqClient };
