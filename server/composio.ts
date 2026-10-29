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
