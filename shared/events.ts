import type { Probe } from './schema.ts';

export type Stage = 'resolve' | 'composio' | 'research' | 'write' | 'check' | 'done';

export type QualityReport = {
  claims: Record<'tested' | 'official' | 'reported' | 'inferred', number>;
  sources: { total: number; fetched: number; snippetOnly: number; official: number; community: number; composio: number };
  probes: { total: number; pass: number; info: number; fail: number };
  fixes: string[];
  llm: { calls: number; inputTokens: number; outputTokens: number; model: string };
};

export type AgentEvent =
  | { type: 'stage'; stage: Stage; message: string }
  | { type: 'search'; query: string; count: number; engine: string }
  | { type: 'read'; url: string; title: string; ok: boolean; chars?: number; via?: string; error?: string; sourceId?: string }
  | { type: 'probe'; probe: Probe }
  | { type: 'finding'; fact: string; sourceIds: string[] }
  | { type: 'info'; message: string }
  | { type: 'warn'; message: string }
  | { type: 'quality'; report: QualityReport }
  | { type: 'done'; slug: string }
  | { type: 'error'; message: string };

export type TimedEvent = AgentEvent & { t: number };

export type JobStatus = 'queued' | 'running' | 'done' | 'error';
