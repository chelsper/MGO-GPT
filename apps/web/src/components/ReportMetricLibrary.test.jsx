import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ReportMetricLibrary from "./ReportMetricLibrary";
import MetricLibraryPage from "@/app/report-configurations/metrics/page";

const source = { id: "alumni:value:counts:fy27", fingerprint: "a".repeat(64), label: "FY27 donors", panelTitle: "Donors", reportTitle: "Alumni & Family Engagement", sourceType: "query_count", queryId: "123", refreshPolicy: "refreshable", enabled: true };
const staticSource = { ...source, id: "demo:value:manual:figure", fingerprint: "b".repeat(64), label: "Manual goal", reportTitle: "Goals", sourceType: "static", refreshPolicy: "manual", queryId: null };
const entry = { id: "12345678-1234-1234-1234-123456789abc", title: "FY27 donors", description: "Distinct donors", sourceId: source.id, sourceFingerprint: source.fingerprint, source, format: "number", published: false, revision: "1", status: "available" };
const payload = { canManage: true, entries: [entry], sources: [source, staticSource] };
const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(payload)));
  vi.spyOn(window, "confirm").mockReturnValue(false);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const mount = (data = payload) => render(<ReportMetricLibrary initialPayload={data} />);
const edit = () => fireEvent.click(screen.getByRole("button", { name: /FY27 donors Alumni/ }));

it("loads only manager metadata and never previews or refreshes automatically", async () => {
  render(<MetricLibraryPage />);
  expect(await screen.findByRole("button", { name: /FY27 donors Alumni/ })).toBeVisible();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][0]).toBe("/api/reports/metrics?manage=1");
  edit();
  expect(screen.getByLabelText("Metric name")).toHaveValue("FY27 donors");
  expect(fetch).toHaveBeenCalledTimes(1);
});

it.each([401, 403])("does not show editing controls when access is denied (%s)", async (status) => {
  fetch.mockResolvedValue(json({}, status));
  render(<MetricLibraryPage />);
  expect(await screen.findByText(/Sign in as an Admin/)).toBeVisible();
  expect(screen.queryByRole("button", { name: "Add metric" })).not.toBeInTheDocument();
});

it("shows a safe retry after load failure", async () => {
  fetch.mockResolvedValueOnce(json({ error: "secret error" }, 500));
  render(<MetricLibraryPage />);
  expect(await screen.findByRole("alert")).not.toHaveTextContent("secret");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByRole("button", { name: "Add metric" })).toBeVisible();
});

it("offers an empty first-use state without enrolling source metrics automatically", () => {
  mount({ ...payload, entries: [] });
  expect(screen.getByText("Start with a saved metric")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Add metric" }));
  expect(screen.getByLabelText(/Make available/)).not.toBeChecked();
  expect(screen.getByRole("button", { name: "Preview saved result" })).toBeDisabled();
  expect(fetch).not.toHaveBeenCalled();
});

it("searches locally and changes source/format without requests or accidental publication", () => {
  mount();
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "not found" } });
  expect(screen.getByText("No metrics match your search.")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Add metric" }));
  fireEvent.change(screen.getByLabelText("Saved source"), { target: { value: source.id } });
  expect(screen.getByLabelText("Display format")).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Saved source"), { target: { value: staticSource.id } });
  expect(screen.getByLabelText("Display format")).toBeEnabled();
  fireEvent.change(screen.getByLabelText("Display format"), { target: { value: "currency" } });
  expect(screen.getByLabelText(/Make available/)).not.toBeChecked();
  expect(fetch).not.toHaveBeenCalled();
});

