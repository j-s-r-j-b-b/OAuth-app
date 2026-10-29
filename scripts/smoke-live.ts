/**
 * End-to-end smoke test of live generation WITHOUT an LLM key.
 *
 * Starts a scripted, OpenAI-compatible fake model, launches the real server against it,
 * POSTs /api/generate, follows the SSE stream, then fetches and validates the published guide.
 * Search, page reads and probes are real; only the model's "thinking" is scripted, so this
 * checks the plumbing (jobs, SSE, tools, registry, citation checks, storage), not guide quality.
 *
 *   npx tsx scripts/smoke-live.ts [app name]
 */
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Guide, lintGuide } from '../shared/schema.ts';

const APP = process.argv[2] ?? 'Pipedrive';
/** KEEP=1 leaves both servers running for manual UI checks; FAKE_DELAY_MS slows the fake model so the live view can be watched. */
const KEEP = process.env.KEEP === '1';
const DELAY = Number(process.env.FAKE_DELAY_MS ?? 0);
const LLM_PORT = 8790;
const APP_PORT = 8791;

type Msg = { role: string; content?: string | null; tool_calls?: unknown[] };

const ids = (text: string, prefix: 'S' | 'P') => [...new Set([...text.matchAll(new RegExp(`\\[(${prefix}\\d+)\\]`, 'g'))].map((m) => m[1]))];
const urls = (text: string) => [...new Set([...text.matchAll(/\] [^\n]*? — (https?:\/\/\S+)/g)].map((m) => m[1]))];
const call = (name: string, args: object, i: number) => ({ id: `call_${name}_${i}_${Date.now()}`, type: 'function', function: { name, arguments: JSON.stringify(args) } });
const dur = (label: string, min: number, max: number) => ({ label, minHours: min, maxHours: max, basis: 'Scripted smoke-test value.' });

