# GitHub Repository Governance

## Purpose

Protect `main` without blocking valid work on known, separately tracked
technical debt. The required automated validation is the `Web CI` workflow in
`.github/workflows/web-ci.yml`.

## Recommended Main Branch Rule

In GitHub, open **MGO-GPT** and go to **Settings > Branches**. Create a branch
protection rule for `main` with these settings:

- Require a pull request before merging.
- Require one approving review.
- Dismiss stale approvals when new commits are pushed.
- Require review from Code Owners only if a `CODEOWNERS` file is deliberately
  added later.
- Require status checks to pass before merging, and select
  `Validate web application` from `Web CI` after the first workflow run.
- Require branches to be up to date before merging.
- Require conversation resolution before merging.
- Block force pushes.
- Block branch deletion.
- Apply these rules to administrators once the maintainers are comfortable
  following the same release process.

Do not require TypeScript checking or `npm audit` as a merge gate yet:

- `npm run typecheck` currently reports pre-existing errors from generated
  routes that reference JavaScript page modules and a generated `__create`
  helper.
- `npm audit --omit=dev` has known critical findings scheduled for separate
  Auth.js and PDF dependency migrations. Forcing an audit gate now would block
  every change without resolving those issues.

## Maintainer Practices

- Develop from `main` using one focused branch per change.
- Do not commit generated `node_modules`, `build`, or `.react-router` files.
- Use the production deploy checklist before merging a user-facing change.
- Never use `npm audit fix --force` against `main`.
- Treat access to Vercel, Okta, Blackbaud, Neon, and GitHub as privileged;
  review access after staffing changes.
