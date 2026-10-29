import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Stage, TimedEvent } from '../../../shared/events.ts';
import { api } from '../api.ts';
import { EventFeed, StageStepper } from '../components/EventFeed.tsx';

export default function Generate() {
  const { jobId = '' } = useParams();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [events, setEvents] = useState<TimedEvent[]>([]);
  const [closed, setClosed] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [now, setNow] = useState(Date.now());
  const startedAt = useRef(Date.now());
  const bottom = useRef<HTMLDivElement>(null);
  const [follow, setFollow] = useState(true);

  useEffect(() => {
    api
      .job(jobId)
      .then((j) => setQuery(j.query))
      .catch(() => setNotFound(true));
    const es = new EventSource(`/api/jobs/${jobId}/events`);
    const seen = new Set<string>();
    let first = true;
    es.onmessage = (m) => {
      if (seen.has(m.data)) return; // replay after reconnect
      seen.add(m.data);
      const e = JSON.parse(m.data) as TimedEvent;
      if (first) {
        startedAt.current = Date.now() - e.t;
        first = false;
      }
      setEvents((prev) => [...prev, e]);
    };
    es.addEventListener('end', () => {
      setClosed(true);
      es.close();
    });
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      es.close();
      clearInterval(tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  useEffect(() => {
    if (follow) bottom.current?.scrollIntoView({ block: 'end' });
  }, [events, follow]);

  const done = events.find((e) => e.type === 'done') as Extract<TimedEvent, { type: 'done' }> | undefined;
  const error = events.find((e) => e.type === 'error') as Extract<TimedEvent, { type: 'error' }> | undefined;
  const stage = useMemo(() => [...events].reverse().find((e) => e.type === 'stage') as Extract<TimedEvent, { type: 'stage' }> | undefined, [events]);
  const counts = useMemo(
    () => ({
      searches: events.filter((e) => e.type === 'search').length,
      pages: events.filter((e) => e.type === 'read' && e.ok).length,
      probes: events.filter((e) => e.type === 'probe').length,
      findings: events.filter((e) => e.type === 'finding').length,
    }),
    [events],
  );

  useEffect(() => {
    if (done) {
      const t = setTimeout(() => navigate(`/guides/${done.slug}?fresh=1`), 2500);
      return () => clearTimeout(t);
    }
  }, [done, navigate]);

  const elapsed = Math.max(0, Math.floor(((closed && events.length ? startedAt.current + events[events.length - 1].t : now) - startedAt.current) / 1000));

  if (notFound && events.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">This generation job has expired</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">Finished guides stay available. Search for the app again.</p>
        <Link to="/" className="btn mt-6">
          Back to guides
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 lg:grid-cols-[1fr_300px]">
      <div>
        <div className="eyebrow">Live research</div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl dark:text-white">
          {done ? 'Guide ready: ' : error ? "Couldn't finish: " : 'Researching '}“{query || '…'}”
        </h1>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <StageStepper current={(stage?.stage as Stage) ?? null} failed={Boolean(error)} />
          <span className="font-mono text-sm text-slate-500 tabular-nums">{elapsed}s</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500 dark:text-slate-400">
          <span>{counts.searches} searches</span>
          <span>{counts.pages} pages read</span>
          <span>{counts.probes} setup probes</span>
          <span>{counts.findings} findings saved</span>
        </div>

        {done && (
          <div className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-700 dark:bg-emerald-500/10">
            <span className="font-semibold text-emerald-900 dark:text-emerald-200">Done. Opening the guide…</span>
            <Link to={`/guides/${done.slug}`} className="btn-primary">
              Open guide →
            </Link>
          </div>
        )}
        {error && (
          <div className="mt-5 rounded-xl border border-rose-300 bg-rose-50 p-4 text-rose-900 dark:border-rose-800 dark:bg-rose-500/10 dark:text-rose-200">
            <div className="font-semibold">{error.message}</div>
            <div className="mt-3 flex gap-2">
              <button
                className="btn"
                onClick={async () => {
                  const r = await api.generate(query, true).catch((e) => ({ error: e.message }) as any);
                  if (r.jobId) navigate(`/generate/${r.jobId}`);
                }}
              >
                Try again
              </button>
              <Link to="/" className="btn">
                Back to guides
              </Link>
            </div>
          </div>
        )}

        <div className="card mt-5 p-3 sm:p-4">
          {events.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">Connecting to the agent…</p> : <EventFeed events={events} />}
          <div ref={bottom} />
        </div>
        <label className="no-print mt-2 flex items-center gap-2 text-xs text-slate-500">
          <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> Follow along
        </label>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <div className="card p-4 text-sm text-slate-600 dark:text-slate-400">
          <div className="font-semibold text-slate-900 dark:text-white">What the agent is doing</div>
          <ol className="mt-2 list-decimal space-y-1.5 pl-4">
            <li>Identifies the app and checks Composio's catalog for a managed OAuth app.</li>
            <li>Searches and reads the provider's docs and policies, plus community reports for real timelines.</li>
            <li>
              Runs <strong>read-only setup probes</strong>: OAuth discovery, an authorize request with a fake client, and the developer portal's sign-in
              wall.
            </li>
            <li>Saves each finding with the source it came from, then writes the guide.</li>
            <li>Checks every citation and recomputes the rating from the evidence.</li>
          </ol>
        </div>
        <div className="card p-4 text-xs text-slate-500 dark:text-slate-400">
          Takes about 2–4 minutes on the free model tier. You can leave this page open; the guide gets a permanent link when it's done.
        </div>
      </aside>
    </div>
  );
}
