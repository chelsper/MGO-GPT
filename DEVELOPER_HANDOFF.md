# Developer Handoff

This repo is being handed off while the app is active in production. Treat changes as production-sensitive, especially anything touching auth, Blackbaud sync, prospect data, or deployment config.

## Current Production Shape

- Production URL: `https://www.jumgogpt.app`
- Production branch: `main`
- Production host: Vercel
- Production app directory: `apps/web`
- Database: Neon/Postgres via `DATABASE_URL`
- Auth: Okta/Auth.js
- External CRM: Blackbaud SKY API / Raiser's Edge NXT

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

## Fragile Areas

- Blackbaud/NXT writes are sensitive to scopes, table values, fundraiser identity resolution, and linked constituent IDs.
- Okta redirect URI and domain restrictions can make preview deployments unusable unless the callback URL is approved.
- Executive dashboard switching must remain read-only when viewing another MGO.
- Prospect Pool has separate Advancement Services and MGO behavior; do not collapse those paths casually.
- The dashboard Closed FY metric depends on Blackbaud gift credit data and can be slow without cache.
- Build sourcemap warnings have been non-fatal; build exit code is the source of truth.

## Testing Notes

Route-level tests live under `apps/web/src/app/api/**/*.test.js`.

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
