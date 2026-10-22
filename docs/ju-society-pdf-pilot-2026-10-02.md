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

- 248 focused tests passed; the full suite passed 5,539 tests with 166 skipped
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
  both supplied templates. Live template previews were checked after release,
  as recorded below.
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

Deployed to JU production on October 2, 2026:

- Application commit: `0da8f2424b0b4e13da25ea86a5fa41d164ff7411`.
- Deployment: `dpl_3EaEM2RNzo9KS2adVCH3jyXJWguT`, READY.
- URL: <https://www.jumgogpt.app>.
- Previous deployment: `dpl_3pYpANuonPdHprKv3fQcb5Tqz58Z`.
- A clean archive of the exact commit was deployed directly to the explicit
  JU project, without a Git push. Production version and asset checks passed.
- All five variables above were added to JU production only; both credentials
  are sensitive server variables. The protected converter deployment and all
  five JU cron definitions remain unchanged.
- Unauthenticated access to the society-letter API still returns 401.

Signed-in checks confirmed both saved templates use Carlito. Existing uploaded
files and merge mappings were retained, and all 17 recipient reviews remained
present. The new saved versions are:

| Society | New Template Version |
| --- | --- |
| President's Society | `adf42002af313148c55a1bb34078319f08a30f128ec48a83136806a6b7239519` |
| Order of the Dolphin | `c4753777456d9dfd853a08cab9acd5b2159361f7055eaf8e4853c78a6187e404` |

Both fictional sample previews rendered with logos, merged date, names,
greeting, and comma-separated city/state intact. Selecting PDF displayed the
three-household instructions and selection limit; Word still allows ten.
There were no font-loading or preview-CSP errors. A browser listener/channel
error was logged separately; it did not prevent either preview from rendering.

Sandbox remains on `dpl_DjwTBKV1P5PptBLibP4oQC9GAK6N`, and the other app copy
remains on `dpl_29oY1mAgmUuZJGGHR9ySSakcJDKp`. Neither received PDF variables.
Their Git-link settings were unchanged.

No real-recipient batch was prepared, approved, sent, or marked sent in this
verification, and no NXT appeals were written. Staff must still complete the
one-to-three-household acceptance step above before increasing the limit.
Existing build warnings (deprecated dependencies, PDF.js eval, mixed imports,
chunk size, and optional canvas resolution) remain; both local and hosted
builds completed successfully.
