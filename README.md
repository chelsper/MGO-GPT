# MGO-GPT

MGO-GPT is a custom advancement workflow application for Jacksonville University. The production web app lives in `apps/web` and is deployed to Vercel at `https://www.jumgogpt.app`.

The app supports MGO portfolio management, prospect pool workflows, data request queues, team discussion items, action/opportunity logging, and Blackbaud Raiser's Edge NXT synchronization.

## Stack

- React Router / Vite frontend and server route modules
- Vercel hosting and deployment
- Neon/Postgres database through `@neondatabase/serverless`
- Okta SSO through Auth.js
- Blackbaud SKY API / Raiser's Edge NXT integration
- Resend email notifications
- Vitest route-level tests

## Repository Layout

- `apps/web`: production web application
- `apps/mobile`: generated/mobile app files; not part of the current production Vercel deploy
- `docs`: release, workflow, and Blackbaud mapping notes
- `README.md`: developer setup and orientation
- `DEVELOPER_HANDOFF.md`: current state, known risks, and recommended next work
- `SECURITY.md`: credential and access-handling expectations

## Local Setup

Use Node 20 or newer.

```bash
cd apps/web
npm install
cp .env.example .env
npm run dev
```

Local development requires real secrets for database, Okta, and Blackbaud integration. Do not request or share those through GitHub, email, or chat; use Vercel project access or a password manager.

## Useful Commands

Run these from `apps/web`.

```bash
npm run dev
npm run build
npm run test
npm run typecheck
npm run check:release
npm run verify:prod -- <expected-commit-sha>
```

Notes:

- `npm run build` is the same core build Vercel runs.
- `npm run test` runs Vitest route and utility tests.
- `npm run verify:prod` checks that `jumgogpt.app` is serving the expected commit and assets.
- The recurring sourcemap warnings during the React Router build have been non-fatal historically; treat a non-zero build exit as blocking.

## Deployment

Production deploys from `main` through Vercel.

Before pushing to `main`:

```bash
cd apps/web
npm run check:release
npm run build
```

After Vercel deploys:

```bash
cd apps/web
npm run verify:prod -- <expected-commit-sha>
```

See `docs/production-deploy-checklist.md` for the release checklist.

## Primary Workflows

The app is currently optimized around these workflows:

- MGO dashboard and Top Prospects
- Portfolio view from Blackbaud fundraiser assignments
- Prospect detail workspace
- Action and opportunity create/edit/delete with NXT sync where supported
- Prospect Pool assignment and solicitor/disposition follow-up
- Data Request & Update Queue
- Team Discussion handoffs
- Executive admin read-only dashboard switching
- Advancement Services queues and admin access management

See `docs/mgo-workflow-readiness.md` for workflow acceptance criteria and known coverage gaps.

## Environment Variables

Safe examples live in:

- `apps/web/.env.example`
- `apps/mobile/.env.example`

Real `.env` files are intentionally ignored and must not be committed.

## Handoff Notes

Read these before making changes:

- `DEVELOPER_HANDOFF.md`
- `SECURITY.md`
- `docs/production-deploy-checklist.md`
- `docs/mgo-workflow-readiness.md`
- `docs/blackbaud-field-mapping.md`
