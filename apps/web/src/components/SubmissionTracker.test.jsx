import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import SubmissionTracker from "./SubmissionTracker";

const { user, view } = vi.hoisted(() => ({ user: { email: "reviewer@example.org" }, view: { effectiveRole: "admin", isReviewerView: true } }));
vi.mock("@/utils/useUser", () => ({ default: () => ({ data: user, loading: false }) }));
vi.mock("@/utils/useWorkspaceView", () => ({ default: () => view }));
let rows, requests;
beforeEach(() => {
  view.isReviewerView = true;
  requests = [];
  rows = [{ id: 78, donor_name: "Historical Activity", submission_type: "donor_update", interaction_type: "Cultivation", status: "Pending", blackbaud_sync_status: "not_requested", notes: "Met with donor", date_submitted: "2026-07-14" }];
  vi.stubGlobal("fetch", vi.fn(async (url) => {
    if (url === "/api/users/profile") return { ok: true, json: async () => ({ user: { id: 1, role: "admin" } }) };
    if (url.includes("/api/submissions/")) return { ok: true, json: async () => rows };
    if (url === "/api/data-requests") return { ok: true, json: async () => requests };
    if (url.includes("/api/constituency-import/")) return { ok: true, json: async () => ({ runs: [] }) };
    return { ok: true, json: async () => [] };
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("detailed activity tracker", () => {
  it("shows direct requests and staff progress in the MGO Stewardship tab without a broken follow-up link", async () => {
    view.isReviewerView = false;
    requests = [{ id: 23, stewardship_request_key: "direct-key", constituent_name: "Sample Foundation", request_type: "Stewardship: Campus visit", status: "In Progress",
      request_note: "A campus visit", reviewer_notes: "Visit planned for next week.", stewardship_context: { constituentId: "100", constituentName: "Sample Foundation", opportunityId: "40", opportunityTitle: "Future scholarship" } }];
    render(<SubmissionTracker detailedReview />);
    fireEvent.click(await screen.findByRole("button", { name: "Stewardship (1)" }));
    expect(screen.getByText("Opportunity: Future scholarship")).toBeInTheDocument();
    expect(screen.getByText(/Visit planned for next week/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "View linked follow-up" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Mark complete", hidden: true })).toBeNull();
  });
  it("does not show approval controls for a routine Pending log", async () => {
    render(<SubmissionTracker detailedReview />);
    await screen.findByText("Historical Activity");
    expect(screen.getByText("Saved in app")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Imports/ })).not.toBeInTheDocument();
    expect(fetch.mock.calls.some(([url]) => url.includes("import"))).toBe(false);
    expect(screen.getByText(/NXT sync is not confirmed/)).toBeInTheDocument();
    expect(screen.queryByText("Review status")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save review", hidden: true })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Pending (0)" }));
    expect(screen.queryByText("Historical Activity")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "History (1)" }));
    expect(screen.getByText("Historical Activity")).toBeInTheDocument();
    expect(fetch.mock.calls.some(([, options]) => options?.method === "POST")).toBe(false);
  });

  it("keeps genuine manual requests reviewable", async () => {
    rows[0].interaction_type = "Data update";
    render(<SubmissionTracker detailedReview />);
    await screen.findByText("Historical Activity");
    expect(screen.getByText("Review status")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save review", hidden: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pending (1)" })).toBeInTheDocument();
  });

  it("shows MGO users a saved status instead of a false pending approval", async () => {
    view.isReviewerView = false;
    render(<SubmissionTracker detailedReview />);
    await screen.findByText("Historical Activity");
    await waitFor(() => expect(screen.getByText("Saved in app")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Save review", hidden: true })).not.toBeInTheDocument();
  });

  it.each([false, true])("shows the same stewardship request in the work queue without duplicate controls (reviewer=%s)", async reviewer => {
    view.isReviewerView = reviewer;
    requests = [{ id: 22, source_pending_action_id: 17, source_pending_action_status: "Done", constituent_name: "Sample Foundation", request_type: "Stewardship: Personal gift", status: "In Progress", request_note: "A small gift, please.", reviewer_notes: "Choosing options for you.", created_at: "2026-09-28" }];
    render(<SubmissionTracker detailedReview />);
    fireEvent.click(await screen.findByRole("button", { name: "Stewardship (1)" }));
    expect(await screen.findByText("Sample Foundation")).toBeInTheDocument();
    expect(screen.getByText("Choosing options for you.", { exact: false })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark complete", hidden: true })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: reviewer ? "Manage in Stewardship" : "View linked follow-up" })).toHaveAttribute("href", reviewer
      ? "/stewardship/requests?requestId=22" : "/follow-ups?tab=next-steps&nextStepId=17&status=Done");
    expect(fetch.mock.calls.some(([, options]) => options?.method)).toBe(false);
  });
});
