/**
 * The guide format. Every guide — curated library or generated live — is one JSON
 * document that validates against `Guide`. The UI, the Markdown export and the
 * agent all work from this single shape, so guides stay comparable across apps.
 *
 * Evidence model: every claim-bearing item carries `sourceIds` (pointing into
 * `evidence.sources` or `evidence.probes`) and a `confidence`:
 *   tested   – we confirmed it ourselves with a probe / setup attempt
 *   official – stated by the provider's own docs or policies (or Composio docs for Composio facts)
 *   reported – third-party or community reports (forums, blogs); real-world but may be stale
 *   inferred – the agent's judgment with no direct source; treat as uncertain
 */
import { z } from 'zod';

/** The callback in Composio's API docs; sent only when an auth config sets `oauth_redirect_uri` to it. */
export const COMPOSIO_REDIRECT_URI = 'https://backend.composio.dev/api/v3/toolkits/auth/callback';
/**
 * What Composio actually sends for a custom OAuth auth config created without `oauth_redirect_uri`
 * (tested 2026-10-30 by creating auth configs with dummy clients and following the connect redirect).
 */
export const COMPOSIO_DEFAULT_REDIRECT_URI = 'https://backend.composio.dev/api/v1/auth-apps/add';

export const Confidence = z.enum(['tested', 'official', 'reported', 'inferred']);
export type Confidence = z.infer<typeof Confidence>;

/** Who does a step: an AI agent, the developer, or a wait on the provider. */
export const Actor = z.enum(['agent', 'you', 'provider']);
export type Actor = z.infer<typeof Actor>;

export const Tri = z.enum(['yes', 'no', 'depends', 'unknown']);
export type Tri = z.infer<typeof Tri>;

export const Difficulty = z.enum(['self-serve', 'light-review', 'formal-review', 'gated']);
export type Difficulty = z.infer<typeof Difficulty>;

const sourceIds = z.array(z.string()).default([]);
const nullableStr = z.string().nullable().default(null);

/** A time range. `label` is short (fits a stat tile); hours are calendar hours, used for sorting and the runway chart. */
export const Duration = z.object({
  label: z.string().min(1),
  minHours: z.number().nonnegative(),
  maxHours: z.number().nonnegative(),
  /** What the range is based on, e.g. "Google states ~6 weeks; reports range 3 weeks to 2+ months". */
  basis: z.string().optional(),
});
export type Duration = z.infer<typeof Duration>;

export const FactorKey = z.enum([
  'self_serve_registration', // can anyone sign up and create an OAuth app without talking to sales?
  'review_required', // must the provider review/approve the app before arbitrary users can connect?
  'business_verification', // must you verify a legal business entity?
  'security_assessment', // third-party security assessment / pen-test style review?
  'paid_access', // is a paid plan / paid API tier needed for the OAuth app or the API?
  'partner_or_sales_gate', // partner program, customer tenant, or sales contact required?
  'user_cap_before_review', // are connections capped (test users / tenants) until approved?
  'per_customer_setup', // does each customer/tenant need its own config, subdomain, or admin consent?
]);
export type FactorKey = z.infer<typeof FactorKey>;

export const Factor = z.object({
  key: FactorKey,
  value: Tri,
  detail: z.string().min(1),
  sourceIds,
  confidence: Confidence,
});
export type Factor = z.infer<typeof Factor>;

export const Link = z.object({ label: z.string(), url: z.string() });

export const Step = z.object({
  id: z.string(),
  title: z.string().min(1),
  actor: Actor,
  /** Hands-on effort, e.g. "10 min". */
  effort: z.string(),
  /** Calendar wait after this step, e.g. "3–5 business days". Null if none. */
  wait: nullableStr,
  /** Markdown allowed. Concrete: which page, which field, which value. */
  details: z.string().min(1),
  /** What an agent can prepare or do even when the developer must act (drafts, values, checks). */
  agentAssist: nullableStr,
  links: z.array(Link).default([]),
  sourceIds,
  confidence: Confidence,
});
export type Step = z.infer<typeof Step>;