it("saves a draft source reference and leaves source access/refresh configuration out of the request", async () => {
  fetch.mockResolvedValue(json({ entry }));
  mount({ ...payload, entries: [] });
  fireEvent.click(screen.getByRole("button", { name: "Add metric" }));
  fireEvent.change(screen.getByLabelText("Metric name"), { target: { value: "FY27 donors" } });
  fireEvent.change(screen.getByLabelText("Saved source"), { target: { value: source.id } });
  fireEvent.click(screen.getByRole("button", { name: "Save metric" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Source reports, access, and refresh schedules were not changed");
  expect(fetch).toHaveBeenCalledTimes(1);
  const [, options] = fetch.mock.calls[0];
  expect(options.method).toBe("POST");
  expect(JSON.parse(options.body)).toEqual({ title: "FY27 donors", description: "", sourceId: source.id, sourceFingerprint: source.fingerprint, format: "number", published: false });
});

it("protects dirty drafts and retains them after a failed save", async () => {
  fetch.mockResolvedValue(json({ error: "Configuration changed" }, 409));
  mount(); edit();
  fireEvent.change(screen.getByLabelText("Metric name"), { target: { value: "My draft" } });
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event); expect(event.defaultPrevented).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Add metric" }));
  expect(window.confirm).toHaveBeenCalled(); expect(screen.getByLabelText("Metric name")).toHaveValue("My draft");
  fireEvent.click(screen.getByRole("button", { name: "Save metric" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Configuration changed");
  expect(screen.getByLabelText("Metric name")).toHaveValue("My draft");
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ id: entry.id, revision: "1" });
});

it("prevents duplicate submissions while a save is in flight", async () => {
  let resolve;
  fetch.mockImplementation(() => new Promise((done) => { resolve = done; }));
  mount(); edit();
  fireEvent.change(screen.getByLabelText("Description"), { target: { value: "New description" } });
  const save = screen.getByRole("button", { name: "Save metric" });
  fireEvent.click(save); fireEvent.click(save);
  expect(save).toBeDisabled(); expect(fetch).toHaveBeenCalledTimes(1);
  resolve(json({ entry: { ...entry, description: "New description", revision: "2" } }));
  await screen.findByRole("status");
});

it("previews only on request and preserves zero, date and frozen provenance", async () => {
  fetch.mockResolvedValue(json({ metric: entry, result: { type: "number", value: 0, status: "ready", asOf: "2026-09-01T00:00:00Z", refreshPolicy: "frozen", provenance: "saved_query" } }));
  mount(); edit();
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Preview saved result" }));
  expect(await screen.findByText("0")).toBeVisible();
  expect(screen.getByText(/Frozen snapshot/)).toBeVisible();
  expect(screen.getByText(/As of/)).toBeVisible();
  expect(fetch.mock.calls[0][0]).toBe(`/api/reports/metrics/${entry.id}?preview=1`);
  expect(fetch.mock.calls[0][1].method).toBeUndefined();
  fireEvent.change(screen.getByLabelText("Metric name"), { target: { value: "Unsaved" } });
  expect(screen.queryByRole("region", { name: "Saved metric preview" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Preview saved result" })).toBeDisabled();
});

it("requires explicit acceptance of changed sources but still permits retirement", async () => {
  const changed = { ...entry, sourceFingerprint: "c".repeat(64), published: true, status: "source_changed" };
  fetch.mockResolvedValue(json({ entry: { ...changed, published: false, revision: "2" } }));
  mount({ ...payload, entries: [changed] }); edit();
  expect(screen.getByRole("button", { name: "Save metric" })).toBeDisabled();
  fireEvent.click(screen.getByLabelText(/Make available/));
  expect(screen.getByRole("button", { name: "Save metric" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Save metric" }));
  await screen.findByRole("status");
  expect(JSON.parse(fetch.mock.calls[0][1].body).sourceFingerprint).toBe(changed.sourceFingerprint);
  fireEvent.click(screen.getByRole("button", { name: "Accept updated source" }));
  expect(screen.getByRole("button", { name: "Save metric" })).toBeEnabled();
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("shows unknown values rather than inventing zero, and safely retries preview failures", async () => {
  fetch.mockResolvedValueOnce(json({ error: "private provider details" }, 500)).mockResolvedValue(json({ metric: entry, result: { type: "number", value: null, status: "missing" } }));
  mount(); edit(); fireEvent.click(screen.getByRole("button", { name: "Preview saved result" }));
  expect(await screen.findByRole("alert")).not.toHaveTextContent("private provider");
  fireEvent.click(screen.getByRole("button", { name: "Retry preview" }));
  expect(await screen.findByText(/No compatible saved result yet/)).toBeVisible();
  expect(screen.queryByText("0")).not.toBeInTheDocument();
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
});
