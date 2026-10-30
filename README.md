# OAuth Runway

**Will your OAuth app take an hour, or two months of review?** For each app, OAuth Runway tells a developer building an agent on Composio:
- how much effort and calendar time it takes to get their own OAuth app created, approved and wired into Composio;
- what blocks approval, and what to do about it;
- which steps an agent can do for them.

Every claim links to its source or to a probe we ran.

- **Live demo:** https://oauth-runway-nnmh.onrender.com (Render free tier; if it has been idle, the first load can take about a minute)
- **Library:** 10 researched and independently verified guides: Gmail, Slack, Shopify, X, Xero, DocuSign, Meta Ads, Microsoft Graph, Spotify, Workday.
- **Catalog:** all 382 OAuth toolkits from [Composio's managed-auth directory](https://docs.composio.dev/toolkits/managed-auth).
- **Live generation:** type any app name or website. A research agent investigates it in about 2–4 minutes and publishes a shareable guide.

## The problem, as I understood it

When an agent's users connect an app, they authorize an **OAuth app**: one registration at the provider, holding the client ID and secret, redirect URI, scopes and the name shown on the consent screen. In Composio that registration becomes an **auth config** (`ac_…`), and each user who approves it becomes a **connected account**.

- **Composio-managed apps.** Composio provides the app for 124 toolkits, which is enough for prototyping.
- **Bring your own app.** For the other 258, you register your own before anyone can connect. You also need your own in production on managed toolkits if you want your brand on the consent screen, custom scopes, your own quota or faster polling.

Registering takes minutes. The hard part is everything after it: provider review, business verification, security assessments, user caps, paid tiers and partner programs. Composio's existing [setup guides](https://composio.dev/auth) cover the console clicks for 46 apps but rarely cover any of that. So **the product focuses on the path to production approval**, and treats the click-path as one phase among several.

## Key decisions

1. **Each guide answers five questions.**
   - How hard is it, and how long until (a) I can connect my own account and (b) any user can connect?
   - What do I do next?
   - What do I need ready?
   - What blocks me, and how do I proceed?
   - How do I wire it into Composio?

   Hands-on effort and calendar wait are kept separate, because an hour of work can still mean six weeks of waiting.
2. **One schema for every guide** ([`shared/schema.ts`](shared/schema.ts)), not free-form prose. This makes apps comparable: the runway chart on the home page sorts apps by time to production on a log scale. It also gives an exportable Markdown version (`/guides/<slug>.md`) and an agent-readable index (`/llms.txt`).
3. **Ratings follow a rule.** A guide records eight factors: self-serve sign-up, review, business verification, security assessment, paid access, partner or sales gate, user cap, and per-customer setup. `deriveDifficulty()` turns them into Self-serve, Light review, Formal review or Gated. The writer can't pick a rating, so the labels mean the same thing everywhere. Cost is shown separately from difficulty; X is self-serve but pay-per-use.
4. **Each step says who does it.**
   - 🤖 **Agent:** no login, legal acceptance or payment involved.
   - 👤 **You:** sign-ins, agreements, documents, payment, judgment.
   - ⏳ **Provider:** a review you can only wait for.

   Even on 👤 steps, an "agent can help" note says what an agent can prepare, such as drafting scope justifications, pre-filling values or checking the result.
5. **Evidence is part of the product.**
   - Every factor, step, requirement, scope, blocker and nuance cites `S#` sources and `P#` probes.
   - Every claim carries a label: **tested**, **official**, **reported** (community) or **inferred**.
   - **Probes** are real, read-only setup attempts. For example, an authorize request with a fake client and Composio's redirect URI returns Google's "OAuth client was not found" or Microsoft's `AADSTS700038`, which shows the endpoint is live and what a misconfigured app sees. Probes also find where the developer portal puts up a login wall, which is exactly where a human has to take over.
6. **Agents are used where they are strong, and checked where they are weak.**
   - **Library:** research agents, one per app, followed a written [protocol](docs/RESEARCH_PROTOCOL.md). A *different* model then verified each guide adversarially and fixed what was wrong (see [verification](#what-was-tested-and-verified)).
   - **Live generation:** a smaller agent identifies the app, pulls Composio facts, then runs a research loop of search, read, probe and save findings. It writes in two structured passes, and the server checks the result before publishing it:
     - citations to pages it never retrieved are dropped;
     - "tested" without a probe is downgraded, and so is "tested" on claims no probe can confirm (scopes, review times);
     - "official" backed only by community sources becomes "reported";
     - hours that contradict their own label are corrected from the label (models write "3–6 weeks" reliably but convert it to hours badly);
     - review waits become their own "Provider" step, and creating the Composio auth config is marked "Agent";
     - the rating is recomputed.

     These rules came from running the agent on real apps and looking at what it got wrong (see [Live agent evaluation](#live-agent-evaluation)).

     The full agent trace is published with the guide.
7. **Built on Composio, on a free stack.** The live agent's web search and page reading are [Composio Search](https://docs.composio.dev/toolkits/composio_search) tools, run with a Composio API key. The LLM is any OpenAI-compatible endpoint; the default is Google Gemini's free tier.

## What the research found

The full table and per-guide evidence counts are in [docs/VERIFICATION.md](docs/VERIFICATION.md).

- **Registration is never the hard part; distribution is.** All 10 apps let you connect your own account within hours. Time until any user can connect ranges from about 1–3 days for X to months for Slack, Xero and Spotify. For Workday it depends on each customer.
- **Many gates aren't reviews.**
  - **Usage thresholds before you can even apply:** 10 active workspaces for Slack Marketplace, about 10 live customer orgs for Xero certification, 500 successful calls for Meta's Full tier.
  - **Paid tiers:** X pay-per-use, Xero connection tiers.
  - **Partner programs and customer gates:** DocuSign for multi-customer apps; Spotify, which needs 250k+ MAU; Workday, where each customer's admin registers your client in their own tenant.
- **Policies changed a lot in 2025–2026**, so guides go stale fast.
  - Slack throttles reads for apps outside the Marketplace (May 2025).
  - X dropped its free tier for pay-per-use (Feb 2026).
  - Spotify limited development mode to 5 users and required Premium for app owners (Feb 2026).
  - Xero introduced paid tiers and granular scopes (Mar 2026).
  - Meta renamed its access tiers (May 2026).

  `npm run replay` re-runs every probe so evidence drift can be detected.
- **Issues for Composio's own docs.** These are reported by the research agents, and the guides include workarounds.
  - Several `composio.dev/auth/*` guides (Gmail, X, Workday, DocuSign) still show the legacy callback `…/api/v1/auth-apps/add`; the API docs use `…/api/v3/toolkits/auth/callback`.
  - The Xero guide suggests broad scopes that apps created after March 2026 can't request.
  - Google's verification wants redirect domains you own, so `backend.composio.dev` likely needs the white-label redirect proxy.
  - Shopify's App Store rules forbid asking merchants to type their shop domain, which Composio's connect flow does.

## What was tested and verified

- **Probes:** 55 read-only setup attempts across the library. `npm run replay` re-ran 45 of them on 2026-10-29, and none were stale. The other 10 aren't replayable: they need a Composio key or their target isn't a single URL.
- **Independent verification:** a second agent re-checked every library guide. It used a different model (Sonnet, where the researchers used Opus), a fresh context and an adversarial brief ("find what is wrong"). It re-read the cited sources for the 8–9 most decision-critical claims per guide, re-ran probes, and fixed the guide where a source disagreed. **Of 90 claims checked, 53 were confirmed, 24 corrected and 13 unverifiable.** Unverifiable claims were downgraded to "reported" or "inferred" and given an open question. Every item is listed in [docs/VERIFICATION.md](docs/VERIFICATION.md) and on each guide's Evidence section. What the corrections taught me:
  - **The biggest correction was a fresh policy change the research agent missed.** Its Workday guide said there was no self-serve route to a tenant. The verifier found Workday's October 2026 developer program, which lets an individual request a personal dev tenant (open beta). The guide's first-connection path changed; its rating stayed "gated", because production still needs each customer's admin.
  - **Most corrections were over-confident attribution, not wrong facts.** A third-party claim was marked "official" (X's "no free tier"), a date was stated more precisely than its source (Meta's "retired on Oct 9"), or a rule was over-generalised (Spotify's 5-user cap applying "only to new apps"). Two duration ranges also had hour bounds that contradicted their labels.
  - **Timelines are the weakest evidence.** For Xero, DocuSign, Spotify and Workday the production range rests on estimates, because the providers publish no review SLA. The guides now say "estimate" explicitly.
- **Live agent:** evaluated against the verified library; see the next section.

## Live agent evaluation

The live agent runs on the free Gemini 3.5 Flash Lite tier with Composio Search, in about 1–2 minutes and 6–9 model calls per guide. I evaluated it by generating guides for three apps that already have verified library guides (Slack, Xero, Spotify), plus two that don't (Pipedrive, Calendly), and comparing the decision-level outputs: rating, production range, and the 8 factors. `npm run live-eval` reproduces the table in [docs/LIVE_EVAL.md](docs/LIVE_EVAL.md). Round-1 outputs are kept in `docs/live-eval/round-1/`.

| Round | What changed | Rating matches library | Production ranges overlap | Factors agree |
|---|---|---|---|---|
| 1 | Baseline | 3/3 | 3/3 | 15/24 |
| 2 | Pricing search added; must read ≥4 pages before finishing | 2/3 | 2/3 | 18/24 |
| 3 (Slack only) | Asks explicitly what changes for unlisted / unapproved apps | Slack still wrong | | 16/24 overall |

What this shows:
- **Headline answers are usually right; nuance is where it fails.** Spotify's 250k-MAU gate and Xero's certification path came through every round. The most-missed facts were paid gates. Adding a pricing search fixed Xero's tiers, but Spotify's Premium requirement for app owners was still missed.
- **Slack is the instructive miss.** Taken literally, Slack needs no review: any workspace can install an unlisted app. What makes it a months-long path is the read throttle for apps outside the Marketplace and API terms that reserve commercial distribution for Marketplace apps, both found only in Slack's changelog and terms. The library research found them; the live agent read the right review guide but never looked at the changelog. Prompting more specifically would only be overfitting to Slack.
- **Runs vary.** The same app can land on different ratings across runs, because a small model doing one minute of research is sensitive to which pages it happens to read.
- **Bugs found by running on real apps, and fixed in code rather than prompts:**
  - hours contradicting their label ("3–6 weeks" stored as 3–14 days), which changed the rating;
  - "tested" labels on claims no probe can confirm;
  - every step attributed to "You".

**Product consequence:** live guides are labelled "auto-checked, not human-reviewed" and are meant as a fast first answer. The path to library quality is a deep research pass plus an independent verifier, which is what the 10 library guides went through. A stronger model (`LLM_MODEL`, any OpenAI-compatible endpoint) is the cheapest upgrade.

## Run it locally

```bash
npm install
cp .env.example .env      # add LLM_API_KEY (free at aistudio.google.com/apikey) and COMPOSIO_API_KEY
npm run dev               # http://localhost:8787
```

Library guides work with no keys at all; only live generation needs them.

| Script | What it does |
|---|---|
| `npm run validate` | Schema and lint checks for every library guide: citations resolve, "tested" cites a probe, the rating matches its factors, labels are short |
| `npm run replay` | Re-runs every recorded probe against the providers and flags stale evidence |
| `npm run smoke` | End-to-end test of live generation with no LLM key. A scripted fake model drives the real server, tools and probes, and 12 checks run on the result: citations to unknown ids dropped, `javascript:` links removed, ratings recomputed, the stream, storage and export |
| `npm run report` | Regenerates `docs/VERIFICATION.md` from the guides |
| `npm run catalog` | Refreshes the 382-toolkit catalog from Composio's docs |
| `npm run build && npm start` | Production build (Vite app and bundled Express server) |

## Deploy

**Render (free, what the demo uses).** In Render, choose **New → Blueprint** and pick this repo. [`render.yaml`](render.yaml) defines a free Node web service, and Render asks for `LLM_API_KEY` and `COMPOSIO_API_KEY`.
- **Sleep:** free services sleep after 15 minutes idle, and waking takes about a minute. [`keepalive.yml`](.github/workflows/keepalive.yml) pings the app every 10 minutes once you set the repo variable `APP_URL`.
- **Storage:** the free disk is wiped on every restart or redeploy, so guides generated on the deployed site are temporary there. The evaluated live guides in `docs/live-eval/` are loaded at startup, so the site always shows real live-agent output.

**Railway (or any host with a persistent disk).** Deploy from GitHub; [`railway.json`](railway.json) sets the build, start and health check.
- Set the same two variables.
- Attach a Volume; the app picks up `RAILWAY_VOLUME_MOUNT_PATH` automatically, and `DATA_DIR` overrides it.
- Then go to **Settings → Networking → Generate Domain**.

Optional variables: `LLM_MODEL`, `LLM_BASE_URL` (any OpenAI-compatible endpoint), `GENERATE_LIMIT_PER_HOUR` (default 6 per IP).

## How it's built

```
shared/schema.ts        guide format, rating rule, lint rules        (single source of truth)
shared/markdown.ts      Markdown export
server/agent/           live research agent: pipeline, tools, probes, evidence registry, prompts
server/composio.ts      Composio Search (web search + page extraction) and toolkit metadata
server/net.ts           outbound HTTP with SSRF protection (agent-chosen URLs never reach private networks)
server/index.ts         Express API, SSE job streams, .md / llms.txt exports, SPA with per-guide meta tags
web/src/                React UI: home (runway chart + catalog), guide page, live generation view, method page
data/library/           the 10 researched guides (JSON)
docs/                   research protocol, verification report
```

## Limitations

- **No authenticated setup attempts.** The agents don't create accounts or log in. Probes stop at login walls, so console labels come from docs and third-party walkthroughs, and are marked as such.
- **Verification is sampled.** Verifiers re-checked 7–9 decision-critical claims per guide, not all ~50. Review timelines are often community-reported and vary a lot.
- **Live guides are a fast first draft.** They come from a free-tier model in a few minutes. They're automatically checked but not human-reviewed, and labelled that way. Free-tier rate limits can slow or queue generations. The server throttles requests and allows 6 new guides per IP per hour.
- **Search needs the Composio key.** Without it, the agent falls back to DuckDuckGo's keyless HTML endpoint, which answers repeated server-side queries with a bot challenge. The job then continues with fewer sources and says so in its trace.
- **Ratings use a fixed rule.** Edge cases are explained in the factor details rather than overridden. For example, Microsoft's partner program is free and self-serve, so it isn't counted as a "gate".
- **Operational shortcuts:**
  - Jobs live in memory in a single process.
  - Generated guides are JSON files on a volume.
  - The SSRF guard resolves DNS before connecting but doesn't pin the address, so DNS rebinding isn't fully covered.
