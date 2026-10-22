# JU Society Letter Review - October 1, 2026

## Scope

- Organization contacts can optionally keep the organization above the contact
  in the address block. The editable multiline addressee and option are saved;
  the contact's preferred-name greeting stays separate.
- Individual and bulk recipient review now offer Exclude for this period using
  the existing reason, date, confirmation, and NXT safety checks. Cancelling
  returns to the draft without discarding edits. Bulk review advances after a
  confirmed exclusion and counts exclusions separately from saved reviews.
- Excluding from the holding list no longer redirects to Excluded. Search,
  filters, and remaining eligible selections are retained. Excluded stays
  available explicitly for decisions and any NXT updates needing attention.
- Household membership, appeal targets, delivery authorization, and backend
  exclusion safeguards are unchanged. There are no schema migrations.

## Validation

- Regular suite: 421 files and 5,513 tests passed; 164 opt-in tests skipped.
- Type-check, production build, release guard, and whitespace checks passed.
- Regression coverage includes saved organization options, multiline Word
  rendering, exclusion cancellation, bulk advance, errors, and holding-list
  navigation with preserved filters and remaining selections.
- Offline UI checks used actual components with synthetic recipients. No live
  letters, appeal assignments, or recipient edits were submitted for testing.

## Release

- Source: `c09934ff096aacc4bb565fa5b87bfbe6afdd8261`.
- Previous JU release: `fa46f704cd3fc2b35f1212de11f314a332904aa4`, deployment
  `dpl_8dMTf8qFobtrfrwspLHLAmg1AJAH`.
- Clean source archive deployed directly to JU project
  `prj_S8IWnRqqTQwLnd6C5lBfTsMj15VY`; no shared Git push or persistent
  environment changes.
- JU deployment: `dpl_5RLLKJgeS5fJLBbYVnaGzo5YpXTA`,
  `https://mgo-4qxj6oblb-chelspers-projects.vercel.app`, status READY.
- `https://www.jumgogpt.app/api/version` returned the exact source SHA, and
  production HTML returned the new assets. Unauthenticated society-letter API
  access returned 401.
- Sandbox remained at `dpl_DjwTBKV1P5PptBLibP4oQC9GAK6N`; the other copy
  remained at `dpl_29oY1mAgmUuZJGGHR9ySSakcJDKp`.
- Read-only live UI checks confirmed the holding list loaded, the organization
  address option and review exclusion action appeared, and Back to recipient
  review restored the editor. The editor was cancelled and the temporary
  verification tab closed. No recipient changes, exclusions, letters, or NXT
  writes were submitted.
- Successful exclusion navigation was verified by automated and synthetic UI
  tests, not by excluding a real production recipient.
