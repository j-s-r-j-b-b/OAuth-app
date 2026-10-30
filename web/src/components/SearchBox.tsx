import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type CatalogEntry, type GuideSummary } from '../api.ts';

type Option = { label: string; sub: string; query: string; slug: string | null };

export default function SearchBox({ catalog, guides, liveEnabled }: { catalog: CatalogEntry[]; guides: GuideSummary[]; liveEnabled: boolean }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const options = useMemo<Option[]>(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    const seen = new Set<string>();
    const out: Option[] = [];
    for (const g of guides) {
      if (g.name.toLowerCase().includes(term) || g.slug.includes(term)) {
        out.push({ label: g.name, sub: 'Guide ready', query: g.name, slug: g.slug });
        if (g.toolkitSlug) seen.add(g.toolkitSlug);
      }
    }
    for (const t of catalog) {
      if (seen.has(t.slug)) continue;
      if (t.name.toLowerCase().includes(term) || t.slug.includes(term.replace(/\s+/g, '_'))) {
        out.push({
          label: t.name,
          sub: t.guideSlug ? 'Guide ready' : t.managed ? 'Composio-managed OAuth · generate guide' : 'Bring your own app · generate guide',
          query: t.name,
          slug: t.guideSlug,
        });
      }
    }
    return out.slice(0, 8);
  }, [q, catalog, guides]);

  async function go(query: string, slug: string | null) {
    setError('');
    if (slug) return navigate(`/guides/${slug}`);
    if (!query.trim()) return;
    setBusy(true);
    try {
      const r = await api.generate(query.trim());
      if (r.existing) navigate(`/guides/${r.existing}`);
      else if (r.jobId) navigate(`/generate/${r.jobId}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const o = open && options[active];
          if (o && o.label.toLowerCase().startsWith(q.trim().toLowerCase())) go(o.query, o.slug);
          else go(q, null);
          setOpen(false);
        }}
        className="flex flex-col gap-2 sm:flex-row"
      >
        <div className="relative flex-1">
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
              setActive(0);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, options.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === 'Escape') setOpen(false);
            }}
            placeholder="App name or website, e.g. Pipedrive, notion.so, Calendly"
            aria-label="App name or website"
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base shadow-sm outline-none placeholder:text-slate-400 focus:border-sky-500 focus:ring-4 focus:ring-sky-500/15 dark:border-slate-700 dark:bg-slate-900"
          />
          {open && options.length > 0 && (
            <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
              {options.map((o, i) => (
                <li key={`${o.label}-${i}`}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setOpen(false);
                      go(o.query, o.slug);
                    }}
                    className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm ${i === active ? 'bg-slate-100 dark:bg-slate-800' : ''}`}
                  >
                    <span className="font-medium">{o.label}</span>
                    <span className={`text-xs ${o.slug ? 'font-semibold text-emerald-700 dark:text-emerald-400' : 'text-slate-500'}`}>{o.sub}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button type="submit" disabled={busy || !q.trim()} className="btn-primary justify-center px-5 py-3 text-base">
          {busy ? 'Starting…' : 'Get the guide'}
        </button>
      </form>
      {liveEnabled && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-slate-500 dark:text-slate-400">Try a live run:</span>
          {['Klaviyo', 'Smartsheet', 'Zoom', 'QuickBooks', 'Typeform'].map((app) => (
            <button
              key={app}
              type="button"
              disabled={busy}
              onClick={() => go(app, null)}
              className="rounded-full border border-slate-300 bg-white px-2.5 py-1 font-medium text-slate-700 hover:border-sky-400 hover:text-sky-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-sky-300"
            >
              {app}
            </button>
          ))}
        </div>
      )}
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        {liveEnabled
          ? 'Library apps open instantly. For anything else, a research agent investigates live (about 1–3 minutes) and publishes a shareable guide.'
          : 'Live generation is switched off on this server; library guides still work.'}
      </p>
      {error && <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
    </div>
  );
}
