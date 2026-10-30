# Product decisions

## The user and the job

**Who:** a developer building an AI agent product on Composio. Their users, not just themselves, need to connect App X.

**The job:** "Tell me whether getting my OAuth app approved for X takes an hour or a quarter, what I must have ready, what will block me, and what I should do next. Then help me make progress on it."

**Why it's painful today:** registering an OAuth app takes minutes. What makes launches slip comes after, and is spread across docs pages, policy pages, changelogs and forum threads:
- provider review, business verification and security assessments;
- user caps in development mode, connection caps tied to paid tiers, partner programs;
- usage thresholds you must hit before you're even allowed to apply.

Composio's own [setup guides](https://composio.dev/auth) cover the console clicks for 46 apps, but not this.

## Scope: the path to production approval, for any app

| Decision | Why |
|---|---|
| Focus on everything *after* registration: review, verification, caps, costs and blockers. Registration is one phase among six. | That's where the uncertainty and the weeks are. The click-path already exists. |
| Answer five questions for every app: how hard and how long, what next, what to have ready, what blocks me, how to wire it into Composio. | These are the questions the brief lists, and they're answerable the same way for every provider. |
| Two timelines (first test connection vs. any user can connect), kept separate from hands-on effort. | "Works for me in an hour" and "works for customers in 2 months" are both true for most apps. Conflating them is the core confusion. |
| A rating computed from eight factors by one rule, not chosen by the writer. | "Formal review" must mean the same thing for Gmail and for an app nobody has reviewed yet. It also makes 100+ guides comparable and sortable. |
| Each step tagged Agent / You / Provider, with "an agent can help" notes, plus a copyable **agent brief**. | The brief asks what an agent can do and where the developer takes over. The brief turns the guide into progress. |
| Evidence on every claim (tested / official / reported / inferred) and published probes. | The answer is only as useful as the developer's ability to trust it, and to check it when the stakes are high. |
| A deep library plus fast live generation, and an honest label on which is which. | A one-minute agent can't match hours of research plus independent verification. The product says so, rather than hiding it. |

## How agents are used, and checked

1. **Research agents** (one per library app) follow a written [protocol](RESEARCH_PROTOCOL.md). They read official docs and policies, changelogs and community reports, and run read-only probes against the provider.
2. **Verifier agents** use a different model with a fresh context and an adversarial brief ("find what's wrong"). They re-read the cited sources for each guide's most decision-critical claims and fix what doesn't hold.
3. **Setup attempts through Composio.** For every app, the system creates a throwaway custom auth config with a dummy client, starts a connection, and follows Composio's redirect to the provider, then deletes everything. This shows exactly which redirect URI and default scopes reach the provider. It found that the redirect URI in Composio's API docs isn't what Composio sends by default, and that the default Gmail scopes include full mailbox access.
4. **The live agent** runs the same loop on a free model in about a minute. Deterministic code then checks what the model can't be trusted to do:
   - it drops citations to pages that were never retrieved;
   - it downgrades "tested" labels on claims no probe can confirm;
   - it re-derives hours from labels;
   - it recomputes the rating.

   Every run publishes its full trace.
5. **The live agent is evaluated against the verified library** ([LIVE_EVAL.md](LIVE_EVAL.md)). Real failures drove the fixes, and the failures that remain are reported.

## What I would build next

- **Scale to 100 guides.** Batch-generate guides for Composio's 258 bring-your-own toolkits with the deep pipeline, prioritised by toolkit usage. Then run the verifier on every guide and have a person review the top 20.
- **Freshness.** Schedule `npm run replay` and `npm run connect-probe` weekly. Re-research a guide when a probe changes or the provider's changelog moves, and show "last verified" prominently.
- **Close the loop with real setups.** Let developers who finish a guide report actual review times and rejection reasons. That turns "reported" timelines into data.
- **Fix Composio's side.** Make the redirect URI shown in docs match what configs send, scope down default scopes for bring-your-own-app configs (Gmail's restricted scope triggers a security assessment), and support Shopify's install-from-App-Store flow.
- **Metrics:** the share of guides with ≥ 1 tested claim; median time from guide view to first ACTIVE connection; and rejection rate for developers who followed the guide vs. those who didn't.
