# Society Letter Word Field Mapping

## Cause

The original OOD document uses native Word MERGEFIELD instructions for its addressee and address, a guillemet greeting split across text runs, and a literal Date paragraph. The old renderer recognized only brace tags. Field-selection checkboxes controlled an allowlist, not what populated existing Word placeholders. Query address components were also collapsed into a string.

## Workflow

1. Open Stewardship > Society Letter Creation > Letter templates.
2. For an existing letter, select **Read fields from Word letter**. No replacement upload is required. Reading is authenticated and read-only; it does not access NXT or acquire a mutation lease.
3. Choose the saved data value for each placeholder. For example, First_Name may use recipient first name, household first names, or the reviewed salutation.
4. For the OOD address-only block, **Full mailing address** uses the reviewed multiline address, including per-recipient edits. This works with existing snapshots without inferring street/city/state/ZIP. **Separate address fields** uses explicit structured components.
5. Save template and field settings. Each society keeps independent, versioned choices. Prepared letters retain their saved template version.
6. Open recipient review and **Preview personalized letter**. The separate saved-template preview still shows the original Word layout, not an actual recipient.

Newly refreshed constituent query snapshots preserve the mapped address components. Existing snapshots need not refresh just to use the full-address block. For separate components, staff may enter them in recipient review. Editing those components rebuilds the mailing address; editing free-form mailing text clears potentially stale components. The backend rejects inconsistent parts and address text. None of this grants mailing permission or changes NXT.

## Boundaries

- Original uploaded Word bytes stay unchanged; mapping is applied to a rendering copy.
- Native simple and non-nested complex MERGEFIELDs and split guillemet placeholders are supported. Unsupported field instructions or incomplete fields are rejected rather than guessed.
- Only an adjacent, address-only paragraph group may become a full-address block. Images, section breaks, tabs, and other non-text objects prevent collapsing that group.
- The optional Date substitution affects only a standalone Date paragraph, not ordinary prose.
- Unknown placeholders require a mapped supported source. Names and missing separate-address data produce actionable errors rather than silently issuing an incomplete letter.
- Existing archive size, external-content, role/origin, revision, hierarchy, delivery and recipient-review protections remain in place.
- No deployment, template saves in production, query refreshes, NXT calls, emails, or appeal assignments are part of this implementation verification.

## Verification

Full suite: 4,178 passed; 21 opt-in tests skipped. Typecheck, production build, release-worktree guard and diff whitespace checks passed. Local browser checks used the actual OOD document and the real renderer with synthetic recipients, confirming date, name, greeting, address and logo. Desktop and 390px-wide mapping controls checked. Local-only settings were saved in memory; production and sandbox remained untouched.
