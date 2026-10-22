import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ImportContactRecovery from "./ImportContactRecovery";

const entry = { sourceRowId: "9", targetId: "123", name: "Alex Example", hasOmittedContacts: true, recoveryRunId: "", blockers: [], stagedKinds: [],
  emailUpdates: [{ address: "alex@example.com", type: "Personal", makePrimary: true }], phoneUpdates: [] };
const props = { run: { id: "42" }, rows: [{ createdBlackbaudConstituentId: "123" }] };
const fetchMock = vi.fn();
const response = (body, ok = true) => ({ ok, json: async () => body });
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("contact recovery controls", () => {
  it("requires an explicit click and approval; preparation only opens a saved correction", async () => {
    const onOpen = vi.fn().mockResolvedValue({});
    fetchMock.mockResolvedValueOnce(response({ rows: [entry] })).mockResolvedValueOnce(response({ runId: "77" }));
    render(<ImportContactRecovery {...props} onOpen={onOpen} />);
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Complete missing contact information" }));
    await screen.findByRole("checkbox", { name: "Include Alex Example" });
    expect(screen.getByText(/make primary/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Prepare contact correction (1)" }));
    await waitFor(() => expect(onOpen).toHaveBeenCalledWith("77", expect.any(Object)));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ rowIds: ["9"], confirmed: true, defaults: { emailType: "", phoneType: "" } });
    expect(fetchMock.mock.calls.every(([url]) => url.endsWith("/contact-recovery"))).toBe(true);
  });
  it("requires a missing contact type without guessing it", async () => {
    fetchMock.mockResolvedValueOnce(response({ rows: [{ ...entry, emailUpdates: [{ ...entry.emailUpdates[0], type: "" }] }] }));
    render(<ImportContactRecovery {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Complete missing contact information" }));
    const field = await screen.findByLabelText(/Email type for blank types/);
    expect(screen.getByRole("button", { name: "Prepare contact correction (1)" })).toBeDisabled();
    fireEvent.change(field, { target: { value: "Personal" } });
    expect(screen.getByRole("button", { name: "Prepare contact correction (1)" })).toBeEnabled();
  });
  it("opens the existing correction, not another preparation", async () => {
    const onOpen = vi.fn();
    fetchMock.mockResolvedValueOnce(response({ rows: [{ ...entry, recoveryRunId: "77" }] }));
    render(<ImportContactRecovery {...props} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole("button", { name: "Complete missing contact information" }));
    fireEvent.click(await screen.findByRole("button", { name: "Open saved correction #77" }));
    expect(onOpen).toHaveBeenCalledWith("77");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Prepare contact correction (0)" })).toBeDisabled();
  });
  it("links a correction back to its original import", () => {
    const onOpen = vi.fn();
    render(<ImportContactRecovery {...props} run={{ id: "77", contactRecoverySourceRunId: "42" }} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole("button", { name: "Back to original import" }));
    expect(onOpen).toHaveBeenCalledWith("42");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("keeps uncertain rows out of selection and retains actionable errors", async () => {
    fetchMock.mockResolvedValueOnce(response({ rows: [{ ...entry, blockers: ["Verify the original uncertain write first."] }] }));
    render(<ImportContactRecovery {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Complete missing contact information" }));
    expect(await screen.findByRole("checkbox", { name: "Include Alex Example" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Prepare contact correction (0)" })).toBeDisabled();
  });
  it("reports preparation errors without starting NXT writes", async () => {
    fetchMock.mockResolvedValueOnce(response({ rows: [entry] })).mockResolvedValueOnce(response({ error: "Check saved contacts again." }, false));
    render(<ImportContactRecovery {...props} onOpen={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Complete missing contact information" }));
    fireEvent.click(await screen.findByRole("button", { name: "Prepare contact correction (1)" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Check saved contacts again.");
  });
  it("does not show recovery for unsent previews and disables during another operation", () => {
    const { rerender } = render(<ImportContactRecovery {...props} rows={[]} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    rerender(<ImportContactRecovery {...props} disabled />);
    expect(screen.getByRole("button")).toBeDisabled();
  });
});
