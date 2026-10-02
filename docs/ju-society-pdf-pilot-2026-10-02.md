# JU Society PDF Pilot

## Candidate

The app supports a protected JU-only PDF connection and a configurable batch
ceiling. The initial production target is three households per PDF draft;
Word stays at ten. No recipient review, readiness, hierarchy, exact-document
approval, or per-member appeal verification requirement is removed.

The saved per-template `fontReplacement: "carlito"` setting substitutes only
`Avenir Next LT Pro` Word font attributes. Raw uploaded bytes and historical
versions remain unchanged. Saving the option creates a new template version.
The effective template download, personalized Word output, browser preview,
and PDF input use the same setting. Font sizes, margins, and images are not
changed. Browser pagination can still differ from Word or LibreOffice.

Four unmodified, OFL-licensed Carlito faces are bundled for browser previews.
They load on demand from this app into the isolated document; the iframe's
no-script/no-network policy is unchanged. No external font provider is used.

## Deployment Configuration

Only JU project `prj_S8IWnRqqTQwLnd6C5lBfTsMj15VY` should receive:

| Production Variable | Purpose |
| --- | --- |
| `SOCIETY_PDF_ENABLED=true` | Explicit pilot activation |
| `SOCIETY_PDF_MAX_BATCH_SIZE=3` | Server and UI limit, validated from 1 to 10 |
| `SOCIETY_PDF_CONVERTER_URL` | Exact HTTPS conversion route on the JU-only converter |
| `SOCIETY_PDF_CONVERTER_TOKEN` | Sensitive, independent service bearer token |
| `SOCIETY_PDF_VERCEL_BYPASS_SECRET` | Sensitive automation token for the converter project, not JU |

Keep both secrets server-only. Never place them in `VITE_*`, URLs, source,
logs, browser storage, or the upload archive. The adapter sends the platform
credential only as `x-vercel-protection-bypass`, preserves bearer authentication,
rejects redirects, and reports generic errors. Invalid configuration disables
PDFs; conversion errors do not trigger appeal updates or automatic retries.
See [Vercel automation protection](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation).

No sandbox environment, Git link, cron, database schema, or converter image
change is part of this release. Use a clean archive and explicit JU project,
not a shared Git push. The converter remains project
`prj_sdikk4n532O9DArgTyQngylrBhMx`, deployment
`dpl_7rXAGQ6svuqwCh3ryqbtAxMRzYxL`.

## Verification Before Release

- 248 focused tests passed; the full suite passed 5,539 tests with 165 skipped
  opt-in checks. Typecheck, local build, and release guard passed.
- Six fresh fictional samples were generated using the real saved-font setting
  and converted through the actual app adapter to the protected hosted service.
  All six are one page with full text preservation, embedded Carlito fonts,
  correct address punctuation, and no unresolved merge placeholders.
- All six page images were inspected. PDFs are 129,784 to 162,479 bytes;
  individual conversion requests took 439 to 3,716 ms. These are single-run
  timings, not cold-start, load, or billing guarantees.
- Earlier separately recorded long-name/address tests remain useful evidence;
  this adapter run covers individual, household, and organization cases for
  both supplied templates. Current live template previews still need checking.
- No real recipient data was sent to the converter, no NXT write was made,
  and no real letter was approved or marked sent during automated validation.

Opt-in QA is in `apps/web/test/societyLetterPdfSamples.test.js` and
`societyLetterPdfHosted.test.js`. It is skipped in normal runs and reads
explicit private credential files only when hosted testing is enabled.
Temporary QA evidence is not included in deployment or Git.

## Staff Pilot

1. In Society Letter Creation > Setup > Letter templates, save Carlito for the
   two JU letters without replacing their files or merge-field mappings.
2. Preview each fictional sample. For a real batch, choose one to three known
   households whose recipient review and current postal readiness pass.
3. Choose PDF, prepare the documents, and inspect every saved PDF. Preparing
   or previewing does not apply appeals. Only approve the intended final files.
4. Approve the batch explicitly, then continue appeal updates in Letter history.
   Download after every member is confirmed; verify a couple and an individual.
   That live acceptance step requires staff approval and is not an automated
   infrastructure smoke test.

If conversion is unreliable, set `SOCIETY_PDF_ENABLED=false` and redeploy JU.
Existing approved document bytes and Word generation remain available. Do not
clear receipts, reapply uncertain appeals, or regenerate approved artifacts.
Increase limits only after live pilot acceptance and resumable batch/storage
work; PDF compression alone does not remove aggregate response-size limits.

## Release Result

Pending deployment and signed-in verification.
