'use strict';
/**
 * Central configuration + startup validation.
 *
 * Every environment variable the backend reads is parsed here, once.
 * Nothing in this file contains a secret default: a missing or insecure
 * secret makes production startup fail instead of silently falling back.
 */
const crypto = require('crypto');

const KNOWN_BAD_SECRET_FRAGMENTS = [
  'change_me', 'changeme', 'change-me', 'hc_dev_secret', 'your-secret',
  'your_secret', 'secret', 'password', 'example', 'placeholder', 'default',
];

class ConfigError extends Error {
  constructor(problems) {
    super('Invalid configuration:\n - ' + problems.join('\n - '));
    this.name = 'ConfigError';
    this.problems = problems;
  }
}

function toInt(value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER, name } = {}, problems = []) {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    problems.push(`${name} must be an integer between ${min} and ${max}.`);
    return fallback;
  }
  return n;
}

function toBool(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function normalizeOrigin(raw, problems) {
  try {
    const u = new URL(raw.trim());
    if (!['http:', 'https:'].includes(u.protocol)) throw new Error('bad protocol');
    return u.origin; // strips any path and trailing slash
  } catch {
    problems.push(`FRONTEND_ORIGIN contains an invalid origin: "${raw}". Use e.g. https://app.example.com (no path).`);
    return null;
  }
}

/** Returns a human-readable reason if the secret is unacceptable, else null. */
function isInsecureSecret(secret) {
  const lower = secret.toLowerCase();
  if (secret.length < 32) return 'must be at least 32 characters long';
  if (KNOWN_BAD_SECRET_FRAGMENTS.some((f) => lower.includes(f))) return 'looks like a placeholder value';
  if (new Set(secret).size < 10) return 'has too little variety';
  return null;
}

function loadConfig(env = process.env) {
  const problems = [];
  const warnings = [];
  const nodeEnv = env.NODE_ENV || 'development';
  const isProd = nodeEnv === 'production';
  const isTest = nodeEnv === 'test';

  // ── Database ────────────────────────────────────────────────────────────
  const databaseUrl = env.DATABASE_URL || '';
  if (!databaseUrl) problems.push('DATABASE_URL is required (PostgreSQL connection string).');
  else if (!/^postgres(ql)?:\/\//i.test(databaseUrl)) problems.push('DATABASE_URL must start with postgres:// or postgresql://');

  // ── JWT secret ──────────────────────────────────────────────────────────
  let jwtSecret = env.JWT_SECRET || '';
  let jwtSecretIsEphemeral = false;
  if (!jwtSecret) {
    if (isProd) {
      problems.push('JWT_SECRET is required in production (use a random value of at least 32 characters).');
    } else {
      // Development/test only: a random per-process secret. Never a hardcoded fallback.
      jwtSecret = crypto.randomBytes(48).toString('hex');
      jwtSecretIsEphemeral = true;
      if (!isTest) warnings.push('JWT_SECRET is not set: using a random secret for this process. Logins are invalidated on every restart.');
    }
  } else {
    const why = isInsecureSecret(jwtSecret);
    if (why) {
      if (isProd) problems.push(`JWT_SECRET is insecure: it ${why}.`);
      else warnings.push(`JWT_SECRET is weak: it ${why}.`);
    }
  }

  // ── CORS ────────────────────────────────────────────────────────────────
  const frontendOrigins = (env.FRONTEND_ORIGIN || '')
    .split(',').map((s) => s.trim()).filter(Boolean)
    .map((o) => normalizeOrigin(o, problems)).filter(Boolean);

  const port = toInt(env.PORT, 3001, { min: 1, max: 65535, name: 'PORT' }, problems);

  // ── TLS for managed Postgres ────────────────────────────────────────────
  let databaseSsl = false;
  const sslSetting = (env.DATABASE_SSL || 'auto').toLowerCase();
  if (sslSetting === 'true') databaseSsl = true;
  else if (sslSetting === 'auto' && databaseUrl && !/sslmode=/i.test(databaseUrl)) {
    try {
      const host = new URL(databaseUrl).hostname;
      // Render's *internal* URL uses a bare hostname (no dots) and needs no TLS;
      // the *external* URL uses a public hostname and requires TLS.
      databaseSsl = isProd && host.includes('.') && !['localhost', '127.0.0.1'].includes(host);
    } catch { /* invalid URL already reported above */ }
  }

  const cfg = {
    nodeEnv, isProd, isTest, port,
    trustProxy: toInt(env.TRUST_PROXY, isProd ? 1 : 0, { min: 0, max: 10, name: 'TRUST_PROXY' }, problems),
    db: {
      url: databaseUrl,
      ssl: databaseSsl,
      poolMax: toInt(env.DB_POOL_MAX, 10, { min: 1, max: 50, name: 'DB_POOL_MAX' }, problems),
    },
    auth: {
      jwtSecret,
      jwtSecretIsEphemeral,
      jwtExpiresIn: env.JWT_EXPIRES_IN || '24h',
      issuer: 'healthcare-api',
      bcryptRounds: toInt(env.BCRYPT_ROUNDS, 12, { min: 4, max: 15, name: 'BCRYPT_ROUNDS' }, problems),
      demoEnabled: toBool(env.ENABLE_DEMO, true),
      demoEmail: 'demo@healthcare.app',
      demoTokenTtl: '1h',
    },
    cors: { origins: frontendOrigins, allowLocalhostInDev: !isProd },
    frontend: { serve: toBool(env.SERVE_FRONTEND, true), dir: env.FRONTEND_DIR || null },
    ai: {
      apiKey: env.GROQ_API_KEY || '',
      apiUrl: env.GROQ_API_URL || 'https://api.groq.com/openai/v1/chat/completions',
      model: env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      timeoutMs: toInt(env.GROQ_TIMEOUT_MS, 20000, { min: 1000, max: 120000, name: 'GROQ_TIMEOUT_MS' }, problems),
      historyLimit: 20,
    },
    limits: {
      authMax: toInt(env.AUTH_RATE_LIMIT_MAX, 10, { min: 1, name: 'AUTH_RATE_LIMIT_MAX' }, problems),
      authWindowMs: toInt(env.AUTH_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000, { min: 1000, name: 'AUTH_RATE_LIMIT_WINDOW_MS' }, problems),
      apiMax: toInt(env.API_RATE_LIMIT_MAX, 300, { min: 1, name: 'API_RATE_LIMIT_MAX' }, problems),
      aiMax: toInt(env.AI_RATE_LIMIT_MAX, 15, { min: 1, name: 'AI_RATE_LIMIT_MAX' }, problems),
      publicFormMax: toInt(env.PUBLIC_FORM_RATE_LIMIT_MAX, 5, { min: 1, name: 'PUBLIC_FORM_RATE_LIMIT_MAX' }, problems),
      bodyLimit: '32kb',
      requestTimeoutMs: 30000,
    },
    appTimezone: env.APP_TIMEZONE || 'Asia/Kolkata',
  };

  if (!cfg.ai.apiKey) warnings.push('GROQ_API_KEY is not set: AI chat and symptom analysis will respond with 503 until it is configured.');
  if (isProd && cfg.cors.origins.length === 0) {
    warnings.push('FRONTEND_ORIGIN is not set: cross-origin browser requests are blocked (correct when this service also serves the frontend).');
  }

  try { new Intl.DateTimeFormat('en', { timeZone: cfg.appTimezone }); }
  catch { problems.push(`APP_TIMEZONE "${cfg.appTimezone}" is not a valid IANA time zone.`); }

  if (problems.length) throw new ConfigError(problems);
  cfg.warnings = warnings;
  return Object.freeze(cfg);
}

module.exports = { loadConfig, ConfigError, isInsecureSecret };
