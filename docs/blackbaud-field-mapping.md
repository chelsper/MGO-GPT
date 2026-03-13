# Blackbaud NXT Field Mapping

This is the working mapping sheet for syncing data between `jumgogpt.app` and Blackbaud Raiser's Edge NXT.

Use this document to decide:
- which app fields should map to NXT
- which NXT field is the source of truth
- whether the flow is `pull`, `push`, `bidirectional`, or `local only`
- any special selection rules such as "Primary only"

Recommended rollout:
1. Start with `pull` mappings only.
2. Link local records to Blackbaud IDs.
3. Keep workflow-only fields local until read-only sync is stable.

## Direction Guide

| Direction | Meaning |
|---|---|
| `pull` | Data comes from Blackbaud into the app |
| `push` | Data originates in the app and writes to Blackbaud |
| `bidirectional` | Data may update in either system |
| `local only` | Stay in the app only; do not sync to Blackbaud |

## Constituent

| App entity | App field | Blackbaud object | Blackbaud field / endpoint | Selection rule | Direction | Source of truth | Notes |
|---|---|---|---|---|---|---|---|
| `constituents` | `blackbaud_constituent_id` | Constituent | `id` | Store exact NXT constituent ID | `pull` | Blackbaud NXT | Primary link key |
| `constituents` | `name` | Constituent | Display / full name | Use the constituent's primary display name | `pull` | Blackbaud NXT | |
| `constituents` | `email` | Constituent email addresses | Primary email | Pull only the email marked `Primary = true`; if none is primary, leave blank | `pull` | Blackbaud NXT | |
| `constituents` | `phone` | Constituent phone numbers | Primary phone | Pull only the phone marked `Primary = true`; if none is primary, leave blank | `pull` | Blackbaud NXT | |
| `constituents` | `organization` | Constituent / employment / organization link | TBD | Decide whether this should come from primary organization, employer, or another NXT field | `pull` | Blackbaud NXT | Needs decision |

## Prospect

| App entity | App field | Blackbaud object | Blackbaud field / endpoint | Selection rule | Direction | Source of truth | Notes |
|---|---|---|---|---|---|---|---|
| `prospects` | `blackbaud_constituent_id` | Constituent | `id` | Match to linked constituent | `pull` | Blackbaud NXT | Added for linking |
| `prospects` | `prospect_name` | Constituent | Display / full name | Use linked constituent name | `pull` | Blackbaud NXT | If linked |
| `prospects` | `expected_close_fy` | Opportunity or local workflow | TBD | Keep local unless you decide to sync opportunity forecast | `local only` | App | Recommended local for phase 1 |
| `prospects` | `ask_amount` | Opportunity rollup or local ranking | TBD | Keep local rollup until opportunity sync is defined | `local only` | App | |
| `prospects` | `ask_type` | Local workflow | N/A | Internal categorization | `local only` | App | |
| `prospects` | `status` | Prospect / opportunity rollup | TBD | Keep local until opportunity sync is stable | `local only` | App | |
| `prospects` | `priority_order` | Local ranking | N/A | User-managed ordering | `local only` | App | |
| `prospects` | `closed_amount` | Opportunity outcomes | TBD | May eventually pull from linked NXT opportunities | `local only` | App | Start local |
| `prospects` | `next_action_text` | Local workflow | N/A | Internal next step | `local only` | App | |
| `prospects` | `next_action_due_date` | Local workflow | N/A | Internal next step due date | `local only` | App | |

## Prospect Opportunities

