import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import QuickNewConstituentImport from "./QuickNewConstituentImport";
const rows = [1, 2, 3].map((id) => ({ id, rowNumber: id, status: "Ready", intentDisposition: { key: "ready_new" } }));
let fetchMock;
const reply = (payload = {}, status = 200) => ({ ok: status === 200, json: async () => payload });
beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock); vi.spyOn(window, "confirm").mockReturnValue(true); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function show(extra = {}) {
  return render(<QuickNewConstituentImport runId="42" rows={rows} onReload={vi.fn().mockResolvedValue({})} onBusyChange={vi.fn()} {...extra} />);
}
it("continues past a held duplicate and processes only one row per request", async () => {
  fetchMock.mockResolvedValueOnce(reply({ done: true })).mockResolvedValueOnce(reply({ held: true }, 409)).mockResolvedValueOnce(reply({ done: true }));
  show();
  fireEvent.click(screen.getByRole("button", { name: "Check and import new records" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Finished. 3 rows processed"));
  expect(fetchMock.mock.calls.map(([url]) => url.match(/rows\/(\d+)/)[1])).toEqual(["1", "2", "3"]);
});
it("stops on quota pauses rather than issuing requests for the rest of the file", async () => {
  fetchMock.mockResolvedValueOnce(reply({ paused: true, error: "NXT quota paused" }, 429));
  show();
  fireEvent.click(screen.getByRole("button", { name: "Check and import new records" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("NXT quota paused"));
  expect(fetchMock).toHaveBeenCalledOnce();
});
it("resumes without recreating successful or uncertain records", async () => {
  fetchMock.mockResolvedValue(reply({ done: true }));
  show({ rows: [{ ...rows[0], createdBlackbaudConstituentId: "555" }, { ...rows[1], createRequestStartedAt: "now" }, rows[2]] });
  fireEvent.click(screen.getByRole("button", { name: "Resume safe import" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Finished. 1 rows processed"));
  expect(fetchMock).toHaveBeenCalledOnce();
  expect(fetchMock.mock.calls[0][0]).toContain("/rows/3/process");
});
it("pauses on a lost response and reloads server checkpoints, without retrying POST", async () => {
  fetchMock.mockRejectedValue(new Error("Connection lost"));
  const reload = vi.fn().mockResolvedValue({});
  show({ onReload: reload });
  fireEvent.click(screen.getByRole("button", { name: "Check and import new records" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Connection lost"));
  expect(fetchMock).toHaveBeenCalledOnce();
  expect(reload).toHaveBeenCalledOnce();
});
it("advances through saved steps with one confirmation and one final reload", async () => {
  const reload = vi.fn().mockResolvedValue({});
  fetchMock.mockResolvedValueOnce(reply({ next: "details" })).mockResolvedValueOnce(reply({ next: "apply" }))
    .mockResolvedValueOnce(reply({ next: "verify" })).mockResolvedValueOnce(reply({ done: true }));
  show({ rows: [rows[0]], onReload: reload });
  fireEvent.click(screen.getByRole("button", { name: "Check and import new records" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Finished. 1 rows processed"));
  expect(fetchMock).toHaveBeenCalledTimes(4);
  expect(window.confirm).toHaveBeenCalledOnce();
  expect(reload).toHaveBeenCalledOnce();
  expect(fetchMock.mock.calls.every(([url]) => url.endsWith("/rows/1/process"))).toBe(true);
});
it("handles non-JSON timeout responses without repeating the request", async () => {
  fetchMock.mockResolvedValue({ ok: false, json: async () => { throw new Error("Unexpected token <"); } });
  show();
  fireEvent.click(screen.getByRole("button", { name: "Check and import new records" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("server response was interrupted"));
  expect(fetchMock).toHaveBeenCalledOnce();
});
it("resumes approved created rows through processing, never the creation endpoint", async () => {
  fetchMock.mockResolvedValue(reply({ done: true }));
  show({ rows: [{ ...rows[0], createdBlackbaudConstituentId: "555", quickImportWorkflow: { phase: "verify", approvedByUserId: "7" } }] });
  fireEvent.click(screen.getByRole("button", { name: "Resume safe import" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Finished"));
  expect(fetchMock.mock.calls[0][0]).toContain("/rows/1/process");
});
it("allows identity-only mode without automatically sending the detail steps", async () => {
  fetchMock.mockResolvedValue(reply());
  show({ rows: [rows[0]] });
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Check and import new records" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Finished"));
  expect(fetchMock).toHaveBeenCalledOnce();
  expect(fetchMock.mock.calls[0][0]).toContain("/create?mode=clear_nonmatches");
});
