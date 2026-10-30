import { COMPOSIO_REDIRECT_URI, type Guide } from './schema.ts';

/**
 * A brief a developer can hand to their coding agent (Claude Code, Cursor, …) to make
 * progress on the guide: what the agent should do now, what to draft for the human,
 * and the exact Composio wiring, without ever handling secrets in chat.
 */
export function guideToAgentBrief(g: Guide, url?: string): string {
  const steps = g.phases.flatMap((p) => p.steps);
  const agentSteps = steps.filter((s) => s.actor === 'agent');
  const humanSteps = steps.filter((s) => s.actor === 'you');
  const waits = steps.filter((s) => s.actor === 'provider');
  const assists = humanSteps.filter((s) => s.agentAssist);
  const slug = g.composio.toolkitSlug ?? '<toolkit_slug>';
  const redirect = g.composioSetup.tested?.redirectUri ?? g.composioSetup.redirectUri;
  const scopes = g.scopes.filter((s) => s.tier !== 'admin').map((s) => s.scope);
  const reviewDocs = g.requirements.filter((r) => r.neededFor === 'review' || r.neededFor === 'production');
  const L: string[] = [];

  L.push(`# Brief: get our ${g.app.name} OAuth app approved and wired into Composio`);
  L.push(
    `You are helping me ship ${g.app.name} connections for our AI agent product on Composio.${url ? ` The full guide, with sources, is at ${url} (Markdown: ${url}.md).` : ''} Read it first.`,
  );
  L.push(`**Where this is heading:** ${g.verdict.headline} Expect ${g.verdict.timeToProduction.label} until any user can connect; the longest pole is: ${g.verdict.longestPole}`);
  L.push(`**Ground rules:** never ask me to paste secrets into chat. Read \`${slug.toUpperCase()}_CLIENT_ID\`, \`${slug.toUpperCase()}_CLIENT_SECRET\` and \`COMPOSIO_API_KEY\` from the environment. Don't submit anything to ${g.app.name} on my behalf. Prepare it, and I review and submit.`);

  L.push('## Do now');
  let n = 1;
  for (const s of agentSteps) L.push(`${n++}. **${s.title}.** ${s.details.split('\n')[0]}`);
  for (const s of assists) L.push(`${n++}. **Prepare for "${s.title}":** ${s.agentAssist}`);
  if (reviewDocs.length) {
    L.push(
      `${n++}. **Draft the review materials** into \`docs/${slug}-review/\`: ${reviewDocs.map((r) => r.item).join('; ')}. Use the guide's requirements and blockers sections so the drafts answer what reviewers check.`,
    );
  }
  if (scopes.length) {
    L.push(
      `${n++}. **Write a one-line justification per scope** for the review form: ${scopes.map((s) => `\`${s}\``).join(', ')}. Flag any scope our code doesn't actually use, so we can drop it.`,
    );
  }

  L.push('## Wire it into Composio (once I have set the client ID and secret)');
  L.push(
    [
      '```ts',
      'import { Composio } from "@composio/core";',
      '',
      'const composio = new Composio(); // reads COMPOSIO_API_KEY',
      `const authConfig = await composio.authConfigs.create("${slug}", {`,
      '  type: "use_custom_auth",',
      '  authScheme: "OAUTH2",',
      `  name: "${g.app.name} (our app)",`,
      '  credentials: {',
      `    client_id: process.env.${slug.toUpperCase()}_CLIENT_ID!,`,
      `    client_secret: process.env.${slug.toUpperCase()}_CLIENT_SECRET!,`,
      `    oauth_redirect_uri: "${redirect}", // must match what is registered with ${g.app.name}`,
      scopes.length ? `    scopes: "${scopes.join(',')}", // least privilege; drop what we don't use` : '',
      '  },',
      '});',
      `// Then: composio.create(userId, { authConfigs: { ${slug}: authConfig.id } }) and session.authorize("${slug}")`,
      '```',
    ]
      .filter((l) => l !== '')
      .join('\n'),
  );
  L.push(
    `Tested behaviour: a custom auth config without \`oauth_redirect_uri\` sends \`${g.composioSetup.tested?.redirectUri ?? redirect}\`; setting it to \`${COMPOSIO_REDIRECT_URI}\` sends that instead. Whatever the config sends must exactly match the redirect URI registered with ${g.app.name}. After creating it, start one test connection with my account and confirm it reaches ACTIVE.`,
  );

  if (humanSteps.length) {
    L.push('## Hand back to me (needs my login, signature, documents or payment)');
    for (const s of humanSteps) L.push(`- ${s.title} (${s.effort})`);
  }
  if (waits.length) {
    L.push('## Waits to track');
    for (const s of waits) L.push(`- ${s.title}: ${s.wait ?? 'unknown'}. Remind me if there's no response by then.`);
  }
  if (g.blockers.length) {
    L.push('## If we hit a blocker');
    for (const b of g.blockers.slice(0, 5)) L.push(`- **${b.title}:** ${b.howToProceed}${b.escalation ? ` (escalate: ${b.escalation.url})` : ''}`);
  }
  return L.join('\n\n') + '\n';
}
