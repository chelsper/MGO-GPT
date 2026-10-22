# Society Letter Organization Contacts

Organization records can use a returned Main contact or Society
letter contact to personalize their letter. This changes name merge data only,
not household membership, giving qualification, hierarchy, or NXT appeal targets.
No additional per-constituent NXT reads are made.

## Source Setup

Under Source & period, open each society's Output columns and load query fields.
In Organization contacts, map Key indicator and either:

- Contact type plus Contact first name and/or Contact last name, for contact
  rows identified as Main Contact or Society Letter Contact.
- Dedicated Main contact first/last name and Society letter contact first/last
  name columns when NXT exports each category separately.

Unused mappings remain blank. First and last names must belong to the same
contact on each query row. An unfiltered relationship name column cannot be
treated as a dedicated contact category. Generic role matching is deliberately
limited to Main Contact, Society Letter, Society Letters, Society Letter Contact,
and Society Letters Contact (case-insensitive).

Key indicator = Organization enables contacts regardless of constituency code.
An explicit Individual (or unknown nonblank type) does not enable them, even
with a Business/Foundation code. When Key indicator is absent or blank, exact
Business/Foundation codes remain supported for older configurations. Conflicting
nonblank indicators across rows/queries reject the refresh rather than guessing.
Optional contact preferred-name columns support more familiar greetings.

Save source settings and refresh membership after mapping. Old snapshots cannot
contain columns newly added to a query. Source changes invalidate prior recipient
reviews and readiness checks through the existing source signature.

Read-only production metadata inspection on September 25 found 17 fields in
queries 31043 and 31049, including Constituency Code but not contact-name columns.
The user was asked whether those outputs had been saved. No production settings
or queries were changed during implementation.

## Recipient Review

Choose the organization under Recipient record, then use Name this letter to.
Every eligible contact name is offered with its role. No contact is selected
automatically, even when only one is available. The organization's saved greeting
remains an explicit option. Selecting a contact suggests its name as addressee and
its preferred name (falling back to first name) as salutation; both remain editable.

The existing first_name, last_name, and first_names template fields use the
selected contact. Spouse-name fields remain empty for that contact. The
household_name field still identifies the organization. The mailing address and
email choices stay with the qualifying organization; a contact's email or address
is not inferred or fetched. Contacts are not added as society members or appeal
assignment targets. Saving recipient choices does not send a letter.

## Integrity

- Query rows still deduplicate by constituent System Record ID.
- Contact names are retained as paired values, never independently combined.
- Exact duplicate name-and-role choices collapse; names do not establish identity.
- Multiple constituency codes and contacts are accumulated independently of the
  stable name, spouse, greeting, and address fields. Conflicts in those stable
  fields still reject the refresh.
- Contact options are unioned across society queries without changing the highest
  qualifying letter. At most 20 contact choices are retained per constituent.
- Key indicator takes precedence over the legacy Business/Foundation fallback.
- A saved contact choice is validated against the selected organization's current
  returned options. Cross-record or forged choices are rejected.
- Changed contacts invalidate saved recipient reviews and readiness tokens.
- Existing snapshot, raw-row, byte, household, and delivery safety limits remain.

## Preferred Names and Individual Edits (September 28)

Map Constituent preferred name and Spouse preferred name under Letter greeting.
Load query fields and Use recognized fields suggests unambiguous main/spouse
preferred names using query metadata, never an unrelated contact's name.
Review mappings for each society, save, then explicitly refresh membership to
include newly added outputs. Existing snapshots cannot contain new query columns.

Unreviewed individual salutations prefer the preferred name. Joint suggestions
use both members' preferred names with independent first-name fallbacks; an
incomplete spouse name retains the query salutation rather than dropping a
spouse. Without preferred names, the query salutation remains the default.
Formal holding-list names and all member IDs stay unchanged. Current saved
recipient wording and unsaved drafts take precedence over new UI suggestions.
Source changes still require a new review and invalidate delivery readiness.

Letter first_name, spouse_first_name and first_names merge fields use preferred
names when available, then first names. The recipient editor displays editable
name fields actually used by the saved template beside the greeting. These
explicit per-letter overrides are saved with the existing recipient choices,
applied to Word/email rendering, and included in conflict comparison and
readiness fingerprints. They never change NXT names, contacts or appeal targets.
Changing recipient/contact resets those overrides; Reset name fields to query
values removes them without changing the addressee or salutation.

If Word uses a name field instead of salutation, the editor explains which
values to edit. Mapping the Word greeting to Salutation in Letter templates
makes the normal Salutation input control that placeholder directly. No template
is remapped automatically, and no document is rendered while typing.
