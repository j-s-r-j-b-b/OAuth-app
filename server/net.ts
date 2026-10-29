/**
 * Outbound HTTP for the agent. The agent chooses URLs from web content, so every
 * request goes through `assertPublicUrl` to keep it off private networks (SSRF).
 */
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export const USER_AGENT =
  'Mozilla/5.0 (compatible; OAuthRunway/0.1; +https://github.com/oauth-runway) research-agent';

function isPrivateAddress(ip: string): boolean {
  if (ip.includes(':')) {
    const v6 = ip.toLowerCase();
    if (v6 === '::1' || v6 === '::') return true;
    if (v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe80')) return true;
    const mapped = v6.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return mapped ? isPrivateAddress(mapped[1]) : false;
  }
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`Not a valid URL: ${raw}`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error(`Blocked scheme: ${url.protocol}`);
  if (url.port && !['80', '443'].includes(url.port)) throw new Error(`Blocked port: ${url.port}`);
  if (url.username || url.password) throw new Error('Blocked: credentials in URL');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || !host.includes('.'))
    throw new Error(`Blocked host: ${host}`);
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (addrs.some((a) => isPrivateAddress(a.address))) throw new Error(`Blocked private address for ${host}`);
  return url;
}

export type HopResult = { url: string; status: number; location?: string };

/**
 * GET with manual redirect handling so every hop is checked and recorded.
 * Returns the redirect chain and the final response body (capped).
 */
export async function safeGet(
  raw: string,
  opts: { maxRedirects?: number; timeoutMs?: number; maxBytes?: number; accept?: string } = {},
): Promise<{ chain: HopResult[]; finalUrl: string; status: number; contentType: string; body: string }> {
  const { maxRedirects = 5, timeoutMs = 15000, maxBytes = 1_500_000 } = opts;
  const chain: HopResult[] = [];
  let current = raw;
  for (let i = 0; i <= maxRedirects; i++) {
    const url = await assertPublicUrl(current);
    const res = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'user-agent': USER_AGENT,
        accept: opts.accept ?? 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9',
      },
    });
    const location = res.headers.get('location') ?? undefined;
    chain.push({ url: url.toString(), status: res.status, location });
    if (res.status >= 300 && res.status < 400 && location) {
      current = new URL(location, url).toString();
      continue;
    }
    const contentType = res.headers.get('content-type') ?? '';
    const buf = await readCapped(res, maxBytes);
    return { chain, finalUrl: url.toString(), status: res.status, contentType, body: buf };
  }
  const last = chain[chain.length - 1];
  return { chain, finalUrl: last.url, status: last.status, contentType: '', body: '' };
}

async function readCapped(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  reader.cancel().catch(() => {});
  return new TextDecoder().decode(Buffer.concat(chunks));
}
