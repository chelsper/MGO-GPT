# JU release: Step 4 major-gift documentation checks

Deployed September 27, 2026 to JU only, at the user's request.

- Commit: `99fa8537edd666603d02cabc74225f0e19d738af`
- JU project: `prj_S8IWnRqqTQwLnd6C5lBfTsMj15VY`
- Deployment: `dpl_J3YT8UAmNjcVyNYG63EZe1Yk8fR3`
- Deployment URL: https://mgo-h6swy40i4-chelspers-projects.vercel.app
- Production: https://www.jumgogpt.app
- Previous known-good deployment: `dpl_6NG1JDmWmmYsuYMX6HN4UDHpNmZY` (Step 3, commit `9572ccc338d14fd6cb71ac011f9aff22d874b200`).

## Release scope

Eligible saved gifts of $10,000 or more offer an explicit **Check documentation** control in Nellie. It verifies the gift and returned opportunity/action coverage before offering a cautious review prompt. No automatic dashboard NXT scan, donor communication, or donor-record write was added. See `dashboard-helper.md` for coverage limits, authorization, cooldowns, and safeguards.

The additive `dashboard_documentation_checks` table stores compact per-viewer check outcomes and concurrency controls. Existing donor data and schedules are not rewritten. Application rollback can leave this table in place; it does not require destructive schema changes.

## Verification

- Re-ran the full suite: 4,725 tests passed, 49 opt-in tests skipped.
- Typecheck, production build, and release guard passed.
- The implementation pass had also passed all 13 disposable PostgreSQL tests and desktop/390px mobile synthetic checks.
- Released a clean archive of the exact commit, excluding uncommitted/untracked workspace work. Verified no credentials, local environment files, build outputs, dependency directories, or local deployment links were included.
- Used an explicitly targeted JU Vercel CLI deployment without a Git push. Vercel reported READY.
- `verify:prod` confirmed the expected production SHA, deployment ID, and HTML asset references.
- Unauthenticated GET and POST requests to the deployed dashboard-priorities endpoint returned 401 with `private, no-store` caching.
- Signed-in smoke passed in the existing Kaye Glover workspace: Nellie stayed collapsed until opened, saved reminders loaded, the Step 4 explanatory text appeared, and the local Recent gifts filter worked. The selected workspace did not have sufficiently fresh saved gift data, so no gift check was available. Its unavailable-data explanation correctly avoided claiming there were no gifts.

No live documentation check, NXT refresh, reminder preference change, donor-record write, or email send was performed during this deployment verification. A small read-only pilot using an eligible fresh saved gift remains outstanding. The temporary browser tab was closed without changing the selected workspace.

## Isolation

Before/after Vercel inventories confirmed only JU's production deployment changed:

- Conference sandbox remained `dpl_3ES2MmNzTHbbvEXriPpm2r2dr7CR`.
- Other linked copy remained `dpl_29oY1mAgmUuZJGGHR9ySSakcJDKp`.

No Step 5 implementation or deployment was included.
