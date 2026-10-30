# Product decisions

## The user and the job

**Who:** a developer building an AI agent product on Composio. Their users, not just themselves, need to connect App X.

**The job:** "Tell me whether getting my OAuth app approved for X takes an hour or a quarter, what I must have ready, what will block me, and what I should do next. Then help me make progress on it."

**Why it's painful today:** registering an OAuth app takes minutes. What makes launches slip comes after, and is spread across docs pages, policy pages, changelogs and forum threads:
- provider review, business verification and security assessments;
- user caps in development mode, connection caps tied to paid tiers, partner programs;
- usage thresholds you must hit before you're even allowed to apply.

Composio's own [setup guides](https://composio.dev/auth) cover the console clicks for 49 apps, but not this.

## Scope: the path to production approval, for any app

| Decision | Why |
|---|---|
| Focus on everything *after* registration: review, verification, caps, costs and blockers. Registration is one phase among six. | That's where the uncertainty and the weeks are. The click-path already exists. |
| Answer five questions for every app: how hard and how long, what next, what to have ready, what blocks me, how to wire it into Composio. | These are the questions the brief lists, and they're answerable the same way for every provider. |
| Two timelines (first test connection vs. any user can connect), kept separate from hands-on effort. | "Works for me in an hour" and "works for customers in 2 months" are both true for most apps. Conflating them is the core confusion. |
| A rating computed from eight factors by one rule, not chosen by the writer. | "Formal review" must mean the same thing for Gmail and for an app nobody has reviewed yet. It also keeps guides comparable and sortable. |
| Each step tagged Agent / You / Provider, with "an agent can help" notes, plus a copyable **agent brief**. | The brief asks what an agent can do and where the developer takes over. The brief turns the guide into progress. |
| Evidence on every claim (tested / official / reported / inferred) and published probes. | The answer is only as useful as the developer's ability to trust it, and to check it when the stakes are high. |
| A deep library plus fast live generation, and an honest label on which is which. | A 1–3 minute agent can't match hours of research plus an independent check, so the product says which is which. |

## How agents are used, and checked

1. **Research agents** (one per library app) follow a written [protocol](RESEARCH_PROTOCOL.md). They read official docs and policies, changelogs and community reports, and run read-only probes against the provider.
2. **Verifier agents** use a different model with a fresh context and an adversarial brief ("find what's wrong"). They re-read the cited sources for each guide's most decision-critical claims and fix what doesn't hold.
3. **Setup attempts through Composio.** For every library app, the system creates a throwaway custom auth config with a dummy client, starts a connection, and follows Composio's redirect to the provider, then deletes everything. This shows exactly which redirect URI and default scopes reach the provider. It found that the redirect URI in Composio's API docs isn't what Composio sends by default, and that the default Gmail scopes include full mailbox access.
4. **The live agent** runs the same loop on a free model in about one to three minutes. Deterministic code then checks what the model can't be trusted to do:
   - it drops citations to pages that were never retrieved;
   - it downgrades "tested" labels on claims no probe can confirm;
   - it re-derives hours from labels;
   - it recomputes the rating.

   Every run publishes its full trace.
5. **The live agent is evaluated against the verified library** ([LIVE_EVAL.md](LIVE_EVAL.md)). Real failures drove the fixes, and the failures that remain are reported.

## Where this lives in Composio

The developer's moment of need is predictable, so the guide should meet them there rather than wait to be found:

| Moment | Surface | Built here as |
|---|---|---|
| Picking toolkits for an agent | Toolkit page and catalog: show the rating and "time until any user can connect" next to "Composio-managed OAuth available?" | `GET /api/readiness/:toolkitSlug` (a compact summary for any surface) |
| Clicking **Create Auth Config → Use your own credentials** | An inline panel: redirect URI to register (tested), default scopes and their review impact, first step, top blockers | Readiness API + the guide's "Tested setup attempt" card |
| A coding agent setting up the integration | The skill or MCP context the agent already reads | `/guides/<slug>.md`, `/llms.txt`, and the per-guide agent brief |
| A connection failing (`redirect_uri_mismatch`, `AADSTS…`) | Error page, support or the knowledge base: "Paste your error" | `POST /api/guides/:slug/ask` (blocker match plus a cited answer) |

## Rollout

1. **Weeks 1–2:** deep, verified guides for the 20 most-used bring-your-own toolkits, plus Gmail, Slack and Microsoft, where managed users move to their own app at launch. Ship them as docs pages and the readiness panel.
2. **Weeks 3–6:** turn on live generation for the long tail. Each live guide is labelled, and demand (`/api/demand`) decides which ones get a deep pass next.
3. **Ongoing:** weekly `replay` and `connect-probe`. A changed probe or a moved provider changelog triggers re-research, and "last verified" is shown on every guide.

## Risks and how they're handled

| Risk | Mitigation |
|---|---|
| Stale or wrong advice costs a developer weeks | Evidence labels on every claim, a verifier pass, probe replay, a visible "last verified" date, and live guides labelled as drafts |
| The agent over-claims certainty | Deterministic checks the model can't skip: citations must resolve, "tested" needs a probe, the rating is computed and not chosen |
| Probing providers looks like abuse | No accounts, logins or form posts, a fake client ID that's obviously a probe, and GETs apart from one POST of a bogus code to Webflow's token endpoint |
| Setup attempts leave debris in a Composio project | Throwaway auth configs and connections are deleted in a `finally` block |
| Costs at scale | 9–13 free-tier model calls and about 15 Composio search and page-read calls per live guide (7-app evaluation). Deep guides cost more and are reserved for demand. |

## How we'd know it works

| Metric | Target | Why |
|---|---|---|
| Median time from guide view to first ACTIVE custom-auth connection | < 1 day for self-serve apps | It's the job: get to a working connection |
| Share of guide users who submit a provider review on their first try without rejection | +20 pts vs. those without a guide | Measures whether the requirements and blockers sections actually prevent rework |
| `redirect_uri_mismatch` failures on new custom auth configs | −80% | Directly addressed by the tested redirect URI |
| Share of claims in top-20 guides labelled tested or official | ≥ 85% | Evidence quality |
| Live guides that matched a later deep review on the rating | ≥ 80% | Live-agent accuracy at scale, the same comparison as LIVE_EVAL.md |

## What I would build next

- **Scale to 100 guides.** Batch-generate guides for Composio's 258 bring-your-own toolkits with the deep pipeline, prioritised by toolkit usage. Then run the verifier on every guide and have a person review the top 20.
- **Freshness.** Schedule `npm run replay` and `npm run connect-probe` weekly. Re-research a guide when a probe changes or the provider's changelog moves, and show "last verified" prominently.
- **Close the loop with real setups.** Let developers who finish a guide report actual review times and rejection reasons. That turns "reported" timelines into data.
- **Fix Composio's side.** Make the redirect URI shown in docs match what configs send, scope down default scopes for bring-your-own-app configs (Gmail's restricted scope triggers a security assessment), and support Shopify's install-from-App-Store flow.