function respond(body: { messages: Msg[]; tools?: unknown[] }): { content?: string; tool_calls?: unknown[] } {
  const sys = String(body.messages[0]?.content ?? '');
  const all = body.messages.map((m) => (typeof m.content === 'string' ? m.content : '')).join('\n');
  if (sys.startsWith('You identify software products')) {
    const first = urls(all)[0] ?? 'https://example.com';
    const host = new URL(first).hostname.split('.').slice(-2).join('.');
    return {
      content: JSON.stringify({
        isRealApp: true, name: APP, website: `https://www.${host}`, category: 'Smoke test', description: `${APP} (scripted identity).`,
        developerPortalUrl: first, docsUrl: first, officialDomains: [host], oauth: 'yes', ambiguity: '',
      }),
    };
  }
  if (body.tools) {
    const round = body.messages.filter((m) => m.role === 'assistant').length;
    // Keyless search can be rate-limited; fall back to known public pages so the plumbing still runs.
    const found = [...urls(all).filter((u) => !/composio\.dev/.test(u)), 'https://pipedrive.readme.io/docs/marketplace-oauth-authorization', 'https://developers.pipedrive.com/docs/api/v1/Oauth'];
    if (round === 0)
      return {
        tool_calls: [
          call('read_page', { url: found[0] }, 0),
          call('read_page', { url: found[1] ?? found[0] }, 1),
          call('probe_developer_portal', { url: found[0] }, 2),
          call('probe_oauth_discovery', { url: found[0] }, 3),
        ],
      };
    if (round === 1) {
      const s = ids(all, 'S').slice(-2);
      const p = ids(all, 'P');
      return {
        tool_calls: [
          call('save_findings', { findings: [{ fact: `${APP} OAuth apps are created in the developer portal (scripted).`, sourceIds: s }, { fact: 'Portal probe result recorded.', sourceIds: p }] }, 0),
          call('finish_research', { summary: 'Scripted research complete.', gaps: ['Real model not used'] }, 1),
        ],
      };
    }
    return { tool_calls: [call('finish_research', { summary: 'done', gaps: [] }, 9)] };
  }
  // Writer passes: cite whatever ids exist in the evidence listing.
  const s = ids(all, 'S');
  const p = ids(all, 'P');
  const S = s.slice(0, 2);
  const refs = { sourceIds: S, confidence: 'official' };
  if (all.includes('Write PART 1')) {
    const keys = ['self_serve_registration', 'review_required', 'business_verification', 'security_assessment', 'paid_access', 'partner_or_sales_gate', 'user_cap_before_review', 'per_customer_setup'];
    return {
      content: JSON.stringify({
        assumption: `An agent that reads and writes ${APP} data for many customers.`,
        verdict: {
          headline: 'Scripted headline.', summary: 'Scripted summary.', difficulty: 'gated',
          handsOnEffort: dur('1–2 hours', 1, 2), timeToFirstConnection: dur('A very long label that the pipeline must shorten automatically', 1, 4),
          timeToProduction: dur('1–3 weeks', 168, 504), longestPole: 'Scripted.', cost: 'Free', costDetail: '', easierPaths: [],
        },
        factors: keys.map((key) => ({ key, value: key === 'review_required' || key === 'self_serve_registration' ? 'yes' : 'no', detail: 'Scripted.', ...refs })),
        requirements: [{ item: 'Developer account', neededFor: 'registration', detail: 'Scripted.', ...refs }],
        scopes: [{ scope: 'base', purpose: 'Scripted.', tier: 'basic', note: null, sourceIds: S, confidence: 'tested' }],
        sourceNotes: Object.fromEntries(S.map((x) => [x, 'Scripted note.'])),
      }),
    };
  }
  return {
    content: JSON.stringify({
      phases: [
        { id: 'p1', title: 'Register', outcome: 'An app', steps: [
          { id: 's1', title: 'Create the app', actor: 'you', effort: '10 min', wait: null, details: 'Scripted <script>alert(1)</script> **bold**.', agentAssist: 'Prefill values.', links: [{ label: 'Bad', url: 'javascript:alert(1)' }], sourceIds: [...S, 'S999'], confidence: 'official' },
          { id: 's1', title: 'Probe check', actor: 'agent', effort: '1 min', wait: null, details: 'Scripted.', agentAssist: null, links: [], sourceIds: p.slice(0, 1), confidence: 'tested' },
        ] },
        { id: 'p2', title: 'Go live in Composio', outcome: 'Connected', steps: [
          { id: 's3', title: 'Create auth config', actor: 'agent', effort: '5 min', wait: null, details: 'Scripted.', agentAssist: null, links: [], sourceIds: [], confidence: 'official' },
        ] },
      ],
      blockers: [{ title: 'Scripted blocker', symptom: 'x', likelihood: 'common', howToProceed: 'y', escalation: null, ...refs }],
      nuances: [{ title: 'Scripted nuance', detail: 'z', ...refs }],
      composioSteps: ['Create a custom auth config.', 'Pass its ID to the session.'],
      composioNotes: [],
      openQuestions: [{ question: 'Is this real?', whyItMatters: 'Smoke test', howToResolve: 'Run with a real model' }],
      sourceNotes: {},
    }),
  };
}

const fake = createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    const body = JSON.parse(raw || '{}');
    const msg = respond(body);
    res.setHeader('content-type', 'application/json');
    setTimeout(() => res.end(
      JSON.stringify({
        id: 'fake', object: 'chat.completion', created: Math.floor(Date.now() / 1000), model: 'fake-model',
        choices: [{ index: 0, message: { role: 'assistant', content: msg.content ?? null, ...(msg.tool_calls ? { tool_calls: msg.tool_calls } : {}) }, finish_reason: msg.tool_calls ? 'tool_calls' : 'stop' }],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      }),
    ), DELAY);
  });
});
await new Promise<void>((r) => fake.listen(LLM_PORT, '127.0.0.1', r));

const dataDir = mkdtempSync(join(tmpdir(), 'runway-smoke-'));
const server = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
  env: { ...process.env, PORT: String(APP_PORT), DATA_DIR: dataDir, NODE_ENV: 'production', LLM_API_KEY: 'fake', LLM_BASE_URL: `http://127.0.0.1:${LLM_PORT}/v1/`, LLM_MODEL: 'fake-model', LLM_RPM: '600', COMPOSIO_API_KEY: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));
