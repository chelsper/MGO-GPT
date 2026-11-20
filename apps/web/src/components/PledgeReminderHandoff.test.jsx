import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PledgeReminderHandoff from "./PledgeReminderHandoff";
import { reminderDraft as draft, reminderSource as source, reminderToday as letterDate } from "../../test/fixtures/pledgeReminder";
let onBusy, createUrl, revoke;
const stopNavigation = event => { if (event.target.closest("a")) event.preventDefault(); };
const response = () => ({ handoff: { pledgeId: draft.pledge.id, refreshedAt: draft.pledge.refreshedAt, letterDate,
  checkedAt: new Date().toISOString(), filename: "pledge-reminder-SAMPLE-P100-2026-11-20.pdf", pdf: btoa("%PDF-1.7\nfictional fixture\n%%EOF"),
  email: { address: "avery@example.test", reason: "" }, subject: "Fictional reminder", message: "Dear Avery,\nPlease see the attached reminder." } });
const props = () => ({ drafts: [draft], source, letterDate, disabled: false, onBusy });
beforeEach(() => {
  onBusy = vi.fn(); createUrl = vi.fn(() => "blob:fictional-pdf"); revoke = vi.fn();
  vi.stubGlobal("URL", { createObjectURL: createUrl, revokeObjectURL: revoke });
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(response())));
  document.addEventListener("click", stopNavigation);
});
afterEach(() => { cleanup(); document.removeEventListener("click", stopNavigation); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
async function prepare() {
  fireEvent.click(screen.getByText("Prepare a PDF and Outlook email"));
  fireEvent.click(screen.getByRole("checkbox", { name: /I checked this recipient/ }));
  fireEvent.click(screen.getByRole("button", { name: "Prepare PDF & email" }));
  await screen.findByText("Prepared, not sent");
}
describe("one-recipient PDF and email handoff", () => {
  it("requires explicit preparation, requests server-verified data and never opens or sends automatically", async () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    render(<PledgeReminderHandoff {...props()} />); expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Prepare PDF & email", hidden: true })).toBeDisabled();
    await prepare(); expect(fetch).toHaveBeenCalledOnce(); expect(open).not.toHaveBeenCalled();
    const request = JSON.parse(fetch.mock.calls[0][1].body);
    expect(request).toMatchObject({ operation: "pdf", confirm: true, fields: draft.fields, jobId: source.jobId, letterDate });
    expect(request).not.toHaveProperty("amountDueCents");
    expect(screen.getByRole("button", { name: "Open Outlook on the web" })).toBeDisabled();
    fireEvent.click(screen.getByRole("link", { name: "Download reminder PDF" }));
    expect(screen.getByRole("link", { name: "Open Outlook on the web" })).toHaveAttribute("href", expect.stringContaining("https://outlook.office.com/mail/deeplink/compose?to=avery%40example.test"));
    expect(screen.getByRole("link", { name: "Open default email app" })).toHaveAttribute("href", expect.stringContaining("mailto:avery%40example.test"));
    expect(screen.getByText(/Attach the downloaded PDF yourself/)).toBeInTheDocument();
    expect(screen.getByText(/No sent status or NXT action is recorded/)).toBeInTheDocument();
    expect(onBusy.mock.calls).toEqual([[true], [false]]);
  });
  it("keeps the PDF available but blocks email links when NXT email is restricted or missing", async () => {
    const data = response(); data.handoff.email = { address: "", reason: "Primary email is restricted." };
    fetch.mockResolvedValue(Response.json(data)); render(<PledgeReminderHandoff {...props()} />); await prepare();
    expect(screen.getByRole("link", { name: "Download reminder PDF" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("restricted");
    expect(screen.queryByRole("link", { name: /Open Outlook/ })).not.toBeInTheDocument();
  });
  it("updates only email text, keeps recipient fixed and disables unsafe/empty text", async () => {
    render(<PledgeReminderHandoff {...props()} />); await prepare();
    fireEvent.click(screen.getByRole("link", { name: "Download reminder PDF" }));
    expect(screen.getByLabelText("To (primary NXT email)")).toHaveAttribute("readonly");
    fireEvent.change(screen.getByLabelText("Email message"), { target: { value: "Hello Avery & family" } });
    expect(screen.getByRole("link", { name: /Open Outlook/ })).toHaveAttribute("href", expect.stringContaining("Hello%20Avery%20%26%20family"));
    fireEvent.change(screen.getByLabelText("Email subject"), { target: { value: "" } });
    expect(screen.queryByRole("link", { name: /Open Outlook/ })).not.toBeInTheDocument(); expect(fetch).toHaveBeenCalledOnce();
  });
  it.each(["date", "address", "pledge"])("invalidates the PDF and handoff when %s changes", async change => {
    const p = props(), component = render(<PledgeReminderHandoff {...p} />); await prepare();
    const next = structuredClone(draft);
    if (change === "address") next.fields.City = "Other City";
    if (change === "pledge") next.pledge.refreshedAt = "2026-11-20T15:00:00Z";
    component.rerender(<PledgeReminderHandoff {...p} drafts={[next]} letterDate={change === "date" ? "2026-11-21" : letterDate} />);
    expect(screen.queryByText("Prepared, not sent")).not.toBeInTheDocument(); expect(revoke).toHaveBeenCalledWith("blob:fictional-pdf");
    expect(screen.getByRole("checkbox", { name: /I checked this recipient/ })).not.toBeChecked();
  });
  it.each(["identity", "pdf", "filename", "date"])("rejects mismatched or malformed %s responses", async change => {
    const data = response();
    if (change === "identity") data.handoff.pledgeId = "20";
    if (change === "pdf") data.handoff.pdf = btoa("not a PDF");
    if (change === "filename") data.handoff.filename = "../../other.pdf";
    if (change === "date") data.handoff.checkedAt = "2000-01-01";
    fetch.mockResolvedValue(Response.json(data)); render(<PledgeReminderHandoff {...props()} />);
    fireEvent.click(screen.getByText("Prepare a PDF and Outlook email")); fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Prepare PDF & email" }));
    await screen.findByRole("alert"); expect(createUrl).not.toHaveBeenCalled();
  });
  it("shows a cache/conflict failure without a PDF or email link", async () => {
    fetch.mockResolvedValue(Response.json({ error: "Pledge changed; reload worklist" }, { status: 409 }));
    render(<PledgeReminderHandoff {...props()} />); fireEvent.click(screen.getByText("Prepare a PDF and Outlook email"));
    fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(screen.getByRole("button", { name: "Prepare PDF & email" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Pledge changed"); expect(createUrl).not.toHaveBeenCalled();
  });
  it("expires the handoff and requires re-preparation without changing an external draft", async () => {
    vi.useFakeTimers(); render(<PledgeReminderHandoff {...props()} />);
    fireEvent.click(screen.getByText("Prepare a PDF and Outlook email")); fireEvent.click(screen.getByRole("checkbox"));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Prepare PDF & email" })));
    expect(screen.getByText("Prepared, not sent")).toBeInTheDocument();
    await act(async () => vi.advanceTimersByTimeAsync(16 * 60 * 1000));
    expect(screen.getByRole("alert")).toHaveTextContent("over 15 minutes old");
    expect(screen.queryByRole("link", { name: "Download reminder PDF" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Open Outlook/ })).not.toBeInTheDocument(); expect(fetch).toHaveBeenCalledOnce();
  });
  it("aborts on unmount and does not automatically retry failed requests", async () => {
    let signal;
    fetch.mockImplementation((url, options) => new Promise((resolve, reject) => { signal = options.signal; signal.addEventListener("abort", () => reject(new Error("aborted"))); }));
    const component = render(<PledgeReminderHandoff {...props()} />);
    fireEvent.click(screen.getByText("Prepare a PDF and Outlook email")); fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Prepare PDF & email" }));
    await act(async () => component.unmount()); expect(signal.aborted).toBe(true); expect(fetch).toHaveBeenCalledOnce();
  });
});