export const Phase = z.object({
  id: z.string(),
  title: z.string().min(1),
  /** What the developer has at the end of this phase. */
  outcome: z.string(),
  steps: z.array(Step).min(1),
});
export type Phase = z.infer<typeof Phase>;

export const Requirement = z.object({
  item: z.string().min(1),
  neededFor: z.enum(['registration', 'testing', 'review', 'production']),
  detail: z.string(),
  sourceIds,
  confidence: Confidence,
});
export type Requirement = z.infer<typeof Requirement>;

export const Scope = z.object({
  scope: z.string().min(1),
  purpose: z.string(),
  tier: z.enum(['basic', 'sensitive', 'restricted', 'admin', 'unknown']),
  note: nullableStr,
  sourceIds,
  confidence: Confidence,
});
export type Scope = z.infer<typeof Scope>;

export const Blocker = z.object({
  title: z.string().min(1),
  /** What the developer sees when they hit it. */
  symptom: z.string(),
  likelihood: z.enum(['common', 'occasional', 'rare']),
  howToProceed: z.string().min(1),
  escalation: Link.nullable().default(null),
  sourceIds,
  confidence: Confidence,
});
export type Blocker = z.infer<typeof Blocker>;

export const Nuance = z.object({
  title: z.string().min(1),
  detail: z.string().min(1),
  sourceIds,
  confidence: Confidence,
});
export type Nuance = z.infer<typeof Nuance>;

/**
 * A use-case profile: the same app needed for a narrower or different set of scopes.
 * Only the factors that differ from the guide's default assumption are listed; the
 * rating for the profile is recomputed with the same rule (deriveDifficulty).
 */
export const Profile = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  label: z.string().min(1), // "Send email only"
  description: z.string(), // what the agent does in this use case
  scopes: z.array(z.string()), // scope strings from guide.scopes that this use case needs
  factorOverrides: z.partialRecord(FactorKey, Tri).default({}),
  timeToProduction: Duration.optional(),
  handsOnEffort: Duration.optional(),
  note: z.string(), // what changes vs. the default path, 1–2 sentences
  sourceIds,
  confidence: Confidence,
});
export type Profile = z.infer<typeof Profile>;

export const Source = z.object({
  id: z.string(), // "S1", "S2", ...
  url: z.string(),
  title: z.string(),
  kind: z.enum(['official', 'composio', 'community']),
  accessedAt: z.string(),
  /** Short supporting quote or note (≤ 25 words). */
  note: nullableStr,
  /** Live guides only: did the agent read the page, or only see it in search results? */
  retrieval: z.enum(['fetched', 'search-result']).optional(),
});
export type Source = z.infer<typeof Source>;

export const Probe = z.object({
  id: z.string(), // "P1", "P2", ...
  kind: z.enum(['oauth-discovery', 'authorize-endpoint', 'token-endpoint', 'portal', 'url-check', 'composio-api', 'dcr']),
  /** What was requested, e.g. "GET https://accounts.google.com/.well-known/openid-configuration". */
  target: z.string(),
  result: z.enum(['pass', 'fail', 'info']),
  summary: z.string(),
  detail: nullableStr,
  at: z.string(),
});
export type Probe = z.infer<typeof Probe>;

export const OpenQuestion = z.object({
  question: z.string(),
  whyItMatters: z.string(),
  howToResolve: z.string(),
});

export const VerificationItem = z.object({
  claim: z.string(),
  outcome: z.enum(['confirmed', 'corrected', 'unverifiable']),
  note: z.string(),
  sourceIds,
});
export type VerificationItem = z.infer<typeof VerificationItem>;

