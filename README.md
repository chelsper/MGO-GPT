# MGO-GPT

An advancement workflow application for Jacksonville University. The production
web app is in `apps/web`, deployed from `main` to <https://www.jumgogpt.app>.

It supports MGO prospects and portfolios, follow-ups and team discussion, delegated
Admin work, NXT actions/opportunities, guarded constituency imports, saved reports,
pledge payment worklists, and prospect exports.

## Start Here

- [Developer handoff](DEVELOPER_HANDOFF.md): current baseline, safety rules, access
  transfer, feature map, and known limitations.
- [Developer setup](docs/developer-setup.md): toolchain, safe environment setup,
  commands, and external-service requirements.
- [Architecture and ownership](docs/architecture-and-data-ownership.md): code map,
  data ownership, permissions, and refresh boundaries.
- [Metric definitions](docs/metrics-and-reporting.md): what reports actually count.
- [Acceptance checklist](docs/mgo-workflow-readiness.md): validation and remaining work.
- [Release checklist](docs/production-deploy-checklist.md) and [security notes](SECURITY.md).

## Repository Layout

| Location | Purpose |
| --- | --- |
| `apps/web` | Production React Router/Vite web app and Hono server/API routes |
| `apps/web/src/app/api` | Authenticated API handlers and server-side utilities |
| `apps/web/src/components`, `apps/web/src/utils` | UI and shared client/domain helpers |
| `apps/web/__create`, `apps/web/plugins` | Generated/runtime integration and build plumbing; do not remove casually |
| `apps/mobile`, root application scaffold | Separate generated/mobile code, not the production web release |
| `docs` | Workflow contracts and handoff guides |

The web stack uses React 18, React Router/Vite, Vercel, Neon/Postgres, Auth.js/Okta,
Blackbaud SKY API, Resend, and Vitest. Exact dependencies are in the web lockfile.

## Local Commands

Read [developer setup](docs/developer-setup.md) before configuring credentials or a
database. Use the web lockfile, not the root mobile/scaffold package:

```bash
cd apps/web
npm ci
npm test
npm run typecheck
npm run build
npm run check:release
```

`npm run dev` serves port 4000 once an isolated environment is configured. There is
not yet a turnkey synthetic database/NXT sandbox. Do not point a local server at
production to work around missing setup.

## Releases

Production deploys through Vercel after an authorized push to `main`. Use the
[release checklist](docs/production-deploy-checklist.md); confirm the exact deployed
commit with:

```bash
cd apps/web
npm run verify:prod -- <expected-commit-sha>
```

Real `.env` files and donor exports must remain outside version control. Transfer
credentials through approved institutional secret management, never this README,
pull requests, or chat.
