# Production Deploy Checklist

Use this checklist for every `jumgogpt.app` production deploy.

## 1. Keep the worktree clean

Before building or shipping, confirm the only staged files are the ones you intend to release.

Known unrelated files that should stay out unless you are explicitly working on them:

- `apps/web/plugins/layouts.ts`
- `apps/web/src/__create/PolymorphicComponent.tsx`

## 2. Build locally

From `apps/web`:

```bash
npm run check:release
npm run build
```

If either command fails, do not deploy.

## 3. Capture the commit you expect in production

From the repo root:

```bash
git rev-parse HEAD
```

Keep that SHA for the verification step.

## 4. Push and let Vercel deploy

Push only the intended commit(s) to `main`.

## 5. Verify production is on the intended deployment

From `apps/web`:

```bash
npm run verify:prod -- <expected-commit-sha>
```

This checks:

- `https://www.jumgogpt.app/api/version`
- the current production asset names in the HTML shell

The command exits non-zero if production is not on the expected commit.

## 6. Spot-check the high-risk flows

Minimum manual checks after deploy:

- sign in
- open `My Prospects`
- open `Prospect Pool`
- if the release touched Blackbaud syncs, run one real sync path

## 7. If production is wrong, stop debugging app logic

If `verify:prod` shows the wrong commit:

- do not trust browser behavior
- do not continue UI debugging
- fix deployment state first
