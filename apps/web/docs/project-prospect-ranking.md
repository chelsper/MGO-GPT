# Project Prospecting Ranking and List Workspace

Project Prospecting defaults to **Prospect Ranking, highest first**. Original query order, names, saved solicitor, tag count and visible query columns remain available. Sorting is presentation only: no NXT writes, household merges, assignment changes or tag transfers.

## Required Saved Output

- Constituent system record ID remains the tag identity.
- Spouse ID, constituent/lookup ID and Marital Status retain the existing safe married-pair rules.
- Head of Household identifies whose giving to display in a paired row. Exactly one affirmative head is required; conflicting or missing heads are not guessed.
- Constituency and Spouse Constituency supply recognition tiers. The best tier across a confirmed married pair is used. Individual rows do not inherit an off-list spouse's constituency.
- Lifetime Giving must be a constituent lifetime total, not the largest or last gift. Repeated identical amounts are deduplicated, not summed. Conflicting or absent amounts remain unranked; an explicit zero is valid.
- Key Indicator must identify individual or organization. Names are never used to guess this.

Unique common headers are detected automatically. Admin-configured exact mappings under **Household, ranking and solicitor fields** take precedence and can be disabled. Adding query outputs requires a completed list refresh before the new fields appear.

## Score

Individuals and married households average three components with equal weight:

1. Constituency points: Alumni Bachelor's Degree 100; Alumni Graduate Degree 80; Trustee 60; Parent - Current 40; Trustee - Former 20; Alumni non-graduate, Friend, Parent - Former, Employee and Employee - Former 0.
2. Lifetime-giving midrank percentile, highest giving best.
3. Distinct-tag-count midrank percentile, most tags best. A tag on both spouses counts once in the household score, without being copied to either spouse.

Organizations average the giving and tag components at 50% each. Percentiles use all rankable rows within the selected project status and household display mode, before search/tag filtering. Ties receive identical midrank points; a one-row population receives 50 percentile points. This avoids a large dollar outlier overwhelming the other equal-weight components. Scores are displayed to one decimal but sorted by their full precision.

Unknown constituency, unavailable tags, conflicting identity/type/giving or ambiguous household heads produce a reason instead of a zero score. Unranked rows remain visible after scored rows in either direction. Search/tag filters do not change the score. Archiving, changing display/status or refreshing source data can change the comparison population.

## Display and Export

On household rows, lifetime and last/largest/first-gift columns show only the confirmed head's values. The original spouse data is retained. Other columns, checkboxes, tags and archive actions remain per person. Ordinary non-giving sorts use matching members, excluding context-only spouses. Household giving sorts always use the head, even when the head is displayed for context only.

CSV exports preserve one row per selected-filter constituent and each person's original source values/tags. They follow the chosen household row order; spouse context outside a filter is not exported. Export Everyone ignores search/tag filters and optionally includes archived people, as explicitly selected. No repeated giving values are summed.

The list workspace keeps bulk tag controls outside its vertically scrolling table and column headers pinned inside it. Additional fields scroll horizontally. Pagination and sort/filter changes reset vertical table scroll. Create-tag and archive/restore actions remain available as compact disclosures. Generic query tables retain their previous behavior unless the new controlled-sort and scrollable options are explicitly enabled.

## Verification

Unit/integration coverage includes hierarchy ties, equal weights, organization rules, ambiguous/missing fields, household head reversal, duplicate amounts, distinct tags, numeric/date sorting, blank-last behavior, spouse context, CSV order, selection identity, reset pagination and cancellation focus. Fictional desktop and 390px mobile checks cover deep scrolling, persistent controls, no page overflow, accessible tag selection and unchanged household score after filtering. No donor records or NXT writes are used for these checks.
