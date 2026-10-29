'use strict';
require('dotenv').config();
const { loadConfig, ConfigError } = require('./config');
const { createDb } = require('./db');
const { migrate } = require('./db/migrate');
const { seedDemo } = require('./db/seedDemo');
const { createApp } = require('./app');

async function main() {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(err.message);
      console.error('\nSee backend/.env.example for the full list of settings.');
      process.exit(1);
    }
    throw err;
  }
  config.warnings.forEach((w) => console.warn(`[config] ${w}`));

  const db = createDb(config);
  if (!(await db.ping())) {
    console.error('[db] Could not connect to the database. Check DATABASE_URL (and DATABASE_SSL for external connections).');
    process.exit(1);
  }
  await migrate(db);
  if (await seedDemo(db, config)) console.log('[demo] Demo account refreshed with synthetic sample data.');

  const app = createApp({ config, db });
  const server = app.listen(config.port, () => {
    console.log(`HealthCare API listening on port ${config.port} (${config.nodeEnv})`);
  });
  // Render's load balancer idles at 60s; keep-alive must be longer to avoid sporadic 502s.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
  server.requestTimeout = 35_000;

  const shutdown = (signal) => {
    console.log(`${signal} received, shutting down…`);
    server.close(() => db.close().finally(() => process.exit(0)));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => { console.error('Fatal startup error:', err.message); process.exit(1); });
