import { useState, type ReactNode } from 'react';
import type { Actor, Confidence, Difficulty, Duration } from '../../../shared/schema.ts';
import { DIFFICULTY_INFO } from '../../../shared/schema.ts';

export const DIFF_STYLE: Record<Difficulty, string> = {
  'self-serve': 'bg-emerald-100 text-emerald-800 ring-emerald-600/20 dark:bg-emerald-500/15 dark:text-emerald-300',
  'light-review': 'bg-sky-100 text-sky-800 ring-sky-600/20 dark:bg-sky-500/15 dark:text-sky-300',
  'formal-review': 'bg-amber-100 text-amber-900 ring-amber-600/25 dark:bg-amber-500/15 dark:text-amber-300',
  gated: 'bg-rose-100 text-rose-800 ring-rose-600/20 dark:bg-rose-500/15 dark:text-rose-300',
};
export const DIFF_BAR: Record<Difficulty, string> = {
  'self-serve': 'bg-emerald-500',
  'light-review': 'bg-sky-500',
  'formal-review': 'bg-amber-500',
  gated: 'bg-rose-500',
};

export function DifficultyPill({ d, size = 'sm' }: { d: Difficulty; size?: 'sm' | 'lg' }) {
  return (
    <span
      title={DIFFICULTY_INFO[d].blurb}
      className={`inline-flex items-center rounded-full font-semibold ring-1 ring-inset ${DIFF_STYLE[d]} ${size === 'lg' ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-xs'}`}
    >
      {DIFFICULTY_INFO[d].label}
    </span>
  );
}

const ACTOR: Record<Actor, { label: string; icon: string; cls: string; title: string }> = {
  agent: { label: 'Agent', icon: '🤖', cls: 'bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300', title: 'An AI agent can do this — no login, legal acceptance or payment involved' },
  you: { label: 'You', icon: '👤', cls: 'bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300', title: 'Needs you: sign-in, legal acceptance, business documents, payment or judgment' },
  provider: { label: 'Provider', icon: '⏳', cls: 'bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300', title: 'Waiting on the provider (review, verification)' },
};

export function ActorChip({ actor }: { actor: Actor }) {
  const a = ACTOR[actor];
  return (
    <span title={a.title} className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold ${a.cls}`}>
      <span aria-hidden>{a.icon}</span>
      {a.label}
    </span>
  );
}

export const CONF: Record<Confidence, { label: string; cls: string; title: string }> = {
  tested: { label: 'Tested', cls: 'bg-emerald-600 text-white dark:bg-emerald-500 dark:text-slate-950', title: 'Confirmed by one of our own probes / setup attempts' },
  official: { label: 'Official', cls: 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300', title: "Stated in the provider's own docs or policies" },
  reported: { label: 'Reported', cls: 'bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300', title: 'Community / third-party reports only — real-world but may be stale' },
  inferred: { label: 'Inferred', cls: 'border border-dashed border-slate-400 text-slate-600 dark:border-slate-500 dark:text-slate-400', title: 'Judgment without a direct source — treat as uncertain' },
};

export function Evidence({ c, ids, onCite }: { c: Confidence; ids: string[]; onCite: (id: string) => void }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1 align-middle">
      <span title={CONF[c].title} className={`rounded px-1.5 py-px text-[10px] font-bold tracking-wide uppercase ${CONF[c].cls}`}>
        {CONF[c].label}
      </span>
      {ids.map((id) => (
        <button
          key={id}
          onClick={() => onCite(id)}
          className="rounded px-1 font-mono text-[11px] text-slate-500 hover:bg-slate-200 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-white"
          title={`Jump to ${id.startsWith('P') ? 'probe' : 'source'} ${id}`}
        >
          [{id}]
        </button>
      ))}
    </span>
  );
}

export function CopyButton({ text, label, className = 'btn' }: { text: string | (() => string | Promise<string>); label: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className={className}
      onClick={async () => {
        const value = typeof text === 'function' ? await text() : text;
        await navigator.clipboard.writeText(value);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? '✓ Copied' : label}
    </button>
  );
}

export function Section({ id, title, kicker, children }: { id: string; title: string; kicker?: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20">
      <div className="mb-3">
        {kicker && <div className="eyebrow">{kicker}</div>}
        <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">{title}</h2>
      </div>
      {children}
    </section>
  );
}

// ── Runway: log-scale time axis from 15 minutes to 6 months ─────────────────
const MIN_H = 0.25;
const MAX_H = 24 * 30 * 6;
export const runwayPos = (h: number) => Math.min(1, Math.max(0, (Math.log(Math.max(h, MIN_H)) - Math.log(MIN_H)) / (Math.log(MAX_H) - Math.log(MIN_H))));
export const TICKS = [
  { h: 1, label: '1 hour' },
  { h: 24, label: '1 day' },
  { h: 168, label: '1 week' },
  { h: 720, label: '1 month' },
  { h: 2160, label: '3 months' },
];

function Range({ d, cls, label }: { d: Duration; cls: string; label?: string }) {
  const left = runwayPos(d.minHours) * 100;
  const width = Math.max(1.2, (runwayPos(d.maxHours) - runwayPos(d.minHours)) * 100);
  return (
    <div className={`absolute top-0 h-full rounded-full ${cls}`} style={{ left: `${left}%`, width: `${width}%` }} title={label ? `${label}: ${d.label}` : d.label} />
  );
}

export function RunwayBar({ first, prod, barCls, showTicks = false, height = 'h-2.5' }: { first: Duration; prod: Duration; barCls: string; showTicks?: boolean; height?: string }) {
  return (
    <div>
      <div className={`relative ${height} rounded-full bg-slate-100 dark:bg-slate-800`}>
        {TICKS.map((t) => (
          <div key={t.h} className="absolute top-0 h-full w-px bg-slate-300/70 dark:bg-slate-700" style={{ left: `${runwayPos(t.h) * 100}%` }} />
        ))}
        <Range d={prod} cls={`${barCls} opacity-90`} label="Production" />
        <Range d={first} cls="bg-slate-900/70 dark:bg-white/80" label="First connection" />
      </div>
      {showTicks && (
        <div className="relative mt-1 h-4 text-[10px] text-slate-500 dark:text-slate-400">
          {TICKS.map((t) => (
            <span key={t.h} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${runwayPos(t.h) * 100}%` }}>
              {t.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function ManagedBadge({ m }: { m: 'available' | 'not-available' | 'not-in-catalog' | 'unknown' }) {
  const map = {
    available: ['Composio-managed OAuth available', 'bg-teal-50 text-teal-800 ring-teal-600/20 dark:bg-teal-500/10 dark:text-teal-300'],
    'not-available': ['Bring your own OAuth app', 'bg-slate-100 text-slate-700 ring-slate-500/20 dark:bg-slate-800 dark:text-slate-300'],
    'not-in-catalog': ['Not in Composio catalog', 'bg-slate-100 text-slate-600 ring-slate-500/20 dark:bg-slate-800 dark:text-slate-400'],
    unknown: ['Composio status unknown', 'bg-slate-100 text-slate-600 ring-slate-500/20 dark:bg-slate-800 dark:text-slate-400'],
  } as const;
  const [label, cls] = map[m];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${cls}`}>{label}</span>;
}
