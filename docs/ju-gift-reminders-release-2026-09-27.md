# JU release: gift-based stewardship reminders

Deployed September 27, 2026 to JU only.

- Commit: `9572ccc338d14fd6cb71ac011f9aff22d874b200`
- JU project: `prj_S8IWnRqqTQwLnd6C5lBfTsMj15VY`
- Deployment: `dpl_6NG1JDmWmmYsuYMX6HN4UDHpNmZY`
- Deployment URL: https://mgo-fa1pjqzpe-chelspers-projects.vercel.app
- Production: https://www.jumgogpt.app

The release adds saved direct-gift suggestions over $1,000 to Nellie, a local reminder-type filter, and links to review the donor or log a stewardship action. It adds no automatic NXT calls, donor communications, or donor-record writes.

## Verification

Before release: 4,658 tests passed, 46 opt-in tests skipped, typecheck passed, production build passed, release guard passed. The prior implementation pass also ran all 10 disposable PostgreSQL tests and synthetic desktop/mobile interactions.

Deployment used an explicitly targeted JU CLI command from a clean committed archive, without a Git push. Vercel returned READY. `verify:prod` confirmed the expected commit, deployment ID, and production assets.

Read-only signed-in smoke: dashboard opened in the existing Erica A. Applegate workspace, Nellie remained collapsed until selected, saved reminders loaded, and the new gift-source explanation appeared. That workspace had no sufficiently fresh eligible saved gift source at the time, so the UI correctly withheld gift suggestions rather than implying zero gifts. No manual NXT refresh, preference change, or donor action was triggered for verification. The temporary verification tab was closed.

Before/after Vercel project inventories confirmed no change to either other project:

- Conference sandbox: `dpl_3ES2MmNzTHbbvEXriPpm2r2dr7CR`
- Other linked copy: `dpl_29oY1mAgmUuZJGGHR9ySSakcJDKp`

Step 4 documentation checks were developed after this deployment and are not part of this release.
