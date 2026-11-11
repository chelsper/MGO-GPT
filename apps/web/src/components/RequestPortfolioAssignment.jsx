"use client";

import { useEffect, useId, useRef, useState } from "react";
import { requestPortfolioAssignment } from "@/utils/portfolioAssignmentRequest";

const buttonStyle = {
  minHeight: "40px", padding: "9px 13px", borderRadius: "999px",
  border: "1px solid #A7D6CA", background: "#EFFAF6", color: "#006B52",
  fontSize: "14px", fontWeight: 800, cursor: "pointer",
};

export default function RequestPortfolioAssignment({ constituentId, constituentName, user, viewingOtherWorkspace = false }) {
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [state, setState] = useState({ status: "idle", message: "" });
  const reasonId = useId();
  const busy = useRef(false);
  const controller = useRef(null);
  useEffect(() => () => controller.current?.abort(), []);
  const submitted = state.status === "requested";
  const loading = state.status === "loading";

  async function submit(action) {
    if (busy.current) return;
    busy.current = true;
    setConfirming(false);
    setState({ status: "loading", message: "" });
    const abort = new AbortController();
    controller.current = abort;
    try {
      const result = await requestPortfolioAssignment({
        constituentId, constituentName, reason, action, expectedUserId: String(user.id),
      }, abort.signal);
      if (!abort.signal.aborted) setState(result);
    } catch (error) {
      if (!abort.signal.aborted) setState({
        status: error.safeToCorrect ? "idle" : "needs_verification",
        message: error.safeToCorrect ? error.message : "We could not confirm the request yet. Check request status before sending again. This does not change NXT or your portfolio.",
      });
    } finally { busy.current = false; }
  }

  return <div style={{ maxWidth: "360px", flex: "0 1 auto" }}>
    {!confirming && <button type="button" style={{ ...buttonStyle, cursor: loading || submitted ? "default" : "pointer" }} disabled={loading || submitted}
      onClick={() => state.status === "needs_verification" ? submit("verify") : setConfirming(true)}>
      {loading ? "Checking request..." : submitted ? `Request ${state.reviewStatus?.toLowerCase() || "submitted"}` : state.status === "needs_verification" ? "Check request status" : "Request portfolio assignment"}
    </button>}
    {!confirming && !submitted && <p style={{ margin: "5px 0 0", fontSize: "12px", color: "#52645E" }}>Advancement Services review required</p>}
    {confirming && <div role="group" aria-label="Request an assignment from Advancement Services" style={{ border: "1px solid #A7D6CA", borderRadius: "12px", background: "#F4FBF8", padding: "12px" }}>
      <p style={{ margin: "0 0 10px", fontSize: "14px", lineHeight: 1.5 }}>
        Ask Advancement Services to assign {constituentName || "this constituent"} to you ({user.name || user.email}) as Lead Solicitor.
      </p>
      <p style={{ margin: "0 0 12px", fontSize: "13px", lineHeight: 1.5 }}>This is a request for review, not an assignment. NXT and your portfolio stay unchanged until Advancement Services approves and makes the change.</p>
      <label htmlFor={reasonId} style={{ fontSize: "13px", fontWeight: 700 }}>Reason (optional)</label>
      <textarea id={reasonId} value={reason} maxLength={2000} rows={3} onChange={event => setReason(event.target.value)}
        style={{ width: "100%", boxSizing: "border-box", margin: "5px 0 10px", padding: "8px", borderRadius: "8px", border: "1px solid #AAC5BC", font: "inherit", resize: "vertical" }} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
        <button type="button" style={buttonStyle} onClick={() => submit("submit")}>Send to Advancement Services</button>
        <button type="button" style={{ ...buttonStyle, background: "white" }} onClick={() => setConfirming(false)}>Cancel</button>
      </div>
    </div>}
    {state.message && <p role="status" style={{ fontSize: "13px", lineHeight: 1.45, margin: "8px 0 0", color: submitted ? "#166534" : "#475569" }}>{state.message}</p>}
    {state.notificationWarning && <p style={{ fontSize: "13px", color: "#92400E" }}>{state.notificationWarning}</p>}
    {submitted && (viewingOtherWorkspace
      ? <p style={{ fontSize: "13px" }}>Switch back to your own workspace to track this in Data Requests.</p>
      : <a href="/data-requests" style={{ display: "inline-block", marginTop: "6px", color: "#006B52", fontSize: "13px" }}>View my requests</a>)}
  </div>;
}
