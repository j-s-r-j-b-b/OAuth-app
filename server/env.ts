import { existsSync, readFileSync } from 'node:fs';

// Minimal .env loader (no dependency). Real environment variables win.
if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trimStart().startsWith('#')) continue;
    const [, key, raw] = m;
    if (process.env[key] === undefined) process.env[key] = raw.replace(/^['"]|['"]$/g, '');
  }
}

const num = (v: string | undefined, d: number) => (v && !Number.isNaN(Number(v)) ? Number(v) : d);

export const env = {
  port: num(process.env.PORT, 8787),
  /** Production when NODE_ENV says so, or when running the bundled server (dist/server.js) rather than TS sources. */
  isProd: process.env.NODE_ENV === 'production' || /\.js$/.test(process.argv[1] ?? ''),
  dataDir: process.env.DATA_DIR || './.data',
  llm: {
    apiKey: process.env.LLM_API_KEY || '',
    baseURL: process.env.LLM_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai/',
    model: process.env.LLM_MODEL || 'gemini-3.5-flash-lite',
    /** Optional stronger model for the final write-up; defaults to LLM_MODEL. */
    composeModel: process.env.LLM_COMPOSE_MODEL || process.env.LLM_MODEL || 'gemini-3.5-flash-lite',
    /** Client-side throttle so free-tier RPM limits don't turn into 429 storms. */
    rpm: num(process.env.LLM_RPM, 12),
  },
  composioApiKey: process.env.COMPOSIO_API_KEY || '',
  /** Live generations allowed per client IP per hour (protects free quotas). */
  generateLimitPerHour: num(process.env.GENERATE_LIMIT_PER_HOUR, 6),
  maxConcurrentJobs: num(process.env.MAX_CONCURRENT_JOBS, 2),
};

export const liveGenerationEnabled = () => Boolean(env.llm.apiKey);
