/**
 * Re-run every recorded GET probe in the library and flag evidence that has gone stale.
 * Probes are read-only (no accounts, no credentials), so this is safe to run any time:
 *   npm run replay            # all guides
 *   npm run replay -- gmail   # one guide
 * "Stale" = the request now fails outright, or the endpoint returns 404/410/5xx.
 * Everything else prints today's observation next to the recorded one for a human to compare.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { probeAuthorize, probeDiscovery, probePortal, probeUrl } from '../server/agent/probes.ts';
import { safeGet } from '../server/net.ts';
import { Guide, type Probe } from '../shared/schema.ts';

const only = process.argv[2];
const files = readdirSync('data/library').filter((f) => f.endsWith('.json') && (!only || f.startsWith(only)));
const urlsIn = (s: string) => (s.match(/https?:\/\/[^\s,|)'"]+/g) ?? []).map((u) => u.replace(/[.;]+$/, ''));

async function replay(p: Probe, url: string) {
  switch (p.kind) {
    case 'oauth-discovery':
      return probeDiscovery(url.replace(/\/\.well-known\/.*$/, ''));
    case 'authorize-endpoint': {
      const u = new URL(url);
      return probeAuthorize(`${u.origin}${u.pathname}`, undefined, Object.fromEntries(u.searchParams));
    }
    case 'portal':
      return probePortal(url);
    default:
      return probeUrl(url);
  }
}

let stale = 0;
let total = 0;
for (const f of files) {
  const g = Guide.parse(JSON.parse(readFileSync(join('data/library', f), 'utf8')));
  console.log(`\n${g.app.name}`);
  for (const p of g.evidence.probes) {
    const [url] = urlsIn(p.target);
    if (!url || p.kind === 'composio-api' || p.kind === 'dcr') {
      console.log(`  ·  ${p.id} ${p.kind}: not replayable (${p.target.slice(0, 60)})`);
      continue;
    }
    total++;
    let status = 0;
    let note = '';
    try {
      status = (await safeGet(url, { maxRedirects: 5, maxBytes: 100_000 })).status;
      note = (await replay(p, url)).summary;
    } catch (e) {
      note = `request failed: ${(e as Error).message}`;
    }
    const bad = status === 0 || status === 404 || status === 410 || status >= 500;
    // An authorize endpoint answering 404 for a made-up tenant is the recorded behaviour, not staleness.
    const expected404 = status === 404 && /404/.test(p.summary + (p.detail ?? ''));
    const flag = bad && !expected404;
    if (flag) stale++;
    console.log(`  ${flag ? '✗' : '✓'}  ${p.id} ${p.kind.padEnd(18)} HTTP ${status || '---'}  now: ${note.slice(0, 100)}`);
    if (flag) console.log(`       recorded ${p.at.slice(0, 10)}: ${p.summary.slice(0, 120)}`);
  }
}
console.log(`\n${total} probes replayed; ${stale} look stale.`);
process.exit(stale ? 1 : 0);
