import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { QualityReport, TimedEvent } from '../shared/events.ts';
import { Guide } from '../shared/schema.ts';
import { env } from './env.ts';

const LIBRARY_DIR = 'data/library';
const GEN_DIR = join(env.dataDir, 'guides');
const TRACE_DIR = join(env.dataDir, 'traces');
mkdirSync(GEN_DIR, { recursive: true });
mkdirSync(TRACE_DIR, { recursive: true });

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

export type Trace = { query: string; events: TimedEvent[]; quality: QualityReport | null };

const summarize = (g: Guide): GuideSummary => ({
  slug: g.slug,
  name: g.app.name,
  category: g.app.category,
  difficulty: g.verdict.difficulty,
  headline: g.verdict.headline,
  timeToFirstConnection: g.verdict.timeToFirstConnection,
  timeToProduction: g.verdict.timeToProduction,
  cost: g.verdict.cost,
  managedOAuth: g.composio.managedOAuth,
  toolkitSlug: g.composio.toolkitSlug,
  generator: g.meta.generator,
  generatedAt: g.meta.generatedAt,
  verified: Boolean(g.evidence.verification),
});

function readDir(dir: string): Guide[] {
  if (!existsSync(dir)) return [];
  const out: Guide[] = [];
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    try {
      out.push(Guide.parse(JSON.parse(readFileSync(join(dir, f), 'utf8'))));
    } catch (e) {
      console.warn(`[store] skipping invalid guide ${dir}/${f}: ${(e as Error).message.slice(0, 200)}`);
    }
  }
  return out;
}

let library = readDir(LIBRARY_DIR);
let generated = readDir(GEN_DIR);

/** In dev, pick up library edits without a restart. */
export function reloadLibrary() {
  library = readDir(LIBRARY_DIR);
}

export const store = {
  list(): GuideSummary[] {
    if (!env.isProd) reloadLibrary();
    const libSlugs = new Set(library.map((g) => g.slug));
    return [...library, ...generated.filter((g) => !libSlugs.has(g.slug))].map(summarize);
  },
  get(slug: string): Guide | null {
    if (!env.isProd) reloadLibrary();
    return library.find((g) => g.slug === slug) ?? generated.find((g) => g.slug === slug) ?? null;
  },
  /** A guide (library first) for a Composio toolkit slug or a guide slug. */
  findFor(keys: { slug?: string; toolkitSlug?: string | null }): Guide | null {
    const all = [...library, ...generated];
    return (
      (keys.slug && all.find((g) => g.slug === keys.slug)) ||
      (keys.toolkitSlug && all.find((g) => g.composio.toolkitSlug === keys.toolkitSlug)) ||
      null
    );
  },
  isLibrary(slug: string) {
    return library.some((g) => g.slug === slug);
  },
  saveGenerated(guide: Guide, trace: Trace) {
    writeFileSync(join(GEN_DIR, `${guide.slug}.json`), JSON.stringify(guide, null, 2));
    writeFileSync(join(TRACE_DIR, `${guide.slug}.json`), JSON.stringify(trace));
    generated = [...generated.filter((g) => g.slug !== guide.slug), guide];
  },
  trace(slug: string): Trace | null {
    const p = join(TRACE_DIR, `${slug}.json`);
    return existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as Trace) : null;
  },
};