export const Guide = z.object({
  schemaVersion: z.literal(1),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  app: z.object({
    name: z.string(),
    website: z.string(),
    category: z.string(),
    description: z.string(),
    developerPortalUrl: z.string(),
    docsUrl: z.string(),
  }),
  composio: z.object({
    toolkitSlug: z.string().nullable(),
    managedOAuth: z.enum(['available', 'not-available', 'not-in-catalog', 'unknown']),
    authSchemes: z.array(z.string()).default([]),
    toolkitDocsUrl: nullableStr,
    /** Extra fields a connection needs beyond client id/secret (subdomain, region, ...). */
    requiredFields: z.array(z.object({ name: z.string(), description: z.string() })).default([]),
    notes: z.array(z.string()).default([]),
  }),
  /** The use case the ratings assume, e.g. "An agent that reads and sends Gmail on behalf of any Google user". */
  assumption: z.string(),
  verdict: z.object({
    headline: z.string(),
    summary: z.string(),
    difficulty: Difficulty,
    handsOnEffort: Duration,
    /** Calendar time until you can connect your own / a test account. */
    timeToFirstConnection: Duration,
    /** Calendar time until any user can connect without caps or warnings. */
    timeToProduction: Duration,
    longestPole: z.string(),
    /** Short cost headline (fits a stat tile), e.g. "Free" or "$540–$3,000+/yr assessment". */
    cost: z.string(),
    /** Full cost breakdown with numbers and sources' caveats. */
    costDetail: z.string().optional(),
    easierPaths: z.array(z.object({ condition: z.string(), effect: z.string() })).default([]),
  }),
  factors: z.array(Factor),
  phases: z.array(Phase).min(1),
  requirements: z.array(Requirement).default([]),
  scopes: z.array(Scope).default([]),
  blockers: z.array(Blocker).default([]),
  nuances: z.array(Nuance).default([]),
  /** Use-case profiles for the scope-based rating (the default path is the guide's own assumption). */
  profiles: z.array(Profile).default([]),
  composioSetup: z.object({
    redirectUri: z.string(),
    steps: z.array(z.string()).min(1),
    /** A real setup attempt through Composio (dummy client): what Composio actually sends to the provider. */
    tested: z
      .object({
        probeId: z.string(),
        testedAt: z.string(),
        authorizeUrl: z.string(),
        redirectUri: z.string().nullable(),
        defaultScopes: z.array(z.string()),
        extraParams: z.record(z.string(), z.string()).default({}),
      })
      .optional(),
  }),
  evidence: z.object({
    sources: z.array(Source),
    probes: z.array(Probe).default([]),
    openQuestions: z.array(OpenQuestion).default([]),
    verification: z
      .object({
        reviewedAt: z.string(),
        method: z.string(),
        items: z.array(VerificationItem).min(1),
      })
      .nullable()
      .default(null),
  }),
  meta: z.object({
    generatedAt: z.string(),
    generator: z.enum(['library', 'live']),
    model: z.string(),
    durationSec: z.number().nullable().default(null),
  }),
});
export type Guide = z.infer<typeof Guide>;
export type GuideInput = z.input<typeof Guide>;

export const DIFFICULTY_INFO: Record<Difficulty, { label: string; blurb: string }> = {
  'self-serve': {
    label: 'Self-serve',
    blurb: 'Register and go live without a provider review.',
  },
  'light-review': {
    label: 'Light review',
    blurb: 'A short or automated provider check (typically days) before any user can connect.',
  },
  'formal-review': {
    label: 'Formal review',
    blurb: 'A provider app review with submission materials; plan for weeks and possible rejections.',
  },
  gated: {
    label: 'Gated',
    blurb: 'Needs a partnership, a customer tenant, sales contact, or thresholds you may not meet.',
  },
};

const factorValue = (factors: Factor[], key: FactorKey): Tri =>
  factors.find((f) => f.key === key)?.value ?? 'unknown';

/**
 * Difficulty is derived from the factors and the production timeline rather than
 * picked freely, so ratings mean the same thing across every guide.
 */
export function deriveDifficulty(g: Pick<Guide, 'factors' | 'verdict'>): Difficulty {
  const f = g.factors;
  if (factorValue(f, 'partner_or_sales_gate') === 'yes' || factorValue(f, 'self_serve_registration') === 'no') {
    return 'gated';
  }
  const review = factorValue(f, 'review_required');
  if (review === 'yes') {
    const heavy =
      factorValue(f, 'security_assessment') === 'yes' ||
      factorValue(f, 'business_verification') === 'yes' ||
      g.verdict.timeToProduction.maxHours > 24 * 14;
    return heavy ? 'formal-review' : 'light-review';
  }
  return 'self-serve';
}

