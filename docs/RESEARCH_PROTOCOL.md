# Research protocol

How a guide is researched, by the library agents and by the live agent alike. The output is one JSON document that validates against `shared/schema.ts`.

## 1. Frame the question

The reader is a developer building an AI agent product. Many of their users, not just themselves, need to connect **App X** through OAuth. They will register **their own OAuth app** with the provider ("bring your own app") and plug its client ID and secret into a Composio auth config. They might do this because Composio has no managed app for X, or because production needs their own consent-screen branding, scopes or quota.

Answer what they actually ask:

1. How hard is this, and how long until (a) I can connect my own test account and (b) any user can connect?
2. What do I do first, and then next? Which steps can an agent do, which need me, and where am I waiting on the provider?
3. What do I need ready (business entity, domain, privacy policy, demo video, paid plan…)?
4. What will block me, and what do I do when it does?
5. How do I wire the result into Composio?

State the **assumption** the ratings are based on. Pick a typical agent use case for that app, such as "an agent that reads and sends Gmail for any Google user". Then give **easier paths** for narrower cases, for example "if you only need sign-in scopes, no verification".

## 2. Research order

1. **Composio facts.** Read `https://docs.composio.dev/toolkits/<slug>.md` for auth schemes, managed-OAuth status and FAQ gotchas, and `https://composio.dev/auth/<app>` if a setup guide exists. Redirect URI (tested 2026-10-30): a custom auth config created without `oauth_redirect_uri` sends `https://backend.composio.dev/api/v1/auth-apps/add`; one that sets `oauth_redirect_uri` to `https://backend.composio.dev/api/v3/toolkits/auth/callback` sends that. Tell developers to register exactly what their auth config sends (both, where the provider allows several). `npm run connect-probe` records what Composio actually sends per toolkit.
2. **Provider's official docs.** Cover app registration, OAuth endpoints, scopes, distribution, publishing, review or verification, user and tenant caps before approval, rate limits, API pricing and access tiers, and developer terms. These are `official` sources.
3. **Real-world reports.** Use forums, Reddit, Stack Overflow, provider community boards and GitHub issues for actual review times, rejection reasons and surprises. These are `community` sources and must be labelled that way.
4. **Recency.** Today is late 2026. Prefer current pages and flag anything that recently changed or is announced to change. Never rely on memory for prices, quotas or timelines. Find a source or mark the claim `inferred` and add an open question.

## 3. Setup attempts (probes)

Probes are real HTTP requests, GET unless noted, that test parts of the setup without an account. Record each one in `evidence.probes` with the exact request and what came back.

| Probe | Request | What it establishes |
|---|---|---|
| `oauth-discovery` | `GET <issuer>/.well-known/openid-configuration` or `/.well-known/oauth-authorization-server` | Real authorize and token endpoints, PKCE support, published scopes, and whether dynamic client registration is offered |
| `authorize-endpoint` | `GET <authorize_url>?response_type=code&client_id=oauth-runway-probe&redirect_uri=<Composio callback>&scope=<typical>&state=probe` | The endpoint is live, and what error an unregistered or misconfigured app gets (and so what a correct setup must avoid) |
| `token-endpoint` | `GET`, or `POST` with a bogus client, secret and code, to the token URL | The endpoint is live and how it rejects an unknown client |
| `portal` | `GET` the developer portal's "create app" URL | Whether it bounces to a login or sign-up wall, which is where a human has to take over |
| `url-check` | `GET` key documentation URLs | The cited pages exist (HTTP status) |
| `composio-api` | Composio toolkit API with an API key (the live agent, and `npm run connect-probe` for library guides) | Exact auth fields and default scopes |

Never create accounts, log in, submit forms, use real credentials, or POST to a registration endpoint. If a probe is blocked (bot protection, 403), record that as the result. It is still information.

## 4. Evidence rules

- Every factor, step, requirement, scope, blocker and nuance cites `sourceIds`: `S*` for sources, `P*` for probes.
- Confidence:
  - **`tested`**: confirmed by one of our probes (must cite a `P*`).
  - **`official`**: stated in the provider's own docs or policy, or in Composio's docs for Composio facts.
  - **`reported`**: community or third-party reports only.
  - **`inferred`**: our judgment, with no direct source. Use it sparingly and pair it with an open question.
- `source.note` holds a short quote or paraphrase (25 words or fewer) showing what the source supports.
- Time estimates are ranges. When an official stated timeline and real-world reports differ, give both, for example "Google states 3–5 business days; developers report 2–6 weeks".
- Uncertain or conflicting points go in `evidence.openQuestions`, each with how to resolve it (who to ask, where).

## 5. Ratings

`verdict.difficulty` is not chosen freely. `deriveDifficulty()` computes it from the factors and the production timeline:

- **gated**: needs a partner program, sales contact or customer tenant, or registration isn't self-serve.
- **formal-review**: review is required, and either a security assessment or business verification is needed, or production is more than 14 days away.
- **light-review**: review is required but short.
- **self-serve**: no review is needed before any user can connect.

Answer the factors for the stated assumption. `depends` is allowed, and the detail must say on what.

## 6. Writing rules

- Be concrete: exact console paths, button names, field values, scope strings. Write "In **Apps → Create app → From scratch**", not "create an app".
- Tag every step with an `actor`. `agentAssist` says what an agent can prepare even when you must act, such as draft justifications, pre-filled values or checking the result.
- Order phases the way the developer lives them: register → configure → test with your own account → prepare for review → review and wait → go live in Composio.
- Each blocker has a symptom (the error text or situation), how to proceed, and where to escalate.
- Keep it short and scannable. The reader is busy and smart.
