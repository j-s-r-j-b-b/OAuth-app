/**
 * Live guide generation:
 *   resolve → Composio facts → research loop (search, read, probe, save findings)
 *   → write (two structured passes) → check citations & ratings → Guide
 */
import type OpenAI from 'openai';
import { z } from 'zod';
import type { AgentEvent, QualityReport } from '../../shared/events.ts';
import {
  Blocker,
  COMPOSIO_REDIRECT_URI,
  Confidence,
  Duration,
  Factor,
  FactorKey,
  Guide,
  Nuance,
  OpenQuestion,
  Phase,
  Requirement,
  Scope,
  deriveDifficulty,
  formatRange,
  lintGuide,
  parseDurationLabel,
} from '../../shared/schema.ts';
import { matchToolkit } from '../catalog.ts';
import { getToolkitAuth, getToolkitDocs, webSearch } from '../composio.ts';
import { env } from '../env.ts';
import { chat, parseJsonLoose, type Usage } from './llm.ts';
import { IDENTIFY_SYSTEM, PLAN_TASK, RESEARCH_SYSTEM, VERDICT_TASK, WRITE_RULES } from './prompts.ts';
import { EvidenceRegistry } from './registry.ts';
import { RESEARCH_TOOLS, runTool, type ToolContext } from './tools.ts';

export class UserFacingError extends Error {}

const MAX_ROUNDS = 9;
const MIN_PAGE_READS = 4;
/** Claims a read-only probe can actually confirm: endpoints, discovery, PKCE, redirects, sign-in walls, client rejection. */
const PROBEABLE = /endpoint|authori[sz]|token url|discovery|well-known|openid|pkce|code_challenge|redirect|callback|sign[- ]?in|log[- ]?in|portal|developer hub|console|client[_ ]?id|invalid_client|unauthorized_client|reachab|is live|returns? (an? )?(error|40\d)/i;
const MAX_CALLS_PER_ROUND = 6;

type Identity = {
  isRealApp: boolean;
  name: string;
  website: string;
  category: string;
  description: string;
  developerPortalUrl: string;
  docsUrl: string;
  officialDomains: string[];
  oauth: 'yes' | 'no' | 'unknown';
  ambiguity: string;
};

