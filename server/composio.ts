/**
 * Composio as the agent's research toolkit:
 *  - Composio Search (no-auth toolkit) for web search and page extraction
 *  - toolkit metadata (auth schemes, managed OAuth, required fields)
 *  - public docs pages (<slug>.md) as a keyless fallback
 */
import { env } from './env.ts';

const API = 'https://backend.composio.dev/api/v3.1';
const USER_ID = 'oauth-runway-agent';

export const composioEnabled = () => Boolean(env.composioApiKey);

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    signal: AbortSignal.timeout(45000),
    headers: { 'x-api-key': env.composioApiKey, 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Composio ${path} → ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text) as T;
}

type ExecResult = { data: unknown; error?: string | null; successful: boolean };

export async function executeTool(slug: string, args: Record<string, unknown>): Promise<unknown> {
  const out = await api<ExecResult>(`/tools/execute/${slug}`, {
    method: 'POST',
    body: JSON.stringify({ user_id: USER_ID, arguments: args }),
  });
  if (!out.successful) throw new Error(`${slug} failed: ${out.error ?? 'unknown error'}`);
  return out.data;
}

export type SearchHit = { title: string; url: string; snippet: string };

/** Pull {title,url,snippet} records out of whatever shape a search tool returns. */
function collectHits(node: unknown, hits: SearchHit[], depth = 0): void {
  if (!node || depth > 6) return;
  if (Array.isArray(node)) {
    for (const n of node) collectHits(n, hits, depth + 1);
    return;
  }
  if (typeof node !== 'object') return;
  const o = node as Record<string, unknown>;
  const url = (o.url ?? o.link ?? o.href) as string | undefined;
  if (typeof url === 'string' && /^https?:\/\//.test(url)) {
    const title = String(o.title ?? o.name ?? url);
    const snippet = String(o.snippet ?? o.text ?? o.summary ?? o.description ?? o.content ?? '').slice(0, 400);
    if (!hits.some((h) => h.url === url)) hits.push({ title, url, snippet });
    return;
  }
  for (const v of Object.values(o)) collectHits(v, hits, depth + 1);
}

/**
 * Search order: Composio's Exa-backed web search → Composio's DuckDuckGo tool →
 * DuckDuckGo's keyless HTML endpoint (so research still works without a key or if Composio is down).
 */
export async function webSearch(query: string): Promise<{ hits: SearchHit[]; answer?: string; engine: string }> {
  if (composioEnabled()) {
    try {
      const data = (await executeTool('COMPOSIO_SEARCH_WEB', { query })) as Record<string, unknown>;
      const hits: SearchHit[] = [];
      collectHits(data, hits);
      const results = (data?.results ?? data) as Record<string, unknown>;
      const answer = typeof results?.answer === 'string' ? results.answer.slice(0, 1500) : undefined;
      if (hits.length) return { hits: hits.slice(0, 10), answer, engine: 'composio:exa' };
    } catch (e) {
      console.warn('[search] COMPOSIO_SEARCH_WEB failed, falling back:', (e as Error).message);
    }
    try {
      const data = await executeTool('COMPOSIO_SEARCH_DUCK_DUCK_GO', { query });
      const hits: SearchHit[] = [];
      collectHits(data, hits);
      if (hits.length) return { hits: hits.slice(0, 10), engine: 'composio:duckduckgo' };
    } catch (e) {
      console.warn('[search] COMPOSIO_SEARCH_DUCK_DUCK_GO failed, falling back:', (e as Error).message);
    }
  }
  return { hits: await duckDuckGoHtml(query), engine: 'duckduckgo-html' };
}

const decodeEntities = (s: string) =>
  s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'");
const stripTags = (s: string) => decodeEntities(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

async function duckDuckGoHtml(query: string): Promise<SearchHit[]> {
  const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
    signal: AbortSignal.timeout(20000),
    headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36' },
  });
  const html = await res.text();
  if (!res.ok || res.status === 202 || /anomaly/i.test(html.slice(0, 20000)))
    throw new Error(`Keyless search is rate-limited by DuckDuckGo (HTTP ${res.status}); set COMPOSIO_API_KEY for reliable search`);
  const hits: SearchHit[] = [];
  const blocks = html.split('class="result__body"').slice(1);
  for (const b of blocks) {
    const link = b.match(/class="result__a" href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!link) continue;
    let url = decodeEntities(link[1]);
    const uddg = url.match(/[?&]uddg=([^&]+)/);
    if (uddg) url = decodeURIComponent(uddg[1]);
    if (!/^https?:\/\//.test(url) || /duckduckgo\.com\/y\.js/.test(url)) continue;
    const snippet = b.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
    hits.push({ title: stripTags(link[2]), url, snippet: snippet ? stripTags(snippet[1]).slice(0, 400) : '' });
    if (hits.length >= 10) break;
  }
  return hits;
}

