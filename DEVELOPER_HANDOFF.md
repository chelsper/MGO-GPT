# Developer Handoff

This repo is being handed off while the app is active in production. Treat changes as production-sensitive, especially anything touching auth, Blackbaud sync, prospect data, or deployment config.

## Current Production Shape

- Production URL: `https://www.jumgogpt.app`
- Production branch: `main`
- Latest verified production commit at handoff: `43fa832`
- Production host: Vercel
- Production app directory: `apps/web`
- Database: Neon/Postgres via `DATABASE_URL`
- Auth: Okta/Auth.js
- External CRM: Blackbaud SKY API / Raiser's Edge NXT

Develop from `main`. The `codex/auth-cookie-fix` branch is a working branch used by Codex, not the branch a new developer should treat as the source of production truth.

## Access Needed

A productive developer will need:

- GitHub collaborator access
- Vercel project access for deploy logs and environment variables
- A safe way to receive local development secrets
- Okta app configuration visibility for redirect URI and user access debugging
- Blackbaud developer app visibility for scopes and callback configuration
- Test user accounts covering MGO, Advancement Services, executive admin, and full admin roles

Do not grant broad admin access unless it is needed. Start with collaborator/developer access and elevate intentionally.

## Local Development

The web app runs from `apps/web`.

```bash
cd apps/web
npm install
cp .env.example .env
npm run dev
```

Useful checks:

```bash
npm run build
npm run test
npm run typecheck
```

## Release Flow

Use the checklist in `docs/production-deploy-checklist.md`.

Minimum release flow:

```bash
cd apps/web
npm run check:release
npm run build
```

Push to `main`, wait for Vercel, then verify:

```bash
npm run verify:prod -- <expected-commit-sha>
```

## Current Feature Priorities

The highest-value workflow is a stable daily MGO workflow:

- My Prospects dashboard
- Top Prospects ranking
- Portfolio import/view
- Prospect detail workspace
- Next steps
- Action logging
- Opportunity create/edit
- Team discussion
- Prospect Pool
- Data Request & Update Queue

See `docs/mgo-workflow-readiness.md` for acceptance criteria.

## Recent Production Updates

Snapshot date: July 24, 2026.

- Advancement Services queue was refocused around manual backend work: bio/demo updates, research/data requests, list requests, clarification, and completion. Automated solicitor/action/opportunity sync noise should not drive that queue.
- List requests now use `Pending`, `Needs Clarification`, and `Complete`. Advancement Services can ask a clarification question, and the MGO can answer from their submission tracker.
- List request UX now keeps validation and success messages visible near the bottom of the form, returns users to the prior screen after submit, and only enables radius filtering after a location is selected.
- Prospect Pool solicitor assignment is treated as an automated MGO workflow. Assigning as solicitor no longer requires an amount, requires an MGOGPT outcome before submit, writes the selected MGOGPT outcome, and removes the entry from the MGO pool after successful solicitor sync.
- Prospect Pool contact request defaults were tightened so MGO users are not pushed into an Advancement Services queue unless they explicitly request help.
- Action logging was hardened for NXT: the logged-in app user is included as the action fundraiser, optional additional fundraisers are included, action type labels were adjusted to match NXT spacing, actions are marked complete with today's date, and MGOs write their own action summary.
- Combined action/opportunity/next-step/team-discussion saves were made more resilient so one failed NXT write should not erase local app progress without a useful error.
- Action/opportunity form navigation now returns the user to the screen they started from after save.
- Portfolio usability was improved with search, NXT profile links, top-prospect indicators, and the ability for an MGO to end their own solicitor assignment by changing it to `Former Solicitor` in NXT.
- Blackbaud summaries were adjusted to load more defensively, including retry-oriented behavior for slower NXT summary responses.
- Dictation was moved toward live browser speech recognition for action fields. Floating "ready" notices were removed because they created misleading UI feedback.

## Known Next Work

- Run a full manual UAT pass with at least one normal MGO, one Advancement Services reviewer, and one executive admin. Use real but low-risk NXT records.
- Verify Blackbaud per-user access for each MGO. App login through Okta is not enough; each MGO still needs a valid Blackbaud connection and sufficient NXT rights for the operations they perform.
- Confirm NXT opportunity/action linking behavior from the combined form. The app can save both locally, but the exact NXT-side relationship should be tested against Blackbaud's current accepted payload shape.
- Add or strengthen tests for list request status changes and Advancement Services/MGO tracker display behavior. The list-request clarification response API now has route tests.
- Consider formal database migrations instead of relying only on `ensureAppSchema()` as the app stabilizes.
- Keep improving NXT data loading performance. The summaries are external-API heavy and may benefit from better queueing, caching, and one-at-a-time lazy loading.
- Follow `docs/dependency-security-maintenance.md` for the staged dependency/security remediation plan. Do not run `npm audit fix --force` directly on `main`; the currently proposed automatic fix requires a newer Node runtime and includes breaking Auth.js and PDF upgrades.

## Fragile Areas

- Blackbaud/NXT writes are sensitive to scopes, table values, fundraiser identity resolution, and linked constituent IDs.
- Okta redirect URI and domain restrictions can make preview deployments unusable unless the callback URL is approved.
- Executive dashboard switching must remain read-only when viewing another MGO.
- Prospect Pool has separate Advancement Services and MGO behavior; do not collapse those paths casually.
- The dashboard Closed FY metric depends on Blackbaud gift credit data and can be slow without cache.
- Build sourcemap warnings have been non-fatal; build exit code is the source of truth.

## Testing Notes

Route-level tests live under `apps/web/src/app/api/**/*.test.js`.

Current route-level coverage at handoff:

- 27 Vitest files
- 156 passing tests
- Recent coverage includes prospect pool solicitor assignment, action logging, opportunity create/edit, prospect reorder, Blackbaud summary language, portfolio solicitor removal, data requests, and list-request clarification responses.

High-risk manual smoke test after deploy:

- Sign in through Okta.
- Open My Prospects.
- Switch Top Prospects / Portfolio / Prospect Pool tabs.
- Open a prospect detail record.
- Add/update a next step.
- Log an action.
- Add/edit an opportunity.
- Create a data request.
- If release touched Blackbaud sync, verify one real NXT sync path.

## Secrets

Real env files are intentionally not tracked. If a secret was ever committed, rotate it before relying on the repository as clean.
