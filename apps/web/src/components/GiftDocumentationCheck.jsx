import { useMutation } from "@tanstack/react-query";

export default function GiftDocumentationCheck({ item, viewerId, workspaceId }) {
  const check = useMutation({
    retry: false,
    mutationFn: async () => {
      const response = await fetch(`/api/dashboard-priorities?workspaceId=${encodeURIComponent(workspaceId)}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: item.key, revision: item.revision }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "The check couldn't finish. Nothing has changed.");
      if (payload.viewerId !== viewerId || payload.workspaceUserId !== workspaceId ||
          payload.key !== item.key || payload.revision !== item.revision) throw new Error("Your workspace or gift changed. Reload reminders before checking again.");
      return payload.result;
    },
  });
  const result = check.isPending || check.isError ? null : check.data;
  const params = new URLSearchParams({ donor: item.constituentName, blackbaudConstituentId: item.constituentId, returnTo: "/" });
  const message = result?.status === "review"
    ? "I didn't find an opportunity or an action labeled Solicitation in the NXT records returned for this donor. Was this gift unsolicited, a payment on an existing commitment, or is there something you'd like to document?"
    : result?.status === "found"
      ? result.source === "app" ? "There's already documentation saved or being processed in the app. Review the existing records before adding anything."
        : "This donor already has an opportunity or a solicitation action in NXT. Check whether it relates to this gift before adding anything."
      : result?.status === "changed" ? "I couldn't confirm that this gift still matches the saved reminder. Review the donor in NXT before acting; I'm not suggesting a documentation gap."
        : result?.status === "connection" ? "Connect your NXT account before checking this donor's history. This check uses your access, not another person's account."
        : result?.status === "waiting" ? "Another check is running or just finished. Please wait a minute before checking again."
          : result ? "I couldn't verify the full history, so I'm not suggesting that anything is missing. You can review the donor in NXT or try again later." : null;
  return <div className="dashboard-assistant-documentation">
    <div className="dashboard-assistant-documentation-heading">
      <strong>Does this major gift need a note?</strong>
      <button type="button" disabled={check.isPending} onClick={() => check.mutate()}>
        {check.isPending ? "Checking NXT..." : check.data ? "Check history again" : "Check documentation"}
      </button>
    </div>
    {!check.data && !check.isPending && <p>Check this gift and the donor's opportunities and solicitation actions when you're ready. Nothing will be added or changed.</p>}
    {check.isPending && <p role="status">Checking this donor only. You can keep using your dashboard.</p>}
    {check.isError && <p role="alert">{check.error.message}</p>}
    {message && <p role="status">{message}</p>}
    {result?.status === "review" && <div className="dashboard-assistant-actions">
      <a href={`/action-opportunity-update?${params}&mode=opportunity`}>Review opportunity form</a>
      <a href={`/action-opportunity-update?${params}&mode=action&actionType=Solicitation`}>Log completed solicitation</a>
    </div>}
    {result?.checkedAt && <p className="dashboard-assistant-note">Checked {new Date(result.checkedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}. Review recent changes in NXT before creating a record.</p>}
    <details className="dashboard-assistant-note">
      <summary>What this check covers</summary>
      <p>A limited, read-only check using your NXT access. It includes inactive opportunities and actions across all dates and fundraisers for this donor, not their spouse or related organizations. Recent NXT changes can take time to appear. Partial results, unfamiliar action types, and connection limits never count as missing documentation.</p>
      <p>Finding a record does not prove it relates to this gift. This is a review prompt, not a requirement to create an opportunity. Use Dismiss reminder below if no follow-up is needed.</p>
    </details>
  </div>;
}