/** Page text via Composio's extractor (handles JS-rendered docs better than a raw GET). */
export async function fetchViaComposio(url: string, maxChars = 14000): Promise<{ title: string; text: string } | null> {
  const data = (await executeTool('COMPOSIO_SEARCH_FETCH_URL_CONTENT', {
    urls: [url],
    text: true,
    max_characters: maxChars,
  })) as Record<string, unknown>;
  const found: { title: string; text: string }[] = [];
  const walk = (n: unknown, d = 0): void => {
    if (!n || d > 6) return;
    if (Array.isArray(n)) return n.forEach((x) => walk(x, d + 1));
    if (typeof n !== 'object') return;
    const o = n as Record<string, unknown>;
    if (typeof o.text === 'string' && o.text.length > 50) {
      found.push({ title: String(o.title ?? ''), text: o.text });
      return;
    }
    Object.values(o).forEach((v) => walk(v, d + 1));
  };
  walk(data);
  return found[0] ?? null;
}

export type ToolkitAuthDetail = {
  scheme: string;
  managed: boolean;
  configFields: { name: string; displayName: string; required: boolean; description: string }[];
  connectionFields: { name: string; displayName: string; required: boolean; description: string }[];
  defaultScopes: string[];
};

/** Auth details from the Composio API (needs an API key). */
export async function getToolkitAuth(slug: string): Promise<{ raw: unknown; details: ToolkitAuthDetail[] } | null> {
  if (!composioEnabled()) return null;
  const tk = await api<Record<string, any>>(`/toolkits/${encodeURIComponent(slug)}`);
  const managedSchemes: string[] = tk.composio_managed_auth_schemes ?? [];
  const toFields = (group: any) => {
    const req = (group?.required ?? []).map((f: any) => ({ ...f, required: true }));
    const opt = (group?.optional ?? []).map((f: any) => ({ ...f, required: false }));
    return [...req, ...opt].map((f: any) => ({
      name: String(f.name ?? ''),
      displayName: String(f.displayName ?? f.display_name ?? f.name ?? ''),
      required: Boolean(f.required),
      description: String(f.description ?? '').slice(0, 300),
      default: f.default,
    }));
  };
  const details: ToolkitAuthDetail[] = (tk.auth_config_details ?? []).map((d: any) => {
    const configFields = toFields(d.fields?.auth_config_creation);
    const scopeField = configFields.find((f: any) => /scope/i.test(f.name)) as any;
    const defaultScopes =
      typeof scopeField?.default === 'string'
        ? scopeField.default.split(/[\s,]+/).filter(Boolean)
        : Array.isArray(scopeField?.default)
          ? scopeField.default
          : [];
    return {
      scheme: String(d.mode ?? d.name ?? ''),
      managed: managedSchemes.includes(d.mode),
      configFields: configFields.map(({ default: _d, ...f }: any) => f),
      connectionFields: toFields(d.fields?.connected_account_initiation).map(({ default: _d, ...f }: any) => f),
      defaultScopes,
    };
  });
  return { raw: tk, details };
}

/** Public toolkit page (no key needed): auth schemes, managed flag and FAQ gotchas. */
export async function getToolkitDocs(slug: string): Promise<{ url: string; authLine: string; managedLine: string; faq: string } | null> {
  const url = `https://docs.composio.dev/toolkits/${slug}.md`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) return null;
  const md = await res.text();
  const authLine = md.match(/\*\*Auth:\*\*\s*(.+)/)?.[1]?.trim() ?? '';
  const managedLine = md.match(/\*\*Composio-managed OAuth available\?\*\*\s*(.+)/)?.[1]?.trim() ?? '';
  const faqStart = md.indexOf('## Frequently Asked Questions');
  const faqEnd = md.indexOf('## Tools', faqStart + 1);
  const faq = faqStart >= 0 ? md.slice(faqStart, faqEnd > 0 ? faqEnd : faqStart + 6000).slice(0, 6000) : '';
  return { url: url.replace(/\.md$/, ''), authLine, managedLine, faq };
}

export type ConnectProbeResult = {
  ok: boolean;
  stage: 'auth-config' | 'connection' | 'redirect' | 'done';
  error?: string;
  authorizeUrl?: string;
  redirectUri?: string | null;
  scopes?: string[];
  extraParams?: Record<string, string>;
  pkce?: boolean;
};

/**
 * A real setup attempt through Composio, using throwaway credentials:
 * create a custom OAuth2 auth config with a dummy client → start a connection →
 * follow Composio's redirect to the provider → record exactly what Composio sends
 * (authorize URL, redirect_uri, scopes) → delete everything.
 */
