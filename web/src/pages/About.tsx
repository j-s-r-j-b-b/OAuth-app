import { Link } from 'react-router-dom';
import { DIFFICULTY_INFO, type Difficulty } from '../../../shared/schema.ts';
import { ActorChip, CONF, DifficultyPill } from '../components/ui.tsx';

export default function About() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="eyebrow">How it works</div>
      <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900 dark:text-white">What a guide answers, and how we know</h1>

      <div className="mt-6 space-y-8 text-slate-700 dark:text-slate-300">
        <section>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">The problem</h2>
          <p className="mt-2">
            When your agent's users connect an app, they authorize an <strong>OAuth app</strong>: one registration at the provider with a client ID, secret,
            redirect URI, scopes and a name on the consent screen. Composio provides that app for some toolkits. For the rest, and whenever production needs
            your own branding, scopes or quota, you register your own and plug it into a Composio auth config. Registering takes minutes. What's hard to
            know up front is whether the provider will then make you wait: app review, business verification, security assessments, user caps, paid tiers,
            partner programs.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Every guide answers five questions</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>How hard is this, and how long until I can connect my own account, and until any user can?</li>
            <li>What do I do first, then next, and who does each step: an agent, me, or a wait on the provider?</li>
            <li>What do I need ready (business entity, domain, privacy policy, demo video, paid plan)?</li>
            <li>What will block me, and what do I do when it does?</li>
            <li>How do I wire the result into Composio?</li>
          </ol>
        </section>

        <section>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Ratings use one rule</h2>
          <p className="mt-2">
            A guide records eight factors for a stated use case. The rating is computed from them by a fixed rule, not chosen by the writer, so “Formal
            review” means the same thing on every guide.
          </p>
          <ul className="mt-3 space-y-2">
            {(Object.keys(DIFFICULTY_INFO) as Difficulty[]).map((d) => (
              <li key={d} className="flex items-start gap-3">
                <DifficultyPill d={d} />
                <span className="text-sm">
                  {DIFFICULTY_INFO[d].blurb}{' '}
                  <span className="text-slate-500">
                    {d === 'gated'
                      ? '(partner or sales gate, or no self-serve sign-up)'
                      : d === 'formal-review'
                        ? '(review required + business verification, a security assessment, or more than 14 days to production)'
                        : d === 'light-review'
                          ? '(review required, otherwise light)'
                          : '(no review before any user can connect)'}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm">
            Cost is separate from difficulty. X, for example, is self-serve but pay-per-use. Each guide also gives two timelines: <em>first test connection</em>{' '}
            (your own account, dev mode) and <em>any user can connect</em> (no caps, warnings or pending reviews).
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Who does each step</h2>
          <ul className="mt-2 space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <ActorChip actor="agent" /> Anything that needs no login, legal acceptance or payment: reading docs, checking endpoints, preparing values,
              drafting scope justifications and review answers, creating the Composio auth config through its API.
            </li>
            <li className="flex items-start gap-2">
              <ActorChip actor="you" /> Signing in to the developer portal, accepting terms, verifying a business, paying, recording demo videos, deciding
              scopes. Even here, the plan notes what an agent can prepare for you.
            </li>
            <li className="flex items-start gap-2">
              <ActorChip actor="provider" /> Reviews and verifications. You can only prepare well and wait.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Evidence labels</h2>
          <ul className="mt-2 space-y-1.5 text-sm">
            {(['tested', 'official', 'reported', 'inferred'] as const).map((c) => (
              <li key={c} className="flex items-start gap-2">
                <span className={`mt-0.5 rounded px-1.5 py-px text-[10px] font-bold uppercase ${CONF[c].cls}`}>{CONF[c].label}</span>
                {CONF[c].title}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm">
            <strong>Setup probes</strong> are real read-only requests: the provider's OAuth discovery document, an authorize request with a fake client ID and
            Composio's redirect URI (does the endpoint exist, how does it reject a bad client?), and the developer portal's sign-in wall. They never create
            accounts, log in, or submit forms. That boundary is also where a human takes over.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Library guides vs live guides</h2>
          <p className="mt-2 text-sm">
            <strong>Library guides</strong> were researched in depth by research agents following one{' '}
            <a className="underline" href="/docs/RESEARCH_PROTOCOL.md" target="_blank" rel="noreferrer">
              written protocol
            </a>
            . A separate verifier agent on a different model then re-checked the most decision-critical claims against the cited sources. The results
            (confirmed, corrected, unverifiable) are shown on each guide and summarised in the{' '}
            <a className="underline" href="/docs/VERIFICATION.md" target="_blank" rel="noreferrer">
              verification report
            </a>
            .{' '}
            <strong>Live guides</strong> are produced on demand in a few minutes by a smaller agent built on Composio's own search tools and a free-tier model.
            Before a live guide is published, every citation is checked automatically: citations to pages the agent never retrieved are removed, a “tested”
            label without a probe is downgraded, and the rating is recomputed. Live guides are a fast first answer; check the evidence before committing.
          </p>
        </section>

        <div className="flex gap-2">
          <Link to="/" className="btn-primary">
            Browse guides
          </Link>
        </div>
      </div>
    </div>
  );
}
