import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { guideToAgentBrief } from '../../../shared/agentBrief.ts';
import { guideToMarkdown } from '../../../shared/markdown.ts';
import { DIFFICULTY_INFO, type Actor, type Guide, type Step } from '../../../shared/schema.ts';
import { api, type GuideSummary, type Health, type Trace } from '../api.ts';
import { EventFeed, QualitySummary } from '../components/EventFeed.tsx';
import { ActorChip, CONF, CopyButton, DIFF_BAR, DifficultyPill, Evidence, ManagedBadge, RunwayBar, Section } from '../components/ui.tsx';
import { renderInline, renderMd } from '../lib/md.ts';

const FACTOR_LABEL: Record<string, string> = {
  self_serve_registration: 'Self-serve registration',
  review_required: 'Provider review before launch',
  business_verification: 'Business verification',
  security_assessment: 'Security assessment',
  paid_access: 'Paid access required',
  partner_or_sales_gate: 'Partner / sales gate',
  user_cap_before_review: 'User cap before approval',
  per_customer_setup: 'Per-customer setup',
};
const VALUE_STYLE: Record<string, string> = {
  yes: 'bg-slate-900 text-white dark:bg-white dark:text-slate-900',
  no: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  depends: 'bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300',
  unknown: 'border border-dashed border-slate-400 text-slate-500',
};
const NEEDED_FOR = ['registration', 'testing', 'review', 'production'] as const;

const TOC = [
  ['verdict', 'Verdict'],
  ['plan', 'Step by step'],
  ['roles', 'Who does what'],
  ['requirements', 'What you need ready'],
  ['blockers', 'Blockers'],
  ['scopes', 'Scopes'],
  ['nuances', 'Nuances'],
  ['composio', 'Wire into Composio'],
  ['rating', 'Why this rating'],
  ['evidence', 'Evidence'],
] as const;

