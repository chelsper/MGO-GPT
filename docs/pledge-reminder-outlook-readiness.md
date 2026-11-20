# Pledge reminder Outlook readiness

Checked November 20, 2026, at approximately 10:48 AM America/New_York.
Status: simple PDF/compose-link handoff deployed November 20, 2026 (commit `6cfb46847bf04eb4112bf1490fd40fe026868eb6`). A Microsoft Graph mailbox connection is not implemented or required for this version. Separate staff-confirmed NXT action logging is described in [Pledge payments](pledge-payments.md#staff-confirmed-sending-and-nxt-actions); it is not part of that deployed handoff release.

## Current implementation

The user chose the simpler workflow: privately generate one PDF, download it, open a prefilled Outlook/default-mail compose link, attach the file manually, and send in Outlook. Existing CSV export remains available. Online-giving instructions only were explicitly approved on November 20; bank/stock instructions remain in the staff Word template. No mailbox permissions, OAuth flow, automatic attachment, send operation, sent history or NXT action is added. See [Pledge payments](pledge-payments.md#individual-pdf-and-outlook-handoff) for behavior and limits.

The IT/Graph plan below is optional future work, not a prerequisite for the current release. The findings and 35-test result describe the original readiness inspection before implementation.

## Findings

- Production reports commit `684f1c56cad489c3b26e5ef01fbac8fec07e13b9` and deployment `dpl_69i2hxA2AtWNv1vJHWQ9MMmbaagM`; this matches the inspected source.
- JU has Okta sign-in configured. Its authentication route does not request Microsoft Graph mailbox access. Okta sign-in is not an Outlook connection.
- Production configuration-key inspection found no Microsoft, Entra, Azure, Graph, or Outlook-named connection settings. Secret values were not printed or used.
- The code has an Outlook calendar compose link, but no Graph mailbox OAuth flow or draft-creation client. Resend email support is separate and cannot create drafts in staff Outlook mailboxes.
- Existing pledge reminders export CSVs from reviewed saved pledge data. They do not create PDF attachments, Outlook drafts, sent history, or NXT outreach actions. Drafts currently exist only in the page.
- All 35 existing reminder tests passed across the CSV utilities, reminder panel, and reminder API. These use fictional fixtures and mocked provider/database calls, not live Outlook or NXT.

This review did not inspect JU's Entra tenant or consent policy. An app registration might exist there, but no connection is implemented in this deployed application. No permissions, environment settings, donor records, or live drafts were changed. Nothing was sent or deployed.

## Request for JU IT

Please review a Microsoft 365 integration for JUMGOGPT at `https://www.jumgogpt.app`. Its purpose is to create personalized pledge-reminder drafts, with a PDF attachment, in the signed-in staff member's own Outlook mailbox. Staff will review and send in Outlook themselves.

Requested initial scope:

- A JU-owned, single-tenant Microsoft Entra application for a server-side web connection, separate from the existing Okta sign-in configuration.
- Microsoft Graph **delegated** `Mail.ReadWrite`, not application-wide permission. Do not grant `Mail.Send`, `Mail.Send.Shared`, `Mail.ReadWrite.Shared`, or application permissions for this pilot.
- Identity scopes `openid profile` for validated account binding. Initially avoid `offline_access`; a later persistent-connection phase must explicitly review refresh-token storage and revocation.
- One named pilot staff member with an Exchange Online mailbox and existing Admin or Advancement Services access in JU. No shared mailbox or acting-as-another-MGO behavior in the first version.
- Confirmation that JU's consent and conditional-access policies permit the proposed pilot. Delegated `Mail.ReadWrite` is not inherently admin-consent-only, but JU policy may require approval.
- Tenant ID, application/client ID, approved pilot account, credential provisioning/rotation owner, and approved credential storage method. Provision any credential directly into the authorized secret store; do not email or paste it into chat.

**Permission disclosure:** `Mail.ReadWrite` permits creating, reading, updating, and deleting mail in the consenting user's mailbox. It is not limited to drafts. It does not include sending permission. The application must additionally restrict its own implementation to creating and checking its own reminder drafts, with no unrelated mailbox browsing, deletion, automatic sending, or changes to existing user drafts. These code restrictions do not narrow Microsoft's consent grant. See [Microsoft's permission definition](https://learn.microsoft.com/en-us/graph/permissions-reference#mailreadwrite).

Proposed Web-platform callback, to finalize with the implementation before use:

`https://www.jumgogpt.app/api/outlook/callback`

This endpoint does not exist yet. Do not attempt to connect or grant consent against it now. Do not register wildcard preview deployments or alter the existing Okta redirect configuration. Any local/test callback must be agreed separately for the actual test environment.

## First prototype after approval

1. Implement an opt-in connection for the authenticated reviewer using the JU tenant and validated account binding. Use a supported Microsoft authentication library, authorization code flow with PKCE, session-bound single-use state, and OIDC validation. Keep credentials/tokens server-side and out of logs, URLs, browser storage, and generated files. The existing Okta app sign-in remains unchanged. [Microsoft flow guidance](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow)
2. Generate one fictional, watermarked pledge-reminder PDF and a personalized HTML email. Use only a designated staff test recipient. Do not copy donor data, real payment instructions, or banking information into test fixtures or public assets.
3. Show the connected mailbox, intended recipient, body, and PDF for confirmation. Create one draft via `POST /me/messages`, including the attachment. Do not call any send, forward, or reply-and-send operation. [Microsoft draft creation](https://learn.microsoft.com/en-us/graph/api/user-post-messages?view=graph-rest-1.0)
4. Save an actor-scoped reminder identity and draft receipt. A double-click should reuse the same draft; a lost response must enter an uncertain state, not trigger a blind second POST. Check only the app's draft before offering a recovery decision.
5. Offer **Open Outlook draft** using the validated returned `webLink`. This opens Outlook on the web; it is not a guarantee of a desktop pop-up. Verify desktop Drafts synchronization separately on the staff client's actual Outlook version. [Microsoft message links](https://learn.microsoft.com/en-us/graph/api/resources/message?view=graph-rest-1.0)
6. Keep the result **Draft created**, not **Sent**. No NXT action or balance change occurs in this prototype. Retain the existing CSV option.

## Acceptance checks

- Correct pilot mailbox, recipient, personalized text, dates, amounts, pledge identity, and matching readable PDF; no other recipient's information in the attachment.
- Missing connection, denied consent, wrong tenant/account, expired session/token, revoked access, missing mailbox, wrong role, and cross-user access fail safely.
- Cancelled consent and closed drafts do not create NXT records or mark anything sent.
- Duplicate clicks, concurrent tabs, timeout after Graph accepts a draft, and a failed local receipt save cannot silently create additional drafts. Do not overwrite a staff-edited draft during recovery.
- A blocked pop-up leaves an accessible link and saved draft. Opening a draft does not imply sending it.
- PDF-generation failures create no partial draft. Incomplete or uncertain attachment results remain visibly blocked from the app's ready workflow.
- Later real-data use must separately validate current pledge amounts, intended recipient/email permissions, and any changed approved content. Do not simply reuse postal address eligibility as email eligibility or expose soft-credit/household financial details to an unverified recipient.
- Tests assert no send endpoint, Resend transport, or NXT write is invoked. Complete the first live Outlook check with fictional data only after explicit mailbox-connection approval.

## Subsequent NXT action phase

After draft creation is verified, add **I sent this - record in NXT** with the actual sending date, actor, pledge identity, fund, due date, and amount from the reminder. Treat this as staff-confirmed sending, not provider-verified delivery. Confirm an appropriate existing NXT action type before implementation.

Maintain a durable, unique reminder/action receipt. An uncertain NXT write needs reconciliation before retry; a confirmed logging failure retries only the action, never the email. Creating, exporting, or opening a draft never creates a sent action automatically. Automated sent-message verification is a separate later feature.

## Original readiness verification

Run from the matching release's `apps/web` directory:

```sh
node node_modules/vitest/vitest.mjs run src/utils/pledgeReminders.test.js src/components/PledgeReminderPanel.test.jsx src/app/api/pledge-payments/reminders/route.test.js
```

Original result: 3 files passed, 35 tests passed, 0 skipped, before implementation. No live Outlook connection or sending test was performed. Microsoft Graph configuration and approval would still be required only for the optional future automatic-attachment integration.

## Current implementation verification

- `npm run build` passed the required workflow gate (209 files, 3,872 tests, zero skipped), route generation, TypeScript checks and production client/server build on November 20, 2026. This is local validation, not production promotion.
- Fictional PDF fixtures were rendered and visually inspected: past-due, upcoming and a two-page long-name/address case. Single-spaced address, leading-zero ZIP, amounts and page boundaries were checked.
- Chrome preview used the actual reminder components with fictional local responses only. PDF download activated the explicit Outlook/default-mail links; changing the addressee cleared them; the existing CSV still exported afterward. A downloaded PDF was present on disk.
- Desktop and 390px-wide layouts were inspected; mobile content width matched the viewport without horizontal overflow. No real mailbox was opened and no donor data, email or NXT action was submitted. Staff's actual Outlook client and attachment workflow remain a post-deployment pilot check.
- No new dependencies, environment settings, database schema or PDF converter are required. Source remains in the `codex/pledge-outlook-readiness` worktree. The local node_modules symlink and fictional preview/download files are not release artifacts.
