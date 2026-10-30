import { useState } from 'react';
import type { Guide, Step } from '../../../shared/schema.ts';
import { renderInline, renderMd } from '../lib/md.ts';
import { ActorChip } from './ui.tsx';

/** The one thing to do now: the first step not yet ticked, plus what's left. */
export function NextAction({ g, steps, done, onDone }: { g: Guide; steps: Step[]; done: Set<string>; onDone: (id: string) => void }) {
  const next = steps.find((s) => !done.has(s.id));
  const left = steps.filter((s) => !done.has(s.id));
  const count = (a: Step['actor']) => left.filter((s) => s.actor === a).length;
  if (!next) {
    return (
      <div className="card border-emerald-300 p-4 text-sm dark:border-emerald-800">
        <strong>All {steps.length} steps done.</strong> Your users can connect {g.app.name} through Composio.
      </div>
    );
  }
  const firstPara = next.details.split(/\n\n/)[0].slice(0, 420);
  return (
    <div className="card border-sky-300 p-4 sm:p-5 dark:border-sky-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="eyebrow text-sky-700 dark:text-sky-300">Your next step</div>
        <div className="text-xs text-slate-500">
          {steps.length - left.length} of {steps.length} done · left: {count('you')} for you, {count('agent')} for an agent, {count('provider')} waits
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{next.title}</h3>
        <ActorChip actor={next.actor} />
        <span className="text-xs text-slate-500">{next.effort}</span>
        {next.wait && <span className="text-xs text-amber-700 dark:text-amber-400">then wait {next.wait}</span>}
      </div>
      <div className="md mt-1 text-sm text-slate-700 dark:text-slate-300" dangerouslySetInnerHTML={{ __html: renderMd(firstPara) }} />
      {next.agentAssist && (
        <div className="mt-2 text-sm text-violet-900 dark:text-violet-200">
          <span className="font-semibold">🤖 An agent can help:</span> <span className="md" dangerouslySetInnerHTML={{ __html: renderInline(next.agentAssist) }} />
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn-primary" onClick={() => onDone(next.id)}>
          ✓ Mark done
        </button>
        <a className="btn" href={`#step-${next.id}`}>
          See full step
        </a>
        {next.links[0] && (
          <a className="btn" href={next.links[0].url} target="_blank" rel="noreferrer">
            {next.links[0].label} ↗
          </a>
        )}
      </div>
    </div>
  );
}

type AskResult = {
  matches: { title: string; symptom: string; howToProceed: string; escalation: { label: string; url: string } | null }[];
  answer: string | null;
  error?: string;
};

/** Paste an error or describe where you're stuck: matched blockers + an answer grounded in the guide. */
export function StuckBox({ g }: { g: Guide }) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<AskResult | null>(null);
  const [err, setErr] = useState('');
  const examples = g.blockers
    .map((b) => (b.symptom.match(/\b(AADSTS\d{5,}|[a-z]+_[a-z_]+|[A-Z][A-Za-z ]{8,40} error)\b/) ?? [])[0])
    .filter(Boolean)
    .slice(0, 3) as string[];
  async function ask(question: string) {
    setBusy(true);
    setErr('');
    setRes(null);
    try {
      const r = await fetch(`/api/guides/${g.slug}/ask`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question }) });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
      setRes(body);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="card p-4 sm:p-5">
      <div className="font-semibold text-slate-900 dark:text-white">Stuck? Paste the error or describe what happened</div>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Matched against the {g.blockers.length} known blockers for {g.app.name}, then answered from this guide's evidence, with citations.
      </p>
      <form
        className="mt-2 flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) ask(q.trim());
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`e.g. ${examples[0] ?? 'redirect_uri_mismatch'}, or "reviewer rejected my demo video"`}
          className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        />
        <button className="btn-primary justify-center" disabled={busy || !q.trim()}>
          {busy ? 'Looking…' : 'Find the fix'}
        </button>
      </form>
      {examples.length > 0 && !res && (
        <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
          {examples.map((x) => (
            <button key={x} type="button" onClick={() => (setQ(x), ask(x))} className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300">
              {x}
            </button>
          ))}
        </div>
      )}
      {err && <p className="mt-2 text-sm text-rose-700 dark:text-rose-400">{err}</p>}
      {res && (
        <div className="mt-3 space-y-3">
          {res.matches.map((m) => (
            <div key={m.title} className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm dark:border-emerald-800 dark:bg-emerald-500/10">
              <div className="font-semibold">Known blocker: {m.title}</div>
              <div className="md mt-1" dangerouslySetInnerHTML={{ __html: renderInline(m.howToProceed) }} />
              {m.escalation && (
                <a href={m.escalation.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs font-medium text-sky-700 underline dark:text-sky-300">
                  Escalate: {m.escalation.label} ↗
                </a>
              )}
            </div>
          ))}
          {res.answer && (
            <div className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800/50">
              <div className="md" dangerouslySetInnerHTML={{ __html: renderMd(res.answer) }} />
              <div className="mt-1 text-[11px] text-slate-500">Generated from this guide's content and sources. Check the cited ids in the Evidence section.</div>
            </div>
          )}
          {!res.matches.length && !res.answer && <p className="text-sm text-slate-500">{res.error ?? 'No known blocker matches. Check the Blockers section, or re-research the app live.'}</p>}
        </div>
      )}
    </div>
  );
}

/** Live guides: let developers ask for a deep, verified version (feeds the library's priority list). */
export function RequestReview({ g }: { g: Guide }) {
  const [state, setState] = useState<'idle' | 'busy' | number>('idle');
  if (g.meta.generator !== 'live') return null;
  return (
    <button
      className="btn"
      disabled={state !== 'idle'}
      onClick={async () => {
        setState('busy');
        const r = await fetch(`/api/guides/${g.slug}/request-review`, { method: 'POST' }).then((x) => x.json()).catch(() => null);
        setState(r?.reviewRequests ?? 1);
      }}
    >
      {typeof state === 'number' ? `✓ Requested (${state} so far): we prioritise the most-requested apps` : state === 'busy' ? 'Requesting…' : 'Request a verified deep guide'}
    </button>
  );
}
