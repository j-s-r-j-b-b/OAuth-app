import { useState } from 'react';
import { DIFFICULTY_INFO, profileForScopes, rateProfile, type Guide, type Step } from '../../../shared/schema.ts';
import { renderInline, renderMd } from '../lib/md.ts';
import { ActorChip, DifficultyPill, Evidence } from './ui.tsx';

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

const FACTOR_NAME: Record<string, string> = {
  self_serve_registration: 'Self-serve registration',
  review_required: 'Provider review',
  business_verification: 'Business verification',
  security_assessment: 'Security assessment',
  paid_access: 'Paid access',
  partner_or_sales_gate: 'Partner / sales gate',
  user_cap_before_review: 'User cap before approval',
  per_customer_setup: 'Per-customer setup',
};

/** Scope-based rating: pick a use case or tick scopes; the rating is recomputed with the same rule. */
export function TailorPanel({ g, onCite }: { g: Guide; onCite: (id: string) => void }) {
  const [profileId, setProfileId] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  if (!g.profiles.length) return null;
  const byScopes = picked.length ? profileForScopes(g, picked) : null;
  const profile = picked.length ? byScopes : (g.profiles.find((p) => p.id === profileId) ?? null);
  const r = profile ? rateProfile(g, profile) : null;
  const tierCls: Record<string, string> = {
    restricted: 'text-rose-700 dark:text-rose-300',
    sensitive: 'text-amber-700 dark:text-amber-300',
    admin: 'text-amber-700 dark:text-amber-300',
    basic: 'text-slate-500',
    unknown: 'text-slate-400',
  };
  const toggle = (sc: string) => {
    setProfileId(null);
    setPicked((p) => (p.includes(sc) ? p.filter((x) => x !== sc) : [...p, sc]));
  };
  return (
    <div className="card p-4 sm:p-5">
      <div className="font-semibold text-slate-900 dark:text-white">Rate it for your use case</div>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        The verdict above assumes: <em>{g.assumption}</em> Pick what you're building, or tick the scopes you need, to recompute the rating with the same rule.
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {g.profiles.map((p) => (
          <button
            key={p.id}
            onClick={() => {
              setPicked([]);
              setProfileId(profileId === p.id ? null : p.id);
            }}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${profile?.id === p.id && !picked.length ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'}`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <details className="mt-3" open={picked.length > 0}>
        <summary className="cursor-pointer text-sm font-medium text-sky-700 dark:text-sky-300">…or tick the scopes your agent needs</summary>
        <div className="mt-2 grid gap-1 sm:grid-cols-2">
          {g.scopes.map((s) => (
            <label key={s.scope} className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1 accent-sky-600" checked={picked.includes(s.scope)} onChange={() => toggle(s.scope)} />
              <span className="min-w-0">
                <code className="text-xs break-all">{s.scope}</code> <span className={`text-[11px] font-semibold uppercase ${tierCls[s.tier]}`}>{s.tier}</span>
              </span>
            </label>
          ))}
        </div>
      </details>
      {picked.length > 0 && !profile && (
        <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
          No researched profile covers that exact combination, so plan for the full path in the verdict above. Its heaviest requirement applies.
        </p>
      )}
      {profile && r && (
        <div className="mt-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">{profile.label}:</span>
            <DifficultyPill d={r.difficulty} />
            {r.difficulty !== g.verdict.difficulty && <span className="text-xs text-slate-500">(default: {DIFFICULTY_INFO[g.verdict.difficulty].label})</span>}
            <span className="text-sm">
              Any user can connect: <strong>{r.timeToProduction.label}</strong>
            </span>
            <span className="text-sm text-slate-500">Hands-on: {r.handsOnEffort.label}</span>
          </div>
          <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">{profile.note}</p>
          {r.changed.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5 text-xs">
              {r.changed.map((c) => (
                <li key={c.key} className="rounded bg-slate-100 px-2 py-0.5 dark:bg-slate-800">
                  {FACTOR_NAME[c.key]}: {c.from} → <strong>{c.to}</strong>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span>Scopes: {profile.scopes.map((s) => s.replace('https://www.googleapis.com/auth/', '')).join(', ') || 'none'}</span>
            <Evidence c={profile.confidence} ids={profile.sourceIds} onCite={onCite} />
          </div>
        </div>
      )}
    </div>
  );
}
