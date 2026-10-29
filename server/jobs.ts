/**
 * Generation jobs: queued, run in-process, streamed to any number of SSE clients.
 * Events are buffered so a client that connects late (or reconnects) replays them.
 */
import { randomUUID } from 'node:crypto';
import type { Response } from 'express';
import type { AgentEvent, JobStatus, TimedEvent } from '../shared/events.ts';
import { generateGuide, UserFacingError } from './agent/pipeline.ts';
import { slugify } from './catalog.ts';
import { env } from './env.ts';
import { store } from './store.ts';

export type Job = {
  id: string;
  query: string;
  status: JobStatus;
  events: TimedEvent[];
  slug: string | null;
  error: string | null;
  createdAt: number;
  clients: Set<Response>;
};

const jobs = new Map<string, Job>();
const queue: Job[] = [];
let running = 0;

const JOB_TIMEOUT_MS = 8 * 60_000;

function push(job: Job, e: AgentEvent) {
  const te = { ...e, t: Date.now() - job.createdAt } as TimedEvent;
  job.events.push(te);
  const line = `data: ${JSON.stringify(te)}\n\n`;
  for (const c of job.clients) c.write(line);
}

function finish(job: Job) {
  for (const c of job.clients) c.write(`event: end\ndata: {}\n\n`);
}

async function run(job: Job) {
  running++;
  job.status = 'running';
  const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new UserFacingError('Generation took too long and was stopped.')), JOB_TIMEOUT_MS));
  try {
    const { guide, quality } = await Promise.race([
      generateGuide(job.query, (e) => push(job, e), {
        slugFor: (name) => {
          const base = slugify(name);
          return store.isLibrary(base) ? `${base}-live` : base;
        },
      }),
      timeout,
    ]);
    store.saveGenerated(guide, { query: job.query, events: job.events, quality });
    job.slug = guide.slug;
    job.status = 'done';
    push(job, { type: 'stage', stage: 'done', message: `Guide ready in ${guide.meta.durationSec}s` });
    push(job, { type: 'done', slug: guide.slug });
  } catch (e) {
    const msg = e instanceof UserFacingError ? e.message : `Generation failed: ${(e as Error).message}`;
    console.error(`[job ${job.id}]`, e);
    job.status = 'error';
    job.error = msg;
    push(job, { type: 'error', message: msg });
  } finally {
    running--;
    finish(job);
    pump();
  }
}

function pump() {
  while (running < env.maxConcurrentJobs && queue.length) {
    const next = queue.shift()!;
    void run(next);
  }
  queue.forEach((j, i) => push(j, { type: 'info', message: `Queued: ${i + 1} generation(s) ahead of you` }));
}

export function startJob(query: string): Job {
  const key = query.trim().toLowerCase();
  const inflight = [...jobs.values()].find((j) => j.query.trim().toLowerCase() === key && (j.status === 'running' || j.status === 'queued'));
  if (inflight) return inflight;
  const job: Job = { id: randomUUID(), query: query.trim(), status: 'queued', events: [], slug: null, error: null, createdAt: Date.now(), clients: new Set() };
  jobs.set(job.id, job);
  queue.push(job);
  pump();
  return job;
}

export const getJob = (id: string) => jobs.get(id) ?? null;

/** Forget finished jobs after an hour. */
setInterval(() => {
  const cutoff = Date.now() - 60 * 60_000;
  for (const [id, j] of jobs) if (j.createdAt < cutoff && (j.status === 'done' || j.status === 'error')) jobs.delete(id);
}, 10 * 60_000).unref();
