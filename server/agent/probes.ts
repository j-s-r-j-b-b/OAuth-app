/**
 * Setup attempts the agent can run without an account. All are read-only GETs.
 * Each returns a summary for the model plus a structured Probe for the evidence log.
 */
import { COMPOSIO_REDIRECT_URI, type Probe } from '../../shared/schema.ts';
import { safeGet } from '../net.ts';
import { htmlToText } from './web.ts';

export const PROBE_CLIENT_ID = 'oauth-runway-probe';

type ProbeDraft = Omit<Probe, 'id' | 'at'>;

const LOGIN_HINTS = /(log ?in|sign ?in|signin|login|sso|authenticate|identifier|accounts?\.)/i;
const ERROR_HINTS =
  /(invalid[_ ]client|client[_ ]id|unauthorized[_ ]client|redirect[_ ]uri|does not exist|not found|AADSTS\d+|invalid[_ ]request|error)/i;

const RAW_ERROR_TOKENS =
  /\b(invalid_client(?:_id)?|unauthorized_client|invalid_request|invalid_scope|redirect_uri_mismatch|bad_redirect_uri|AADSTS\d{5,}[^"<]{0,120}|The OAuth client was not found\.?|client[_ ]id[^"<]{0,60}(?:invalid|not found|does not exist))/gi;

/** Error parameters are sometimes base64/protobuf-encoded (e.g. Google's authError). */
function decodeErrorParams(url: string): string[] {
  const out: string[] = [];
  try {
    for (const [k, v] of new URL(url).searchParams) {
      if (!/error/i.test(k)) continue;
      out.push(`${k}=${v.slice(0, 120)}`);
      try {
        const printable = Buffer.from(v, 'base64').toString('latin1').match(/[\x20-\x7e]{6,}/g);
        if (printable) out.push(`decoded: ${printable.join(' ')}`);
      } catch {}
    }
  } catch {}
  return out;
}

function excerpt(body: string, contentType: string, urls: string[] = [], max = 700): string {
  const decoded = urls.flatMap(decodeErrorParams);
  const tokens = [...new Set((body.match(RAW_ERROR_TOKENS) ?? []).map((t) => t.trim()))].slice(0, 5);
  if (/json/.test(contentType)) return [body.slice(0, 400), ...decoded].join(' | ').slice(0, max);
  const { title, text } = htmlToText(body);
  const lines = text.split('\n').filter((l) => ERROR_HINTS.test(l)).slice(0, 4).join(' | ');
  const parts = [title ? `title="${title}"` : '', lines, tokens.length ? `error tokens in page: ${tokens.join(', ')}` : '', ...decoded];
  return parts.filter(Boolean).join(' | ').slice(0, max) || text.slice(0, 300);
}

const chainText = (chain: { url: string; status: number }[]) =>
  chain.map((h) => `${h.status} ${new URL(h.url).host}${new URL(h.url).pathname}`).join(' → ');

export async function probeDiscovery(input: string): Promise<ProbeDraft> {
  const base = new URL(input);
  const candidates = [
    `${base.origin}/.well-known/openid-configuration`,
    `${base.origin}/.well-known/oauth-authorization-server`,
  ];
  if (base.pathname.length > 1) {
    const path = base.pathname.replace(/\/$/, '');
    candidates.unshift(`${base.origin}${path}/.well-known/openid-configuration`);
  }
  const tried: string[] = [];
  for (const url of candidates) {
    try {
      const r = await safeGet(url, { accept: 'application/json', maxRedirects: 2 });
      tried.push(`${r.status} ${url}`);
      if (r.status === 200 && /json/.test(r.contentType)) {
        const doc = JSON.parse(r.body);
        const facts = {
          issuer: doc.issuer,
          authorization_endpoint: doc.authorization_endpoint,
          token_endpoint: doc.token_endpoint,
          registration_endpoint: doc.registration_endpoint ?? null,
          code_challenge_methods_supported: doc.code_challenge_methods_supported ?? null,
          grant_types_supported: doc.grant_types_supported ?? null,
          scopes_supported: Array.isArray(doc.scopes_supported) ? doc.scopes_supported.slice(0, 25) : null,
        };
        const dcr = facts.registration_endpoint ? ' Dynamic client registration endpoint advertised.' : '';
        const pkce = facts.code_challenge_methods_supported ? ` PKCE: ${facts.code_challenge_methods_supported.join(', ')}.` : '';
        return {
          kind: 'oauth-discovery',
          target: `GET ${url}`,
          result: 'pass',
          summary: `Discovery document found. Authorize: ${facts.authorization_endpoint}; token: ${facts.token_endpoint}.${pkce}${dcr}`,
          detail: JSON.stringify(facts).slice(0, 1500),
        };
      }
    } catch (e) {
      tried.push(`ERR ${url}: ${(e as Error).message}`);
    }
  }
  return {
    kind: 'oauth-discovery',
    target: `GET ${candidates.join(' | ')}`,
    result: 'info',
    summary: 'No public OAuth/OIDC discovery document; endpoints must come from the provider docs.',
    detail: tried.join('\n').slice(0, 1500),
  };
}

