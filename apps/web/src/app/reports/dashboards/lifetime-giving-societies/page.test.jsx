import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@/app/reports/SharedReportHeader", () => ({ default: ({ title }) => <h1>{title}</h1> }));
import Page from "./page";
import { lifetimeRules } from "../../../../../test/lifetimeQueryFixture";
const inspection = { ready: true, checks: [{ key: "id", label: "Constituent system record ID", required: true, column: "Person ID" }], warnings: ["Calculated dates are provisional."] };
const row = { id: '["system","1"]', systemId: "1", lookupId: "D-1", name: "Fictional Donor", societyKey: "1934_club", societyName: "1934 Club", thresholdCents: 10000000,
  totalCents: 10000000, date: "2020-07-01", status: "provisional", reasons: [], crossingGiftIds: ["101"] };
const snapshot = { refreshedAt: "2026-11-16T12:00:00Z", source: inspection, rows: [row, { ...row, id: "2", name: "Fictional Review Donor", date: null,
  totalCents: null, status: "review", reasons: ["Pledge history needs reconciliation."], crossingGiftIds: [] }], peopleCount: 2, rawRows: 3, repeatedRows: 1, provisionalCount: 1, reviewCount: 1 };
const saved = { revision: "saved", title: "Lifetime Giving Societies", canManage: true, societies: lifetimeRules, snapshot };
const json = (body, status = 200) => ({ ok: status === 200, status, json: async () => body });
beforeEach(() => vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(saved))));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("opens saved history and filters without NXT execution", async () => {
  render(<Page />); await screen.findByText("Fictional Donor");
  expect(fetch).toHaveBeenCalledTimes(1); expect(fetch.mock.calls[0][1].method).toBeUndefined();
  expect(screen.getByText("Fictional Review Donor")).toBeVisible();
  fireEvent.change(screen.getByLabelText("Review status"), { target: { value: "review" } });
  expect(screen.queryByText("Fictional Donor")).not.toBeInTheDocument(); expect(fetch).toHaveBeenCalledTimes(1);
});
it("does not mistake an unconfigured source for zero members", async () => {
  fetch.mockResolvedValue(json({ ...saved, snapshot: null })); render(<Page />); await screen.findByText("Not imported");
  expect(screen.getByRole("button", { name: "Refresh gift history" })).toBeDisabled();
  expect(screen.getByText(/No gift history imported yet/)).toBeVisible();
});
it("shows actionable missing outputs without enabling an unsafe import", async () => {
  fetch.mockResolvedValueOnce(json({ ...saved, snapshot: null })).mockResolvedValueOnce(json({ ...inspection, ready: false,
    checks: [{ key: "lookupId", label: "Constituent ID", required: true, column: "", help: "Choose Constituent > Constituent ID in NXT." }] }));
  render(<Page />); fireEvent.click(await screen.findByRole("button", { name: "Check query outputs" }));
  expect(await screen.findByText("Choose Constituent > Constituent ID in NXT.")).toBeVisible();
  expect(screen.getByRole("button", { name: "Refresh gift history" })).toBeDisabled();
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ operation: "fields" });
});
it("enables import using an existing lookup ID without demanding another output", async () => {
  fetch.mockResolvedValueOnce(json({ ...saved, snapshot: null })).mockResolvedValueOnce(json({ ...inspection, identityMode: "lookup",
    checks: [{ key: "constituentId", label: "Constituent system record ID (optional)", required: false, column: "" },
      { key: "lookupId", label: "Constituent ID", required: true, column: "Constituent ID" }] }));
  render(<Page />); fireEvent.click(await screen.findByRole("button", { name: "Check query outputs" }));
  expect(await screen.findByText(/You do not need to add a constituent system record ID/)).toBeVisible();
  expect(screen.getByRole("button", { name: "Refresh gift history" })).toBeEnabled();
  expect(screen.queryByText("Add to NXT query output")).not.toBeInTheDocument();
});
it("labels lookup-scoped recipients correctly without exposing a fake system ID", async () => {
  fetch.mockResolvedValue(json({ ...saved, snapshot: { ...snapshot, source: { ...inspection, identityMode: "lookup" },
    rows: [{ ...row, id: '["lookup","00123"]', systemId: null, lookupId: "00123" }] } }));
  render(<Page />); expect(await screen.findByText("Constituent ID 00123")).toBeVisible();
  expect(screen.queryByText(/System ID/)).not.toBeInTheDocument();
  expect(screen.queryByText('["lookup","00123"]')).not.toBeInTheDocument();
});
it("keeps saved results visible during failures and submits only one refresh", async () => {
  let resolve; fetch.mockResolvedValueOnce(json(saved)).mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  render(<Page />); fireEvent.click(await screen.findByRole("button", { name: "Refresh gift history" }));
  const pending = screen.getByRole("button", { name: "Importing history..." }); fireEvent.click(pending); expect(pending).toBeDisabled();
  expect(screen.getByText("Fictional Donor")).toBeVisible(); expect(fetch).toHaveBeenCalledTimes(2);
  resolve(json({ error: "NXT is temporarily unavailable." }, 503));
  expect(await screen.findByRole("alert")).toHaveTextContent("temporarily unavailable"); expect(screen.getByText("Fictional Donor")).toBeVisible();
});
it("clears donor data when access is revoked", async () => {
  fetch.mockResolvedValueOnce(json(saved)).mockResolvedValueOnce(json({ error: "Not shared" }, 403));
  render(<Page />); fireEvent.click(await screen.findByRole("button", { name: "Check query outputs" }));
  await screen.findByRole("alert"); await waitFor(() => expect(screen.queryByText("Fictional Donor")).not.toBeInTheDocument());
});
it("does not expose refresh actions to read-only viewers", async () => {
  fetch.mockResolvedValue(json({ ...saved, canManage: false })); render(<Page />); await screen.findByText("Fictional Donor");
  expect(screen.queryByRole("button", { name: "Check query outputs" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Refresh gift history" })).not.toBeInTheDocument();
});
