import { DIFFICULTY_INFO, type Guide } from './schema.ts';

const ACTOR = { agent: '🤖 Agent', you: '👤 You', provider: '⏳ Provider' } as const;
const CONF = { tested: 'tested', official: 'official docs', reported: 'community reports', inferred: 'inferred' } as const;
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

const refs = (ids: string[], c: keyof typeof CONF) => ` _(${CONF[c]}${ids.length ? `: ${ids.join(', ')}` : ''})_`;

/** A self-contained Markdown version of a guide, for pasting into docs, tickets or an agent. */
export function guideToMarkdown(g: Guide, url?: string): string {
  const v = g.verdict;
  const out: string[] = [];
  out.push(`# ${g.app.name}: OAuth app setup & approval guide`);
  out.push(
    `> ${v.headline}\n>\n> **${DIFFICULTY_INFO[v.difficulty].label}** · hands-on ${v.handsOnEffort.label} · first connection ${v.timeToFirstConnection.label} · production ${v.timeToProduction.label} · cost: ${v.cost}`,
  );
  if (url) out.push(`Live version: ${url}`);
  out.push(`_${g.meta.generator === 'library' ? 'Library guide' : 'Generated live by the research agent'} · ${g.meta.generatedAt.slice(0, 10)}${g.evidence.verification ? ` · reviewed ${g.evidence.verification.reviewedAt.slice(0, 10)}` : ''}_`);

  const dur = (d: Guide['verdict']['handsOnEffort']) => `${d.label}${d.basis ? ` (${d.basis})` : ''}`;
  out.push(
    `## Verdict\n\n${v.summary}\n\n- **Your hands-on work:** ${dur(v.handsOnEffort)}\n- **First test connection:** ${dur(v.timeToFirstConnection)}\n- **Any user can connect:** ${dur(v.timeToProduction)}\n- **Cost:** ${v.costDetail ?? v.cost}\n- **Longest pole:** ${v.longestPole}\n- **Assumes:** ${g.assumption}`,
  );
  if (v.easierPaths.length) out.push(`**Easier paths**\n\n${v.easierPaths.map((e) => `- If ${e.condition}: ${e.effect}`).join('\n')}`);

  const managed =
    g.composio.managedOAuth === 'available'
      ? `Composio has a **managed OAuth app** for \`${g.composio.toolkitSlug}\`, so you can prototype without any of this. You need your own app for your branding on the consent screen, custom scopes, or a dedicated quota.`
      : g.composio.managedOAuth === 'not-available'
        ? `Composio has **no managed OAuth app** for \`${g.composio.toolkitSlug}\`. Nobody can connect until you register your own.`
        : `This app is not in Composio's toolkit catalog.`;
  out.push(`## Do you need your own OAuth app?\n\n${managed}`);

  out.push(
    `## Why this rating\n\n| Factor | Answer | Detail |\n|---|---|---|\n${g.factors
      .map((f) => `| ${FACTOR_LABEL[f.key] ?? f.key} | ${f.value} | ${f.detail.replace(/\|/g, '\\|')}${refs(f.sourceIds, f.confidence)} |`)
      .join('\n')}`,
  );

  out.push('## Step by step');
  for (const p of g.phases) {
    out.push(`### ${p.title}\n\n_Outcome: ${p.outcome}_`);
    for (const s of p.steps) {
      const meta = [ACTOR[s.actor], s.effort, s.wait ? `then wait ${s.wait}` : ''].filter(Boolean).join(' · ');
      let block = `- [ ] **${s.title}** — ${meta}${refs(s.sourceIds, s.confidence)}\n\n  ${s.details.replace(/\n/g, '\n  ')}`;
      if (s.agentAssist) block += `\n\n  🤖 _Agent can help:_ ${s.agentAssist}`;
      if (s.links.length) block += `\n\n  ${s.links.map((l) => `[${l.label}](${l.url})`).join(' · ')}`;
      out.push(block);
    }
  }

  if (g.requirements.length) {
    out.push(
      `## What you need ready\n\n${g.requirements.map((r) => `- [ ] **${r.item}** (for ${r.neededFor}): ${r.detail}${refs(r.sourceIds, r.confidence)}`).join('\n')}`,
    );
  }
  if (g.scopes.length) {
    out.push(
      `## Scopes\n\n| Scope | Purpose | Tier |\n|---|---|---|\n${g.scopes.map((s) => `| \`${s.scope}\` | ${s.purpose} | ${s.tier} |`).join('\n')}`,
    );
  }
  if (g.blockers.length) {
    out.push(
      `## Blockers and how to proceed\n\n${g.blockers
        .map(
          (b) =>
            `### ${b.title} (${b.likelihood})\n\n- **You'll see:** ${b.symptom}\n- **What to do:** ${b.howToProceed}${b.escalation ? `\n- **Escalate:** [${b.escalation.label}](${b.escalation.url})` : ''}${refs(b.sourceIds, b.confidence)}`,
        )
        .join('\n\n')}`,
    );
  }
  if (g.nuances.length) out.push(`## Nuances\n\n${g.nuances.map((n) => `- **${n.title}.** ${n.detail}${refs(n.sourceIds, n.confidence)}`).join('\n')}`);

  out.push(
    `## Wire it into Composio\n\nRedirect URI to register with ${g.app.name}: \`${g.composioSetup.redirectUri}\`\n\n${g.composioSetup.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}${
      g.composio.requiredFields.length ? `\n\nExtra connection fields: ${g.composio.requiredFields.map((f) => `\`${f.name}\` (${f.description})`).join(', ')}` : ''
    }${g.composio.notes.length ? `\n\n${g.composio.notes.map((n) => `- ${n}`).join('\n')}` : ''}`,
  );

  const ev = g.evidence;
  out.push(`## Evidence\n\n### Sources\n\n${ev.sources.map((s) => `- **${s.id}** [${s.title}](${s.url}) (${s.kind})${s.note ? `: ${s.note}` : ''}`).join('\n')}`);
  if (ev.probes.length) out.push(`### Setup attempts (probes)\n\n${ev.probes.map((p) => `- **${p.id}** \`${p.target.slice(0, 160)}\` → **${p.result}**: ${p.summary}`).join('\n')}`);
  if (ev.openQuestions.length) out.push(`### Open questions\n\n${ev.openQuestions.map((q) => `- **${q.question}** ${q.whyItMatters} _Resolve: ${q.howToResolve}_`).join('\n')}`);
  if (ev.verification) {
    out.push(
      `### Verification (${ev.verification.reviewedAt.slice(0, 10)})\n\n${ev.verification.method}\n\n${ev.verification.items
        .map((i) => `- **${i.outcome}:** ${i.claim} — ${i.note}`)
        .join('\n')}`,
    );
  }
  return out.join('\n\n') + '\n';
}
