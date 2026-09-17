# My Prospects Module Boundaries

Roadmap step 6, first extraction pass, September 17, 2026. Production release
authorized after local verification. Based on the previously deployed application
`e2cdacad5968e024d16f35707567fb01f5a7748e`. Confirm production availability by
matching the release SHA with the version endpoint and a read-only smoke check.

This is a behavior-preserving refactor, not a new loading strategy, UI redesign,
performance claim, or rewrite of NXT operations. The route page shrinks from
11,638 to 9,788 lines. Much of the opportunity/detail and mutation orchestration
still needs separate, bounded extraction passes.

## Ownership Map

Paths below are relative to `apps/web/src`.

| Module | Owns | Must not absorb |
| --- | --- | --- |
| `app/my-top-prospects/page.jsx` | Workspace/role resolution, query orchestration, refresh runner, category/ranking/assignment mutations, modal selection, and remaining prospect detail/opportunity editors | New automatic NXT requests from card rendering or client-only authorization |
| `app/my-top-prospects/PortfolioTier.jsx` | A tier's existing detailed card content, saved giving/pledge/contact presentation, and callback controls | Query scheduling, mutation ownership, or a second copy of portfolio sorting/pagination |
| `app/my-top-prospects/usePortfolioSummary.js` | Per-mounted-tier summary expansion state, explicit summary reads, retained payload/contact data on errors | Background polling, global summary cache, contact-only refresh scheduling, or any CRM write |
| `app/my-top-prospects/PortfolioRefreshProgress.jsx` | Existing refresh status, busy/cooldown controls, Admin-only diagnostics, and callback dispatch | Job execution, auto-resume timers, leases, retry policy, or connection ownership |
| `app/my-top-prospects/PortfolioCategoryManagerModal.jsx` | Category drafts, parent/sibling options, confirmations, and parent mutation callbacks | API calls or NXT assignment changes |
| `app/my-top-prospects/PortfolioFollowUpModal.jsx` | Existing portfolio next-step/discussion drafts and their local API contracts, focus handling, in-flight guard, and draft-preserving errors | NXT action creation, server authorization, or implicit reminder completion |
| `app/my-top-prospects/ProspectGiving.jsx` | Existing currency display, society badges, and current-FY giving presentation | Credit calculations, metric definitions, or new fetches |
| `app/my-top-prospects/prospectPresentation.js` | Shared button/link styles and the existing action/opportunity URL builder | Identity resolution or treating a Lookup ID as a system ID |
| `components/PortfolioWorklist.jsx` (existing) | Local quick views, search/sort/grouping, pagination, density, card expansion, and preferences | Full NXT enrichment or rank writes from display sorting |
| `components/PortfolioContactDetails.jsx` (existing) | Saved contact display and the scoped, visible-expanded contact-only check | Full summary fetching or merging incomplete reads over saved contacts |

## Preserved Contracts

- Card expansion is not summary expansion. `NXT Summary` explicitly reads
  `/api/blackbaud/constituents/:id/summary`; explicit refresh adds `?refresh=1`.
  Collapsing/reopening a loaded summary reuses its mounted-tier state. Failures
  retain the last payload and verified contacts. Newer verified empty contacts
  must not restore older values.
- Summary state remains local to each tier. The existing workspace-keyed
  worklist/contact-provider subtree resets it when the selected MGO changes.
  Do not hoist this state to an unscoped singleton or remove those keys.
- Parent queries, query keys, enabled gates, mutations, and interval policies are
  unchanged. The refresh renderer delegates commands; the existing parent runner
  still owns continuation/cooldown behavior. Server protections are untouched.
- The portfolio next-step composer still posts to `/api/pending-actions`.
  The discussion composer still reads `/api/users/mgos` and posts to
  `/api/discussion-items`. Their bodies, invalidation keys, and draft behavior
  are unchanged. Neither creates an NXT action. Only discussion mode loads
  teammates, using the existing five-minute freshness/no-focus-refetch policy.
- Admin acting edits and Executive-only read-only views keep their existing
  gating. Rendering a button remains distinct from server permission to write.
- No API route, schema, NXT write receipt, query boundary, fiscal calculation,
  donor record, or refresh schedule changes in this pass. No dependency added.

## Verification

The original 45 focused tests passed before and after extraction. Added 20 tests
cover explicit reads, cached reopening, failure retention, blocked reads during
fallback, verified empty contacts, workspace changes, cooldown/busy callbacks,
Admin-only controls, category decisions and failed drafts, discussion payloads
and in-flight submission guards, giving labels, and identity-preserving URLs.

The focused suite now has 65 tests in 13 files. Full release verification results
are recorded with the change in [workflow readiness](mgo-workflow-readiness.md).
Existing integration tests continue to mount the actual route page; they are not
replaced by mocks of the extracted components.

A one-time AST comparison against the pre-extraction revision verified that all
59 retained/moved top-level declarations have unchanged bodies, the tier's props
and render tree are unchanged, and its four summary-state/handler declarations
are unchanged inside the new hook. Import/export wiring is the intended change.

Actual extracted components with synthetic responses and built CSS were inspected
at 1280px and 390px: compact/expanded portfolio, saved giving and pledges, healthy
maintenance collapse, next-step save feedback, and discussion/category dialogs.
The inspected page/dialogs had no horizontal overflow. This is not a full live
acceptance test. No production app or NXT records were changed.

## Next Extraction Slices

1. Extract the remaining prospect-detail opportunity/activity presentation with
   its current props and existing tests. Preserve ordering, FY rollover consent,
   saved pledge visibility, and read-only behavior.
2. Isolate opportunity form state and mutation orchestration behind contract
   tests for create versus edit, mapped identity, delegated attribution, failed
   drafts, and uncertain outcomes. Do not change UI structure and write semantics
   in the same extraction.
3. Inventory legacy NXT action/opportunity writes before considering a shared
   write coordinator. Compare receipt ownership, identity checks, idempotency,
   verification, and recovery per endpoint. Reuse the proven reminder protocol
   only where its semantics fit; never add generic automatic POST retries or
   imply it already protects every legacy write.

Keep each slice independently testable and releasable. A smaller file alone is
not evidence of correctness or faster loading. Family Import, configurable
reporting policy activation, versioned migrations, and the incoming developers'
safe development/release infrastructure remain separate work.
