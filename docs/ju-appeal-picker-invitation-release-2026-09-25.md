# JU Appeal Picker and Invitation Email Release

## Deployment Sequence

1. Step 4, verified appeal selection: commit
   `2dfc7eb9ad87058358220c6a4a0f95160af80efe`, deployment
   `dpl_VLnBMnxdBKfHgZ6kN7gnM2P7MtKr`.
2. JU OKTA invitation email: commit
   `d4b37cd9386dbef72fb46495773f7fdd358f9784`, deployment
   `dpl_EznmetvnmwsNB9Hur4sN14FGSccb`.

Both used clean commit archives and explicit JU project
`prj_S8IWnRqqTQwLnd6C5lBfTsMj15VY`, without a Git push. Dry-run manifests
contained no credentials, dependencies, build output, or Git metadata;
`.env.example` was the only environment file. Production SHA and asset checks
passed after each deployment at `https://www.jumgogpt.app`.

Known-good before step 4: `9d8039c3ce6ed15d37c2f1aafa411659afc3a252`, deployment
`dpl_Fdk2FHomKdC7bQedzdfK7HTQuijt`. The additive invitation receipt column is
compatible with rollback; never clear receipts to trigger another email.

## Verification

Step 4: 4,307 tests passed, 21 opt-in skipped; typecheck, build, release guard,
diff check, desktop/mobile and keyboard checks passed.

Invitation email: 4,344 tests passed, 28 opt-in skipped. Seven invitation
PostgreSQL integration tests passed separately against a disposable local
database with a mocked provider. Typecheck, build, release guard and diff check
passed. Email HTML was inspected on desktop and mobile. Signed-in production
Access Management loaded successfully with the new receipt/status controls.
No real invitation or test email was sent; inbox delivery remains untested.
Deployment does not resend existing invitations.

Final read-only Vercel check confirmed JU's five cron paths/schedules unchanged.
The conference sandbox remained Git-disconnected at
`dpl_B8rEqHDQpCyHxZrNArjiS6xTcL3D`; `mgo-gpt-y1r7` remained at
`dpl_29oY1mAgmUuZJGGHR9ySSakcJDKp`.

Step 5 review recovery is subsequent local work, not part of these deployments.
