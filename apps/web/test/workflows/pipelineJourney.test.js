// Real routes, report access, ownership rules and synchronization orchestration.
// Only account/storage/provider boundaries are simulated with fictional records.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), user: vi.fn(), sql: vi.fn(), provider: vi.fn(),
  load: vi.fn(), claim: vi.fn(), complete: vi.fn(), receipt: vi.fn(), reject: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/getOrCreateUser", () => ({ default: mocks.user }));
vi.mock("@/app/api/utils/sql", () => ({ default: mocks.sql }));
vi.mock("@/app/api/utils/blackbaud", () => ({ blackbaudApiFetch: mocks.provider }));
vi.mock("@/app/api/utils/pipelineOpportunityStore", async original => ({ ...(await original()),
  loadPipelineCopies: mocks.load, claimPipelineChange: mocks.claim, completePipelineChange: mocks.complete,
  getPipelineReceipt: mocks.receipt, rejectPipelineChange: mocks.reject }));
import { GET as list } from "@/app/api/reports/opportunity-pipeline/route";
import { GET, PATCH, POST } from "@/app/api/reports/opportunity-pipeline/[id]/route";
import OpportunityEditor from "@/app/reports/opportunity-pipeline/OpportunityEditor";

const url = "https://app.example.test/api/reports/opportunity-pipeline/1";
const params = { params: { id: "1" } };
const req = (method = "GET", body, headers = {}) => new Request(url, {
  method, headers: { "content-type": "application/json", origin: "https://app.example.test", ...headers },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
let rows, remote, receipt, visibility, uncertain;
const signIn = (role, id = 10, active = true) => {
  mocks.auth.mockResolvedValue({ user: { email: `fictional-${id}@example.test` } });
  mocks.user.mockResolvedValue({ id, role, active });
};
const patches = () => mocks.provider.mock.calls.filter(([, options]) => options.method === "PATCH");

beforeEach(() => {
  vi.clearAllMocks();
  receipt = null; uncertain = false; visibility = "all_users";
  rows = [10, 20].map((user_id, index) => ({ id: index + 1, user_id,
    blackbaud_opportunity_id: "900", blackbaud_constituent_id: "100", shared_opportunity_key: "fictional-joint",
    title: "Fictional scholarship", prospect_name: "Sample Donor", current_stage: "Cultivation", opportunity_status: "Active",
    estimated_amount: 1000, expected_date: "2027-05-01", revision: "2026-10-01T00:00:00Z", checked_revision: null }));
  remote = { id: "900", constituent_id: "100", name: "Fictional scholarship", status: "Cultivation", purpose: "Campaign",
    ask_amount: { value: 1000 }, expected_date: "2027-05-01" };
  signIn("mgo");
  mocks.sql.mockImplementation(async strings => {
    const query = strings.join("?");
    if (query.includes("FROM report_configurations")) return [{ visibility, specific_user_ids: [] }];
    if (query.includes("FROM prospect_opportunities")) return structuredClone(rows);
    if (query.includes("FROM users")) return [{ id: 10, name: "Sample Officer A" }, { id: 20, name: "Sample Officer B" }];
    throw new Error("Unexpected fixture query");
  });
  mocks.load.mockImplementation(async () => structuredClone(rows));
  mocks.claim.mockImplementation(async change => {
    receipt = { ...structuredClone(change), state: "pending" };
    rows.forEach(row => { row.pipeline_change_id = change.id; });
  });
  mocks.receipt.mockImplementation(async () => structuredClone(receipt));
  mocks.complete.mockImplementation(async (change, next) => {
    expect(change.copies.map(row => row.id).sort()).toEqual(["1", "2"]);
    rows.forEach(row => Object.assign(row, next, { pipeline_change_id: null, revision: "2026-10-02T00:00:00Z" }));
    receipt.state = "complete";
  });
  mocks.provider.mockImplementation(async (path, options) => {
    expect(path).toBe("/opportunity/v1/opportunities/900");
    if (options.method === "PATCH") {
      Object.assign(remote, options.body);
      if (uncertain) throw new Error("Simulated timeout after NXT accepted the change");
      return null;
    }
    expect(options.method).toBe("GET");
    return structuredClone(remote);
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function mountEditor() {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  // Wire the real component to real server handlers, not canned HTTP responses.
  vi.stubGlobal("fetch", vi.fn(async (input, options) => {
    const request = new Request(new URL(input, url), options);
    expect(request.url).toBe(url);
    const handler = { GET, PATCH, POST }[request.method];
    expect(handler).toBeTypeOf("function");
    return handler(request, params);
  }));
  const callbacks = { onClose: vi.fn(), onSaved: vi.fn() };
  render(createElement(OpportunityEditor, { row: { id: "1", title: "Fictional scholarship", constituentName: "Sample Donor" },
    operation: "edit", ...callbacks }));
  return callbacks;
}

describe("role-based pipeline journey", () => {
  it.each(["admin", "advancement_services", "mgo"])("lets %s see the overall pipeline without contacting NXT", async role => {
    signIn(role, 99);
    const response = await list();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const report = await response.json();
    expect(report.opportunities).toHaveLength(1);
    expect(report.opportunities[0].fundraisers.map(person => person.id).sort()).toEqual(["10", "20"]);
    expect(report.opportunities[0].canEdit).toBe(role === "admin");
    expect(mocks.provider).not.toHaveBeenCalled();
  });
  it.each([["admin", 99], ["mgo", 10], ["mgo", 20]])("lets %s/%s open, save, verify and see a shared update", async (role, id) => {
    signIn(role, id);
    const editor = await (await GET(req(), params)).json();
    expect(editor).toMatchObject({ state: "ready", copyCount: 2 });
    const saved = await PATCH(req("PATCH", { operation: "edit", version: editor.version,
      fields: { name: "Fictional updated scholarship", ask_amount: "2500" } }), params);
    expect(saved.status).toBe(200);
    expect(await saved.json()).toMatchObject({ state: "complete" });
    expect(patches()).toHaveLength(1);
    expect(patches()[0][1]).toMatchObject({ authUserId: id, maxRetries: 0 });
    expect(rows.every(row => row.title === "Fictional updated scholarship" && row.estimated_amount === 2500)).toBe(true);
    const report = await (await list()).json();
    expect(report.opportunities[0].amount).toBe(2500);
  });
  it.each([["mgo", 99], ["advancement_services", 10], ["executive", 10]])("denies %s/%s direct editing despite a forged Admin identity", async (role, id) => {
    signIn(role, id);
    const response = await PATCH(req("PATCH", { operation: "edit", version: "a".repeat(64), fields: { name: "Forged" },
      actor: { id: 1, role: "admin" } }, { cookie: "workspace_acting_user_id=10; role=admin" }), params);
    expect(response.status).toBe(403);
    expect(mocks.provider).not.toHaveBeenCalled();
    expect(mocks.claim).not.toHaveBeenCalled();
  });
  it("allows Admin archive, rejects an MGO archive and never deletes records", async () => {
    const editor = await (await GET(req(), params)).json();
    const body = { operation: "archive", version: editor.version, confirmArchive: true };
    expect((await PATCH(req("PATCH", body), params)).status).toBe(403);
    expect(patches()).toHaveLength(0);
    signIn("admin", 99);
    expect((await PATCH(req("PATCH", body), params)).status).toBe(200);
    expect(patches()[0][1].body).toEqual({ inactive: true });
    expect(rows).toHaveLength(2);
    expect(rows.every(row => row.opportunity_status === "Archived")).toBe(true);
  });
  it("does not replay an uncertain update when the user resumes", async () => {
    const editor = await (await GET(req(), params)).json();
    const body = { operation: "edit", version: editor.version, fields: { name: "Saved once" } };
    uncertain = true;
    expect((await PATCH(req("PATCH", body), params)).status).toBe(202);
    expect((await PATCH(req("PATCH", body), params)).status).toBe(202);
    expect((await POST(req("POST"), params)).status).toBe(200);
    expect(patches()).toHaveLength(1);
    expect(rows.every(row => row.title === "Saved once" && row.pipeline_change_id === null)).toBe(true);
  });
  it("rejects a stale edit without writing, then lets the user reload and save", async () => {
    const editor = await (await GET(req(), params)).json();
    remote.name = "Changed elsewhere";
    const body = { operation: "edit", version: editor.version, fields: { name: "Reviewed update" } };
    expect((await PATCH(req("PATCH", body), params)).status).toBe(409);
    expect(patches()).toHaveLength(0);
    const fresh = await (await GET(req(), params)).json();
    expect((await PATCH(req("PATCH", { ...body, version: fresh.version }), params)).status).toBe(200);
  });
  it.each(["anonymous", "inactive", "report denied", "cross-site"])("blocks %s access before loading an opportunity", async reason => {
    if (reason === "anonymous") mocks.auth.mockResolvedValue(null);
    if (reason === "inactive") signIn("mgo", 10, false);
    if (reason === "report denied") visibility = "specific_users";
    const response = await PATCH(req("PATCH", {}, reason === "cross-site" ? { origin: "https://foreign.example.test" } : {}), params);
    expect(response.status).toBe(reason === "anonymous" ? 401 : 403);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.load).not.toHaveBeenCalled();
    expect(mocks.provider).not.toHaveBeenCalled();
  });
});

describe("opportunity editor connected to the server workflow", () => {
  it.each([["admin", 99], ["mgo", 10], ["mgo", 20]])("lets %s/%s complete an edit through the real form and server", async (role, id) => {
    signIn(role, id);
    const callbacks = mountEditor();
    expect(await screen.findByLabelText("Opportunity title")).toHaveValue("Fictional scholarship");
    fireEvent.change(screen.getByLabelText("Ask amount"), { target: { value: "4200" } });
    fireEvent.click(screen.getByRole("button", { name: "Save to NXT and app" }));
    await waitFor(() => expect(callbacks.onClose).toHaveBeenCalledOnce());
    expect(callbacks.onSaved).toHaveBeenCalledWith(expect.objectContaining({ state: "complete" }));
    expect((await (await list()).json()).opportunities[0].amount).toBe(4200);
    expect(patches()).toHaveLength(1);
  });
  it.each([["advancement_services", 10], ["mgo", 99]])("explains denied access to %s/%s without offering a save", async (role, id) => {
    signIn(role, id);
    mountEditor();
    expect(await screen.findByRole("alert")).not.toHaveTextContent(/^\s*$/);
    expect(screen.queryByRole("button", { name: "Save to NXT and app" })).not.toBeInTheDocument();
    expect(mocks.provider).not.toHaveBeenCalled();
  });
  it("provides a working read-only recovery button after an uncertain NXT update", async () => {
    const callbacks = mountEditor();
    fireEvent.change(await screen.findByLabelText("Opportunity title"), { target: { value: "Save without duplication" } });
    uncertain = true;
    fireEvent.click(screen.getByRole("button", { name: "Save to NXT and app" }));
    const check = await screen.findByRole("button", { name: "Check sync status" });
    await waitFor(() => expect(check).toBeEnabled());
    expect(screen.queryByRole("button", { name: "Save to NXT and app" })).not.toBeInTheDocument();
    fireEvent.click(check);
    await waitFor(() => expect(callbacks.onClose).toHaveBeenCalledOnce());
    expect(patches()).toHaveLength(1);
    expect(rows.every(row => row.title === "Save without duplication")).toBe(true);
  });
});
