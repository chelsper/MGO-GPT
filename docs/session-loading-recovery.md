# Session Loading Recovery

Protected pages now wait for a bounded session check before mounting their workflow.
A confirmed missing or expired session offers sign-in with the original internal
path, query, and fragment preserved. Public sign-in and password-recovery routes
remain accessible. A failed check offers a read-only retry instead of an indefinite
loading screen; it does not imply that a user is disabled or disconnected from NXT.

`useUser` limits the full session request (including reading the body) to 15 seconds,
deduplicates overlapping focus checks, and cancels stale work on unmount or clear.
A transient background error retains the already-loaded user so file-picker focus
events do not unmount an import form. A successful empty session or HTTP 401 still
clears the client session. Server-side authorization remains unchanged and continues
to validate every protected request; retained client state never grants access.

My Top Prospects also handles its own independent session check with the same
recovery screen. This fixes the previous `loading || !user` indefinite-spinner path.
No automatic sign-out, account change, NXT reconnect, or write retry is performed.

## Verification

Required workflow tests cover missing sessions, fetch/body timeouts, safe return
paths, retry, confirmed expiration, transient background failures, overlapping focus
events, stale responses after clear/unmount, StrictMode remounts, public routes, and
Admin/Executive workspace controls. They use fictional sessions and no live providers.

A matching loading screen is not proof of the remote browser's precise failure.
If sign-in recovery does not resolve it, collect the affected URL, time, and a
redacted network/error screenshot. Do not reset accounts or reconnect NXT solely
because the sign-in check failed.