export async function generateGuide(
  query: string,
  emit: (e: AgentEvent) => void,
  opts: { slugFor: (name: string) => string },
): Promise<{ guide: Guide; quality: QualityReport }> {
  const started = Date.now();
  const usage: Usage = { calls: 0, inputTokens: 0, outputTokens: 0 };
  const reg = new EvidenceRegistry();
  const onWait = (message: string) => emit({ type: 'warn', message });
  const model = env.llm.model;

  // ── 1. Resolve ────────────────────────────────────────────────────────────
  emit({ type: 'stage', stage: 'resolve', message: `Identifying “${query}”` });
  let toolkit = matchToolkit(query);
  const seedQuery = `${toolkit?.name ?? query} API OAuth app developer documentation`;
  // Search trouble degrades the guide (fewer sources) but must not abort the job.
  const seed = await webSearch(seedQuery).catch((e: Error) => {
    emit({ type: 'warn', message: `Web search unavailable: ${e.message.slice(0, 160)}` });
    return { hits: [] as { title: string; url: string; snippet: string }[], engine: 'none' };
  });
  emit({ type: 'search', query: seedQuery, count: seed.hits.length, engine: seed.engine });
  const identRes = await chat(
    {
      model,
      messages: [
        { role: 'system', content: IDENTIFY_SYSTEM },
        {
          role: 'user',
          content: `Query: ${query}\nComposio catalog match: ${toolkit ? `${toolkit.name} (slug ${toolkit.slug})` : 'none'}\n\nSearch results:\n${seed.hits
            .map((h) => `- ${h.title} — ${h.url}\n  ${h.snippet.slice(0, 200)}`)
            .join('\n')}`,
        },
      ],
      response_format: { type: 'json_object' },
    },
    usage,
    onWait,
  );
  const ident = parseJsonLoose(identRes.choices[0].message.content ?? '') as Identity;
  if (!ident?.isRealApp || !ident.name) {
    throw new UserFacingError(
      `Couldn't tell which app “${query}” refers to${ident?.ambiguity ? ` (${ident.ambiguity})` : ''}. Try the app's website URL.`,
    );
  }
  toolkit ??= matchToolkit(ident.name) ?? matchToolkit(ident.website);
  for (const d of [ident.website, ident.developerPortalUrl, ident.docsUrl, ...(ident.officialDomains ?? [])]) if (d) reg.addOfficialDomain(d);
  for (const h of seed.hits) reg.addSource(h.url, h.title, 'search-result', h.snippet);
  emit({ type: 'info', message: `Identified ${ident.name} — ${ident.description}` });
  if (ident.ambiguity) emit({ type: 'warn', message: ident.ambiguity });
  if (ident.oauth === 'no') emit({ type: 'warn', message: `${ident.name} may not offer OAuth for third-party apps. Researching anyway.` });

  // ── 2. Composio facts ─────────────────────────────────────────────────────
  emit({ type: 'stage', stage: 'composio', message: 'Checking Composio’s toolkit catalog' });
  const composio: Guide['composio'] = {
    toolkitSlug: toolkit?.slug ?? null,
    managedOAuth: toolkit ? (toolkit.managed ? 'available' : 'not-available') : 'not-in-catalog',
    authSchemes: [],
    toolkitDocsUrl: toolkit?.docsUrl ?? null,
    requiredFields: [],
    notes: [],
  };
  let composioFaq = '';
  let defaultScopes: string[] = [];
  if (toolkit) {
    const docs = await getToolkitDocs(toolkit.slug).catch(() => null);
    if (docs) {
      composio.authSchemes = docs.authLine.split(/,\s*/).filter(Boolean);
      composioFaq = docs.faq;
      reg.addSource(docs.url, `Composio docs: ${toolkit.name} toolkit`, 'fetched', `Auth: ${docs.authLine}. Managed OAuth: ${docs.managedLine}`);
    }
    try {
      const auth = await getToolkitAuth(toolkit.slug);
      if (auth) {
        const oauth = auth.details.find((d) => /OAUTH/i.test(d.scheme)) ?? auth.details[0];
        if (oauth) {
          defaultScopes = oauth.defaultScopes;
          composio.requiredFields = oauth.connectionFields
            .filter((f) => f.required)
            .map((f) => ({ name: f.name, description: f.description || f.displayName }));
        }
        reg.addProbe({
          kind: 'composio-api',
          target: `GET https://backend.composio.dev/api/v3.1/toolkits/${toolkit.slug}`,
          result: 'pass',
          summary: `Auth schemes: ${auth.details.map((d) => `${d.scheme}${d.managed ? ' (managed)' : ''}`).join(', ') || 'none'}. Connection fields: ${
            composio.requiredFields.map((f) => f.name).join(', ') || 'none'
          }. Default scopes: ${defaultScopes.length ? defaultScopes.slice(0, 12).join(' ') : 'none listed'}.`,
          detail: JSON.stringify(auth.details).slice(0, 1500),
        });
      }
    } catch (e) {
      emit({ type: 'warn', message: `Composio toolkit API unavailable: ${(e as Error).message.slice(0, 120)}` });
    }
    emit({
      type: 'info',
      message: toolkit.managed
        ? `Composio toolkit \`${toolkit.slug}\` has a managed OAuth app: you can prototype today and need your own app for production branding, scopes or quota.`
        : `Composio toolkit \`${toolkit.slug}\` has no managed OAuth app: you must register your own before anyone can connect.`,
    });
  } else {
    emit({ type: 'info', message: `No Composio toolkit matches ${ident.name}; you'd need a custom toolkit or proxy calls. Researching the OAuth path anyway.` });
  }

  // ── 3. Research loop ──────────────────────────────────────────────────────
  emit({ type: 'stage', stage: 'research', message: 'Researching docs, policies and real-world reports' });
  const ctx: ToolContext = { reg, emit, findings: [], readCount: 0 };
  const seedQueries = [
    `${ident.name} OAuth app review approval verification publish requirements`,
    `${ident.name} OAuth app approval how long experience reddit OR forum`,
    // The first evaluation showed paid gates (API tiers, connection caps, required subscriptions) were the most-missed facts.
    `${ident.name} API pricing plans tiers limits for developers connections`,
  ];
  const seedResults = await Promise.all(seedQueries.map((q) => runTool('web_search', { query: q }, ctx).catch((e) => `Search failed: ${e.message}`)));
  const firstSearch = seed.hits
    .map((h) => {
      const s = reg.sources.find((x) => x.url === h.url.split('#')[0]);
      return `[${s?.id}] ${h.title} — ${h.url}\n    ${h.snippet.replace(/\s+/g, ' ').slice(0, 250)}`;
    })
    .join('\n');

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: RESEARCH_SYSTEM.replaceAll('APP', ident.name) },
    {
      role: 'user',
      content: [
        `APP: ${ident.name} (${ident.category}) — ${ident.description}`,
        `Website: ${ident.website}  Developer portal (guess): ${ident.developerPortalUrl || 'unknown'}  Docs (guess): ${ident.docsUrl || 'unknown'}`,
        `Composio: ${toolkit ? `toolkit \`${toolkit.slug}\`, managed OAuth ${toolkit.managed ? 'AVAILABLE' : 'NOT available'}, auth schemes ${composio.authSchemes.join(', ') || 'unknown'}` : 'no toolkit in catalog'}`,
        composioFaq ? `Composio toolkit FAQ (source ${reg.sources.find((s) => s.kind === 'composio')?.id}):\n${composioFaq.slice(0, 2500)}` : '',
        `\nInitial search: ${seedQuery}\n${firstSearch}`,
        ...seedQueries.map((q, i) => `\nInitial search: ${q}\n${seedResults[i]}`),
        `\nBudget: up to ${MAX_ROUNDS} turns, ${MAX_CALLS_PER_ROUND} tool calls per turn, 12 page reads. Start now: read the most relevant official pages, run the probes, and save findings as you go.`,
      ]
        .filter(Boolean)
        .join('\n'),
    },
  ];

  let summary = '';
  let gaps: string[] = [];
  const toolMsgIndex: number[] = [];
  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const last = round === MAX_ROUNDS;
    const res = await chat(
      {
        model,
        messages,
        tools: last ? RESEARCH_TOOLS.filter((t) => ['save_findings', 'finish_research'].includes((t as any).function.name)) : RESEARCH_TOOLS,
        tool_choice: last ? 'required' : 'auto',
      },
      usage,
      onWait,
    );
    const msg = res.choices[0].message;
    messages.push(msg as OpenAI.Chat.ChatCompletionMessageParam);
    const calls = (msg.tool_calls ?? []).filter((c): c is OpenAI.Chat.ChatCompletionMessageFunctionToolCall => c.type === 'function');
    if (!calls.length) {
      messages.push({ role: 'user', content: 'Continue using the tools, or call finish_research if you are done.' });
      continue;
    }
    let finished = false;
    const outputs = await Promise.all(
      calls.map(async (c, i) => {
        if (i >= MAX_CALLS_PER_ROUND) return 'Skipped: too many tool calls in one turn.';
        let args: Record<string, any> = {};
        try {
          args = JSON.parse(c.function.arguments || '{}');
        } catch {
          return 'Invalid JSON arguments.';
        }
        if (c.function.name === 'finish_research') {
          // Evaluation showed the model stopping after 1–3 page reads and leaning on search snippets.
          if (ctx.readCount < MIN_PAGE_READS && round < MAX_ROUNDS - 1) {
            return `Not yet: you have read ${ctx.readCount} page(s). Read at least ${MIN_PAGE_READS} before finishing, including the provider's pricing/plans or API-limits page and one community thread about review times, and save findings from them.`;
          }
          finished = true;
          summary = String(args.summary ?? '');
          gaps = Array.isArray(args.gaps) ? args.gaps.map(String) : [];
          return 'Research finished.';
        }
        try {
          return await runTool(c.function.name, args, ctx);
        } catch (e) {
          return `Tool error: ${(e as Error).message}`;
        }
      }),
    );
    calls.forEach((c, i) => {
      toolMsgIndex.push(messages.length);
      messages.push({ role: 'tool', tool_call_id: c.id, content: outputs[i] });
    });
    // Trim old page text; findings were saved explicitly.
    for (const idx of toolMsgIndex.slice(0, -calls.length * 2)) {
      const m = messages[idx] as { content: string };
      if (typeof m.content === 'string' && m.content.length > 2500) m.content = `${m.content.slice(0, 2500)}\n[…trimmed; rely on saved findings]`;
    }
    if (finished) break;
  }
  emit({ type: 'info', message: `Research done: ${ctx.findings.length} findings, ${reg.sources.filter((s) => s.retrieval === 'fetched').length} pages read, ${reg.probes.length} probes.` });
  if (ctx.findings.length < 5) emit({ type: 'warn', message: 'Few findings were saved; the guide will lean on inferred judgments.' });

  // ── 4. Write ──────────────────────────────────────────────────────────────
  emit({ type: 'stage', stage: 'write', message: 'Writing the guide' });
  const writeContext = [
    `APP: ${ident.name} (${ident.category}) — ${ident.description}. Website ${ident.website}.`,
    `COMPOSIO FACTS (authoritative, already in the guide): toolkit ${composio.toolkitSlug ?? 'none'}; managed OAuth ${composio.managedOAuth}; auth schemes ${composio.authSchemes.join(', ') || 'unknown'}; redirect URI ${COMPOSIO_REDIRECT_URI}; extra connection fields ${composio.requiredFields.map((f) => f.name).join(', ') || 'none'}; default scopes ${defaultScopes.join(' ') || 'unknown'}.`,
    composioFaq ? `COMPOSIO TOOLKIT FAQ:\n${composioFaq.slice(0, 2000)}` : '',
    `RESEARCH SUMMARY: ${summary || '(none)'}\nGAPS: ${gaps.join('; ') || '(none)'}`,
    `FINDINGS:\n${ctx.findings.map((f, i) => `${i + 1}. ${f.fact} [${f.sourceIds.join(', ')}]`).join('\n') || '(none)'}`,
    reg.describe(),
  ]
    .filter(Boolean)
    .join('\n\n');

  const Part1 = z.object({
    assumption: z.string(),
    verdict: z.object({
      headline: z.string(),
      summary: z.string(),
      difficulty: z.string(),
      handsOnEffort: Duration,
      timeToFirstConnection: Duration,
      timeToProduction: Duration,
      longestPole: z.string(),
      cost: z.string(),
      costDetail: z.string().optional(),
      easierPaths: z.array(z.object({ condition: z.string(), effect: z.string() })).default([]),
    }),
    factors: z.array(Factor.extend({ confidence: z.string(), key: z.string() })),
    requirements: z.array(Requirement.extend({ confidence: z.string() })).default([]),
    scopes: z.array(Scope.extend({ confidence: z.string(), tier: z.string() })).default([]),
    sourceNotes: z.record(z.string(), z.string()).default({}),
  });
  const Part2 = z.object({
    phases: z.array(
      Phase.extend({ steps: z.array(Phase.shape.steps.element.extend({ confidence: z.string(), actor: z.string() })) }),
    ),
    blockers: z.array(Blocker.extend({ confidence: z.string(), likelihood: z.string() })).default([]),
    nuances: z.array(Nuance.extend({ confidence: z.string() })).default([]),
    composioSteps: z.array(z.string()).default([]),
    composioNotes: z.array(z.string()).default([]),
    openQuestions: z.array(OpenQuestion).default([]),
    sourceNotes: z.record(z.string(), z.string()).default({}),
  });

  const writeJson = async <T extends z.ZodTypeAny>(task: string, schema: T, extra = ''): Promise<z.infer<T>> => {
    const base: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: `You write OAuth setup guides for developers from research notes.\n\n${WRITE_RULES}` },
      { role: 'user', content: `${writeContext}${extra}\n\n${task}` },
    ];
    let lastErr = '';
    for (let attempt = 0; attempt < 3; attempt++) {
      const msgs = attempt === 0 ? base : [...base, { role: 'user' as const, content: `Your previous JSON was invalid:\n${lastErr}\nReturn the complete corrected JSON only.` }];
      const r = await chat({ model: env.llm.composeModel, messages: msgs, response_format: { type: 'json_object' } }, usage, onWait);
      try {
        const parsed = schema.safeParse(parseJsonLoose(r.choices[0].message.content ?? ''));
        if (parsed.success) return parsed.data;
        lastErr = parsed.error.issues.slice(0, 15).map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
      } catch (e) {
        lastErr = (e as Error).message;
      }
      emit({ type: 'warn', message: `Draft failed validation; repairing (${lastErr.split('\n')[0].slice(0, 120)})` });
    }
    throw new Error(`The model could not produce a valid draft: ${lastErr.slice(0, 300)}`);
  };

  const p1 = await writeJson(VERDICT_TASK, Part1);
  const fixes: string[] = [];
  for (const k of ['handsOnEffort', 'timeToFirstConnection', 'timeToProduction'] as const) {
    const d = p1.verdict[k];
    if (d.minHours > d.maxHours) [d.minHours, d.maxHours] = [d.maxHours, d.minHours];
    // Models write human labels more reliably than they convert to hours ("3–6 weeks" came back as 72–336 h).
    // When the label parses and disagrees with the hours by more than 2.5×, trust the label.
    const fromLabel = parseDurationLabel(d.label);
    if (fromLabel && Math.abs(Math.log((fromLabel.maxHours + 0.5) / (d.maxHours + 0.5))) > Math.log(2.5)) {
      fixes.push(`${k}: hours ${d.minHours}–${d.maxHours} contradicted label "${d.label}" → ${Math.round(fromLabel.minHours)}–${Math.round(fromLabel.maxHours)} h`);
      d.minHours = fromLabel.minHours;
      d.maxHours = fromLabel.maxHours;
    }
    // Tiles need short labels: keep the model's wording as the basis and derive a label from the hours.
    if (d.label.length > 32) {
      d.basis = d.basis ? `${d.label}. ${d.basis}` : d.label;
      d.label = formatRange(d.minHours, d.maxHours);
    }
    if (!d.basis) delete d.basis;
  }
  if (p1.verdict.cost.length > 48) {
    p1.verdict.costDetail ||= p1.verdict.cost;
    p1.verdict.cost = `${p1.verdict.cost.slice(0, 44).replace(/[\s,;.]+\S*$/, '')}…`;
  }
  if (!p1.verdict.costDetail) delete p1.verdict.costDetail;
  emit({ type: 'info', message: `Verdict drafted: ${p1.verdict.headline}` });
  const { sourceNotes: _n, ...p1ForContext } = p1;
  const p2 = await writeJson(
    PLAN_TASK.replace('"composioSteps": [string],', '"composioSteps": [string],\n  "composioNotes": [string],   // 0–4 Composio-specific gotchas from the toolkit FAQ'),
    Part2,
    `\n\nPART 1 (already written — stay consistent with it):\n${JSON.stringify(p1ForContext).slice(0, 12000)}`,
  );

  // ── 5. Assemble & check ───────────────────────────────────────────────────
  emit({ type: 'stage', stage: 'check', message: 'Checking citations, confidence labels and ratings' });
  const known = new Set([...reg.sources.map((s) => s.id), ...reg.probes.map((p) => p.id)]);
  const cited = new Set<string>();
  const fixRefs = <T extends { sourceIds: string[]; confidence: string }>(item: T, where: string): T & { confidence: Confidence } => {
    const ids = [...new Set(item.sourceIds.map((s) => String(s).trim().replace(/^\[|\]$/g, '')))];
    const keep = ids.filter((id) => known.has(id));
    if (keep.length !== ids.length) fixes.push(`${where}: dropped citation(s) to unknown ids ${ids.filter((i) => !known.has(i)).join(', ')}`);
    let confidence = (Confidence.options as string[]).includes(item.confidence) ? (item.confidence as Confidence) : 'inferred';
    if (confidence === 'tested' && !keep.some((i) => i.startsWith('P'))) {
      confidence = keep.length ? 'official' : 'inferred';
      fixes.push(`${where}: "tested" without a probe → ${confidence}`);
    }
    // A probe can only confirm endpoint-level facts; "tested" on anything else (scopes, review times…) is over-claiming.
    const it = item as Record<string, unknown>;
    const claimText = String(it.title ?? it.item ?? it.scope ?? it.detail ?? '');
    if (confidence === 'tested' && !PROBEABLE.test(claimText)) {
      confidence = keep.some((i) => i.startsWith('S')) ? 'official' : 'inferred';
      fixes.push(`${where}: "tested" on a claim no probe can confirm → ${confidence}`);
    }
    if (confidence !== 'inferred' && keep.length === 0) {
      fixes.push(`${where}: "${confidence}" with no valid source → inferred`);
      confidence = 'inferred';
    }
    if (confidence === 'official' && keep.length && keep.every((i) => reg.sources.find((s) => s.id === i)?.kind === 'community')) {
      confidence = 'reported';
      fixes.push(`${where}: "official" but only community sources → reported`);
    }
    keep.forEach((i) => cited.add(i));
    return { ...item, sourceIds: keep, confidence };
  };

  const factors = FactorKey.options.map((key) => {
    const f = p1.factors.find((x) => x.key === key);
    if (!f) {
      fixes.push(`factor ${key}: missing → unknown`);
      return { key, value: 'unknown' as const, detail: 'Not determined by the research.', sourceIds: [], confidence: 'inferred' as const };
    }
    const value = (['yes', 'no', 'depends', 'unknown'] as const).includes(f.value) ? f.value : 'unknown';
    return { ...fixRefs(f, `factor ${key}`), key, value };
  });

  let stepNo = 0;
  let hasProviderStep = false;
  const phases = p2.phases.map((ph, pi) => ({
    id: `p${pi + 1}`,
    title: ph.title,
    outcome: ph.outcome,
    steps: ph.steps.flatMap((s) => {
      let actor = (['agent', 'you', 'provider'] as const).includes(s.actor as any) ? (s.actor as 'agent' | 'you' | 'provider') : 'you';
      // Creating the Composio auth config is a single API call with the developer's Composio key.
      if (actor === 'you' && /auth ?config/i.test(s.title) && /creat|set ?up|add/i.test(s.title)) {
        actor = 'agent';
        fixes.push(`step "${s.title.slice(0, 40)}": Composio auth-config creation is agent-doable via API → agent`);
      }
      if (actor === 'provider') hasProviderStep = true;
      const step = { ...fixRefs(s, `step ${s.title.slice(0, 40)}`), id: `s${++stepNo}`, actor, links: (s.links ?? []).filter((l) => /^https?:\/\//.test(l.url)) };
      // A review wait is the provider's step, not the developer's: split it out so "who does what" is honest.
      if (actor !== 'provider' && s.wait && /review|approv|verif|certif/i.test(`${s.title} ${s.wait}`)) {
        hasProviderStep = true;
        fixes.push(`step "${s.title.slice(0, 40)}": split its review wait into a provider step`);
        return [
          { ...step, wait: null },
          {
            ...step,
            id: `s${++stepNo}`,
            title: `${ident.name} reviews the submission`,
            actor: 'provider' as const,
            effort: 'None (waiting)',
            wait: s.wait,
            details: `Nothing to do but wait and watch for reviewer questions. The wait is ${s.wait}.`,
            agentAssist: 'An agent can watch the review inbox and draft replies to reviewer questions.',
            links: [],
          },
        ];
      }
      return [step];
    }),
  }));
  if (!hasProviderStep && p1.factors.find((f) => f.key === 'review_required')?.value === 'yes') {
    fixes.push('no provider wait step although review_required = yes');
  }

  const notes = { ...p1.sourceNotes, ...p2.sourceNotes };
  const draft = {
    schemaVersion: 1 as const,
    slug: opts.slugFor(ident.name),
    app: {
      name: ident.name,
      website: ident.website,
      category: ident.category,
      description: ident.description,
      developerPortalUrl: ident.developerPortalUrl,
      docsUrl: ident.docsUrl,
    },
    composio: { ...composio, notes: p2.composioNotes.slice(0, 4) },
    assumption: p1.assumption,
    verdict: { ...p1.verdict, difficulty: 'self-serve' as const },
    factors,
    phases,
    requirements: p1.requirements.map((r, i) => fixRefs(r, `requirement ${i + 1}`)),
    scopes: p1.scopes.map((s) => ({
      ...fixRefs(s, `scope ${s.scope}`),
      tier: (['basic', 'sensitive', 'restricted', 'admin', 'unknown'] as const).includes(s.tier as any) ? (s.tier as any) : 'unknown',
    })),
    blockers: p2.blockers.map((b, i) => ({
      ...fixRefs(b, `blocker ${i + 1}`),
      likelihood: (['common', 'occasional', 'rare'] as const).includes(b.likelihood as any) ? (b.likelihood as any) : 'occasional',
      escalation: b.escalation && /^https?:\/\//.test(b.escalation.url) ? b.escalation : null,
    })),
    nuances: p2.nuances.map((n, i) => fixRefs(n, `nuance ${i + 1}`)),
    composioSetup: {
      redirectUri: COMPOSIO_REDIRECT_URI,
      steps: p2.composioSteps.length
        ? p2.composioSteps
        : ['Create a custom auth config for the toolkit in the Composio dashboard with your client ID and secret.', 'Pass the auth config ID to your session.'],
    },
    evidence: { sources: [] as Guide['evidence']['sources'], probes: reg.probes, openQuestions: p2.openQuestions.slice(0, 6), verification: null },
    meta: { generatedAt: new Date().toISOString(), generator: 'live' as const, model: env.llm.model, durationSec: null as number | null },
  };

  // Difficulty is derived, never trusted from the model.
  const derived = deriveDifficulty(draft as unknown as Guide);
  if (derived !== p1.verdict.difficulty) fixes.push(`difficulty: model said "${p1.verdict.difficulty}", factors imply "${derived}"`);
  draft.verdict.difficulty = derived as any;

  // Keep sources that were cited, plus Composio's toolkit page; renumber S1..Sn.
  const composioSrc = reg.sources.find((s) => s.kind === 'composio');
  if (composioSrc) cited.add(composioSrc.id);
  const keptSources = reg.sources.filter((s) => cited.has(s.id));
  const remap = new Map(keptSources.map((s, i) => [s.id, `S${i + 1}`]));
  const remapIds = (ids: string[]) => ids.map((id) => remap.get(id) ?? id);
  draft.evidence.sources = keptSources.map((s) => ({
    id: remap.get(s.id)!,
    url: s.url,
    title: s.title,
    kind: s.kind,
    accessedAt: s.accessedAt,
    note: notes[s.id]?.slice(0, 240) ?? null,
    retrieval: s.retrieval,
  }));
  const walk = (o: any) => {
    if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === 'object') {
      if (Array.isArray(o.sourceIds)) o.sourceIds = remapIds(o.sourceIds);
      Object.values(o).forEach(walk);
    }
  };
  walk([draft.factors, draft.phases, draft.requirements, draft.scopes, draft.blockers, draft.nuances]);

  if (!reg.probes.some((p) => p.result === 'pass' && p.kind !== 'composio-api')) {
    draft.evidence.openQuestions.push({
      question: `Do ${ident.name}'s OAuth endpoints behave as documented?`,
      whyItMatters: 'None of our live probes confirmed the authorize endpoint, so endpoint details rest on documentation only.',
      howToResolve: 'Register a test app and run one connection end to end before relying on these details.',
    });
  }

  draft.meta.durationSec = Math.round((Date.now() - started) / 1000);
  const guide = Guide.parse(draft);
  for (const p of lintGuide(guide)) fixes.push(`lint: ${p}`);

  const count = (c: Confidence) =>
    [guide.factors, guide.requirements, guide.scopes, guide.blockers, guide.nuances, guide.phases.flatMap((p) => p.steps)]
      .flat()
      .filter((x) => x.confidence === c).length;
  const quality: QualityReport = {
    claims: { tested: count('tested'), official: count('official'), reported: count('reported'), inferred: count('inferred') },
    sources: {
      total: guide.evidence.sources.length,
      fetched: guide.evidence.sources.filter((s) => s.retrieval === 'fetched').length,
      snippetOnly: guide.evidence.sources.filter((s) => s.retrieval === 'search-result').length,
      official: guide.evidence.sources.filter((s) => s.kind === 'official').length,
      community: guide.evidence.sources.filter((s) => s.kind === 'community').length,
      composio: guide.evidence.sources.filter((s) => s.kind === 'composio').length,
    },
    probes: {
      total: guide.evidence.probes.length,
      pass: guide.evidence.probes.filter((p) => p.result === 'pass').length,
      info: guide.evidence.probes.filter((p) => p.result === 'info').length,
      fail: guide.evidence.probes.filter((p) => p.result === 'fail').length,
    },
    fixes,
    llm: { ...usage, model: env.llm.model },
  };
  emit({ type: 'quality', report: quality });
  return { guide, quality };
}
