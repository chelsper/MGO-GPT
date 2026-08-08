# Dependency Security Maintenance Plan

## Scope

This is an assessment and remediation plan, not an approved dependency update.
It was prepared on August 8, 2026 while production was serving commit
`43fa832`. No package manifest or lockfile was changed for this assessment.

## Baseline

- Local runtime used for the assessment: Node `20.19.1`, npm `10.8.2`
- Production application package: `apps/web`
- `npm audit --omit=dev`: 24 findings (2 critical, 14 high, 8 moderate)
- Current installed direct versions include:
  - `@auth/core@0.37.4`
  - `hono@4.12.7`
  - `react-router@7.13.1` and `react-router-dom@7.13.1`
  - `react-router-hono-server@2.25.0`
  - `pdfjs-dist@3.11.174`
  - `lodash-es@4.17.23`
  - `ws@8.19.0`

## Why Automated Fixes Are Not Safe Yet

`npm audit fix --dry-run --omit=dev` proposes 55 package changes, 124 added
packages, and one removed package. Most importantly, it moves
`react-router-hono-server` to `2.26.0`, which requires Node `>=22.20.0`.
The assessment runtime is Node `20.19.1`, so applying the automatic change
would risk local and Vercel build failure.

Two critical paths also require intentional breaking upgrades:

- `@auth/core@0.41.3` is the available security fix for the Auth.js findings.
  It must be validated against the Okta callback, session retrieval, logout,
  and the app's `getToken` usage.
- `pdfjs-dist@5.6.205` is the available path that removes the vulnerable
  `canvas`/`tar` chain. It is a major upgrade and must be checked against the
  PDF viewer and worker-bundling code.

`@vercel/react-router` currently retains an indirect `ajv` advisory with no
available automatic fix. Keep it documented and revisit when Vercel releases
an upstream update.

## Safe Remediation Order

1. **Runtime readiness**: confirm the intended Node version is supported by
   Vercel and local developer tooling before adopting a package that requires
   Node `>=22.20.0`.
2. **Router/server batch**: update React Router, React Router DOM,
   `react-router-hono-server`, Hono, and their closely coupled transitive
   dependencies together only after the runtime decision. Verify every server
   route, redirect, and SSR build path.
3. **Auth.js batch**: update `@auth/core` separately. Test the Okta sign-in
   redirect, callback, session endpoint, logout, and unauthorized responses.
4. **PDF batch**: update `pdfjs-dist` separately and verify loading, rendering,
   and worker initialization with a representative PDF.
5. **Remaining transitive fixes**: apply the smaller patch updates only after
   each previous batch is stable. Re-run the audit after each batch rather than
   bundling all remaining findings into one release.

## Required Gates Per Batch

Run from `apps/web`:

```bash
npm ci
npm run check:release
npm test
npm run build
npm audit --omit=dev --audit-level=high
```

Then complete a small manual smoke test:

- Okta sign-in, callback, session, and logout
- MGO dashboard and Blackbaud summary loading
- One low-risk Blackbaud write path, if the batch touches server/auth code
- Constituency import preview and one review-only import row
- Production verification after deploy:

```bash
npm run verify:prod -- <expected-commit-sha>
```

## Guardrails

- Do not run `npm audit fix --force` on `main`.
- Keep dependency updates out of feature branches and avoid mixing them with
  schema, Blackbaud payload, or UI workflow changes.
- Use a temporary branch and a separate commit for each remediation batch.
- Preserve the last verified production commit for immediate Vercel rollback.
