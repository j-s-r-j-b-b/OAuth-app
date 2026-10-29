/**
 * Build data/composio-toolkits.json from Composio's public "Managed OAuth apps" page.
 * That page lists every OAuth-capable toolkit and whether Composio manages the OAuth app.
 *   npm run catalog
 */
import { writeFileSync } from 'node:fs';

const SOURCE = 'https://docs.composio.dev/toolkits/managed-auth.md';

const res = await fetch(SOURCE);
if (!res.ok) throw new Error(`GET ${SOURCE} → ${res.status}`);
const md = await res.text();

type Entry = { name: string; slug: string; managed: boolean; docsUrl: string };
const entries: Entry[] = [];
let section: 'managed' | 'byo' | null = null;

for (const line of md.split('\n')) {
  if (/^## Composio-managed OAuth available/.test(line)) section = 'managed';
  else if (/^## Bring your own OAuth app/.test(line)) section = 'byo';
  else if (/^## /.test(line)) section = null;
  const m = line.match(/^\|\s*\[([^\]]+)\]\(([^)]+)\)\s*\|\s*`([A-Z0-9_]+)`\s*\|/);
  if (section && m) {
    const path = m[2].replace(/\.md$/, '');
    entries.push({
      name: m[1],
      slug: m[3].toLowerCase(),
      managed: section === 'managed',
      docsUrl: `https://docs.composio.dev${path}`,
    });
  }
}

const managed = entries.filter((e) => e.managed).length;
if (entries.length < 100) throw new Error(`Parsed only ${entries.length} toolkits — page format changed?`);
writeFileSync(
  'data/composio-toolkits.json',
  JSON.stringify({ source: SOURCE, fetchedAt: new Date().toISOString(), toolkits: entries }, null, 2) + '\n',
);
console.log(`Wrote ${entries.length} toolkits (${managed} managed, ${entries.length - managed} bring-your-own).`);
