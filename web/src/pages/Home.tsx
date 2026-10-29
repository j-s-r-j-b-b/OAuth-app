import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DIFFICULTY_INFO, type Difficulty } from '../../../shared/schema.ts';
import { api, type CatalogEntry, type GuideSummary, type Health } from '../api.ts';
import SearchBox from '../components/SearchBox.tsx';
import { DIFF_BAR, DifficultyPill, ManagedBadge, RunwayBar, runwayPos, TICKS } from '../components/ui.tsx';

type Filter = 'all' | 'byo' | 'managed' | 'guide';

export default function Home() {
  const [guides, setGuides] = useState<GuideSummary[]>([]);
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [filter, setFilter] = useState<Filter>('byo');
  const [term, setTerm] = useState('');

  useEffect(() => {
    api.guides().then(setGuides).catch(() => {});
    api.catalog().then((c) => setCatalog(c.toolkits)).catch(() => {});
    api.health().then(setHealth).catch(() => {});
  }, []);

  const sorted = useMemo(() => [...guides].sort((a, b) => a.timeToProduction.maxHours - b.timeToProduction.maxHours), [guides]);
  const library = sorted.filter((g) => g.generator === 'library');
  const live = sorted.filter((g) => g.generator === 'live');
  const counts = useMemo(
    () => ({ managed: catalog.filter((t) => t.managed).length, byo: catalog.filter((t) => !t.managed).length }),
    [catalog],
  );

  const rows = useMemo(() => {
    const t = term.trim().toLowerCase();
    return catalog
      .filter((c) => (filter === 'byo' ? !c.managed : filter === 'managed' ? c.managed : filter === 'guide' ? Boolean(c.guideSlug) : true))
      .filter((c) => !t || c.name.toLowerCase().includes(t) || c.slug.includes(t))
      .sort((a, b) => Number(Boolean(b.guideSlug)) - Number(Boolean(a.guideSlug)) || a.name.localeCompare(b.name));
  }, [catalog, filter, term]);

  return (
    <div className="mx-auto max-w-6xl px-4">
      {/* Hero */}
      <section className="pt-12 pb-10 sm:pt-16">
        <div className="max-w-3xl">
          <div className="eyebrow mb-3">For developers building agents on Composio</div>
          <h1 className="text-3xl font-bold tracking-tight text-balance text-slate-900 sm:text-5xl dark:text-white">
            Will your OAuth app take an hour, or two months of review?
          </h1>
          <p className="mt-4 text-lg text-slate-600 dark:text-slate-400">
            Before your users can connect an app, you may need your own OAuth app, and the provider may need to approve it. Look up an app to see the
            effort, the wait, what blocks approval, and which steps an agent can take off your hands. Every claim links to its evidence.
          </p>
        </div>
        <div className="mt-8 max-w-3xl">
          <SearchBox catalog={catalog} guides={guides} liveEnabled={health?.liveGeneration ?? true} />
        </div>
        {catalog.length > 0 && (
          <p className="mt-6 max-w-3xl text-sm text-slate-600 dark:text-slate-400">
            <strong className="text-slate-900 dark:text-white">Why this matters:</strong> Composio manages the OAuth app for {counts.managed} of its{' '}
            {catalog.length} OAuth toolkits. For the other <strong className="text-slate-900 dark:text-white">{counts.byo}</strong>, and whenever production
            needs your own branding, scopes or quota, you register and get approval for your own app.
          </p>
        )}
      </section>

      {/* Runway comparison */}
      <section className="card p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="eyebrow">Library</div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">Time until any user can connect</h2>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-5 rounded-full bg-slate-900/70 dark:bg-white/80" /> first test connection
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-flex h-2 w-8 overflow-hidden rounded-full">
                <span className="flex-1 bg-emerald-500" />
                <span className="flex-1 bg-sky-500" />
                <span className="flex-1 bg-amber-500" />
                <span className="flex-1 bg-rose-500" />
              </span>
              any user can connect (colour = rating)
            </span>
          </div>
        </div>
        {library.length === 0 ? (
          <p className="mt-6 text-sm text-slate-500">Loading guides…</p>
        ) : (
          <div className="mt-5">
            <div className="hidden grid-cols-[180px_1fr_140px] gap-4 sm:grid">
              <div />
              <div className="relative h-4 text-[10px] text-slate-500 dark:text-slate-400">
                <RunwayAxis />
              </div>
              <div />
            </div>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {library.map((g) => (
                <GuideRow key={g.slug} g={g} />
              ))}
            </ul>
          </div>
        )}
      </section>

      {live.length > 0 && (
        <section className="card mt-6 p-5 sm:p-6">
          <div className="eyebrow">Generated live by the research agent</div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">Recently researched</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Automatically checked, not reviewed by a person. Check the evidence section of each guide.</p>
          <ul className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
            {live.slice(0, 12).map((g) => (
              <GuideRow key={g.slug} g={g} />
            ))}
          </ul>
        </section>
      )}

      {/* Difficulty scale */}
      <section className="mt-10">
        <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">How to read the ratings</h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-400">
          Ratings come from eight factors (review, business verification, security assessment, paid access, partner gates, user caps, per-customer setup,
          self-serve sign-up) using one fixed rule, so they mean the same thing on every guide.{' '}
          <Link to="/method" className="font-medium text-sky-700 underline dark:text-sky-300">
            Method →
          </Link>
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(Object.keys(DIFFICULTY_INFO) as Difficulty[]).map((d) => (
            <div key={d} className="card p-4">
              <DifficultyPill d={d} />
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{DIFFICULTY_INFO[d].blurb}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Catalog */}
      <section className="mt-12 mb-16" id="catalog">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="eyebrow">All Composio OAuth toolkits</div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">Find an app</h2>
          </div>
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Filter toolkits…"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm sm:w-64 dark:border-slate-700 dark:bg-slate-900"
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {(
            [
              ['byo', `Bring your own app (${counts.byo})`],
              ['managed', `Composio-managed (${counts.managed})`],
              ['guide', 'Has a guide'],
              ['all', 'All'],
            ] as [Filter, string][]
          ).map(([f, label]) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${filter === f ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-slate-200/70 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="card mt-3 max-h-[560px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-900 dark:text-slate-400">
              <tr>
                <th className="px-4 py-2 font-semibold">Toolkit</th>
                <th className="hidden px-4 py-2 font-semibold sm:table-cell">Composio OAuth</th>
                <th className="px-4 py-2 text-right font-semibold">Guide</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map((t) => (
                <CatalogRow key={t.slug} t={t} />
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-slate-500">
                    {catalog.length === 0 ? 'Loading toolkits…' : 'No toolkit matches. You can still type any app name or website in the search box above.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Source:{' '}
          <a className="underline" href="https://docs.composio.dev/toolkits/managed-auth" target="_blank" rel="noreferrer">
            docs.composio.dev/toolkits/managed-auth
          </a>
          . “Composio-managed” means at least one OAuth method is managed.
        </p>
      </section>
    </div>
  );
}

function RunwayAxis() {
  return (
    <>
      {TICKS.map((t) => (
        <span key={t.h} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${runwayPos(t.h) * 100}%` }}>
          {t.label}
        </span>
      ))}
    </>
  );
}

function GuideRow({ g }: { g: GuideSummary }) {
  return (
    <li>
      <Link to={`/guides/${g.slug}`} className="group grid gap-x-4 gap-y-1.5 py-3 sm:grid-cols-[180px_1fr_140px] sm:items-center">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-900 group-hover:text-sky-700 dark:text-white dark:group-hover:text-sky-300">{g.name}</span>
        </div>
        <div className="order-3 sm:order-none">
          <RunwayBar first={g.timeToFirstConnection} prod={g.timeToProduction} barCls={DIFF_BAR[g.difficulty]} />
          <p className="mt-1 line-clamp-1 text-xs text-slate-500 dark:text-slate-400">{g.headline}</p>
        </div>
        <div className="flex items-center justify-between gap-2 sm:flex-col sm:items-end">
          <DifficultyPill d={g.difficulty} />
          <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{g.timeToProduction.label}</span>
        </div>
      </Link>
    </li>
  );
}

function CatalogRow({ t }: { t: CatalogEntry }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  return (
    <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
      <td className="px-4 py-2">
        <div className="font-medium text-slate-900 dark:text-slate-100">{t.name}</div>
        <div className="font-mono text-[11px] text-slate-500">{t.slug}</div>
      </td>
      <td className="hidden px-4 py-2 sm:table-cell">
        <ManagedBadge m={t.managed ? 'available' : 'not-available'} />
      </td>
      <td className="px-4 py-2 text-right">
        {t.guideSlug ? (
          <Link to={`/guides/${t.guideSlug}`} className="text-sm font-semibold text-emerald-700 hover:underline dark:text-emerald-400">
            View guide →
          </Link>
        ) : (
          <GenerateLink name={t.name} busy={busy} setBusy={setBusy} setErr={setErr} />
        )}
        {err && <div className="mt-1 text-xs text-rose-600">{err}</div>}
      </td>
    </tr>
  );
}

function GenerateLink({ name, busy, setBusy, setErr }: { name: string; busy: boolean; setBusy: (b: boolean) => void; setErr: (s: string) => void }) {
  return (
    <button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        setErr('');
        try {
          const r = await api.generate(name);
          window.location.href = r.existing ? `/guides/${r.existing}` : `/generate/${r.jobId}`;
        } catch (e) {
          setErr((e as Error).message);
          setBusy(false);
        }
      }}
      className="text-sm font-medium text-slate-600 hover:text-slate-900 hover:underline dark:text-slate-400 dark:hover:text-white"
    >
      {busy ? 'Starting…' : 'Generate'}
    </button>
  );
}