export async function connectProbe(
  toolkitSlug: string,
  connectionData: Record<string, string> = {},
  extraCredentials: Record<string, string> = {},
): Promise<ConnectProbeResult> {
  if (!composioEnabled()) return { ok: false, stage: 'auth-config', error: 'No Composio API key' };
  let authConfigId: string | undefined;
  let connectionId: string | undefined;
  try {
    const ac = await api<{ auth_config: { id: string } }>('/auth_configs', {
      method: 'POST',
      body: JSON.stringify({
        toolkit: { slug: toolkitSlug },
        auth_config: {
          type: 'use_custom_auth',
          authScheme: 'OAUTH2',
          name: 'oauth-runway-probe (auto-deleted)',
          credentials: { client_id: 'oauth-runway-probe', client_secret: 'oauth-runway-probe-secret', ...extraCredentials },
        },
      }),
    }).catch((e: Error) => {
      throw Object.assign(e, { stage: 'auth-config' });
    });
    authConfigId = ac.auth_config.id;
    const conn = await api<{ id: string; redirect_url?: string; redirect_uri?: string }>('/connected_accounts', {
      method: 'POST',
      body: JSON.stringify({
        auth_config: { id: authConfigId },
        connection: { user_id: 'oauth-runway-probe', ...(Object.keys(connectionData).length ? { data: connectionData } : {}) },
      }),
    }).catch((e: Error) => {
      throw Object.assign(e, { stage: 'connection' });
    });
    connectionId = conn.id;
    const short = conn.redirect_url ?? conn.redirect_uri;
    if (!short) return { ok: false, stage: 'redirect', error: 'Composio returned no redirect URL' };
    // Composio's link is a short URL that 30x-redirects to the provider's authorize endpoint.
    let url = short;
    for (let i = 0; i < 4; i++) {
      const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
      const loc = res.headers.get('location');
      if (!loc || res.status < 300 || res.status >= 400) break;
      url = new URL(loc, url).toString();
      if (!/composio\.dev/.test(new URL(url).hostname)) break;
    }
    const u = new URL(url);
    if (/composio\.dev/.test(u.hostname)) return { ok: false, stage: 'redirect', error: `Redirect stayed on Composio (${u.hostname}${u.pathname})` };
    const params = Object.fromEntries(u.searchParams);
    const { client_id: _c, redirect_uri, scope, state: _s, code_challenge, code_challenge_method: _m, ...extra } = params;
    return {
      ok: true,
      stage: 'done',
      authorizeUrl: `${u.origin}${u.pathname}`,
      redirectUri: redirect_uri ?? null,
      scopes: scope ? scope.split(/[\s,+]+/).filter(Boolean) : [],
      extraParams: extra,
      pkce: Boolean(code_challenge),
    };
  } catch (e) {
    return { ok: false, stage: ((e as { stage?: ConnectProbeResult['stage'] }).stage ?? 'auth-config'), error: (e as Error).message.slice(0, 300) };
  } finally {
    if (connectionId) await api(`/connected_accounts/${connectionId}`, { method: 'DELETE' }).catch(() => {});
    if (authConfigId) await api(`/auth_configs/${authConfigId}`, { method: 'DELETE' }).catch(() => {});
  }
}

/** Human summary + probe record for a connect-probe result. */
export function describeConnectProbe(toolkitSlug: string, r: ConnectProbeResult) {
  const target = `Composio API: create custom OAuth2 auth config for \`${toolkitSlug}\` with a dummy client → start a connection → follow the redirect (then delete both)`;
  if (!r.ok) {
    return {
      kind: 'composio-api' as const,
      target,
      result: 'info' as const,
      summary: `Composio connect test stopped at ${r.stage}: ${r.error}`,
      detail: null,
    };
  }
  const extra = Object.entries(r.extraParams ?? {}).map(([k, v]) => `${k}=${v}`).join(', ');
  return {
    kind: 'composio-api' as const,
    target,
    result: 'pass' as const,
    summary: `Composio sends users to ${r.authorizeUrl} with redirect_uri=${r.redirectUri ?? '(none)'}; default scopes: ${r.scopes?.length ? r.scopes.join(' ') : '(none sent)'}${r.pkce ? '; PKCE on' : ''}.`,
    detail: JSON.stringify({ authorizeUrl: r.authorizeUrl, redirectUri: r.redirectUri, scopes: r.scopes, extraParams: r.extraParams, pkce: r.pkce, note: extra ? `extra params: ${extra}` : undefined }).slice(0, 1500),
  };
}

/** Connect probe that first looks up the toolkit's required fields and fills them with dummy values. */
export async function connectProbeAuto(toolkitSlug: string): Promise<ConnectProbeResult> {
  const auth = await getToolkitAuth(toolkitSlug).catch(() => null);
  const oauth = auth?.details.find((d) => /OAUTH2/i.test(d.scheme));
  if (!oauth) return { ok: false, stage: 'auth-config', error: 'Toolkit has no OAuth2 scheme in Composio' };
  const dummy = (name: string, description: string) =>
    /url|endpoint|full|host|domain/i.test(`${name} ${description}`) && !/subdomain/i.test(name) ? 'https://oauth-runway-probe.example.com' : 'oauth-runway-probe';
  const extraCredentials = Object.fromEntries(
    oauth.configFields.filter((f) => f.required && !['client_id', 'client_secret'].includes(f.name)).map((f) => [f.name, dummy(f.name, f.description)]),
  );
  const connectionData = Object.fromEntries(oauth.connectionFields.filter((f) => f.required).map((f) => [f.name, dummy(f.name, f.description)]));
  return connectProbe(toolkitSlug, connectionData, extraCredentials);
}
