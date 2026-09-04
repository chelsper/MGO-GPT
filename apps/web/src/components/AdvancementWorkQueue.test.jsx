import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import AdvancementWorkQueue, { loadQueueSource } from "./AdvancementWorkQueue";

let data, lists, submissions, imports, failData, failSave;
const json = (payload, ok = true) => ({ ok, json: async () => payload });
beforeEach(() => {
  data = [{ id: 1, constituent_name: "Example Donor", request_type: "Contact update", requester_name: "Example Officer", status: "Open", created_at: "2026-09-01", request_note: "Please check contact details." }];
  lists = [{ id: 2, purpose: "Event invitations", requester_user_name: "List Requester", status: "Complete", output_type: "nxt_only", date_needed: "2026-03-31T00:00:00.000Z" }, { id: 3, purpose: "Visit preparation", status: "Needs Clarification", reviewer_notes: "Which city?" }];
  submissions = [{ id: 4, donor_name: "Synced Example", status: "Pending", blackbaud_sync_status: "synced" }];
  imports = [{ id: "5", sourceFilename: "Example import.csv", needsReviewCount: 12, rowCount: 12 }];
  failData = false;
  failSave = false;
  vi.stubGlobal("fetch", vi.fn(async (url, options = {}) => {
    if (options.method) {
      if (failSave) return json({ error: "Save unavailable; try again" }, false);
      const body = JSON.parse(options.body);
      return json({ id: url.includes("data-requests") ? 1 : body.id, ...body, reviewer_notes: body.reviewerNotes });
    }
    if (url.includes("data-requests")) return failData ? json({ error: "Data service unavailable" }, false) : json(data);
    if (url.includes("list-requests")) return json(lists);
    if (url.includes("submissions/all")) return json(submissions);
    if (url.includes("constituency-import")) return json({ runs: imports, nextCursor: null });
    throw new Error(`Unexpected request ${url}`);
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const ready = async () => waitFor(() => expect(screen.getByRole("button", { name: "Refresh queues" })).toBeEnabled());
const rowButton = (name) => screen.getByRole("button", { name: new RegExp(name) });

describe("compact reviewer queue", () => {
  it("opens on active work and does not load NXT while browsing", async () => {
    render(<AdvancementWorkQueue />);
    await ready();
    expect(screen.getByText("Example Donor")).toBeInTheDocument();
    expect(screen.getByText("Example import.csv")).toBeInTheDocument();
    expect(screen.queryByText("Event invitations")).not.toBeInTheDocument();
    expect(screen.queryByText("Visit preparation")).not.toBeInTheDocument();
    expect(screen.queryByText("Synced Example")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /Reviewer notes/ })).not.toBeInTheDocument();
    fireEvent.click(rowButton("Example Donor"));
    expect(screen.getByText("Please check contact details.")).toBeInTheDocument();
    expect(fetch.mock.calls).toHaveLength(4);
    expect(fetch.mock.calls.every(([url]) => !url.includes("blackbaud"))).toBe(true);
  });

  it("uses list and data entry points as filters and keeps completed lists in History", async () => {
    render(<AdvancementWorkQueue initialCategory="lists" />);
    await ready();
    expect(screen.getByText("No open work in this view")).toBeInTheDocument();
    fireEvent.click(rowButton("^History"));
    fireEvent.click(rowButton("Event invitations"));
    expect(screen.getByText("Deliver in NXT")).toBeInTheDocument();
    expect(screen.getByText("List Requester", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Due Mar 31, 2026")).toBeInTheDocument();
    expect(screen.queryByText("Synced Example")).not.toBeInTheDocument();
  });

  it("completes work, moves it to History, and supports reopening", async () => {
    render(<AdvancementWorkQueue initialCategory="data" />);
    await ready();
    fireEvent.click(rowButton("Example Donor"));
    fireEvent.change(screen.getByRole("textbox", { name: /Reviewer notes/ }), { target: { value: "Verified contact details" } });
    fireEvent.click(screen.getByRole("button", { name: "Complete request" }));
    await screen.findByText(/Moved to History/);
    expect(screen.queryByText("Example Donor")).not.toBeInTheDocument();
    const call = fetch.mock.calls.find(([, options]) => options?.method === "PATCH");
    expect(call[0]).toBe("/api/data-requests/1?view=reviewer");
    expect(JSON.parse(call[1].body)).toMatchObject({ status: "Completed", reviewerNotes: "Verified contact details" });
    fireEvent.click(rowButton("^History"));
    expect(screen.getByRole("textbox", { name: /Reviewer notes/ })).toHaveValue("Verified contact details");
    fireEvent.click(screen.getByRole("button", { name: "Reopen request" }));
    await screen.findByText(/Moved to Open work/);
  });

  it("preserves drafts across collapse and failed saves", async () => {
    failSave = true;
    render(<AdvancementWorkQueue />);
    await ready();
    fireEvent.click(rowButton("Example Donor"));
    fireEvent.change(screen.getByRole("textbox", { name: /Reviewer notes/ }), { target: { value: "Keep this draft" } });
    fireEvent.click(rowButton("Example Donor"));
    fireEvent.click(rowButton("Example Donor"));
    expect(screen.getByRole("textbox", { name: /Reviewer notes/ })).toHaveValue("Keep this draft");
    fireEvent.click(screen.getByRole("button", { name: "Save notes" }));
    await screen.findByText("Save unavailable; try again");
    expect(screen.getByRole("textbox", { name: /Reviewer notes/ })).toHaveValue("Keep this draft");
  });

  it("requires notes before clarification and moves the request into Waiting", async () => {
    lists = [{ id: 3, purpose: "Visit preparation", status: "Pending" }];
    render(<AdvancementWorkQueue initialCategory="lists" />);
    await ready();
    fireEvent.click(rowButton("Visit preparation"));
    fireEvent.click(screen.getByRole("button", { name: "Request clarification" }));
    await screen.findByText(/Write your clarification question/);
    expect(fetch.mock.calls.some(([, options]) => options?.method)).toBe(false);
    fireEvent.change(screen.getByRole("textbox", { name: /Reviewer notes/ }), { target: { value: "Which city?" } });
    fireEvent.click(screen.getByRole("button", { name: "Request clarification" }));
    await screen.findByText(/Moved to Waiting on requester/);
    fireEvent.click(rowButton("^Waiting on requester"));
    expect(screen.getByRole("textbox", { name: /Reviewer notes/ })).toHaveValue("Which city?");
  });

  it("retains the last good source when refresh fails and still shows other queues", async () => {
    render(<AdvancementWorkQueue />);
    await ready();
    failData = true;
    fireEvent.click(screen.getByRole("button", { name: "Refresh queues" }));
    await screen.findByRole("alert");
    await ready();
    expect(screen.getByText("Example Donor")).toBeInTheDocument();
    expect(screen.getByText("Example import.csv")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("counts may be incomplete");
  });

  it("searches within the chosen view and has accessible expansion controls", async () => {
    render(<AdvancementWorkQueue />);
    await ready();
    fireEvent.change(screen.getByRole("textbox", { name: "Search requests" }), { target: { value: "Example Officer" } });
    expect(screen.queryByText("Example import.csv")).not.toBeInTheDocument();
    const button = rowButton("Example Donor");
    expect(button).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(within(document.getElementById(button.getAttribute("aria-controls"))).getByText("Review this request")).toBeInTheDocument();
  });
});

describe("import queue pagination", () => {
  it("loads beyond the old 12-batch cap, including the oldest unfinished batch", async () => {
    fetch.mockReset();
    const batches = Array.from({ length: 123 }, (_, index) => ({ id: String(123 - index), readyCount: index === 122 ? 1 : 0 }));
    fetch.mockImplementation(async (url) => {
      const before = new URL(url, "https://example.com").searchParams.get("beforeId");
      const remaining = batches.filter((row) => !before || Number(row.id) < Number(before));
      const page = remaining.slice(0, 50);
      return json({ runs: page, nextCursor: remaining.length > 50 ? page.at(-1).id : null });
    });
    const rows = await loadQueueSource("imports", "/api/constituency-import/runs?queue=all&limit=50");
    expect(rows).toHaveLength(123);
    expect(rows.at(-1)).toMatchObject({ id: "1", readyCount: 1 });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("does not silently accept a partial batch list or loop on a repeated cursor", async () => {
    fetch.mockReset();
    fetch.mockResolvedValue(json({ runs: [{ id: "10" }], nextCursor: "10" }));
    await expect(loadQueueSource("imports", "/api/constituency-import/runs?queue=all")).rejects.toThrow("did not advance");
    expect(fetch).toHaveBeenCalledTimes(2);
    fetch.mockResolvedValue(json({ runs: [] }));
    await expect(loadQueueSource("imports", "/api/constituency-import/runs?queue=all")).rejects.toThrow("incomplete");
  });
});
