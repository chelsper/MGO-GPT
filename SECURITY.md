# Security Notes

This app handles donor, prospect, fundraiser, and institutional workflow data. Treat the repository and every deployment environment as sensitive.

## Secrets

Never commit real credentials or `.env` files.

Use one of these instead:

- Vercel environment variables for deployed environments
- A password manager for local developer setup
- Temporary credentials with explicit expiration when possible

If a secret is accidentally committed:

1. Rotate or revoke it immediately.
2. Remove it from the repository.
3. Assume the old value is compromised.

## Required External Access

Production behavior depends on several external systems:

- Okta app credentials and redirect URI configuration
- Blackbaud SKY API client credentials, subscription key, scopes, and approved callback URL
- Neon/Postgres database connection string
- Resend API key for email notifications
- Vercel project settings and environment variables

Do not share these credentials through GitHub issues, pull requests, email, Slack, or chat transcripts.

## Blackbaud Scopes

The app may require these scopes depending on enabled workflows:

```text
offline_access rnxt.r rnxt.w rnxt.d
```

After scope changes, the Blackbaud Marketplace/admin approval and OAuth reconnect flow may both be required before the app sees the updated permissions.

## GitHub Access

Prefer least-privilege access:

- Use collaborator access for normal development.
- Use pull requests for changes to `main`.
- Avoid granting repository Admin unless the developer needs to manage settings.

## Production Safety

Before production deploys:

```bash
cd apps/web
npm run check:release
npm run build
```

After deployment:

```bash
npm run verify:prod -- <expected-commit-sha>
```

If production is not serving the expected commit, stop debugging application behavior and fix deployment state first.
