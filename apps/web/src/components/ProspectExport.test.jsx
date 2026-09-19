import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ProspectExportButton, { ProspectExportForm, readExportPreferences } from "./ProspectExport";
import ProspectExportsPage from "@/app/prospect-exports/page";
import { WorkspaceTerminologyProvider } from "./WorkspaceTerminology";

const fetchMock = vi.fn();
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  URL.createObjectURL = vi.fn().mockReturnValue("blob:test-export");
  URL.revokeObjectURL = vi.fn();
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const form = (props = {}) => <ProspectExportForm viewerId={1} ownerIds={["2"]} prospectIds={["20", "10"]} {...props} />;
describe("Top Prospect export controls", () => {
  it("opens the export dialog only on request", () => {
    render(<ProspectExportButton viewerId={1} workspaceId={2} prospectIds={[20]} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Export prospects" }));
    expect(screen.getByRole("dialog", { name: "Export Top Prospects" })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Close export" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("defaults to the filtered order and excludes contacts, closed records and closed opportunities", async () => {
    fetchMock.mockResolvedValue({ ok: true, blob: async () => new Blob(["test"]) });
    render(form());
    expect(screen.getByLabelText("Email (saved)")).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Download Excel" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({ scope: "filtered", ownerIds: ["2"], prospectIds: ["20", "10"], includeInactive: false, includeClosedOpportunities: false, format: "xlsx" });
    expect(body.columns).not.toContain("email");
    expect(await screen.findByRole("status")).toHaveTextContent("Export downloaded");
  });
  it("offers all active when the filtered list is empty and makes closed records opt-in", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "Please retry" }) });
    render(form({ prospectIds: [] }));
    expect(screen.getByRole("button", { name: "Download Excel" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Prospects to export"), { target: { value: "active" } });
    expect(screen.getByRole("button", { name: "Download Excel" })).toBeEnabled();
    fireEvent.click(screen.getByLabelText(/Include closed and archived/));
    fireEvent.click(screen.getByRole("button", { name: "Download Excel" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Please retry");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ scope: "active", prospectIds: [], includeInactive: true });
  });
  it("remembers only columns/format per signed-in user, not donor data or selected MGOs", () => {
    render(form());
    fireEvent.click(screen.getByLabelText("Email (saved)"));
    fireEvent.change(screen.getByLabelText("File format"), { target: { value: "csv" } });
    const stored = JSON.parse(localStorage.getItem("prospect-export-v1:1"));
    expect(Object.keys(stored).sort()).toEqual(["columns", "format"]);
    expect(stored.columns).toContain("email");
    expect(readExportPreferences(2).columns).not.toContain("email");
    expect(screen.getByText(/CSV includes Prospect Summary only/)).toBeInTheDocument();
  });
  it("sanitizes old or malformed preferences and keeps identity columns required", () => {
    localStorage.setItem("prospect-export-v1:1", JSON.stringify({ columns: ["secret"], format: "html" }));
    expect(readExportPreferences(1)).toMatchObject({ format: "xlsx", columns: ["mgo", "name", "savedAt"] });
    localStorage.setItem("prospect-export-v1:1", "broken");
    expect(readExportPreferences(1).columns).toContain("rank");
  });
});

describe("Advancement Services master export", () => {
  const roster = { viewerId: 9, users: [{ id: 1, name: "MGO Alpha", email: "alpha@example.com", active_count: 21 },
    { id: 2, name: "MGO Beta", email: "beta@example.com", active_count: 301 }] };
  it("multi-selects searchable MGOs, keeps hidden selections and sends only selected IDs", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => roster });
    fetchMock.mockResolvedValueOnce({ ok: true, blob: async () => new Blob(["xlsx"]) });
    render(<ProspectExportsPage />);
    expect(await screen.findByRole("button", { name: "Download Excel master" })).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/MGO Alpha/));
    fireEvent.change(screen.getByLabelText("Find a workspace"), { target: { value: "beta" } });
    expect(screen.getByText(/1 selected workspace is hidden by this search and will still be exported/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Select all shown" }));
    expect(screen.getByText("2 selected / 322 active prospects")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Download Excel master" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({ scope: "master", ownerIds: ["1", "2"], includeInactive: false });
    expect(await screen.findByText(/Export downloaded/)).toBeInTheDocument();
  });
  it("clears a no-match search without losing selections or fetching again", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => roster });
    render(<ProspectExportsPage />);
    fireEvent.click(await screen.findByLabelText(/MGO Alpha/));
    fireEvent.change(screen.getByLabelText("Find a workspace"), { target: { value: "not found" } });
    expect(screen.getByText(/No workspaces match this search/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select all shown" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Download Excel master" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(screen.getByLabelText(/MGO Alpha/)).toBeChecked();
    expect(screen.getByLabelText(/MGO Beta/)).not.toBeChecked();
    expect(screen.queryByText(/hidden by this search/)).not.toBeInTheDocument();
    expect(screen.getByText("1 selected / 21 active prospects")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("distinguishes an empty roster from a filtered roster and keeps Home available", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ...roster, users: [] }) });
    render(<ProspectExportsPage />);
    expect(screen.getByRole("link", { name: "Back to Home" })).toHaveAttribute("href", "/");
    expect(await screen.findByText("No active workspaces are available to export.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select all shown" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Clear selection" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Download Excel master" })).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("reuses configured role labels and treats surrounding search spaces as whitespace", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => roster });
    render(<WorkspaceTerminologyProvider terminology={{ mgo: "Fundraiser", advancementServices: "Operations" }}><ProspectExportsPage /></WorkspaceTerminologyProvider>);
    await screen.findByLabelText(/MGO Alpha/);
    expect(screen.getByText("Operations")).toBeInTheDocument();
    expect(screen.getByText(/Includes active users with the Fundraiser role/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Find a workspace"), { target: { value: "  ALPHA  " } });
    expect(screen.getByLabelText(/MGO Alpha/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/MGO Beta/)).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("clears all selected MGOs", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => roster });
    render(<ProspectExportsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Select all shown" }));
    expect(screen.getByRole("button", { name: "Download Excel master" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(screen.getByRole("button", { name: "Download Excel master" })).toBeDisabled();
  });
  it("does not render the master controls when access is denied", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "Access denied" }) });
    render(<ProspectExportsPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Access denied");
    expect(screen.getByRole("link", { name: "Back to Home" })).toHaveAttribute("href", "/");
    expect(screen.queryByRole("button", { name: "Download Excel master" })).not.toBeInTheDocument();
  });
});
