import type { QualityReport, Stage, TimedEvent } from '../../../shared/events.ts';

const STAGES: { key: Stage; label: string }[] = [
  { key: 'resolve', label: 'Identify' },
  { key: 'composio', label: 'Composio' },
  { key: 'research', label: 'Research' },
  { key: 'write', label: 'Write' },
  { key: 'check', label: 'Check' },
  { key: 'done', label: 'Done' },
];

export function StageStepper({ current, failed }: { current: Stage | null; failed?: boolean }) {
  const idx = current ? STAGES.findIndex((s) => s.key === current) : -1;
  return (
    <ol className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
      {STAGES.map((s, i) => {
        const state = i < idx || current === 'done' ? 'done' : i === idx ? (failed ? 'failed' : 'active') : 'todo';
        const cls =
          state === 'done'
            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300'
            : state === 'active'
              ? 'bg-sky-600 text-white dark:bg-sky-400 dark:text-slate-950'
              : state === 'failed'
                ? 'bg-rose-600 text-white'
                : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400';
        return (
          <li key={s.key} className={`flex items-center gap-1 rounded-full px-2.5 py-1 ${cls}`}>
            {state === 'done' ? '✓' : state === 'active' ? <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" /> : null}
            {s.label}
          </li>
        );
      })}
    </ol>
  );
}

const host = (u: string) => {
  try {
    const x = new URL(u);
    return x.host + (x.pathname.length > 1 ? x.pathname.slice(0, 48) : '');
  } catch {
    return u;
  }
};
const secs = (t: number) => `${Math.floor(t / 60000)}:${String(Math.floor((t % 60000) / 1000)).padStart(2, '0')}`;

export function EventLine({ e }: { e: TimedEvent }) {
  const time = <span className="w-10 shrink-0 pt-0.5 font-mono text-[11px] text-slate-400 tabular-nums">{secs(e.t)}</span>;
  const row = (icon: string, body: React.ReactNode, cls = '') => (
    <li className={`flex gap-2 py-1.5 text-sm ${cls}`}>
      {time}
      <span className="w-5 shrink-0 text-center" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0 flex-1">{body}</div>
    </li>
  );
  switch (e.type) {
    case 'stage':
      return row('▸', <span className="font-semibold text-slate-900 dark:text-white">{e.message}</span>, 'mt-2');
    case 'search':
      return row(
        '🔎',
        <span>
          Searched <span className="font-medium">“{e.query}”</span> <span className="text-slate-500">· {e.count} results</span>
        </span>,
      );
    case 'read':
      return row(
        e.ok ? '📄' : '⚠️',
        e.ok ? (
          <span>
            Read{' '}
            <a href={e.url} target="_blank" rel="noreferrer" className="font-medium text-sky-700 hover:underline dark:text-sky-300">
              {e.title?.slice(0, 80) || host(e.url)}
            </a>{' '}
            <span className="text-slate-500">
              · {host(e.url)} {e.sourceId ? `· ${e.sourceId}` : ''}
            </span>
          </span>
        ) : (
          <span className="text-slate-500">
            Couldn't read {host(e.url)}: {e.error?.slice(0, 100)}
          </span>
        ),
      );
    case 'probe': {
      const p = e.probe;
      const badge =
        p.result === 'pass'
          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300'
          : p.result === 'fail'
            ? 'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300'
            : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
      return row(
        '🧪',
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-800/50">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">
              {p.id} · {p.kind}
            </span>
            <span className={`rounded px-1.5 text-[10px] font-bold uppercase ${badge}`}>{p.result}</span>
          </div>
          <div className="mt-0.5">{p.summary}</div>
          <div className="mt-0.5 truncate font-mono text-[11px] text-slate-500">{p.target}</div>
        </div>,
      );
    }
    case 'finding':
      return row(
        '✎',
        <span className="text-slate-700 dark:text-slate-300">
          {e.fact} <span className="font-mono text-[11px] text-slate-400">{e.sourceIds.join(' ')}</span>
        </span>,
      );
    case 'info':
      return row('ℹ', <span className="text-slate-600 dark:text-slate-400">{e.message}</span>);
    case 'warn':
      return row('⚠', <span className="text-amber-700 dark:text-amber-400">{e.message}</span>);
    case 'quality':
      return row('✓', <QualitySummary q={e.report} />);
    case 'done':
      return null;
    case 'error':
      return row('✕', <span className="font-semibold text-rose-700 dark:text-rose-400">{e.message}</span>);
  }
}

export function QualitySummary({ q }: { q: QualityReport }) {
  return (
    <div className="text-sm">
      <div className="font-semibold text-slate-900 dark:text-white">Evidence check</div>
      <div className="mt-0.5 text-slate-600 dark:text-slate-400">
        Claims: {q.claims.tested} tested · {q.claims.official} official · {q.claims.reported} reported · {q.claims.inferred} inferred. Sources:{' '}
        {q.sources.total} ({q.sources.fetched} read in full, {q.sources.snippetOnly} snippet-only). Probes: {q.probes.pass} passed, {q.probes.info}{' '}
        inconclusive, {q.probes.fail} failed. Model: {q.llm.model}, {q.llm.calls} calls.
      </div>
      {q.fixes.length > 0 && (
        <details className="mt-1">
          <summary className="cursor-pointer text-xs text-slate-500">{q.fixes.length} automatic correction(s) to the draft</summary>
          <ul className="mt-1 list-disc pl-5 text-xs text-slate-500">
            {q.fixes.slice(0, 40).map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export function EventFeed({ events, hideFindings = false }: { events: TimedEvent[]; hideFindings?: boolean }) {
  return (
    <ul className="divide-y divide-slate-100 dark:divide-slate-800/70">
      {events
        .filter((e) => !(hideFindings && e.type === 'finding'))
        .map((e, i) => (
          <EventLine key={i} e={e} />
        ))}
    </ul>
  );
}
