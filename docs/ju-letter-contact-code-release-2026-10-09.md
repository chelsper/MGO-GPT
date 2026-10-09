# JU Society Letter Contact-Code Release

Released October 9, 2026, to JU only at https://www.jumgogpt.app.

- Application commit: `8ca76693a06570e0b7d6a5ba50280c7bdcc4af55`.
- Deployment: `dpl_AtdZDUQXuVMccqBFU6mNyFVgsqoy`.
- Candidate: https://mgo-lr9vs6fpc-chelspers-projects.vercel.app.
- Previous deployment / rollback: `dpl_DJYvxvAvghicJAkAGc4vLSrebAPj`,
  application `e29e65de99a03ddf64240bb629a5c463723f4c3e`.

## Scope

At the user's request, Society Letter Creation no longer fetches or blocks on
contact/solicit codes. This applies to new letters and the continuation of saved
approved letters. It does not modify those codes in NXT. Explicit address/email
flags, applicable consent, deceased/inactive checks, household identity,
exclusions, prior-letter coverage, and duplicate-appeal protections remain.

Previously saved contact-code messages are replaced when staff continue the
existing letter and its normal current checks run. Deployment does not resume
batches or clear saved statuses itself. Existing approval and document metadata
are retained; contact codes alone no longer require another review or rendering.

## Verification

- Full suite: 6,410 passed; 193 opt-in checks skipped, not claimed as passing.
  This includes 26 isolated PGlite letter database tests.
- An initial run alongside build/typecheck timed out on two unrelated import UI
  tests. All 22 import UI tests then passed alone, followed by the full passing
  run without competing build/typecheck. No tests or timeouts were weakened.
- Typecheck, local build, release-worktree check, and hosted build passed.
- Regression coverage includes DOCX/PDF saved contact-code holds, preserved
  approvals/documents, both household appeal assignments, duplicate prevention,
  and retained explicit email opt-out/consent protections.
- All 1,228 tracked web files in the isolated Git archive were compared with the
  tested checkout. No untracked web files or real tracked environment files were
  included. Unrelated dirty documentation was left untouched by this deployment.
- Candidate and live smoke checks passed: expected SHA/deployment identity,
  main pages and assets, new contact-code policy copy, embedded client SHA,
  unauthenticated API/download rejection, invalid reload rejection, and the
  successful latest-version reload redirect.
- The release was promoted explicitly, without pushing the shared Git branch.
  Before/after Vercel metadata confirmed only JU's production deployment changed.
  Sandbox `dpl_GeiPFGgbaBEYVvM2HW2GeD3TcK2t`, other projects, schedules, and PDF
  settings were unchanged.

Existing browser tabs may remain on their prior deployment pin. Use the letter
workspace's **Load latest version** action before continuing saved letters. This
release does not claim every existing browser session was automatically upgraded.

No authenticated live NXT writes, appeals, emails, document regeneration,
mailing-status changes, query refreshes, schema migrations, or PDF credential
changes were performed. Live end-to-end appeal submission was not exercised.

Local verification logs: `/tmp/ju-letter-contact-code-deploy-*`,
`/tmp/ju-letter-contact-code-full-recheck.log`,
`/tmp/ju-letter-contact-code-typecheck.log`, and
`/tmp/ju-letter-contact-code-build.log`.
