import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PledgeReminderPanel from "./PledgeReminderPanel";
const row = { id: "1", constituentId: "10", lookupId: "P100", name: "Fictional Avery", stale: false, totalCents: 100000,
  balanceCents: 70000, paidToDateCents: 20000, amountDueCents: 20000, dueDate: "2026-11-01", refreshedAt: "2026-11-18T12:00:00Z", fundDescriptions: ["Scholarships"] };
const source = { rows: [row], today: "2026-11-18", jobId: "job", view: "pastDue" };
const fields = { Addressee: "Avery Example", Address_Line_1: "10 Test St", Address_Line_2: "", City: "Jacksonville", State: "FL", Zip: "01234" };
const makeDraft = pledge => ({ pledge, fields: { ...fields }, warnings: [], blocked: "", checkedAt: "2026-11-18T13:00:00Z" });
let objectUrl, anchor, onClose;
beforeEach(() => {
  onClose = vi.fn(); objectUrl = vi.fn(() => "blob:reminder");
  vi.stubGlobal("URL", { createObjectURL: objectUrl, revokeObjectURL: vi.fn() });
  anchor = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn(async (url, options) => {
    const body = JSON.parse(options.body);
    return Response.json(body.operation === "check" ? { verified: true } : { draft: makeDraft({ ...row, id: body.pledges[0].id }) });
  }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const open = (data = source) => render(<PledgeReminderPanel source={data} onClose={onClose} />);
const select = () => fireEvent.click(screen.getByRole("button", { name: /Select up to/ }));
const prepare = async () => { select(); fireEvent.click(screen.getByRole("button", { name: "Prepare selected reminders" })); await screen.findByRole("heading", { name: "Review reminder details" }); await waitFor(() => expect(screen.getByRole("button", { name: "Close reminders" })).not.toBeDisabled()); };
const review = () => fireEvent.click(screen.getByRole("checkbox", { name: /I reviewed/ }));
describe("pledge reminder preparation", () => {
  it("opens without network calls, prepares only on request, requires review and checks saved state before exporting", async () => {
    open(); expect(fetch).not.toHaveBeenCalled(); await prepare();
    const button = screen.getByRole("button", { name: "Download 1 pledge reminders CSV" }); expect(button).toBeDisabled();
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ operation: "prepare", jobId: "job", view: "pastDue", pledges: [{ id: "1", refreshedAt: row.refreshedAt }] });
    review(); fireEvent.click(button);
    await screen.findByText(/1 reminder rows exported/);
    expect(JSON.parse(fetch.mock.calls[1][1].body).operation).toBe("check"); expect(anchor).toHaveBeenCalledOnce();
    const csv = await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsText(objectUrl.mock.calls[0][0]); });
    expect(csv).toContain('"Addressee","Address_Line_1","Address_Line_2","City","State","Zip"');
    expect(csv).toContain('"Avery Example","10 Test St","","Jacksonville","FL","01234"');
    expect(csv).toContain('"$1,000.00","$200.00","$200.00"');
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:reminder"), { timeout: 2000 });
  });
  it("resets confirmation after a local name, address or letter-date edit without NXT writes", async () => {
    open(); await prepare(); review();
    fireEvent.click(screen.getByText(/P100 \/ Ready for review/));
    fireEvent.change(screen.getByLabelText("Addressee"), { target: { value: "Dr. Avery Example" } });
    expect(screen.getByRole("checkbox", { name: /I reviewed/ })).not.toBeChecked();
    review(); fireEvent.change(screen.getByLabelText("Letter date"), { target: { value: "2026-11-20" } });
    expect(screen.getByRole("checkbox", { name: /I reviewed/ })).not.toBeChecked(); expect(fetch).toHaveBeenCalledOnce();
  });
  it("keeps blocked and missing-address drafts out while allowing ready rows to proceed", async () => {
    const rows = [row, { ...row, id: "2", lookupId: "P200" }, { ...row, id: "3", lookupId: "P300" }];
    fetch.mockImplementation(async (url, options) => { const id = JSON.parse(options.body).pledges[0].id;
      const draft = makeDraft(rows.find(row => row.id === id));
      if (id === "2") draft.blocked = "NXT address says Do not mail.";
      if (id === "3") draft.fields.Address_Line_1 = "";
      return Response.json({ draft });
    });
    open({ ...source, rows }); await prepare();
    expect(screen.getByText(/1 ready \/ 2 not included yet/)).toBeInTheDocument(); review();
    expect(screen.getByRole("button", { name: "Download 1 pledge reminders CSV" })).not.toBeDisabled();
    fireEvent.click(screen.getByText(/P300 \/ Needs review/));
    const third = screen.getByText(/P300 \/ Needs review/).closest("details");
    fireEvent.change(within(third).getByLabelText("Address Line 1"), { target: { value: "20 Verified Street" } });
    expect(screen.getByText(/2 ready \/ 1 not included yet/)).toBeInTheDocument();
  });
  it("preserves completed drafts after a failure and explicitly continues only remaining reads", async () => {
    const second = { ...row, id: "2", lookupId: "P200" };
    fetch.mockResolvedValueOnce(Response.json({ draft: makeDraft(row) })).mockResolvedValueOnce(Response.json({ error: "Connection paused" }, { status: 503 }));
    open({ ...source, rows: [row, second] }); await prepare(); await screen.findByRole("alert");
    expect(screen.getByText(/P100 \/ Ready for review/)).toBeInTheDocument();
    fetch.mockResolvedValueOnce(Response.json({ draft: makeDraft(second) }));
    fireEvent.click(screen.getByRole("button", { name: "Continue reminder preparation" }));
    await screen.findByText(/2 ready \/ 0 not included yet/);
    expect(fetch.mock.calls.map(([, options]) => JSON.parse(options.body).pledges[0].id)).toEqual(["1", "2", "2"]);
  });
  it("retains drafts if the export cache check fails and does not create a CSV", async () => {
    open(); await prepare(); review(); fetch.mockResolvedValueOnce(Response.json({ error: "Saved worklist changed" }, { status: 409 }));
    fireEvent.click(screen.getByRole("button", { name: "Download 1 pledge reminders CSV" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Saved worklist changed"); expect(objectUrl).not.toHaveBeenCalled();
    expect(screen.getByText(/P100 \/ Ready for review/)).toBeInTheDocument();
  });
  it("pauses after the current read without losing it or starting another", async () => {
    let resolve; fetch.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    open({ ...source, rows: [row, { ...row, id: "2" }] }); select(); fireEvent.click(screen.getByRole("button", { name: "Prepare selected reminders" }));
    fireEvent.click(screen.getByRole("button", { name: "Pause after current read" }));
    await act(async () => resolve(Response.json({ draft: makeDraft(row) })));
    expect(screen.getByText(/Preparation paused/)).toBeInTheDocument(); expect(fetch).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Continue reminder preparation" })).not.toBeDisabled();
  });
  it("asks before discarding unsaved drafts and excludes stale pledges", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    open({ ...source, rows: [row, { ...row, id: "2", lookupId: "P200", stale: true }] }); await prepare();
    expect(screen.getByRole("checkbox", { name: /Include pledge P200/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Close reminders" })); expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Close reminders" })); expect(onClose).toHaveBeenCalledOnce(); expect(confirm).toHaveBeenCalledTimes(2);
  });
  it("caps both bulk and individual selection at 200 and allows clearing it", () => {
    open({ ...source, rows: Array.from({ length: 201 }, (_, index) => ({ ...row, id: String(index + 1), lookupId: `P${index + 1}` })) });
    select(); expect(screen.getByText("200 selected")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Include pledge P201 for Fictional Avery" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Include pledge P1 for Fictional Avery" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Include pledge P201 for Fictional Avery" }));
    expect(screen.getByText("200 selected")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear reminder selection" }));
    expect(screen.getByText("0 selected")).toBeInTheDocument(); expect(fetch).not.toHaveBeenCalled();
  });
  it("times out a stalled read without retrying it automatically", async () => {
    vi.useFakeTimers();
    fetch.mockImplementation((url, options) => new Promise((resolve, reject) => options.signal.addEventListener("abort", () => reject(new Error("aborted")))));
    open(); select(); fireEvent.click(screen.getByRole("button", { name: "Prepare selected reminders" }));
    await act(async () => vi.advanceTimersByTimeAsync(25000));
    expect(screen.getByRole("alert")).toHaveTextContent("The read took too long"); expect(fetch).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Prepare selected reminders" })).not.toBeDisabled();
  });
  it("aborts an in-flight read when leaving and never starts the next pledge", async () => {
    let signal;
    fetch.mockImplementation((url, options) => new Promise((resolve, reject) => { signal = options.signal; signal.addEventListener("abort", () => reject(new Error("aborted"))); }));
    const mounted = open({ ...source, rows: [row, { ...row, id: "2" }] }); select(); fireEvent.click(screen.getByRole("button", { name: "Prepare selected reminders" }));
    await act(async () => mounted.unmount());
    expect(signal.aborted).toBe(true); expect(fetch).toHaveBeenCalledOnce();
  });
});
