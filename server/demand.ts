/** Demand signal: which apps developers look up and ask to have verified. Drives what the library covers next. */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { env } from './env.ts';

type Demand = Record<string, { generated: number; reviewRequests: number; lastAt: string }>;
const FILE = join(env.dataDir, 'demand.json');
let demand: Demand = existsSync(FILE) ? (JSON.parse(readFileSync(FILE, 'utf8')) as Demand) : {};

export function recordDemand(key: string, kind: 'generated' | 'reviewRequests') {
  const k = key.toLowerCase().slice(0, 80);
  const d = (demand[k] ??= { generated: 0, reviewRequests: 0, lastAt: '' });
  d[kind]++;
  d.lastAt = new Date().toISOString();
  try {
    writeFileSync(FILE, JSON.stringify(demand));
  } catch {}
  return d;
}

export const demandFor = (key: string) => demand[key.toLowerCase()] ?? { generated: 0, reviewRequests: 0, lastAt: '' };
export const topDemand = (n = 20) =>
  Object.entries(demand)
    .map(([app, d]) => ({ app, ...d, score: d.generated + 3 * d.reviewRequests }))
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
