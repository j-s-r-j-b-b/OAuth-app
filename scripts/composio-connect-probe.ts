/**
 * Real setup attempt through Composio for every library guide (needs COMPOSIO_API_KEY):
 * create a custom OAuth2 auth config with a dummy client, start a connection, follow the
 * redirect to the provider, record what Composio sends (authorize URL, redirect_uri, scopes),
 * then delete the auth config and connection. Results are written into each guide as a
 * `composio-api` probe plus `composioSetup.tested`.
 *   npm run connect-probe            # all library guides
 *   npm run connect-probe -- gmail   # one guide
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { connectProbe, describeConnectProbe } from '../server/composio.ts';
import { COMPOSIO_DEFAULT_REDIRECT_URI, COMPOSIO_REDIRECT_URI, Guide, lintGuide } from '../shared/schema.ts';

const only = process.argv[2];
const TARGET_PREFIX = 'Composio API: create custom OAuth2 auth config';
// Some toolkits need extra fields before Composio will build an authorize URL (dummy values; nothing real is created).
const CONNECTION_DATA: Record<string, Record<string, string>> = {
  shopify: { subdomain: 'oauth-runway-probe' },
  workday: {
    full: 'https://wd2-impl-services1.workday.com/ccx/api/v1/oauthrunwayprobe',
    authorizationUrl: 'https://impl.workday.com/oauthrunwayprobe/authorize',
    tokenUrl: 'https://wd2-impl-services1.workday.com/ccx/oauth2/oauthrunwayprobe/token',
  },
};
const EXTRA_CREDENTIALS: Record<string, Record<string, string>> = { twitter: { generic_id: 'oauth-runway-probe-bearer' } };

for (const f of readdirSync('data/library').filter((f) => f.endsWith('.json') && (!only || f.startsWith(only)))) {
  const path = join('data/library', f);
  const g = Guide.parse(JSON.parse(readFileSync(path, 'utf8')));
  const slug = g.composio.toolkitSlug;
  if (!slug) continue;
  const r = await connectProbe(slug, CONNECTION_DATA[slug] ?? {}, EXTRA_CREDENTIALS[slug] ?? {});
  const draft = describeConnectProbe(slug, r);

  // Replace an earlier run of this probe rather than piling up duplicates.
  const existing = g.evidence.probes.find((p) => p.target.startsWith(TARGET_PREFIX));
  const id = existing?.id ?? `P${g.evidence.probes.length + 1}`;
  const probe = { ...draft, id, at: new Date().toISOString() };
  g.evidence.probes = existing ? g.evidence.probes.map((p) => (p.id === id ? probe : p)) : [...g.evidence.probes, probe];

  if (r.ok) {
    g.composioSetup.tested = {
      probeId: id,
      testedAt: probe.at.slice(0, 10),
      authorizeUrl: r.authorizeUrl!,
      redirectUri: r.redirectUri ?? null,
      defaultScopes: r.scopes ?? [],
      extraParams: r.extraParams ?? {},
    };
    if (r.redirectUri) g.composioSetup.redirectUri = r.redirectUri;
    const note =
      r.redirectUri === COMPOSIO_DEFAULT_REDIRECT_URI
        ? `Tested: a custom auth config created without \`oauth_redirect_uri\` sends \`${COMPOSIO_DEFAULT_REDIRECT_URI}\`, not the v3 callback shown in Composio's API docs. Register exactly the URI your auth config sends, or set \`oauth_redirect_uri\` to \`${COMPOSIO_REDIRECT_URI}\` and register that instead.`
        : `Tested: Composio sends \`${r.redirectUri}\` as the redirect URI for this toolkit.`;
    g.composio.notes = [note, ...g.composio.notes.filter((n) => !n.startsWith('Tested: a custom auth config') && !n.startsWith('Tested: Composio sends'))];
  }
  const problems = lintGuide(Guide.parse(g));
  writeFileSync(path, JSON.stringify(g, null, 2) + '\n');
  console.log(`${r.ok ? '✓' : '·'} ${slug.padEnd(16)} ${draft.summary.slice(0, 160)}${problems.length ? `\n   lint: ${problems.join('; ')}` : ''}`);
}