/** Cross-field checks zod can't express. Returns human-readable problems. */
export function lintGuide(g: Guide): string[] {
  const problems: string[] = [];
  const ids = new Set([...g.evidence.sources.map((s) => s.id), ...g.evidence.probes.map((p) => p.id)]);
  const check = (where: string, refs: string[], confidence?: Confidence) => {
    for (const r of refs) if (!ids.has(r)) problems.push(`${where}: unknown source id "${r}"`);
    if (confidence && confidence !== 'inferred' && refs.length === 0)
      problems.push(`${where}: confidence "${confidence}" but no sourceIds`);
    if (confidence === 'tested' && !refs.some((r) => r.startsWith('P')))
      problems.push(`${where}: confidence "tested" must cite a probe (P*)`);
  };
  g.factors.forEach((x) => check(`factor ${x.key}`, x.sourceIds, x.confidence));
  g.phases.forEach((p) => p.steps.forEach((s) => check(`step ${s.id}`, s.sourceIds, s.confidence)));
  g.requirements.forEach((x, i) => check(`requirement ${i}`, x.sourceIds, x.confidence));
  g.scopes.forEach((x) => check(`scope ${x.scope}`, x.sourceIds, x.confidence));
  g.blockers.forEach((x, i) => check(`blocker ${i}`, x.sourceIds, x.confidence));
  g.nuances.forEach((x, i) => check(`nuance ${i}`, x.sourceIds, x.confidence));
  g.evidence.verification?.items.forEach((x, i) => check(`verification ${i}`, x.sourceIds));

  for (const key of FactorKey.options) {
    if (!g.factors.some((f) => f.key === key)) problems.push(`factors: missing "${key}"`);
  }
  const derived = deriveDifficulty(g);
  if (derived !== g.verdict.difficulty)
    problems.push(`verdict.difficulty is "${g.verdict.difficulty}" but factors imply "${derived}"`);
  for (const d of ['handsOnEffort', 'timeToFirstConnection', 'timeToProduction'] as const) {
    const v = g.verdict[d];
    if (v.minHours > v.maxHours) problems.push(`verdict.${d}: minHours > maxHours`);
    if (v.label.length > 32) problems.push(`verdict.${d}.label is ${v.label.length} chars; keep it ≤ 32 and put detail in "basis"`);
  }
  if (g.verdict.cost.length > 48) problems.push(`verdict.cost is ${g.verdict.cost.length} chars; keep it ≤ 48 and put detail in "costDetail"`);
  const scopeNames = new Set(g.scopes.map((s) => s.scope));
  for (const p of g.profiles) {
    check(`profile ${p.id}`, p.sourceIds, p.confidence);
    for (const sc of p.scopes) if (!scopeNames.has(sc)) problems.push(`profile ${p.id}: scope "${sc}" is not in the guide's scopes table`);
  }
  const stepIds = g.phases.flatMap((p) => p.steps.map((s) => s.id));
  if (new Set(stepIds).size !== stepIds.length) problems.push('phases: duplicate step ids');
  return problems;
}

/** Compact human label for an hour range, e.g. (0.5, 1.5) → "30–90 min", (504, 2016) → "3–12 weeks". */
export function formatRange(minH: number, maxH: number): string {
  type U = 'min' | 'hour' | 'day' | 'week' | 'month';
  const size: Record<U, number> = { min: 1 / 60, hour: 1, day: 24, week: 168, month: 720 };
  const unitOf = (h: number): U => (h < 1 ? 'min' : h < 24 ? 'hour' : h < 168 ? 'day' : h < 2160 ? 'week' : 'month');
  let uMin = unitOf(minH);
  let uMax = unitOf(maxH);
  if (maxH < 2 && minH < 1) uMin = uMax = 'min';
  const n = (h: number, u: U) => Math.max(1, Math.round(h / size[u]));
  const name = (u: U, k: number) => (u === 'min' ? 'min' : k === 1 ? u : `${u}s`);
  const a = n(minH, uMin);
  const b = n(maxH, uMax);
  if (uMin === uMax) return a === b ? `${b} ${name(uMax, b)}` : `${a}–${b} ${name(uMax, b)}`;
  return `${a} ${name(uMin, a)} – ${b} ${name(uMax, b)}`;
}