| App entity | App field | Blackbaud object | Blackbaud field / endpoint | Selection rule | Direction | Source of truth | Notes |
|---|---|---|---|---|---|---|---|
| `prospect_opportunities` | `id` | Opportunity | `id` | Add a future `blackbaud_opportunity_id` when ready | `local only` | App | Not implemented yet |
| `prospect_opportunities` | `title` | Opportunity | TBD | Opportunity title / description | `local only` | App | Defer until write-back design |
| `prospect_opportunities` | `current_stage` | Opportunity | Stage | Possible future mapping | `local only` | App | |
| `prospect_opportunities` | `estimated_amount` | Opportunity | Amount | Possible future mapping | `local only` | App | |
| `prospect_opportunities` | `opportunity_status` | Opportunity | Status / outcome | Possible future mapping | `local only` | App | |
| `prospect_opportunities` | `closed_amount` | Opportunity | Closed / booked amount | Possible future mapping | `local only` | App | |
| `prospect_opportunities` | `close_date` | Opportunity | Close date | Possible future mapping | `local only` | App | |
| `prospect_opportunities` | `decline_reason` | Opportunity | Outcome notes | Possible future mapping | `local only` | App | |

## Prospect Pool

| App entity | App field | Blackbaud object | Blackbaud field / endpoint | Selection rule | Direction | Source of truth | Notes |
|---|---|---|---|---|---|---|---|
| `prospect_pool` | `blackbaud_constituent_id` | Constituent | `id` | Use when reviewer adds a known NXT person into the pool | `pull` | Blackbaud NXT | |
| `prospect_pool` | `prospect_name` | Constituent | Display / full name | Pull from linked constituent if matched | `pull` | Blackbaud NXT | Otherwise manual |
| `prospect_pool` | `email` | Constituent email addresses | Primary email | Use only the primary email if linked | `pull` | Blackbaud NXT | Otherwise local |
| `prospect_pool` | `phone` | Constituent phone numbers | Primary phone | Use only the primary phone if linked | `pull` | Blackbaud NXT | Otherwise local |
| `prospect_pool` | `note` | Local workflow | N/A | Internal note from Advancement Services | `local only` | App | |
| `prospect_pool` | `needs_contact_info` | Local workflow | N/A | Internal request flag | `local only` | App | |
| `prospect_pool` | `contact_info_request_note` | Local workflow | N/A | Internal request note | `local only` | App | |
| `prospect_pool` | `solicitor_requested` | Local workflow | N/A | Internal workflow flag | `local only` | App | |

## Submissions

| App entity | App field | Blackbaud object | Blackbaud field / endpoint | Selection rule | Direction | Source of truth | Notes |
|---|---|---|---|---|---|---|---|
| `submissions` | `submission_type` | N/A | N/A | Workflow-only record | `local only` | App | |
| `submissions` | `donor_name` | Possibly contact report context | TBD | Keep local for now | `local only` | App | |
| `submissions` | `interaction_type` | Contact report | TBD | Candidate future write-back | `local only` | App | Defer |
| `submissions` | `transcript` | N/A | N/A | Internal reference | `local only` | App | |
| `submissions` | `notes` | Contact report / action notes | TBD | Candidate future write-back | `local only` | App | Defer |
| `submissions` | `next_step` | Local workflow | N/A | Internal reviewer + MGO workflow | `local only` | App | |
| `submissions` | `status` | Local workflow | N/A | Review queue state | `local only` | App | |
| `submissions` | `reviewer_notes` | Local workflow | N/A | Internal clarification loop | `local only` | App | |

## Blackbaud Search Phase 1

Recommended first implementation:

1. Read-only constituent search from Blackbaud
2. Match/select one constituent
3. Save `blackbaud_constituent_id` locally
4. Pull only:
   - display name
   - primary email
   - primary phone
   - organization (once defined)

Do **not** write updates back to NXT in phase 1.

## Open Decisions

- Which NXT field should drive `constituents.organization`?
- Do you want to sync NXT opportunities later, or keep app opportunities local?
- Should the app ever write contact reports/actions back to NXT?
- Should prospect owner / fundraiser assignment come from NXT or stay local?

## Notes

- OAuth is already connected.
- Before real NXT data can flow, the Blackbaud app still needs data scopes beyond `offline_access`.
- Once scopes are added, reauthorize and test the read-only route:
  - `/api/blackbaud/constituents/search?q=smith`
