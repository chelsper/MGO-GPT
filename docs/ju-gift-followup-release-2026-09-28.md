# JU Gift Follow-up Release

Deployed September 28, 2026 to https://www.jumgogpt.app.

## Release identity

- Commit: `e7439d43718df844aa6ca6472e3c2f009e90ec42`.
- JU Vercel project: `prj_S8IWnRqqTQwLnd6C5lBfTsMj15VY` (`mgo-gpt`).
- Deployment: `dpl_B4yMsLTSpKAYaZ1gEz7iL1GWdXzU`, `READY`.
- Deployment URL: https://mgo-3ki6l6va2-chelspers-projects.vercel.app.
- Previous release: `332a9b3680cd64cc8ac5b301d2f578bfa8851c0e`, deployment `dpl_J3j7fKCStjiW32XZyLXbw5Fq6aG5`.

Published a clean archive of the reviewed commit to the explicit JU project. No Git push was performed. Unrelated worktree changes were preserved and excluded. No dependencies, environment settings, schedules, or NXT credentials were changed.

## Delivered scope

Nellie's visible gift reminders offer **Create a stewardship follow-up** in editable workspaces. The additional app task has a workspace owner, optional date and notes, saved gift context, and a link into Follow-ups & Discussion. Existing primary next steps stay unchanged. Duplicate protection covers the same workspace/gift across retries, concurrent submissions, edits, completion, and gift revisions.

Runtime schema setup adds two nullable origin columns and a partial unique index to `pending_actions`. There is no backfill, destructive migration, or modification of existing task contents. If code rollback is needed, retain the additive columns/index and any newly created tasks rather than deleting records or provenance.

## Verification

- Final pre-release suite: 4,861 passed, including 13 disposable local PostgreSQL integration tests; 52 unrelated opt-in tests skipped. Typecheck, production build, release guard, and whitespace checks passed.
- Clean Vercel input manifest confirmed the reviewed files and no secret environment files or desktop metadata. The remote build completed successfully.
- Production alias reported the exact commit and deployment ID. Entry, index, and root JavaScript returned HTTP 200 with nonempty JavaScript bodies.
- The new follow-up endpoint rejected an unsigned GET with HTTP 401 and `Cache-Control: private, no-store`.
- A fresh signed-in JU dashboard loaded in the existing Admin-selected workspace. Nellie showed 11 saved reminders, including five gifts, with the new create button.
- Opening one gift's follow-up dialog successfully loaded saved gift context, the selected workspace owner, editable title, optional date/quick dates, and notes controls. The dialog was closed without saving; no real task or NXT action was created and no communication was sent.
- Follow-ups & Discussion > Next Steps loaded the selected workspace and its existing open stewardship task without errors. No task was edited. The temporary verification tab was then closed, leaving the user's other tabs alone.
- Full create/edit/complete/retry/concurrent-write behavior was tested with synthetic local data, not production donor writes. Read-only Executive visibility remains covered by automated permission tests, not a separately impersonated live session.
- Before/after Vercel project snapshots matched for the conference sandbox (`dpl_6tgUQT4BP5JEMhoFYFBAooCe4Dd2`) and the other copy (`dpl_29oY1mAgmUuZJGGHR9ySSakcJDKp`), including their deployment histories. This release did not deploy either copy.

Existing dependency deprecation warnings remain a separate maintenance item; no dependencies were changed for this release.