/**
 * Parse a human duration label ("3–6 weeks", "30 min – 2 hours", "Same day", "Up to 21 business days")
 * into calendar hours. Returns null when the label has no recognisable duration.
 * Models write labels more reliably than they convert units, so labels are used to sanity-check hours.
 */
export function parseDurationLabel(label: string): { minHours: number; maxHours: number } | null {
  const s = label.toLowerCase().replace(/[–—]/g, '-');
  if (/\b(instant|immediate|minutes?)\b/.test(s) && !/\d/.test(s)) return { minHours: 0, maxHours: 0.5 };
  if (/same[- ]day/.test(s) && !/\d+\s*(day|week|month)/.test(s)) return { minHours: 0.5, maxHours: 8 };
  const unitHours = (u: string): number | null => {
    if (/^(min|minute)/.test(u)) return 1 / 60;
    if (/^(h|hr|hour)/.test(u)) return 1;
    if (/^business ?day/.test(u)) return 24 * 1.4;
    if (/^(d|day)/.test(u)) return 24;
    if (/^(w|wk|week)/.test(u)) return 168;
    if (/^(mo|month)/.test(u)) return 720;
    return null;
  };
  const re = /(\d+(?:\.\d+)?)\s*(?:-|to)?\s*(\d+(?:\.\d+)?)?\s*\+?\s*(business ?days?|minutes?|mins?|hours?|hrs?|h\b|days?|d\b|weeks?|wks?|w\b|months?|mo\b)/g;
  const values: number[] = [];
  for (const m of s.matchAll(re)) {
    const u = unitHours(m[3]);
    if (u == null) continue;
    values.push(Number(m[1]) * u);
    if (m[2]) values.push(Number(m[2]) * u);
  }
  if (!values.length) return null;
  const upTo = /\bup to\b|\bwithin\b|\bunder\b|\bless than\b/.test(s) && values.length === 1;
  const sameDay = /same[- ]day/.test(s);
  return { minHours: upTo ? 0 : sameDay ? Math.min(0.5, ...values) : Math.min(...values), maxHours: Math.max(...values) };
}

/** The guide's factors with a profile's overrides applied, and the rating recomputed by the same rule. */
export function rateProfile(g: Guide, p: Profile) {
  const factors = g.factors.map((f) => (p.factorOverrides[f.key] ? { ...f, value: p.factorOverrides[f.key]! } : f));
  const verdict = { ...g.verdict, timeToProduction: p.timeToProduction ?? g.verdict.timeToProduction };
  const changed = g.factors.filter((f) => p.factorOverrides[f.key] && p.factorOverrides[f.key] !== f.value).map((f) => ({ key: f.key, from: f.value, to: p.factorOverrides[f.key]! }));
  return { difficulty: deriveDifficulty({ factors, verdict }), timeToProduction: verdict.timeToProduction, handsOnEffort: p.handsOnEffort ?? g.verdict.handsOnEffort, changed };
}

/** The lightest profile whose scopes cover everything the developer ticked (null if none does). */
export function profileForScopes(g: Guide, picked: string[]): Profile | null {
  const order: Difficulty[] = ['self-serve', 'light-review', 'formal-review', 'gated'];
  const covering = g.profiles.filter((p) => picked.every((sc) => p.scopes.includes(sc)));
  covering.sort((a, b) => {
    const ra = rateProfile(g, a);
    const rb = rateProfile(g, b);
    return order.indexOf(ra.difficulty) - order.indexOf(rb.difficulty) || ra.timeToProduction.maxHours - rb.timeToProduction.maxHours;
  });
  return covering[0] ?? null;
}