export async function probeAuthorize(authorizeUrl: string, scope?: string, extra?: Record<string, string>): Promise<ProbeDraft> {
  const u = new URL(authorizeUrl);
  const set = (k: string, v: string) => {
    if (!u.searchParams.has(k)) u.searchParams.set(k, v);
  };
  set('response_type', 'code');
  set('client_id', PROBE_CLIENT_ID);
  set('redirect_uri', COMPOSIO_REDIRECT_URI);
  set('state', 'oauth-runway-probe');
  if (scope) set('scope', scope);
  for (const [k, v] of Object.entries(extra ?? {})) u.searchParams.set(k, v);
  const target = `GET ${u.toString()}`;
  try {
    const r = await safeGet(u.toString(), { maxRedirects: 4 });
    const final = new URL(r.finalUrl);
    const ex = excerpt(r.body, r.contentType, [r.finalUrl, ...r.chain.map((h) => h.location ?? '')]);
    const sawError = ERROR_HINTS.test(ex) || /error/i.test(final.search) || r.chain.some((h) => /error/i.test(h.location ?? ''));
    const loginWall = LOGIN_HINTS.test(final.host + final.pathname) && !sawError;
    let summary: string;
    if (sawError) summary = `Endpoint is live and rejects an unregistered client (${r.status}). Shows what a misconfigured app sees.`;
    else if (loginWall) summary = `Endpoint is live; it sends the browser to sign-in before validating the client (${r.status}).`;
    else if (r.status >= 500) summary = `Endpoint returned a server error (${r.status}); inconclusive.`;
    else if (r.status === 403 || r.status === 429) summary = `Request blocked by the provider (${r.status}), likely bot protection; inconclusive.`;
    else if (htmlToText(r.body).text.length < 200)
      summary = `Endpoint responded ${r.status} with a client-rendered page; client validation happens in the browser, so this probe is inconclusive.`;
    else summary = `Endpoint responded ${r.status}; see detail.`;
    return {
      kind: 'authorize-endpoint',
      target,
      result: sawError || loginWall ? 'pass' : 'info',
      summary,
      detail: `Chain: ${chainText(r.chain)}\nFinal: ${r.finalUrl.slice(0, 300)}\nExcerpt: ${ex}`.slice(0, 1500),
    };
  } catch (e) {
    return { kind: 'authorize-endpoint', target, result: 'fail', summary: `Request failed: ${(e as Error).message}`, detail: null };
  }
}

export async function probePortal(url: string): Promise<ProbeDraft> {
  try {
    const r = await safeGet(url, { maxRedirects: 6 });
    const final = new URL(r.finalUrl);
    const { title } = /html/.test(r.contentType) ? htmlToText(r.body) : { title: '' };
    const wall = LOGIN_HINTS.test(final.host + final.pathname + ' ' + title) || r.chain.some((h) => LOGIN_HINTS.test(h.location ?? ''));
    return {
      kind: 'portal',
      target: `GET ${url}`,
      result: r.status < 400 ? 'pass' : r.status === 403 ? 'info' : 'fail',
      summary: wall
        ? `Portal reachable; it requires signing in (redirected to ${final.host}${final.pathname.slice(0, 60)}). A human takes over here.`
        : `Portal reachable (${r.status}${title ? `, "${title.slice(0, 80)}"` : ''}); no sign-in redirect seen on the landing page.`,
      detail: `Chain: ${chainText(r.chain)}`.slice(0, 1500),
    };
  } catch (e) {
    return { kind: 'portal', target: `GET ${url}`, result: 'fail', summary: `Request failed: ${(e as Error).message}`, detail: null };
  }
}

export async function probeUrl(url: string): Promise<ProbeDraft> {
  try {
    const r = await safeGet(url, { maxRedirects: 5, maxBytes: 200_000 });
    return {
      kind: 'url-check',
      target: `GET ${url}`,
      result: r.status < 400 ? 'pass' : r.status === 403 ? 'info' : 'fail',
      summary: `HTTP ${r.status}${r.finalUrl !== url ? ` (redirected to ${r.finalUrl.slice(0, 120)})` : ''}.`,
      detail: `Chain: ${chainText(r.chain)}`,
    };
  } catch (e) {
    return { kind: 'url-check', target: `GET ${url}`, result: 'fail', summary: `Request failed: ${(e as Error).message}`, detail: null };
  }
}
