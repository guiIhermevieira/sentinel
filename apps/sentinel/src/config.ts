const seconds = (name: string, fallback: number) => Number(process.env[name] ?? fallback) * 1000;

export const config = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://sentinel:sentinel@localhost:5432/sentinel',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  windowKeyPrefix: 'sentinel',
  windowRetentionMs: 24 * 60 * 60 * 1000,
  maintenanceEnabled: process.env.SENTINEL_MAINTENANCE !== 'off',
  staleAfterMs: seconds('SENTINEL_STALE_AFTER_SECONDS', 120),
  sweepEveryMs: seconds('SENTINEL_SWEEP_EVERY_SECONDS', 60),
  recheckEveryMs: seconds('SENTINEL_RECHECK_EVERY_SECONDS', 30),
  windowsCheckEveryMs: seconds('SENTINEL_WINDOWS_CHECK_EVERY_SECONDS', 15),
  ruleRefreshEveryMs: seconds('SENTINEL_RULE_REFRESH_SECONDS', 10),
  apiKeyCacheMs: seconds('SENTINEL_API_KEY_CACHE_SECONDS', 30),
  graphqlMaxDepth: Number(process.env.SENTINEL_GRAPHQL_MAX_DEPTH ?? 8),
};

export const EVALUATION_QUEUE = 'transaction-evaluation';
export const MAINTENANCE_QUEUE = 'maintenance';
