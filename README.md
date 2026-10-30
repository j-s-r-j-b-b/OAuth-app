# OAuth Runway

**Will your OAuth app take an hour, or two months of review?** For each app, OAuth Runway tells a developer building an agent on Composio three things:
- how much effort and calendar time it takes to get their own OAuth app created, approved and wired into Composio;
- what blocks approval, and what to do about it;
- which steps an agent can do for them, and where they take over.

Every claim links to its source, or to a setup attempt we ran.

- **Live demo:** https://oauth-runway-nnmh.onrender.com (Render free tier; if it has been idle, the first load can take about a minute)
- **Library:** 12 researched and independently verified guides covering all difficulty levels: GitHub, X, Microsoft Graph, Gmail, Slack, Shopify, Xero, Meta Ads, Webflow, DocuSign, Spotify, Workday.
- **Catalog:** all 382 OAuth toolkits from [Composio's managed-auth directory](https://docs.composio.dev/toolkits/managed-auth).
- **Live generation:** type any app name or website. A research agent investigates it in about 1–3 minutes and publishes a shareable guide.
- **Product reasoning:** [docs/DECISIONS.md](docs/DECISIONS.md)

## The problem

When an agent's users connect an app, they authorize an **OAuth app**: one registration at the provider, holding the client ID and secret, redirect URI, scopes and the name shown on the consent screen. In Composio it becomes an **auth config**, and each user who approves it becomes a **connected account**.
- **Managed apps.** Composio provides the app for 124 toolkits.
- **Bring your own.** For the other 258, you register your own. You also need your own on managed toolkits once production needs your brand, your scopes or your own quota.

Registering takes minutes. Review, verification, security assessments, user caps, paid tiers and partner programs can take months, and nothing summarises them per app. That gap is this product's scope.

## What a guide gives you

- **A verdict.** A rating computed from eight factors by one rule (Self-serve, Light review, Formal review, Gated). Hands-on effort is shown separately from calendar time, and calendar time is split into *first test connection* and *any user can connect*. Longest pole, cost and easier paths are included.
- **A rating for your use case.** Pick a use case, such as "Send email only" or "Internal workspace only", or tick the scopes your agent needs. The page recomputes the rating with the same rule and shows what changes, such as "Security assessment: yes → no". Every library guide has 2–4 researched profiles; live guides get them too.
- **Your next step, at the top.** The first unfinished step, who does it, its effort, and what an agent can prepare. Mark it done and the next one appears.
- **"Stuck? Paste your error."** It matches error codes like `redirect_uri_mismatch` or `AADSTS900941` against the guide's known blockers, then gives an answer grounded in the guide's evidence, with citations.
- **A step-by-step plan.** Each step is tagged 🤖 Agent / 👤 You / ⏳ Provider, with notes on what an agent can prepare even when you must act. Progress is tracked in your browser.
- **A 🤖 agent brief.** One click copies a brief for Claude Code or Cursor: what the agent should do now, which review materials and scope justifications to draft, the exact Composio wiring, and what to hand back to you.
- **What to have ready, scopes, blockers and how to proceed, and nuances.**
- **Composio wiring**, including a **tested setup attempt**: the exact redirect URI and default scopes Composio sends to the provider.
- **Evidence.** Sources, probes, open questions and the verification log. Every claim is labelled **tested / official / reported / inferred**.
- **Exports:** a shareable link, Markdown (`/guides/<slug>.md`), print, and an agent-readable index at `/llms.txt`.

## What we tested, and what it found

- **Setup attempts through Composio** (`npm run connect-probe`). For every library app we created a throwaway custom auth config with a dummy client, started a connection, followed the redirect to the provider, and deleted both. Findings:
  - **Composio sends `https://backend.composio.dev/api/v1/auth-apps/add` as the redirect URI by default, not the v3 callback in its API docs.** The v3 URL is sent only when the auth config sets `oauth_redirect_uri`. A developer who registers the documented URL gets `redirect_uri_mismatch`.
  - **Default scopes can trigger heavier review.** For Gmail, the defaults include `https://mail.google.com/` (restricted, so the CASA security assessment applies) and People API scopes such as birthday, addresses and phone numbers. For Slack, they are 47 user scopes.
- **Provider probes** (`npm run replay`). 55+ read-only requests check discovery documents, authorize endpoints with a fake client (for example Google's "OAuth client was not found" and Microsoft's `AADSTS700038`), and developer-portal sign-in walls. That wall is where a human takes over.
- **Independent verification.** A second agent re-checked every library guide, using a different model with a fresh context and an adversarial brief. It re-read the cited sources for the most decision-critical claims, re-ran probes and fixed what didn't hold. **108 claims checked across 12 guides: 66 confirmed, 27 corrected and fixed, 15 unverifiable (downgraded and logged as open questions).** The biggest correction was a fresh policy change the research missed: Workday's October 2026 personal developer tenants. Most other corrections were about over-confident attribution. Every item is in [docs/VERIFICATION.md](docs/VERIFICATION.md) and on each guide.
- **The live agent, evaluated against the verified library** ([docs/LIVE_EVAL.md](docs/LIVE_EVAL.md)). It was run on Slack, Xero and Spotify in rounds 1–4, then on 7 apps in round 5, compared on rating, production range and the 8 factors, and each round's real failures drove the next fix:

  | Round | Change | Rating matches library | Factors agree |
  |---|---|---|---|
  | 1 | Baseline | 3/3 | 15/24 |
  | 2 | Pricing search, ≥4 page reads before finishing | 2/3 | 16/24 |
  | 3 | Gotcha checklist from the library, stronger writing model, Composio setup attempt | 1/3 | 16/24 |
  | 4 | Explicit factor definitions: eligibility thresholds count as a gate, and review means any approval needed for full access | 3/3 | 19/24 |
  | 5 | An automated verifier pass; widened to **7 apps** (adds Gmail, GitHub, Webflow, Shopify) | **6/7** | **43/56 (77%)** |

  - **What I learned.** Most errors came from ambiguous factor definitions, not missing facts. Spotify's 250k-MAU bar wasn't counted as a gate, and Slack's Marketplace approval for full rate limits wasn't counted as review. Defining the factors precisely fixed both.
  - **Fixed in code along the way:** hours re-derived from their own labels, "tested" allowed only on probe-confirmable claims, review waits split into Provider steps.
  - **The one round-5 miss** is Webflow: rated light review against the library's formal review, one level off, with overlapping timelines.
  - **The verifier pass** re-reads cited source text. Across 7 runs it confirmed 65 claims, corrected none, and flagged 5 as unverifiable, which were downgraded. It is a guard against unsupported claims, not a second opinion.
  - **Caveats:** seven apps is still a small sample, and runs vary. Live guides are labelled "auto-checked, not human-reviewed", and link to the verified guide when one exists.

**Findings for Composio itself:**
- the redirect-URI mismatch above;
- several `composio.dev/auth/*` guides contradict the API docs;
- the Xero guide suggests broad scopes that apps created after March 2026 can't request;
- Shopify's App Store rules forbid asking merchants for their shop domain, which Composio's connect flow does;
- Gmail's default custom-auth scopes force Google's heaviest review.

## Run it

```bash
npm install
cp .env.example .env      # LLM_API_KEY (free: aistudio.google.com/apikey) and COMPOSIO_API_KEY
npm run dev               # http://localhost:8787
```

Library guides work without keys. Live generation needs both keys.

| Script | What it does |
|---|---|
| `npm run validate` | Schema and lint checks for every guide: citations resolve, "tested" cites a probe, the rating matches its factors |
| `npm run connect-probe` | The Composio setup attempt for every library app (needs `COMPOSIO_API_KEY`); writes `composioSetup.tested` |
| `npm run replay` | Re-runs every recorded provider probe and flags stale evidence |
| `npm run generate -- "<app>"` | Runs the live agent from the command line |
| `npm run live-eval` | Compares live guides in `docs/live-eval/` with the verified library |
| `npm run smoke` | End-to-end test of live generation with no LLM key: a scripted model drives the real server, tools and checks (12 assertions) |
| `npm run report` | Regenerates `docs/VERIFICATION.md` |
| `npm run build && npm start` | Production build |

**Deploy.** On Render (what the demo uses), choose **New → Web Service** with this repo. Set build to `npm ci --include=dev && npm run build`, start to `npm start`, and the health check to `/api/health`, then add `LLM_API_KEY`, `COMPOSIO_API_KEY` and optionally `LLM_COMPOSE_MODEL`. [`render.yaml`](render.yaml) has the same settings as a Blueprint. [`keepalive.yml`](.github/workflows/keepalive.yml) pings the app every 10 minutes when the repo variable `APP_URL` is set. Any host with a persistent disk works too; set `DATA_DIR`, or attach a Railway volume.

**Integration endpoints** (how this would plug into Composio; see [docs/DECISIONS.md](docs/DECISIONS.md#where-this-lives-in-composio)):
- `GET /api/readiness/:toolkitSlug`: a readiness summary for the dashboard's "use your own credentials" moment;
- `POST /api/guides/:slug/ask`: the "paste your error" helper;
- `GET /api/demand`: which apps developers want, which decides what gets deep-researched next;
- `/guides/<slug>.md` and `/llms.txt` for coding agents.

## How it's built

`shared/schema.ts` is the guide format, the rating rule and the lint rules: the single source of truth. `server/agent/` is the live research agent:
- identify the app;
- check Composio's catalog and run the setup attempt;
- research by search, read, probe and save findings;
- write in two structured passes;
- apply deterministic evidence checks.

`server/composio.ts` covers Composio Search, toolkit metadata and the connect probe. `server/net.ts` provides outbound HTTP with SSRF protection. `web/src/` is the React UI. `data/library/` holds the 12 guides, and `docs/` holds the protocol, decisions, verification and evaluation.

## Limitations

- **No logged-in setup.** The agents never create provider accounts or log in, so console labels come from docs and third-party walkthroughs, labelled as such. The Composio setup attempt stops at the provider's sign-in page.
- **Verification is sampled.** 8–9 decision-critical claims per guide were re-checked, not all ~50. Agents verified; no human did. Review timelines are often community-reported and vary.
- **Live guides are fast first drafts** on a free model. They're checked automatically, they vary between runs, and they miss changelog-level nuance (Slack). Free-tier limits are about 500 model calls a day, roughly 35 guides; the server allows 6 new guides per visitor per hour.
- **Free hosting.** Guides generated on the demo live on an ephemeral disk until the next deploy. The library and the evaluated live guides are always loaded.
- **Ratings follow a fixed rule.** Edge cases are explained in the factor details rather than overridden, for example Microsoft's free partner program isn't counted as a gate.
