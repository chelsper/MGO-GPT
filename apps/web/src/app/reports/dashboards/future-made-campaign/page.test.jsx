import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
vi.mock("@/app/reports/SharedReportHeader", () => ({ default: ({ title }) => <h1>{title}</h1> }));
import Page from "./page";
const saved = { version: 7,runId: "run-a",canManage: true,config: { sourceKey: "fixture" },job: null,busy: false,
  priorities: [{ priority: "unassigned",allocations: 2,gifts: 1,effective_cents: 10000,original_cents: 10000 }], originalCents: 10000,effectiveCents: 10000,rawRows: 2,uniqueRows: 2,total: 2,gifts: 1,
  funds: [{ fund_id: "4",fund_name: "Scholarship Fund",fund_priority: "unassigned",original_cents: 10000 }],
  rows: [{ item_key: "10:1",gift_id: "10",split_id: "1",fund_id: "4",fund_name: "Scholarship Fund",donor_name: "Fictional Donor",amount_cents: 6000,effective_cents: 6000,priority: "unassigned",fund_priority: "unassigned",override_cents: null,has_override: false }] };
const json = (value,status = 200) => new Response(JSON.stringify(value),{ status,headers: { "Content-Type": "application/json" } });
let current, calls;
beforeEach(() => { current = structuredClone(saved); calls = []; vi.stubGlobal("fetch",vi.fn(async (url,options) => {
  calls.push({ url,options }); return json(options?.method === "POST" ? { version: 8 } : current);
})); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });
it("shows five priorities and saved totals, without starting an NXT query on open", async () => {
  render(<Page />); await screen.findByText("Campaign priorities");
  expect(within(screen.getByRole("region",{ name: "Five campaign priorities" })).getAllByRole("button")).toHaveLength(5);
  expect(screen.getByText("Unassigned: $100.00")).toBeInTheDocument();
  expect(calls.every(call => call.options?.method !== "POST")).toBe(true);
});
it("hides editing and query controls from read-only viewers", async () => {
  current.canManage = false; current.config = undefined; render(<Page />); await screen.findByText("Campaign priorities");
  expect(screen.queryByRole("button",{ name: "Adjust allocation" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button",{ name: "Source & refresh" })).not.toBeInTheDocument();
  expect(screen.queryByText("Refresh campaign data")).not.toBeInTheDocument();
});
it("can close and reopen first-time setup without losing the dashboard or running NXT", async () => {
  current.config = {}; current.runId = null;
  render(<Page />); expect(await screen.findByRole("region", { name: "Campaign source setup" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Close setup" }));
  expect(screen.queryByRole("region", { name: "Campaign source setup" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Source & refresh" }));
  expect(screen.getByRole("region", { name: "Campaign source setup" })).toBeInTheDocument();
  expect(calls.every(call => call.options?.method !== "POST")).toBe(true);
});
it("saves only the selected split, preserving deliberate zero and requiring a reason", async () => {
  render(<Page />); fireEvent.click(await screen.findByRole("button",{ name: "Adjust allocation" }));
  const dialog = screen.getByRole("dialog"); expect(within(dialog).getByRole("button",{ name: "Save campaign exception" })).toBeDisabled();
  fireEvent.change(within(dialog).getByLabelText("Adjusted campaign amount (USD)"),{ target: { value: "0" } });
  fireEvent.change(within(dialog).getByLabelText("Reason for this change"),{ target: { value: "Campaign exclusion" } });
  fireEvent.click(within(dialog).getByRole("button",{ name: "Save campaign exception" }));
  await waitFor(() => expect(calls.some(call => call.options?.method === "POST")).toBe(true));
  expect(JSON.parse(calls.find(call => call.options?.method === "POST").options.body)).toMatchObject({ operation: "override",version: 7,runId: "run-a",input: { itemKey: "10:1",amount: "0",priority: null,reason: "Campaign exclusion" } });
});
it("preserves the draft and surfaces save conflicts inside the dialog", async () => {
  fetch.mockImplementation(async (_url,options) => options?.method === "POST" ? json({ error: "The campaign changed. Reload saved data." },409) : json(current));
  render(<Page />); fireEvent.click(await screen.findByRole("button",{ name: "Adjust allocation" }));
  const dialog = screen.getByRole("dialog"); fireEvent.change(within(dialog).getByLabelText("Reason for this change"),{ target: { value: "Keep this draft" } });
  fireEvent.click(within(dialog).getByRole("button",{ name: "Save campaign exception" }));
  expect(await within(dialog).findByRole("alert")).toHaveTextContent("The campaign changed");
  expect(within(dialog).getByLabelText("Reason for this change")).toHaveValue("Keep this draft");
});
it("does not silently rebase an open edit onto a newer dataset version", async () => {
  render(<Page />); fireEvent.click(await screen.findByRole("button",{ name: "Adjust allocation" }));
  const dialog = screen.getByRole("dialog");
  current = { ...current,version: 20,runId: "run-b" };
  fireEvent.change(screen.getByLabelText("Find a donor, gift ID or fund"),{ target: { value: "Donor" } });
  fireEvent.click(screen.getByRole("button",{ name: "Search",exact: true }));
  await waitFor(() => expect(calls.some(call => call.url.includes("search=Donor"))).toBe(true));
  fireEvent.change(within(dialog).getByLabelText("Reason for this change"),{ target: { value: "Original view" } });
  fireEvent.click(within(dialog).getByRole("button",{ name: "Save campaign exception" }));
  await waitFor(() => expect(calls.some(call => call.options?.method === "POST")).toBe(true));
  expect(JSON.parse(calls.find(call => call.options?.method === "POST").options.body)).toMatchObject({ version: 7,runId: "run-a" });
});
it("shows split verification as resumable work, not a new refresh, without starting on page open", async () => {
  current.job = {stage:"resolving",nextCheckAt:null};
  render(<Page />);
  expect(await screen.findByText(/Checking split gifts against their NXT fund allocations/)).toBeInTheDocument();
  expect(screen.getByRole("button",{name:"Continue refresh"})).toBeEnabled();
  expect(screen.queryByRole("button",{name:"Refresh campaign",exact:true})).not.toBeInTheDocument();
  expect(calls.every(call => call.options?.method !== "POST")).toBe(true);
  fireEvent.click(screen.getByRole("button",{name:"Continue refresh"}));
  await waitFor(() => expect(calls.some(call => call.options?.method === "POST")).toBe(true));
  expect(JSON.parse(calls.find(call => call.options?.method === "POST").options.body)).toMatchObject({operation:"continue"});
});
