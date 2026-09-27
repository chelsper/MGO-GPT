# JU dashboard helper release

- Source: `5c6dd49b373fa1eca895b2176caee4829016f4e5`.
- Production: `https://www.jumgogpt.app`.
- Deployment: `dpl_NAbEaSxya8WzReFWvSn1Xyvm6cYN`.
- Published from a clean 1,031-file archive to JU's explicit Vercel project. No Git push.
- Verification: 4,614 tests passed, 41 opt-in skipped; typecheck, build, release guard, exact production SHA and asset checks passed.
- Signed-in smoke: Nellie starts collapsed, opens on demand, and loads the selected workspace. A concurrent workspace change correctly returned 409; reloading resolved the selection and loaded Erica's saved reminders. No reminder preferences or donor records were changed.
- Sandbox remains `dpl_3ES2MmNzTHbbvEXriPpm2r2dr7CR`; other linked copy remains `dpl_29oY1mAgmUuZJGGHR9ySSakcJDKp`.
- Additive organization settings and private reminder preferences are initialized by the existing schema guard. Step 3 is not part of this deployment.
