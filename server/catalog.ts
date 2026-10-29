import { readFileSync } from 'node:fs';

export type CatalogEntry = { name: string; slug: string; managed: boolean; docsUrl: string };

const raw = JSON.parse(readFileSync('data/composio-toolkits.json', 'utf8')) as {
  source: string;
  fetchedAt: string;
  toolkits: CatalogEntry[];
};

export const catalog = raw.toolkits;
export const catalogMeta = { source: raw.source, fetchedAt: raw.fetchedAt };

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\.(com|io|dev|ai|co|net|org|app)(\/.*)?$/, '')
    .replace(/[^a-z0-9]+/g, '');

/** Turn free text ("Pipedrive", "pipedrive.com", "https://www.pipedrive.com/en") into a slug-ish key. */
export function slugify(input: string): string {
  const s = input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .replace(/\.(com|io|dev|ai|co|net|org|app|so|me)$/, '');
  return s.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'app';
}

/** Best Composio toolkit match for a user query; prefers non-MCP toolkits. */
export function matchToolkit(query: string): CatalogEntry | null {
  const q = norm(query);
  if (!q) return null;
  const exact = catalog.filter((t) => norm(t.name) === q || t.slug.replace(/_/g, '') === q);
  if (exact.length) return exact.sort((a, b) => Number(/MCP/.test(a.name)) - Number(/MCP/.test(b.name)))[0];
  const partial = catalog.filter((t) => !/MCP/.test(t.name) && (norm(t.name).startsWith(q) || q.startsWith(norm(t.name))));
  return partial.length === 1 ? partial[0] : null;
}
