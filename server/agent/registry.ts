/**
 * Everything the agent saw, with stable ids. The writer may only cite ids from here,
 * which is how we know a citation points at something that was actually retrieved.
 */
import type { Probe, Source } from '../../shared/schema.ts';

export type RegSource = Source & { retrieval: 'fetched' | 'search-result'; excerpt: string; text?: string };

const COMMUNITY = /(reddit\.com|stackoverflow\.com|stackexchange\.com|medium\.com|dev\.to|news\.ycombinator\.com|quora\.com|youtube\.com|hashnode|substack\.com|github\.com|community\.|forum|discuss)/i;
const COMPOSIO = /(^|\.)composio\.dev$/i;

export class EvidenceRegistry {
  sources: RegSource[] = [];
  probes: Probe[] = [];
  officialDomains = new Set<string>();

  constructor(private now = () => new Date().toISOString()) {}

  addOfficialDomain(urlOrHost: string) {
    try {
      const host = urlOrHost.includes('://') ? new URL(urlOrHost).hostname : urlOrHost;
      this.officialDomains.add(registrable(host));
    } catch {}
  }

  classify(url: string): Source['kind'] {
    const host = new URL(url).hostname;
    if (COMPOSIO.test(host)) return 'composio';
    if (COMMUNITY.test(host + new URL(url).pathname.slice(0, 20))) return 'community';
    return this.officialDomains.has(registrable(host)) ? 'official' : 'community';
  }

  /** Record a source; upgrades search-result → fetched if seen again by a fetch. */
  addSource(url: string, title: string, retrieval: RegSource['retrieval'], excerpt = ''): RegSource {
    const clean = url.split('#')[0];
    const existing = this.sources.find((s) => s.url === clean);
    if (existing) {
      if (retrieval === 'fetched') {
        existing.retrieval = 'fetched';
        if (title && title !== clean) existing.title = title;
        if (excerpt) existing.excerpt = excerpt;
      }
      return existing;
    }
    const src: RegSource = {
      id: `S${this.sources.length + 1}`,
      url: clean,
      title: (title || clean).slice(0, 200),
      kind: this.classify(clean),
      accessedAt: this.now().slice(0, 10),
      note: null,
      retrieval,
      excerpt,
    };
    this.sources.push(src);
    return src;
  }

  addProbe(p: Omit<Probe, 'id' | 'at'>): Probe {
    const probe: Probe = { ...p, id: `P${this.probes.length + 1}`, at: this.now() };
    this.probes.push(probe);
    return probe;
  }

  /** Compact listing the writer sees. */
  describe(): string {
    const s = this.sources
      .map((x) => `${x.id} [${x.kind}${x.retrieval === 'search-result' ? ', search snippet only' : ''}] ${x.title} — ${x.url}`)
      .join('\n');
    const p = this.probes.map((x) => `${x.id} [${x.kind}, ${x.result}] ${x.target}\n   → ${x.summary}`).join('\n');
    return `SOURCES\n${s || '(none)'}\n\nPROBES\n${p || '(none)'}`;
  }
}

/** eTLD+1-ish; good enough for official-domain matching (handles co.uk-style suffixes). */
export function registrable(host: string): string {
  const parts = host.toLowerCase().split('.');
  const twoLevel = /^(co|com|org|net|gov|ac)\.[a-z]{2}$/.test(parts.slice(-2).join('.'));
  return parts.slice(twoLevel ? -3 : -2).join('.');
}
