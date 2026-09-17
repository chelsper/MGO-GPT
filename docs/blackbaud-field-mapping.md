# Blackbaud Field And Identity Contracts

Reviewed September 17, 2026. This replaces the early read-only/phase-one proposal.
Constituent import, action writes, and linked opportunity edits are implemented.
This is a map to current contracts, not authorization to turn on arbitrary NXT
field writes or an exhaustive external API specification.

## Identity First

| Identifier | Meaning and rule |
| --- | --- |
| NXT constituent system ID | Canonical link for constituent API paths and related records; store the exact returned ID |
| NXT Lookup ID | User-editable constituent identifier; resolve and verify live for imports, never substitute it into a system-ID path |
| Local user/prospect/reminder ID | App database key; not a Blackbaud identifier |
| NXT fundraiser mapping | Stored MGO identity and permitted report aliases; protected writes verify the primary saved system ID and active fundraiser status |
| NXT opportunity/action/gift ID | ID of that object, not the related constituent; retain exact IDs for updates and verification |
| Query QRECID | Object-specific system record ID; pledge discovery needs the gift QRECID, not a constituent Lookup ID |

A numeric string does not identify its namespace. A historical cached Lookup-ID
match can become wrong after an NXT correction. The import path uses current
identity checks and rejects changed targets before writes. Rejected suggestions
are recorded decisions, not proof that all duplicate checks completed.

## Current Mapping Boundaries

| Area | Direction / authority | Implemented boundary |
| --- | --- | --- |
| Constituent identity and names | NXT to saved app views; controlled import creation | Display values are not an identity match. Explicit import workflow determines creation versus update |
| Emails, phones, addresses | NXT to saved contacts; reviewed import additions/replacements | Contact entry IDs, type, primary state, and intended operation matter. A saved contact is not proof its primary flag was confirmed |
| Addressee/salutation | Controlled import writes using selected name-format options | Table-based formats are supported; distinguish them from editable/custom text and verify tenant table options |
| Constituencies and education | Staged import writes | Preserve hierarchy/identity safeguards and per-step checkpoints; identical education records are skipped, not replaced automatically |
| Current fundraiser assignments | NXT to portfolio snapshots | Role and active assignment determine display/grouping; local Top Prospect membership is a separate concept |
| Top Prospect rank, categories, local status | App only | No generic write-back to NXT constituent inactive status, fundraiser assignment, or opportunity status |
| Primary/additional next steps | App only unless a user explicitly adds an NXT action | Due date, completion, and discussion state are independent from an NXT action's state |
| Team discussion and participation | App only | Adding a constituent topic or resolving discussion does not alter the constituent or close an opportunity |
| Linked opportunities | NXT reads and explicit create/edit routes | Local `blackbaud_opportunity_id` links the record; stage, amounts, and dates use the opportunity payload builder |
| FY rollover prompt | Explicit linked-opportunity edit | Eligible prior-FY open opportunities can update expected date to current FY end; not an automatic rewrite of all opportunities |
| NXT actions | Explicit user-requested creation/metadata updates; saved IDs for verification | Category, type, date, constituent, fundraiser credit, and opportunity link must belong to the intended operation |
| Gifts, pledge schedules, fund descriptions | NXT to verified saved reports | No gift edits are implied by report refresh or display. See the reporting contract for amount/credit meanings |
| Prospect Pool assignment/disposition | App workflow plus supported NXT custom-field/solicitor operations | App assignment and successful NXT sync are separately reported outcomes |
| Submission review/history | App workflow status plus independent sync evidence | Approving a local queue item is not an NXT write or proof of sync |

These are workflow-specific operations, not unrestricted bidirectional
synchronization. Do not replace them with a blanket last-write-wins merge.

## Planned Versus Completed Actions

The reminder action dialog requires explicit intent. Planned actions send
`completed: false`, omit completion date/custom status, and do not complete the
local reminder. Completed actions follow their verification/metadata flow and
may complete the reminder only with explicit consent and a valid current version.

The selected MGO receives fundraiser credit; the actual signed-in Admin remains
the author for delegated entry. A missing fundraiser mapping must not be replaced
by a convenient name/email match.

A durable reminder receipt claims the submission before create and saves the NXT
action ID before verification. Read-only recovery compares the exact saved ID with
the original payload. It does not resubmit or silently change a later NXT edit.
Other legacy action/submission routes are not automatically covered by this newer
protocol. See [Follow-ups & Discussion](follow-ups-workspace.md).

## Import Safety And Verification

New-record creation and applying additional details are distinct checkpoints.
Partial success must preserve the created identity and every confirmed write.
If the record already exists from this import, do not reject/retarget it as if it
were merely a suggestion, or send another create request.

Original CSV identifiers may remain audit evidence while NXT assigns fresh IDs
during explicitly confirmed creation. Lookup-ID and system-ID columns must remain
distinct. Not-a-match controls exclude a candidate; final duplicate checking,
creation eligibility, and confirmation still apply.

Verification can finish a row by re-reading already-applied NXT fields without
resending them. Uncertain primary-contact changes and incomplete identity checks
remain review states, not a reason to recreate the person or replay all details.
See [Quick Constituent Import](quick-constituent-import.md) for candidate criteria,
safe additions, duplicate holds, locks, and recovery.

## Source Map

- [NXT transport](../apps/web/src/app/api/utils/blackbaud.js) defines request helpers.
- [Field mappings](../apps/web/src/app/api/utils/blackbaudFieldMappings.js) defines configurable mapping behavior, not every workflow's authorization.
- [Import target identity](../apps/web/src/app/api/utils/importTargetIdentity.js) and [write checkpoints](../apps/web/src/app/api/utils/importWriteCheckpoint.js) protect staged updates.
- [Reminder action protocol](../apps/web/src/app/api/utils/pendingActionNxt.js) owns its create/verify/recovery contract.
- [Linked opportunity editing](../apps/web/src/app/api/prospects/opportunities/[id]/route.js) applies the current opportunity payload mapping.
- [Metric definitions](metrics-and-reporting.md) distinguishes gift credit, actions, local coverage, and pledge balances.

Before adding another mapped field, specify identity, source of truth, allowed
actors, null/clear semantics, stale-edit handling, duplicate/retry behavior, and
verification evidence. Test against approved tenant options without exposing
donor data or broadening permissions. Family Import remains deferred.
