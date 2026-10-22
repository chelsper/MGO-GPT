# JU Invitation Email

New administrator-created invitations now await an email from
`JUMGOGPT <notifications@jumgogpt.app>`. The message links to
`https://www.jumgogpt.app/account/signin`, identifies the existing
**Continue with Jacksonville University SSO** button, and directs users to
their existing JU credentials and normal OKTA MFA. No separate password,
sign-up token, constituent details, or credentials are included.

Existing pending invitations are not replayed on deployment or page load.
An administrator may explicitly use **Re-send email**. Provision-only workspace
creation, existing user edits, and role changes do not send invitations.

## Delivery Safety

- Sending is limited to the JU Vercel project in Production, with configured
  OKTA and Resend credentials, the verified notification sender, and a JU
  recipient address. Preview, local, and sandbox fail closed without a send.
- A nullable `user_invitations.invitation_email` JSONB column stores status,
  attempt UUID/time, and provider receipt. It is additive and rollback-compatible;
  the schema guard does not modify historical rows or queue emails.
- An atomic SQL claim prevents simultaneous sends, excludes accepted/revoked
  invitations and existing users, and enforces a 60-second resend cooldown.
- A fixed Resend endpoint, bounded timeout, and per-attempt idempotency key
  protect the request. No automatic retry is made.
- Provider acceptance is labeled **accepted**, not inbox delivery. Rejections
  are **failed**. Timeouts, uncertain provider responses, and receipt-write
  failures remain **unknown/sending**, blocking another send.
- The access grant remains saved when email fails. The pending-invitations
  list retains delivery status and the last attempt timestamp.

For an uncertain result, inspect the durable attempt and Resend receipt/events
before any recovery. Do not clear the claim or create another send merely to
test delivery. A process interruption can leave `sending`; treat it as uncertain.
No new automated provider-status reconciliation or delivery webhook is added.

The provider's [idempotency retention](https://resend.com/docs/dashboard/emails/idempotency-keys)
is bounded, so the app keeps its durable guard independently. JU isolation uses
[Vercel system project/environment variables](https://vercel.com/docs/environment-variables/system-environment-variables).

## Acceptance

Unit/API tests exercise configuration, message content, recipients, auth/origin,
provider outcomes, receipt persistence, and trigger exclusions. Opt-in local
PostgreSQL tests exercise concurrency, cooldowns, and uncertain/closed records.
No live invitation or test email should be sent without a specific authorized
recipient. Provider acceptance does not establish inbox delivery.

September 25 validation: 4,344 tests passed (28 opt-in skipped); the seven
invitation PostgreSQL tests also passed separately. Typecheck, build, release
guard, and diff check passed. Desktop/mobile email preview passed. JU production
configuration was checked without sending or printing secrets. One unrelated
SubmissionTracker timing failure passed in isolation and in both subsequent
full runs without modifying that test. No live email was sent for verification.
