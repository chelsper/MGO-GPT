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
  expect(within(screen.getByRole("group",{ name: "Five campaign priorities" })).getAllByRole("button")).toHaveLength(5);
  expect(screen.getByText("Unassigned: $100.00")).toBeInTheDocument();
  expect(calls.every(call => call.options?.method !== "POST")).toBe(true);
});
it("hides editing and query controls from read-only viewers", async () => {
  current.canManage = false; current.config = undefined; render(<Page />); await screen.findByText("Campaign priorities");
  expect(screen.queryByRole("button",{ name: "Adjust allocation" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button",{ name: "Source & refresh" })).not.toBeInTheDocument();
  expect(screen.queryByText("Refresh campaign data")).not.toBeInTheDocument();
  expect(screen.queryByRole("button",{name:"Manage write-offs"})).not.toBeInTheDocument();
});
it("saves a CSV then starts one refresh with the returned version, even after a previous failed job",async()=>{
  current.config={...current.config,queryId:"27460",mode:"gift",columns:{giftType:"Gift Type"}};
  current.job={stage:"failed",error:"Old check failed"};
  fetch.mockImplementation(async(_url,options)=>{
    if (!options?.method) return json(current);
    const body=JSON.parse(options.body); calls.push(body);
    if (body.operation==="fields") return json({fields:["Gift Pledge Balance"]});
    if (body.operation==="writeOffs") {current={...current,version:8};return json({version:8});}
    if (body.operation==="start") {current={...current,version:9,job:{stage:"waiting",nextCheckAt:new Date(Date.now()+60000).toISOString()}};return json({version:9,stage:"waiting"});}
    throw new Error("Unexpected operation");
  });
  render(<Page/>); fireEvent.click(await screen.findByRole("button",{name:"Manage write-offs"}));
  const csv="Gift Amount,Gift Type,Pledge Balance,Gf_System_ID,Write off\n100,Pledge,0,11,25";
  fireEvent.change(screen.getByLabelText("Write-off CSV"),{target:{files:[{size:csv.length,text:async()=>csv}]}});
  await screen.findByText(/1 unique pledges/);
  await waitFor(()=>expect(screen.getByLabelText("Current balance field in campaign query")).toHaveValue("Gift Pledge Balance"));
  fireEvent.click(screen.getByLabelText(/I reviewed these cumulative/));
  fireEvent.click(screen.getByRole("button",{name:"Save write-offs and refresh campaign"}));
  await screen.findByText(/Write-offs saved/);
  expect(calls.filter(call=>call.operation==="writeOffs")).toHaveLength(1);
  expect(calls.filter(call=>call.operation==="start")).toEqual([{operation:"start",version:8,runId:"run-a",input:{confirmed:true}}]);
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
it("shows saved financial progress and unresolved pledges without auto-starting NXT reads",async()=>{
  current.job={stage:"financial",nextCheckAt:null,financial:{checked:1,total:3,withWriteOffs:1,blocked:1,
    issues:[{giftId:"9",message:"Pledge 9 requires a matching-gift write-off source."}]}};
  render(<Page />);
  expect(await screen.findByText(/Pledge checks: 1 of 3 verified/)).toHaveTextContent("1 need attention");
  expect(screen.getByText("Pledge 9 requires a matching-gift write-off source.")).toBeInTheDocument();
  expect(screen.getByRole("button",{name:"Continue refresh"})).toBeEnabled();
  expect(screen.queryByRole("button",{name:"Refresh campaign",exact:true})).not.toBeInTheDocument();
  expect(calls.every(call=>call.options?.method!=="POST")).toBe(true);
  fireEvent.click(screen.getByRole("button",{name:"Continue refresh"}));
  await waitFor(()=>expect(calls.some(call=>call.options?.method==="POST")).toBe(true));
  expect(JSON.parse(calls.find(call=>call.options?.method==="POST").options.body)).toMatchObject({operation:"continue"});
});
it("saves fund assignments against the current dataset and moves them only after reloading saved data", async () => {
  fetch.mockImplementation(async (_url, options) => {
    if (options?.method === "POST") {
      const body = JSON.parse(options.body); calls.push(body);
      current = { ...current, version: 8, funds: current.funds.map(f => ({ ...f, fund_priority: body.input.priority })) };
      return json({ version: 8 });
    }
    return json(current);
  });
  render(<Page />); fireEvent.click(await screen.findByRole("button", { name: "Assign funds to priorities" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Select Scholarship Fund" }));
  fireEvent.click(screen.getByRole("button", { name: "Save 1 fund" }));
  expect(await screen.findByRole("status")).toHaveTextContent("1 fund assigned to Scholarships");
  expect(screen.getByRole("button", { name: "Assigned (1)" })).toBeInTheDocument();
  expect(screen.queryByRole("checkbox", { name: "Select Scholarship Fund" })).not.toBeInTheDocument();
  expect(calls).toEqual([{ operation: "funds", version: 7, runId: "run-a", input: { fundIds: ["4"], priority: "scholarships" } }]);
});
it("does not announce assignment success if the saved data cannot be reloaded", async () => {
  let savedPost = false;
  fetch.mockImplementation(async (_url, options) => {
    if (options?.method === "POST") { savedPost = true; return json({ version: 8 }); }
    return savedPost ? json({ error: "Saved data unavailable. Reload before retrying." }, 503) : json(current);
  });
  render(<Page />); fireEvent.click(await screen.findByRole("button", { name: "Assign funds to priorities" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Select Scholarship Fund" }));
  fireEvent.click(screen.getByRole("button", { name: "Save 1 fund" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Saved data unavailable");
  await waitFor(() => expect(screen.getByRole("checkbox", { name: "Select Scholarship Fund" })).toBeEnabled());
  expect(screen.getByRole("checkbox", { name: "Select Scholarship Fund" })).toBeChecked();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});
it("clears fund selections when a new dataset is loaded", async () => {
  render(<Page />); fireEvent.click(await screen.findByRole("button", { name: "Assign funds to priorities" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Select Scholarship Fund" }));
  current = { ...current, runId: "run-b", version: 20 };
  fireEvent.change(screen.getByLabelText("Find a donor, gift ID or fund"), { target: { value: "Donor" } });
  fireEvent.click(screen.getByRole("button", { name: "Search", exact: true }));
  await waitFor(() => expect(screen.getByRole("checkbox", { name: "Select Scholarship Fund" })).not.toBeChecked());
  expect(screen.getByRole("button", { name: "Save selected funds" })).toBeDisabled();
});
it("orders the campaign overview, fiscal years, pillars, and gift detail as independent sections", async () => {
  render(<Page />); await screen.findByText("Campaign priorities");
  const navigation = screen.getByRole("navigation", { name: "Campaign sections" });
  expect(within(navigation).getAllByRole("link").map(link => link.getAttribute("href"))).toEqual([
    "#campaign-overview", "#campaign-fiscal-years", "#campaign-pillars", "#campaign-gifts",
  ]);
  expect(Array.from(document.querySelectorAll("section[id]")).map(section => section.id)).toEqual([
    "campaign-overview", "campaign-fiscal-years", "campaign-pillars", "campaign-gifts",
  ]);
  expect(screen.getByText(/Filters below apply to gift detail only/)).toBeInTheDocument();
  fireEvent.click(within(screen.getByRole("group", { name: "Five campaign priorities" })).getByRole("button", { name: /Scholarships/ }));
  await waitFor(() => expect(calls.some(call => call.url.includes("priority=scholarships"))).toBe(true));
  expect(calls.every(call => call.options?.method !== "POST")).toBe(true);
});
