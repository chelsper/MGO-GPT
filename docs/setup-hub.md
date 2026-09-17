# Setup Hub

The `/setup` page is the starting point for workspace administration. It is available to active Admin and Advancement Services accounts, including their legacy role aliases, in either workspace view. Ordinary MGO and Executive accounts cannot read its status API. Existing editor permissions remain unchanged.

## Five setup areas

1. Organization & Terminology: organization branding, shared navigation labels and notification delivery.
2. NXT Connection: saved scheduled-account connection metadata, with links to personal connection settings and account administration.
3. Fundraiser Mapping: counts of active MGO-role workspaces with a saved primary NXT system ID, regardless of displayed job title.
4. Data Sources: links to custom dashboard queries and an explanation of release-managed built-in query and fiscal rules.
5. Reports: saved dashboard and built-in report configuration counts, plus the existing report editor.

Advanced field settings, giving societies and reporting rules are collapsed. Integration Health is offered only to actual Admins. Direct section links scroll and focus their destination after an asynchronous editor loads.

Report Configurations, Organization Settings, Security & Access and Field Settings return to Setup Hub using an explicit, keyboard-accessible link. For workspace managers their breadcrumb path is Home / Setup Hub / current editor, so Home remains directly accessible. Personal account settings and report-viewing pages retain their original navigation. Return links do not save drafts or trigger any data refresh; the report editor's existing unsaved-change warning remains in place.

## Status meaning

- **Ready:** the relevant saved setup values are present. This does not establish correct identities, current NXT authorization, query validity, audience correctness or sandbox isolation.
- **Needs setup:** required saved values are missing. A Lookup ID alone does not satisfy the fundraiser system-ID check.
- **Requires technical configuration:** deployment credentials or protected reporting/source rules need technical work. The Data Sources card uses this status because built-in reports are not yet fully transferable through the UI.
- **Unknown:** a saved read failed. Other areas remain usable; the failed read is not interpreted as missing data or a successful check.

`GET /api/admin/setup-status` authorizes the actual active account from the database, not a session role claim, acting-workspace cookie or supplied user ID. Responses are private and uncached. Reads are section-isolated. The endpoint does not initialize schemas, renew tokens, fetch from NXT, query report data, modify settings or start jobs. The page makes one saved-status request on entry, with an explicit reload and a 20-second client timeout; it does not poll. Credentials and constituent records are not returned.

The NXT card describes the account selected by the existing scheduled-report resolver. It is not a new connection selection policy. Connection management belongs to that account's owner; throttling alone does not justify reconnecting.

## Deliberate limits

This is a navigation and saved-readiness foundation, not a new universal configuration engine. Built-in report calculations, query boundaries, fiscal policies, protected settings, access controls and refresh behavior are unchanged. Terminology still has the scope documented in `organization-configuration.md`; this step does not relabel every screen or export.

Before duplicating the app, provision a separate database and sandbox authorization. Do not transfer production tokens, constituent snapshots, scheduled jobs or viewer access lists. The hub does not certify isolation or provide report-template import/export. Those are separate follow-up phases.
