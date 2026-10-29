/**
 * Run the live research agent from the command line (same pipeline the web app uses).
 *   npm run generate -- "Pipedrive"
 *   npm run generate -- "Slack" --out docs/live-eval     # write the guide JSON + trace to a folder
 * Without --out, the guide is saved like a web-generated one (DATA_DIR/guides).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TimedEvent } from '../shared/events.ts';
import { lintGuide } from '../shared/schema.ts';
import { generateGuide } from '../server/agent/pipeline.ts';
import { slugify } from '../server/catalog.ts';
import { store } from '../server/store.ts';

const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const out = outIdx >= 0 ? args[outIdx + 1] : null;
const query = args.filter((_, i) => i !== outIdx && i !== outIdx + 1).join(' ').trim();
if (!query) {
  console.error('Usage: npm run generate -- "<app name or website>" [--out <dir>]');
  process.exit(1);
}

const started = Date.now();
const events: TimedEvent[] = [];
const { guide, quality } = await generateGuide(
  query,
  (e) => {
    const te = { ...e, t: Date.now() - started } as TimedEvent;
    events.push(te);
    const text =
      'message' in e ? e.message : e.type === 'search' ? `${e.query} (${e.count})` : e.type === 'read' ? `${e.ok ? '' : 'FAILED '}${e.url}` : e.type === 'probe' ? `${e.probe.kind} ${e.probe.result}: ${e.probe.summary}` : e.type === 'finding' ? e.fact : e.type === 'done' ? e.slug : '';
    console.log(`${String(Math.round(te.t / 1000)).padStart(4)}s ${e.type.padEnd(8)} ${String(text).slice(0, 140)}`);
  },
  { slugFor: (name) => (out ? slugify(name) : store.isLibrary(slugify(name)) ? `${slugify(name)}-live` : slugify(name)) },
);

if (out) {
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, `${guide.slug}.json`), JSON.stringify(guide, null, 2) + '\n');
  writeFileSync(join(out, `${guide.slug}.trace.json`), JSON.stringify({ query, events, quality }, null, 2) + '\n');
} else {
  store.saveGenerated(guide, { query, events, quality });
}
const v = guide.verdict;
console.log(`\n${guide.app.name}: ${v.difficulty} · first ${v.timeToFirstConnection.label} · production ${v.timeToProduction.label} · cost ${v.cost}`);
console.log(`  ${v.headline}`);
console.log(`  claims ${JSON.stringify(quality.claims)} · sources ${quality.sources.total} (${quality.sources.fetched} read) · probes ${quality.probes.pass}/${quality.probes.total} pass · ${quality.llm.calls} LLM calls · ${Math.round((Date.now() - started) / 1000)}s`);
console.log(`  automatic fixes: ${quality.fixes.length}; lint: ${lintGuide(guide).length ? lintGuide(guide).join('; ') : 'clean'}`);
