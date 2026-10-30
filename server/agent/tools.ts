import type OpenAI from 'openai';
import type { AgentEvent } from '../../shared/events.ts';
import { webSearch } from '../composio.ts';
import { probeAuthorize, probeDiscovery, probePortal } from './probes.ts';
import type { EvidenceRegistry } from './registry.ts';
import { readPage } from './web.ts';

export type Finding = { fact: string; sourceIds: string[] };

export type ToolContext = {
  reg: EvidenceRegistry;
  emit: (e: AgentEvent) => void;
  findings: Finding[];
  readCount: number;
};

const fn = (name: string, description: string, properties: Record<string, unknown>, required: string[]) =>
  ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } }) as const;

export const RESEARCH_TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  fn('web_search', 'Search the web. Returns titles, URLs and snippets, each with a source id.', { query: { type: 'string' } }, ['query']),
  fn('read_page', 'Read a web page as text. Returns its source id and content.', { url: { type: 'string' } }, ['url']),
  fn(
    'probe_oauth_discovery',
    "Fetch the provider's OAuth/OIDC discovery document (/.well-known/...). Pass the issuer or any URL on the provider's auth domain.",
    { url: { type: 'string' } },
    ['url'],
  ),
  fn(
    'probe_authorize_endpoint',
    "Send a browser-style GET to the provider's OAuth authorize URL with a fake client_id and the Composio redirect URI, and record how it responds (live? rejects unknown clients? login wall?). Pass the bare authorize URL from the docs.",
    { authorize_url: { type: 'string' }, scope: { type: 'string', description: 'space- or comma-separated scopes typical for the app' } },
    ['authorize_url'],
  ),
  fn(
    'probe_developer_portal',
    'GET the developer portal page where OAuth apps are created, and record whether it requires signing in (the human handoff point).',
    { url: { type: 'string' } },
    ['url'],
  ),
  fn(
    'save_findings',
    'Save atomic facts you learned, each with supporting source/probe ids (S#/P#). Call this alongside your other tool calls.',
    {
      findings: {
        type: 'array',
        items: {
          type: 'object',
          properties: { fact: { type: 'string' }, sourceIds: { type: 'array', items: { type: 'string' } } },
          required: ['fact', 'sourceIds'],
        },
      },
    },
    ['findings'],
  ),
  fn(
    'finish_research',
    'Finish research. Summarise what you established and list remaining gaps.',
    { summary: { type: 'string' }, gaps: { type: 'array', items: { type: 'string' } } },
    ['summary', 'gaps'],
  ),
];

const MAX_PAGES = 12;

export async function runTool(name: string, args: Record<string, any>, ctx: ToolContext): Promise<string> {
  const { reg, emit } = ctx;
  switch (name) {
    case 'web_search': {
      const query = String(args.query ?? '').slice(0, 300);
      const { hits, answer, engine } = await webSearch(query);
      emit({ type: 'search', query, count: hits.length, engine });
      const lines = hits.map((h) => {
        const s = reg.addSource(h.url, h.title, 'search-result', h.snippet);
        return `[${s.id}] ${h.title} — ${h.url}\n    ${h.snippet.replace(/\s+/g, ' ').slice(0, 300)}`;
      });
      return `${answer ? `Search summary (unverified): ${answer.slice(0, 800)}\n\n` : ''}${lines.join('\n') || 'No results.'}`;
    }
    case 'read_page': {
      const url = String(args.url ?? '');
      if (ctx.readCount >= MAX_PAGES) return `Page budget exhausted (${MAX_PAGES}). Use what you have.`;
      ctx.readCount++;
      try {
        const page = await readPage(url);
        const s = reg.addSource(page.finalUrl || url, page.title, 'fetched', page.text.slice(0, 600));
        s.text = page.text.slice(0, 8000); // kept for the verifier pass
        emit({ type: 'read', url: s.url, title: page.title, ok: true, chars: page.text.length, via: page.via, sourceId: s.id });
        return `[${s.id}] ${page.title} — ${s.url}\n\n${page.text}`;
      } catch (e) {
        const msg = (e as Error).message;
        emit({ type: 'read', url, title: url, ok: false, error: msg });
        return `Could not read ${url}: ${msg}`;
      }
    }
    case 'probe_oauth_discovery':
    case 'probe_authorize_endpoint':
    case 'probe_developer_portal': {
      if (reg.probes.length >= 8) return 'Probe budget exhausted.';
      const draft =
        name === 'probe_oauth_discovery'
          ? await probeDiscovery(String(args.url))
          : name === 'probe_authorize_endpoint'
            ? await probeAuthorize(String(args.authorize_url), args.scope ? String(args.scope) : undefined)
            : await probePortal(String(args.url));
      const p = reg.addProbe(draft);
      emit({ type: 'probe', probe: p });
      return `[${p.id}] ${p.kind} → ${p.result}: ${p.summary}\n${p.detail ?? ''}`;
    }
    case 'save_findings': {
      const items = Array.isArray(args.findings) ? args.findings : [];
      for (const f of items.slice(0, 20)) {
        const fact = String(f?.fact ?? '').trim();
        if (!fact) continue;
        const sourceIds = (Array.isArray(f?.sourceIds) ? f.sourceIds : []).map(String).filter((id: string) => /^[SP]\d+$/.test(id));
        ctx.findings.push({ fact, sourceIds });
        emit({ type: 'finding', fact, sourceIds });
      }
      return `Saved ${items.length} finding(s). Total ${ctx.findings.length}.`;
    }
    default:
      return `Unknown tool ${name}`;
  }
}
