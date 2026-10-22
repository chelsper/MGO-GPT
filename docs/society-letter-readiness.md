# Society letter readiness

## Scope

The combined society-query holding list has an explicit, read-only readiness
check for postal or email letters. This is not a delivery authorization. It
does not enable the existing query-preview delivery gate, create final letter
batches, send email, mark letters acknowledged, or assign NXT appeals.

## Operator workflow

1. Configure every active annual society in the hierarchy and finish its membership
   query refresh. Membership must be less than 24 hours old and for the current
   recognition period. Giving qualification remains query-defined, not recalculated
   by readiness.
2. Review and save the recipient and address choices for each household. Individuals
   without spouses are supported; missing choices require review without NXT calls.
3. Under **Setup > Appeal settings > Letter appeal settings for this period**, load
   appeal choices, search by name or code, and select each society's dedicated
   letter-sent appeal. Selection fills the exact code/description but does not
   save. Manual entry remains available under its disclosure. The app resolves
   the numeric system record ID; **System record ID (advanced)** remains available
   for explicitly numeric mappings. Existing saved numeric settings are retained.
   Numeric lookup codes are never interpreted as system IDs. Use distinct appeals
   reserved for that society and recognition period, not general fundraising appeals.
   Saving verifies codes/IDs, exact descriptions, and active status using GET requests. The operator must
   confirm that the connected account can read all communication restrictions.
4. Choose postal or email, narrow the holding list if desired, and select
   **Check readiness**. Only the filtered households are included. Successful fresh
   checks and already-acknowledged households are not automatically rechecked.
5. Review **Ready for preview**, **Needs review**, and **Already acknowledged**.
   Unknown, incomplete, restricted, or changed records never become ready silently.

Closing the page pauses continuation after the in-flight request. Returning does
not start NXT requests. **Resume check** continues the saved checkpoint; **Stop
check** preserves results. A Blackbaud cooldown prevents early resume. Readiness
does not have an overnight worker.

## Safety and limits

- Appeal-picker loading is explicit and read-only. Search and selection use a
  single bounded catalog per form; typing never calls NXT. Selection cannot
  bypass the fresh save-time verification described below. See
  [Appeal picker](society-letter-appeal-picker.md) for the full boundary.

- Code-based setup uses one bounded appeal-catalog GET, shared across all selected
  societies for that save. Missing, ambiguous, inactive, or mismatched appeals and
  incomplete catalogs do not replace saved policy. A catalog larger than 5,000
  rows is rejected, never partially matched. Catalog verification and code matching
  use the same helpers as exclusion appeals. Configuration reads never assign
  appeals, send messages, or start constituent readiness checks.
- One NXT household per request, sequential reads, no request-level retries. Up to
  ten local-only checks can be processed per request. The reader has a 12-call,
  60-second budget and a five-second timeout per call. A spouse pair normally uses
  eight calls; a single constituent uses four.
- The existing reviewer authorization, same-origin validation, request revision,
  and 120-second database lease protect all readiness actions. Only the starting
  reviewer resumes a job; another reviewer can stop it and start their own check.
- Current system IDs and reciprocal spouse links must match. A changed spouse link
  prevents using the old spouse's appeal to suppress the current household.
- A dedicated same/higher-tier period appeal on either household member means
  already acknowledged. A lower-tier appeal does not prevent a higher-tier letter.
  The dedicated appeal identifies the period, not its assignment date. This status
  is a read-only finding, not a new delivery-history record.
- Active solicit codes and any returned most-recent consent instruction require
  staff review. This first version deliberately does not infer permission from
  unfamiliar codes or override restrictions. Secondary emails, seasonal addresses,
  missing restriction flags, and changed recipient details also require review.
- Preferred mailing addresses and primary email are compared to saved choices;
  no alternate contact is silently substituted. Required template merge values
  and the highest qualifying society must be present.
- Collection responses must have explicit complete counts, matching constituent
  IDs, unique item IDs, and no continuation link. Incomplete/paged/oversize results
  are held for review rather than treated as empty. No returned URL is followed.
- Connection, permission, quota, and server errors pause at the current household.
  Completed checkpoints survive; raw provider error bodies are not persisted.
- Results expire after 24 hours and invalidate on relevant source, recipient,
  template, period, appeal settings, exclusion, or delivery-history changes.
  A membership refresh requires fresh checks. Saving appeal settings clears prior
  readiness results. Readiness is separate from recipient choices and source jobs.

## Persistence and integration

`stewardship_letters.readiness` is an additive JSONB column (default `{}`). It
stores the period appeal policy, owner/checkpoint, and bounded result summaries.
It does not store complete NXT profiles or communication collections. All existing
state saves preserve this column. No production data migration has been run as
part of local implementation/testing.

The reader uses these fixed GET endpoints:

```text
/fundraising/v1/appeals/{appeal_id}
/constituent/v1/constituents/{constituent_id}
/constituent/v1/constituents/{constituent_id}/appeals
/commpref/v1/constituents/{constituent_id}/constituentsolicitcodes
/commpref/v1/constituents/{constituent_id}/consents?most_recent_only=true
```

The official [Constituent API reference](https://developer.sky.blackbaud.com/api#api=56b76470069a0509c8f1c5b3&operation=ListConstituentAppealsSingleConstituent)
and [Communication Preference API reference](https://developer.sky.blackbaud.com/api#api=communication-preference)
were checked for the profile, appeal, solicit-code, and consent contracts. Live
tenant permissions and actual response completeness still require a small explicit
pilot after deployment and appeal configuration.

## Verification

Automated coverage includes spouse suppression and upgrades, mismatched links,
singles, contact restrictions, impossible dates, missing merge values, stale inputs,
GET-only bounded reads, incomplete responses, owner/revision protection, cooldown,
checkpoint resume, UI explicit-start behavior, and persistence across unrelated
state saves. Isolated PostgreSQL migration/persistence tests and synthetic desktop
and 390-pixel mobile UI checks are separate from JU and sandbox production data.

Next stage: a small, explicitly selected personalized-letter preview pilot, then
separately designed final-generation/delivery and idempotent appeal write-back.
Do not remove the existing delivery gate merely because readiness passed.
