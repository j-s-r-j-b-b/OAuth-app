import type { QualityReport, TimedEvent } from '../../shared/events.ts';
import type { Guide } from '../../shared/schema.ts';

export type GuideSummary = {
  slug: string;
  name: string;
  category: string;
  difficulty: Guide['verdict']['difficulty'];
  headline: string;
  timeToFirstConnection: Guide['verdict']['timeToFirstConnection'];
  timeToProduction: Guide['verdict']['timeToProduction'];
  cost: string;
  managedOAuth: Guide['composio']['managedOAuth'];
  toolkitSlug: string | null;
  generator: 'library' | 'live';
  generatedAt: string;
  verified: boolean;
};

export type CatalogEntry = { name: string; slug: string; managed: boolean; docsUrl: string; guideSlug: string | null };
export type Health = { ok: boolean; liveGeneration: boolean; composio: boolean; model: string };
export type Trace = { query: string; events: TimedEvent[]; quality: QualityReport | null };

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  health: () => get<Health>('/api/health'),
  guides: () => get<GuideSummary[]>('/api/guides'),
  guide: (slug: string) => get<Guide>(`/api/guides/${slug}`),
  trace: (slug: string) => get<Trace | null>(`/api/guides/${slug}/trace`),
  catalog: () => get<{ source: string; fetchedAt: string; toolkits: CatalogEntry[] }>('/api/catalog'),
  job: (id: string) => get<{ id: string; query: string; status: string; slug: string | null; error: string | null }>(`/api/jobs/${id}`),
  async generate(query: string, force = false): Promise<{ jobId?: string; existing?: string }> {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query, force }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
    return body;
  },
};