const base = `http://127.0.0.1:${APP_PORT}`;
const fail = (m: string) => {
  console.error(`✗ ${m}`);
  server.kill();
  fake.close();
  process.exit(1);
};

for (let i = 0; i < 40; i++) {
  if (await fetch(`${base}/api/health`).then((r) => r.ok).catch(() => false)) break;
  await new Promise((r) => setTimeout(r, 500));
}
const gen = await fetch(`${base}/api/generate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: APP, force: true }) }).then((r) => r.json());
if (!gen.jobId) fail(`generate did not start a job: ${JSON.stringify(gen)}`);
console.log(`job ${gen.jobId} started; streaming events…`);

const events: any[] = [];
const sse = await fetch(`${base}/api/jobs/${gen.jobId}/events`);
const reader = sse.body!.getReader();
let buf = '';
const deadline = Date.now() + 5 * 60_000;
outer: while (Date.now() < deadline) {
  const { done, value } = await reader.read();
  if (done) break;
  buf += new TextDecoder().decode(value);
  let i: number;
  while ((i = buf.indexOf('\n\n')) >= 0) {
    const chunk = buf.slice(0, i);
    buf = buf.slice(i + 2);
    if (chunk.startsWith('event: end')) break outer;
    const line = chunk.split('\n').find((l) => l.startsWith('data: '));
    if (!line) continue;
    const e = JSON.parse(line.slice(6));
    events.push(e);
    const txt = e.message ?? e.query ?? e.title ?? e.fact ?? e.probe?.summary ?? e.slug ?? '';
    console.log(`  ${String(Math.round(e.t / 1000)).padStart(3)}s ${e.type.padEnd(8)} ${String(txt).slice(0, 110)}`);
  }
}

const done = events.find((e) => e.type === 'done');
if (!done) fail(`no done event; last: ${JSON.stringify(events.at(-1))}`);
const guide = await fetch(`${base}/api/guides/${done.slug}`).then((r) => r.json());
const parsed = Guide.safeParse(guide);
if (!parsed.success) fail(`published guide fails schema: ${parsed.error.issues[0]?.path.join('.')} ${parsed.error.issues[0]?.message}`);
const g = parsed.data!;
const checks: [string, boolean][] = [
  ['lint clean', lintGuide(g).length === 0],
  ['difficulty recomputed from factors (model said "gated")', g.verdict.difficulty !== 'gated'],
  ['long label shortened, original kept in basis', g.verdict.timeToFirstConnection.label.length <= 32 && /very long label/.test(g.verdict.timeToFirstConnection.basis ?? '')],
  ['unknown citation S999 dropped', !JSON.stringify(g.phases).includes('S999')],
  ['javascript: link removed', !JSON.stringify(g).includes('javascript:')],
  ['step ids unique', new Set(g.phases.flatMap((p) => p.steps.map((s) => s.id))).size === g.phases.flatMap((p) => p.steps).length],
  ['"tested" scope without probe downgraded', g.scopes[0]?.confidence !== 'tested'],
  ['uncited Composio step became inferred', g.phases[1].steps[0].confidence === 'inferred'],
  ['sources retrieved and renumbered', g.evidence.sources.length > 0 && g.evidence.sources[0].id === 'S1'],
  ['probes recorded', g.evidence.probes.length >= 2],
  ['trace stored', Boolean(await fetch(`${base}/api/guides/${done.slug}/trace`).then((r) => r.json()))],
  ['markdown export', (await fetch(`${base}/guides/${done.slug}.md`).then((r) => r.text())).startsWith(`# ${g.app.name}`)],
];
for (const [name, ok] of checks) console.log(`${ok ? '✓' : '✗'} ${name}`);
if (KEEP) {
  console.log(`
Servers left running for manual checks: app ${base}, fake model http://127.0.0.1:${LLM_PORT}. Ctrl+C to stop.`);
  await new Promise(() => {});
}
server.kill();
fake.close();
process.exit(checks.every(([, ok]) => ok) ? 0 : 1);