function cite(id: string) {
  const el = document.getElementById(`ev-${id}`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
  if (el.tagName === 'DETAILS') (el as HTMLDetailsElement).open = true;
}

export default function GuidePage() {
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const [g, setG] = useState<Guide | null>(null);
  const [error, setError] = useState('');
  const [trace, setTrace] = useState<Trace | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [allGuides, setAllGuides] = useState<GuideSummary[]>([]);
  const storageKey = `runway:${slug}:done`;
  const [done, setDone] = useState<Set<string>>(new Set());

  useEffect(() => {
    setG(null);
    setError('');
    api.guide(slug).then(setG).catch((e) => setError(e.message));
    api.trace(slug).then(setTrace).catch(() => setTrace(null));
    api.health().then(setHealth).catch(() => {});
    api
      .guides()
      .then(setAllGuides)
      .catch(() => {});
    try {
      setDone(new Set(JSON.parse(localStorage.getItem(storageKey) ?? '[]')));
    } catch {
      setDone(new Set());
    }
  }, [slug, storageKey]);

  const toggle = (id: string) => {
    setDone((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      try {
        localStorage.setItem(storageKey, JSON.stringify([...next]));
      } catch {}
      return next;
    });
  };

  const steps = useMemo(() => g?.phases.flatMap((p) => p.steps) ?? [], [g]);

  // Deep links (#plan, #evidence, #ev-S3) only resolve once the guide has rendered.
  useEffect(() => {
    if (!g || !window.location.hash) return;
    const id = decodeURIComponent(window.location.hash.slice(1));
    requestAnimationFrame(() => (id.startsWith('ev-') ? cite(id.slice(3)) : document.getElementById(id)?.scrollIntoView()));
  }, [g]);

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">No guide here yet</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">{error}</p>
        <Link to="/" className="btn mt-6">
          Search for an app
        </Link>
      </div>
    );
  }
  if (!g) return <div className="mx-auto max-w-6xl px-4 py-16 text-slate-500">Loading guide…</div>;

  const v = g.verdict;
  const url = typeof window !== 'undefined' ? window.location.origin + `/guides/${g.slug}` : '';
  const progress = steps.length ? Math.round((steps.filter((s) => done.has(s.id)).length / steps.length) * 100) : 0;

  return (
    <div className="mx-auto max-w-6xl px-4 pt-6 pb-16">
      <nav className="no-print text-sm text-slate-500">
        <Link to="/" className="hover:underline">
          Guides
        </Link>{' '}
        / {g.app.name}
      </nav>

      {/* Header */}
      <header className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl dark:text-white">{g.app.name}</h1>
          <p className="mt-1 text-slate-600 dark:text-slate-400">
            OAuth app setup & approval guide · {g.app.category}
            {g.app.website && (
              <>
                {' · '}
                <a href={g.app.website} target="_blank" rel="noreferrer" className="underline">
                  website
                </a>
              </>
            )}
            {g.app.developerPortalUrl && (
              <>
                {' · '}
                <a href={g.app.developerPortalUrl} target="_blank" rel="noreferrer" className="underline">
                  developer portal
                </a>
              </>
            )}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <ManagedBadge m={g.composio.managedOAuth} />
            <Provenance g={g} />
          </div>
          {(() => {
            const twin =
              g.meta.generator === 'live' && g.composio.toolkitSlug
                ? allGuides.find((x) => x.generator === 'library' && x.toolkitSlug === g.composio.toolkitSlug)
                : undefined;
            return twin ? (
              <div className="no-print mt-3 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200">
                A <strong>verified library guide</strong> exists for this app.{' '}
                <Link to={`/guides/${twin.slug}`} className="font-semibold underline">
                  Open it
                </Link>
                . This page is the live agent's quick first draft and may miss nuances; comparing the two shows what deeper research adds.
              </div>
            ) : null;
          })()}
        </div>
        <div className="no-print flex flex-wrap gap-2">
          <CopyButton text={url} label="Copy link" />
          <CopyButton text={() => guideToAgentBrief(g, url)} label="🤖 Copy agent brief" className="btn border-violet-300 bg-violet-50 text-violet-900 hover:bg-violet-100 dark:border-violet-700 dark:bg-violet-500/10 dark:text-violet-200" />
          <CopyButton text={() => guideToMarkdown(g, url)} label="Copy Markdown" />
          <a className="btn" href={`/guides/${g.slug}.md`} target="_blank" rel="noreferrer">
            .md
          </a>
          <button className="btn" onClick={() => window.print()}>
            Print / PDF
          </button>
        </div>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_220px]">
        <div className="min-w-0 space-y-12">
          {/* Verdict */}
          <section id="verdict" className="card scroll-mt-20 overflow-hidden">
            <div className="p-5 sm:p-6">
              <div className="flex flex-wrap items-center gap-3">
                <DifficultyPill d={v.difficulty} size="lg" />
                <span className="text-sm text-slate-500 dark:text-slate-400">{DIFFICULTY_INFO[v.difficulty].blurb}</span>
              </div>
              <p className="mt-4 text-xl leading-snug font-semibold text-balance text-slate-900 dark:text-white">{v.headline}</p>
              <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat label="Your hands-on work" value={v.handsOnEffort.label} note={v.handsOnEffort.basis} />
                <Stat label="First test connection" value={v.timeToFirstConnection.label} note={v.timeToFirstConnection.basis} />
                <Stat label="Any user can connect" value={v.timeToProduction.label} note={v.timeToProduction.basis} strong />
                <Stat label="Cost" value={v.cost} />
              </div>
              <div className="mt-5">
                <RunwayBar first={v.timeToFirstConnection} prod={v.timeToProduction} barCls={DIFF_BAR[v.difficulty]} showTicks height="h-3" />
              </div>
              <div className="md mt-4 text-slate-700 dark:text-slate-300" dangerouslySetInnerHTML={{ __html: renderMd(v.summary) }} />
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
                  <dt className="eyebrow">Longest pole</dt>
                  <dd className="mt-1 text-slate-800 dark:text-slate-200">{v.longestPole}</dd>
                </div>
                <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
                  <dt className="eyebrow">Ratings assume</dt>
                  <dd className="mt-1 text-slate-800 dark:text-slate-200">{g.assumption}</dd>
                </div>
                {v.costDetail && (
                  <div className="rounded-lg bg-slate-50 p-3 sm:col-span-2 dark:bg-slate-800/50">
                    <dt className="eyebrow">Cost breakdown</dt>
                    <dd className="md mt-1 text-slate-800 dark:text-slate-200" dangerouslySetInnerHTML={{ __html: renderInline(v.costDetail) }} />
                  </div>
                )}
              </dl>
              {v.easierPaths.length > 0 && (
                <div className="mt-4">
                  <div className="eyebrow">Easier paths</div>
                  <ul className="mt-1.5 space-y-1 text-sm">
                    {v.easierPaths.map((p, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-emerald-600">↳</span>
                        <span>
                          <strong className="font-semibold">If {p.condition}:</strong> {p.effect}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <NeedOwnApp g={g} />
          </section>

          {/* Plan */}
          <Section id="plan" title="Step by step" kicker={`${steps.length} steps · ${progress}% done`}>
            <div className="space-y-6">
              {g.phases.map((p, pi) => (
                <div key={p.id}>
                  <div className="flex items-baseline gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white dark:bg-white dark:text-slate-900">
                      {pi + 1}
                    </span>
                    <div>
                      <h3 className="font-semibold text-slate-900 dark:text-white">{p.title}</h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400">You end up with: {p.outcome}</p>
                    </div>
                  </div>
                  <ol className="mt-3 space-y-2 border-l-2 border-slate-200 pl-5 ml-3 dark:border-slate-800">
                    {p.steps.map((s) => (
                      <StepCard key={s.id} s={s} checked={done.has(s.id)} onToggle={() => toggle(s.id)} />
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </Section>

          {/* Roles */}
          <Section id="roles" title="Who does what" kicker="Where an agent helps and where you take over">
            <Roles steps={steps} />
            <AgentBrief g={g} url={url} />
          </Section>

          {/* Requirements */}
          {g.requirements.length > 0 && (
            <Section id="requirements" title="What you need ready" kicker="Gather these before you start to avoid back-and-forth">
              <div className="grid gap-3 sm:grid-cols-2">
                {NEEDED_FOR.filter((n) => g.requirements.some((r) => r.neededFor === n)).map((n) => (
                  <div key={n} className="card p-4">
                    <div className="eyebrow">For {n}</div>
                    <ul className="mt-2 space-y-2.5">
                      {g.requirements
                        .filter((r) => r.neededFor === n)
                        .map((r, i) => (
                          <li key={i} className="text-sm">
                            <div className="font-semibold text-slate-900 dark:text-white">{r.item}</div>
                            <div className="md text-slate-600 dark:text-slate-400" dangerouslySetInnerHTML={{ __html: renderInline(r.detail) }} />
                            <Evidence c={r.confidence} ids={r.sourceIds} onCite={cite} />
                          </li>
                        ))}
                    </ul>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Blockers */}
          {g.blockers.length > 0 && (
            <Section id="blockers" title="Blockers and how to proceed" kicker="What tends to go wrong">
              <div className="space-y-3">
                {g.blockers.map((b, i) => (
                  <div key={i} className="card p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-semibold text-slate-900 dark:text-white">{b.title}</h3>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${b.likelihood === 'common' ? 'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300' : b.likelihood === 'occasional' ? 'bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}
                      >
                        {b.likelihood}
                      </span>
                    </div>
                    <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                      <div>
                        <div className="eyebrow">You'll see</div>
                        <div className="md mt-0.5" dangerouslySetInnerHTML={{ __html: renderInline(b.symptom) }} />
                      </div>
                      <div>
                        <div className="eyebrow">What to do</div>
                        <div className="md mt-0.5" dangerouslySetInnerHTML={{ __html: renderInline(b.howToProceed) }} />
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <Evidence c={b.confidence} ids={b.sourceIds} onCite={cite} />
                      {b.escalation && (
                        <a href={b.escalation.url} target="_blank" rel="noreferrer" className="text-sm font-medium text-sky-700 hover:underline dark:text-sky-300">
                          Escalate: {b.escalation.label} ↗
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Scopes */}
          {g.scopes.length > 0 && (
            <Section id="scopes" title="Scopes" kicker="Request the least you need. Sensitive and restricted scopes drive review.">
              <div className="card overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
                    <tr>
                      <th className="px-4 py-2">Scope</th>
                      <th className="px-4 py-2">Purpose</th>
                      <th className="px-4 py-2">Tier</th>
                      <th className="px-4 py-2">Evidence</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {g.scopes.map((s, i) => (
                      <tr key={i} className="align-top">
                        <td className="px-4 py-2 font-mono text-xs break-all">{s.scope}</td>
                        <td className="px-4 py-2">
                          {s.purpose}
                          {s.note && <div className="text-xs text-slate-500">{s.note}</div>}
                        </td>
                        <td className="px-4 py-2">
                          <span
                            className={`rounded px-1.5 py-0.5 text-xs font-semibold ${s.tier === 'restricted' ? 'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300' : s.tier === 'sensitive' || s.tier === 'admin' ? 'bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}
                          >
                            {s.tier}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          <Evidence c={s.confidence} ids={s.sourceIds} onCite={cite} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {/* Nuances */}
          {g.nuances.length > 0 && (
            <Section id="nuances" title="Nuances that bite later">
              <ul className="space-y-3">
                {g.nuances.map((n, i) => (
                  <li key={i} className="card p-4 text-sm">
                    <div className="font-semibold text-slate-900 dark:text-white">{n.title}</div>
                    <div className="md mt-1 text-slate-700 dark:text-slate-300" dangerouslySetInnerHTML={{ __html: renderMd(n.detail) }} />
                    <Evidence c={n.confidence} ids={n.sourceIds} onCite={cite} />
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* Composio */}
          <Section id="composio" title="Wire it into Composio" kicker="Once the provider gives you a client ID and secret">
            <ComposioSetup g={g} />
          </Section>

          {/* Rating */}
          <Section id="rating" title="Why this rating" kicker={`${DIFFICULTY_INFO[v.difficulty].label}, computed from these factors`}>
            <div className="card divide-y divide-slate-100 dark:divide-slate-800">
              {g.factors.map((f) => (
                <div key={f.key} className="grid gap-2 p-3 text-sm sm:grid-cols-[200px_70px_1fr]">
                  <div className="font-medium text-slate-900 dark:text-white">{FACTOR_LABEL[f.key]}</div>
                  <div>
                    <span className={`rounded px-1.5 py-0.5 text-xs font-bold uppercase ${VALUE_STYLE[f.value]}`}>{f.value}</span>
                  </div>
                  <div>
                    <span className="md text-slate-700 dark:text-slate-300" dangerouslySetInnerHTML={{ __html: renderInline(f.detail) }} />{' '}
                    <Evidence c={f.confidence} ids={f.sourceIds} onCite={cite} />
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {/* Evidence */}
          <Section id="evidence" title="Evidence" kicker="What we read, what we tested, what's still uncertain">
            <EvidenceSection g={g} trace={trace} />
          </Section>

          {health?.liveGeneration && (
            <div className="no-print rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-400">
              Something out of date?{' '}
              <button
                className="font-semibold text-sky-700 underline dark:text-sky-300"
                onClick={async () => {
                  const r = await api.generate(g.app.name, true).catch((e) => {
                    alert(e.message);
                    return null;
                  });
                  if (r?.jobId) navigate(`/generate/${r.jobId}`);
                }}
              >
                Re-research {g.app.name} live
              </button>{' '}
              to get a fresh agent-generated version{g.meta.generator === 'library' ? ' (saved separately; this reviewed guide stays)' : ''}.
            </div>
          )}
        </div>

        {/* TOC */}
        <aside className="no-print hidden lg:block">
          <div className="sticky top-20 space-y-4">
            <nav className="text-sm">
              <div className="eyebrow mb-2">On this page</div>
              <ul className="space-y-1">
                {TOC.filter(([id]) => document.getElementById(id) || ['verdict', 'plan', 'roles', 'composio', 'rating', 'evidence'].includes(id)).map(([id, label]) => (
                  <li key={id}>
                    <a href={`#${id}`} className="text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
            <div className="card p-3">
              <div className="flex justify-between text-xs font-semibold text-slate-600 dark:text-slate-400">
                <span>Your progress</span>
                <span>{progress}%</span>
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800">
                <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} />
              </div>
              <p className="mt-1.5 text-[11px] text-slate-500">Saved in this browser only.</p>
            </div>
            <div className="card p-3 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
              <div className="mb-1 font-semibold text-slate-700 dark:text-slate-300">Evidence labels</div>
              {(['tested', 'official', 'reported', 'inferred'] as const).map((c) => (
                <div key={c} className="flex items-start gap-1.5 py-0.5">
                  <span className={`mt-px rounded px-1 text-[9px] font-bold uppercase ${CONF[c].cls}`}>{CONF[c].label}</span>
                  <span>{CONF[c].title}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Stat({ label, value, note, strong }: { label: string; value: string; note?: string; strong?: boolean }) {
  return (
    <div className={`rounded-lg p-3 ${strong ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-slate-50 dark:bg-slate-800/50'}`}>
      <div className={`text-[11px] font-semibold tracking-wide uppercase ${strong ? 'text-slate-300 dark:text-slate-600' : 'text-slate-500 dark:text-slate-400'}`}>{label}</div>
      <div className="mt-1 text-lg leading-tight font-bold">{value}</div>
      {note && (
        <div title={note} className={`mt-1 line-clamp-3 text-xs leading-snug ${strong ? 'text-slate-300 dark:text-slate-600' : 'text-slate-500 dark:text-slate-400'}`}>
          {note}
        </div>
      )}
    </div>
  );
}

function Provenance({ g }: { g: Guide }) {
  if (g.meta.generator === 'library') {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 ring-1 ring-emerald-600/20 ring-inset dark:bg-emerald-500/10 dark:text-emerald-300">
        Library guide
        {g.evidence.verification ? ` · reviewed ${g.evidence.verification.reviewedAt.slice(0, 10)}` : ` · researched ${g.meta.generatedAt.slice(0, 10)}`}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-800 ring-1 ring-violet-600/20 ring-inset dark:bg-violet-500/10 dark:text-violet-300">
      Generated live {g.meta.generatedAt.slice(0, 10)}
      {g.meta.durationSec ? ` in ${g.meta.durationSec}s` : ''} · auto-checked, not human-reviewed
    </span>
  );
}

function NeedOwnApp({ g }: { g: Guide }) {
  const m = g.composio.managedOAuth;
  const slug = g.composio.toolkitSlug;
  const body =
    m === 'available' ? (
      <>
        <strong>You may not need any of this yet.</strong> Composio has a managed OAuth app for <code>{slug}</code>, so you can build and test today.
        Follow this guide when production needs <em>your</em> name on the consent screen, scopes beyond Composio's defaults, or your own rate-limit quota.
      </>
    ) : m === 'not-available' ? (
      <>
        <strong>You need your own OAuth app.</strong> Composio has no managed app for <code>{slug}</code>, so nobody can connect until you finish the steps
        below.
      </>
    ) : (
      <>
        <strong>Not in Composio's toolkit catalog.</strong> You'd connect it through a custom toolkit or proxy calls. The OAuth app work below still applies.
      </>
    );
  return (
    <div className={`border-t px-5 py-4 text-sm sm:px-6 ${m === 'available' ? 'border-teal-200 bg-teal-50 text-teal-900 dark:border-teal-900 dark:bg-teal-500/10 dark:text-teal-200' : 'border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-200'}`}>
      <span className="md">{body}</span>{' '}
      {g.composio.toolkitDocsUrl && (
        <a href={g.composio.toolkitDocsUrl} target="_blank" rel="noreferrer" className="font-medium underline">
          Toolkit docs ↗
        </a>
      )}
    </div>
  );
}

function StepCard({ s, checked, onToggle }: { s: Step; checked: boolean; onToggle: () => void }) {
  return (
    <li className={`card relative p-4 transition ${checked ? 'opacity-60' : ''}`}>
      <span className="absolute top-5 -left-[27px] h-3 w-3 rounded-full border-2 border-white bg-slate-300 dark:border-slate-950 dark:bg-slate-600" />
      <div className="flex items-start gap-3">
        <input type="checkbox" checked={checked} onChange={onToggle} className="mt-1 h-4 w-4 shrink-0 accent-emerald-600" aria-label={`Mark "${s.title}" done`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className={`font-semibold text-slate-900 dark:text-white ${checked ? 'line-through' : ''}`}>{s.title}</h4>
            <ActorChip actor={s.actor} />
            <span className="text-xs text-slate-500">{s.effort}</span>
            {s.wait && (
              <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-amber-600/20 ring-inset dark:bg-amber-500/10 dark:text-amber-300">
                then wait {s.wait}
              </span>
            )}
          </div>
          <div className="md mt-1.5 text-sm text-slate-700 dark:text-slate-300" dangerouslySetInnerHTML={{ __html: renderMd(s.details) }} />
          {s.agentAssist && (
            <div className="mt-2 rounded-lg bg-violet-50 px-3 py-2 text-sm text-violet-900 dark:bg-violet-500/10 dark:text-violet-200">
              <span className="font-semibold">🤖 An agent can help:</span> <span className="md" dangerouslySetInnerHTML={{ __html: renderInline(s.agentAssist) }} />
            </div>
          )}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {s.links.map((l, i) => (
                <a key={i} href={l.url} target="_blank" rel="noreferrer" className="text-xs font-medium text-sky-700 hover:underline dark:text-sky-300">
                  {l.label} ↗
                </a>
              ))}
            </div>
            <Evidence c={s.confidence} ids={s.sourceIds} onCite={cite} />
          </div>
        </div>
      </div>
    </li>
  );
}

function Roles({ steps }: { steps: Step[] }) {
  const cols: { actor: Actor; title: string; blurb: string }[] = [
    { actor: 'agent', title: 'An agent can do', blurb: 'No login, legal acceptance or payment involved' },
    { actor: 'you', title: 'You need to do', blurb: 'Sign-ins, agreements, documents, payments, judgment' },
    { actor: 'provider', title: 'Waiting on the provider', blurb: 'Reviews and verifications you can only wait for' },
  ];
  const assists = steps.filter((s) => s.actor !== 'agent' && s.agentAssist);
  return (
    <div>
      <div className="grid gap-3 md:grid-cols-3">
        {cols.map((c) => {
          const list = steps.filter((s) => s.actor === c.actor);
          return (
            <div key={c.actor} className="card p-4">
              <ActorChip actor={c.actor} />
              <div className="mt-2 font-semibold text-slate-900 dark:text-white">
                {c.title} <span className="text-slate-400">({list.length})</span>
              </div>
              <div className="text-xs text-slate-500">{c.blurb}</div>
              <ul className="mt-2 space-y-1.5 text-sm">
                {list.map((s) => (
                  <li key={s.id} className="flex justify-between gap-2">
                    <span>{s.title}</span>
                    <span className="max-w-[45%] text-right text-xs text-slate-500">{c.actor === 'provider' ? (s.wait ?? s.effort) : s.effort}</span>
                  </li>
                ))}
                {list.length === 0 && <li className="text-slate-400">Nothing</li>}
              </ul>
            </div>
          );
        })}
      </div>
      {assists.length > 0 && (
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
          On {assists.length} of the steps only you can do, an agent can still prepare the work: drafts, pre-filled values, or checking the result.
          Look for the 🤖 notes in the plan.
        </p>
      )}
    </div>
  );
}

function AgentBrief({ g, url }: { g: Guide; url: string }) {
  const [open, setOpen] = useState(false);
  const brief = guideToAgentBrief(g, url);
  return (
    <div className="mt-4 rounded-xl border border-violet-300 bg-violet-50 p-4 dark:border-violet-800 dark:bg-violet-500/10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-semibold text-violet-950 dark:text-violet-100">🤖 Hand this to your coding agent</div>
          <p className="text-sm text-violet-900/80 dark:text-violet-200/80">
            A ready brief for Claude Code, Cursor or similar. It covers the agent's steps, drafts of the review materials and scope justifications, the
            exact Composio wiring with the tested redirect URI, and what to hand back to you.
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn" onClick={() => setOpen(!open)}>
            {open ? 'Hide' : 'Preview'}
          </button>
          <CopyButton text={brief} label="Copy brief" className="btn-primary" />
        </div>
      </div>
      {open && <pre className="mt-3 max-h-96 overflow-auto rounded-lg bg-white p-3 text-xs whitespace-pre-wrap text-slate-800 dark:bg-slate-900 dark:text-slate-200">{brief}</pre>}
    </div>
  );
}

function ComposioSetup({ g }: { g: Guide }) {
  const slug = g.composio.toolkitSlug ?? 'your_toolkit';
  const ts = `import { Composio } from "@composio/core";

const composio = new Composio();
const session = await composio.create("user_123", {
  authConfigs: { ${slug}: "ac_your_${slug}_config" }, // your custom auth config
});
const link = await session.authorize("${slug}"); // send link.redirectUrl to the user`;
  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="eyebrow">Redirect URI to register with {g.app.name}</div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <code className="rounded-lg bg-slate-100 px-3 py-2 font-mono text-sm break-all dark:bg-slate-800">{g.composioSetup.redirectUri}</code>
          <CopyButton text={g.composioSetup.redirectUri} label="Copy" />
        </div>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          This is what a Composio custom auth config sends by default. If you set <code>oauth_redirect_uri</code> to{' '}
          <code>https://backend.composio.dev/api/v3/toolkits/auth/callback</code>, register that instead; where {g.app.name} allows several redirect URIs,
          register both.
        </p>
      </div>
      {g.composioSetup.tested && <TestedSetup g={g} />}
      <ol className="card list-decimal space-y-2 p-4 pl-9 text-sm">
        {g.composioSetup.steps.map((s, i) => (
          <li key={i} className="md" dangerouslySetInnerHTML={{ __html: renderInline(s) }} />
        ))}
      </ol>
      {g.composio.requiredFields.length > 0 && (
        <div className="card p-4 text-sm">
          <div className="eyebrow">Extra fields each connection needs</div>
          <ul className="mt-2 space-y-1">
            {g.composio.requiredFields.map((f) => (
              <li key={f.name}>
                <code className="font-mono">{f.name}</code>: {f.description}
              </li>
            ))}
          </ul>
        </div>
      )}
      {g.composio.notes.length > 0 && (
        <ul className="card list-disc space-y-1 p-4 pl-8 text-sm text-slate-700 dark:text-slate-300">
          {g.composio.notes.map((n, i) => (
            <li key={i} className="md" dangerouslySetInnerHTML={{ __html: renderInline(n) }} />
          ))}
        </ul>
      )}
      <div className="relative">
        <pre className="overflow-x-auto rounded-xl bg-slate-900 p-4 font-mono text-xs leading-relaxed text-slate-100">{ts}</pre>
        <div className="absolute top-2 right-2">
          <CopyButton text={ts} label="Copy" className="rounded-md bg-white/10 px-2 py-1 text-xs text-white hover:bg-white/20" />
        </div>
      </div>
    </div>
  );
}

function TestedSetup({ g }: { g: Guide }) {
  const t = g.composioSetup.tested!;
  const extra = Object.entries(t.extraParams).filter(([k]) => k !== 'response_type');
  const [open, setOpen] = useState(false);
  const scopes = t.defaultScopes;
  return (
    <div className="card border-emerald-300 p-4 dark:border-emerald-800">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded px-1.5 py-px text-[10px] font-bold tracking-wide uppercase ${CONF.tested.cls}`}>Tested</span>
        <span className="font-semibold text-slate-900 dark:text-white">Setup attempt through Composio · {t.testedAt}</span>
        <button onClick={() => cite(t.probeId)} className="font-mono text-[11px] text-slate-500 hover:underline">
          [{t.probeId}]
        </button>
      </div>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        We created a throwaway custom auth config for <code>{g.composio.toolkitSlug}</code> with a dummy client, started a connection, and followed
        Composio's redirect to {g.app.name}. Then we deleted both. This is exactly what your users' browsers will be sent:
      </p>
      <dl className="mt-3 grid gap-2 text-sm">
        <div>
          <dt className="eyebrow">Authorize endpoint</dt>
          <dd className="font-mono text-xs break-all">{t.authorizeUrl}</dd>
        </div>
        <div>
          <dt className="eyebrow">redirect_uri sent</dt>
          <dd className="font-mono text-xs break-all">{t.redirectUri ?? '(none)'}</dd>
        </div>
        <div>
          <dt className="eyebrow">Default scopes Composio requests ({scopes.length})</dt>
          <dd className="mt-1 flex flex-wrap gap-1">
            {scopes.length === 0 && <span className="text-xs text-slate-500">None in the scope parameter{extra.length ? ' (see extra parameters)' : ''}</span>}
            {(open ? scopes : scopes.slice(0, 14)).map((s) => (
              <code key={s} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] dark:bg-slate-800">
                {s.replace('https://www.googleapis.com/auth/', '')}
              </code>
            ))}
            {scopes.length > 14 && (
              <button onClick={() => setOpen(!open)} className="text-xs font-medium text-sky-700 dark:text-sky-300">
                {open ? 'show fewer' : `+${scopes.length - 14} more`}
              </button>
            )}
          </dd>
        </div>
        {extra.length > 0 && (
          <div>
            <dt className="eyebrow">Extra parameters</dt>
            <dd className="font-mono text-[11px] break-all text-slate-600 dark:text-slate-400">
              {extra.map(([k, v]) => `${k}=${v.length > 160 ? `${v.slice(0, 160)}… (${v.split(/[\s,]+/).length} values)` : v}`).join(' · ')}
            </dd>
          </div>
        )}
      </dl>
      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
        Your own OAuth app must allow these scopes, and the provider's review judges them. Override them with a <code>scopes</code> value on the auth
        config to request only what your agent needs.
      </p>
    </div>
  );
}

function EvidenceSection({ g, trace }: { g: Guide; trace: Trace | null }) {
  const ev = g.evidence;
  const KIND: Record<string, string> = {
    official: 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300',
    composio: 'bg-teal-100 text-teal-800 dark:bg-teal-500/15 dark:text-teal-300',
    community: 'bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300',
  };
  return (
    <div className="space-y-6">
      {ev.verification && (
        <div className="card border-emerald-300 p-4 dark:border-emerald-800">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold text-slate-900 dark:text-white">Verification review · {ev.verification.reviewedAt.slice(0, 10)}</h3>
            <span className="text-xs text-slate-500">
              {ev.verification.items.filter((i) => i.outcome === 'confirmed').length} confirmed ·{' '}
              {ev.verification.items.filter((i) => i.outcome === 'corrected').length} corrected ·{' '}
              {ev.verification.items.filter((i) => i.outcome === 'unverifiable').length} unverifiable
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{ev.verification.method}</p>
          <ul className="mt-3 space-y-2">
            {ev.verification.items.map((it, i) => (
              <li key={i} className="flex gap-2 text-sm">
                <span
                  className={`mt-0.5 h-fit shrink-0 rounded px-1.5 text-[10px] font-bold uppercase ${it.outcome === 'confirmed' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300' : it.outcome === 'corrected' ? 'bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}
                >
                  {it.outcome}
                </span>
                <span>
                  <span className="font-medium text-slate-900 dark:text-white">{it.claim}</span> <span className="text-slate-600 dark:text-slate-400">{it.note}</span>{' '}
                  {it.sourceIds.map((id) => (
                    <button key={id} onClick={() => cite(id)} className="font-mono text-[11px] text-slate-500 hover:underline">
                      [{id}]
                    </button>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {ev.probes.length > 0 && (
        <div>
          <h3 className="font-semibold text-slate-900 dark:text-white">Setup attempts we ran ({ev.probes.length})</h3>
          <p className="text-sm text-slate-500">Real read-only requests against the provider. They show what an agent can check without an account, and where a human has to take over.</p>
          <ul className="mt-2 space-y-2">
            {ev.probes.map((p) => (
              <li key={p.id} id={`ev-${p.id}`} className="card p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-bold">{p.id}</span>
                  <span className="text-xs text-slate-500">{p.kind}</span>
                  <span
                    className={`rounded px-1.5 text-[10px] font-bold uppercase ${p.result === 'pass' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300' : p.result === 'fail' ? 'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}
                  >
                    {p.result}
                  </span>
                  <span className="text-xs text-slate-400">{p.at.slice(0, 10)}</span>
                </div>
                <div className="mt-1 text-slate-800 dark:text-slate-200">{p.summary}</div>
                <div className="mt-1 font-mono text-[11px] break-all text-slate-500">{p.target}</div>
                {p.detail && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs text-slate-500">Raw result</summary>
                    <pre className="mt-1 max-h-48 overflow-auto rounded bg-slate-50 p-2 text-[11px] whitespace-pre-wrap dark:bg-slate-800">{p.detail}</pre>
                  </details>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h3 className="font-semibold text-slate-900 dark:text-white">Sources ({ev.sources.length})</h3>
        <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white text-sm dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
          {ev.sources.map((s) => (
            <li key={s.id} id={`ev-${s.id}`} className="flex gap-3 p-3">
              <span className="w-8 shrink-0 font-mono text-xs font-bold text-slate-500">{s.id}</span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <a href={s.url} target="_blank" rel="noreferrer" className="font-medium text-sky-700 hover:underline dark:text-sky-300">
                    {s.title}
                  </a>
                  <span className={`rounded px-1.5 text-[10px] font-bold uppercase ${KIND[s.kind]}`}>{s.kind}</span>
                  {s.retrieval === 'search-result' && <span className="rounded px-1.5 text-[10px] font-bold text-slate-500 uppercase ring-1 ring-slate-300 dark:ring-slate-600">snippet only</span>}
                </div>
                {s.note && <div className="mt-0.5 text-slate-600 italic dark:text-slate-400">“{s.note}”</div>}
                <div className="truncate text-[11px] text-slate-400">
                  {s.url} · accessed {s.accessedAt}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {ev.openQuestions.length > 0 && (
        <div>
          <h3 className="font-semibold text-slate-900 dark:text-white">Still uncertain</h3>
          <ul className="mt-2 space-y-2">
            {ev.openQuestions.map((q, i) => (
              <li key={i} className="card p-3 text-sm">
                <div className="font-medium text-slate-900 dark:text-white">{q.question}</div>
                <div className="text-slate-600 dark:text-slate-400">{q.whyItMatters}</div>
                <div className="mt-1 text-slate-600 dark:text-slate-400">
                  <span className="font-semibold">How to resolve:</span> {q.howToResolve}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {trace && (
        <details className="card p-4">
          <summary className="cursor-pointer font-semibold text-slate-900 dark:text-white">How this guide was researched (full agent trace)</summary>
          {trace.quality && (
            <div className="mt-3">
              <QualitySummary q={trace.quality} />
            </div>
          )}
          <div className="mt-3">
            <EventFeed events={trace.events} />
          </div>
        </details>
      )}
      <p className="text-xs text-slate-500">
        {g.meta.generator === 'library' ? 'Researched by' : 'Generated by'} {g.meta.model} on {g.meta.generatedAt.slice(0, 10)}.
      </p>
    </div>
  );
}
