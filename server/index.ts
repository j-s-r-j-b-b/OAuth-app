import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import express, { type Request, type Response } from 'express';
import { guideToMarkdown } from '../shared/markdown.ts';
import { DIFFICULTY_INFO } from '../shared/schema.ts';
import { catalog, catalogMeta, matchToolkit, slugify } from './catalog.ts';
import { composioEnabled } from './composio.ts';
import { env, liveGenerationEnabled } from './env.ts';
import { getJob, startJob } from './jobs.ts';
import { store } from './store.ts';

const app = express();
app.set('trust proxy', true);
app.disable('x-powered-by');
app.use(express.json({ limit: '20kb' }));

const baseUrl = (req: Request) => `${req.protocol}://${req.get('host')}`;

// ── API ─────────────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, liveGeneration: liveGenerationEnabled(), composio: composioEnabled(), model: env.llm.model });
});

app.get('/api/catalog', (_req, res) => {
  const guides = store.list();
  const byToolkit = new Map(guides.filter((g) => g.toolkitSlug).map((g) => [g.toolkitSlug!, g.slug]));
  res.json({
    ...catalogMeta,
    toolkits: catalog.map((t) => ({ ...t, guideSlug: byToolkit.get(t.slug) ?? null })),
  });
});

app.get('/api/guides', (_req, res) => {
  res.json(store.list());
});

app.get('/api/guides/:slug', (req, res) => {
  const g = store.get(req.params.slug);
  if (!g) return res.status(404).json({ error: 'Guide not found' });
  res.json(g);
});

// Library guides have no live trace; answer null rather than 404 so clients don't log errors.
app.get('/api/guides/:slug/trace', (req, res) => {
  res.json(store.trace(req.params.slug));
});

const hits = new Map<string, number[]>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  if (recent.length >= env.generateLimitPerHour) return true;
  recent.push(now);
  hits.set(ip, recent);
  return false;
}

app.post('/api/generate', (req, res) => {
  const query = String(req.body?.query ?? '').trim();
  const force = Boolean(req.body?.force);
  if (query.length < 2 || query.length > 120) return res.status(400).json({ error: 'Enter an app name or website (2–120 characters).' });
  if (!force) {
    const tk = matchToolkit(query);
    const existing = store.findFor({ slug: slugify(query), toolkitSlug: tk?.slug });
    if (existing) return res.json({ existing: existing.slug });
  }
  if (!liveGenerationEnabled()) {
    return res.status(503).json({ error: 'Live generation is not configured on this server (missing LLM_API_KEY).' });
  }
  if (rateLimited(req.ip ?? 'unknown')) {
    return res.status(429).json({ error: `Limit of ${env.generateLimitPerHour} new guides per hour reached. Existing guides still work.` });
  }
  const job = startJob(query);
  res.json({ jobId: job.id });
});

app.get('/api/jobs/:id', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found (it may have expired).' });
  res.json({ id: job.id, query: job.query, status: job.status, slug: job.slug, error: job.error });
});

app.get('/api/jobs/:id/events', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).end();
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  res.write(`retry: 3000\n\n`);
  for (const e of job.events) res.write(`data: ${JSON.stringify(e)}\n\n`);
  if (job.status === 'done' || job.status === 'error') {
    res.write(`event: end\ndata: {}\n\n`);
    return res.end();
  }
  job.clients.add(res);
  const ping = setInterval(() => res.write(`: ping\n\n`), 15000);
  req.on('close', () => {
    clearInterval(ping);
    job.clients.delete(res);
  });
});

// ── Agent-readable exports ──────────────────────────────────────────────────
app.get(/^\/guides\/([a-z0-9-]+)\.md$/, (req, res) => {
  const slug = (req.params as unknown as string[])[0];
  const g = store.get(slug);
  if (!g) return res.status(404).type('text/plain').send('Guide not found');
  res.type('text/markdown; charset=utf-8').send(guideToMarkdown(g, `${baseUrl(req)}/guides/${slug}`));
});

app.get(/^\/docs\/(RESEARCH_PROTOCOL|VERIFICATION)\.md$/, (req, res) => {
  const name = (req.params as unknown as string[])[0];
  res.type('text/markdown; charset=utf-8').send(readFileSync(join('docs', `${name}.md`), 'utf8'));
});

app.get('/llms.txt', (req, res) => {
  const base = baseUrl(req);
  const lines = store
    .list()
    .map((g) => `- [${g.name}](${base}/guides/${g.slug}.md): ${DIFFICULTY_INFO[g.difficulty].label}; production in ${g.timeToProduction.label}. ${g.headline}`);
  res
    .type('text/plain; charset=utf-8')
    .send(
      `# OAuth Runway\n\n> How to get a provider OAuth app created, approved, and wired into Composio — per app, with evidence.\n\n## Guides\n\n${lines.join('\n')}\n\n## Generate\n\nPOST ${base}/api/generate {"query": "<app name or website>"} → {"jobId"} or {"existing"}; stream progress from ${base}/api/jobs/<jobId>/events (SSE).\n`,
    );
});

// ── Web app ─────────────────────────────────────────────────────────────────
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function injectMeta(html: string, req: Request): string {
  const m = req.path.match(/^\/guides\/([a-z0-9-]+)\/?$/);
  const g = m ? store.get(m[1]) : null;
  const title = g ? `${g.app.name} OAuth app guide · OAuth Runway` : 'OAuth Runway: OAuth app setup & approval guides';
  const desc = g
    ? `${DIFFICULTY_INFO[g.verdict.difficulty].label} · production in ${g.verdict.timeToProduction.label}. ${g.verdict.headline}`
    : 'How hard is it to get an OAuth app approved for your agent? Per-app guides with timelines, blockers, and evidence — or generate one live.';
  const tags = [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(desc)}">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(desc)}">`,
    `<meta property="og:type" content="article">`,
    g ? `<link rel="alternate" type="text/markdown" href="/guides/${g.slug}.md">` : '',
  ].join('\n    ');
  return html.replace(/<title>.*?<\/title>/, '').replace('<!--meta-->', tags);
}

/** Client-side routes: anything outside /api with no file extension. Assets never fall back to HTML. */
const PAGE_ROUTE = /^\/(?!api\/)(?:[^.]*)$/;

async function start() {
  if (env.isProd) {
    const dist = join(process.cwd(), 'dist/web');
    const indexHtml = readFileSync(join(dist, 'index.html'), 'utf8');
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.get(PAGE_ROUTE, (req: Request, res: Response) => {
      res.type('html').send(injectMeta(indexHtml, req));
    });
  } else {
    const { createServer } = await import('vite');
    const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
    app.use(vite.middlewares);
    app.get(PAGE_ROUTE, async (req: Request, res: Response, next) => {
      try {
        const raw = readFileSync('web/index.html', 'utf8');
        const html = await vite.transformIndexHtml(req.originalUrl, raw);
        res.type('html').send(injectMeta(html, req));
      } catch (e) {
        next(e);
      }
    });
  }
  app.listen(env.port, () => {
    console.log(`OAuth Runway on http://localhost:${env.port}`);
    console.log(`  live generation: ${liveGenerationEnabled() ? `on (${env.llm.model})` : 'OFF (set LLM_API_KEY)'}; Composio: ${composioEnabled() ? 'on' : 'OFF (set COMPOSIO_API_KEY)'}`);
    if (!existsSync('data/library') || store.list().length === 0) console.log('  note: no library guides found in data/library');
  });
}

void start();
