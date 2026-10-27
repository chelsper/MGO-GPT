import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/getWorkspaceUser", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/sendSubmissionEmail", () => ({ sendSubmissionEmail: vi.fn() }));
vi.mock("@/app/api/utils/constituents", () => ({ resolveConstituent: vi.fn(), createConstituent: vi.fn() }));
vi.mock("@/app/api/utils/portfolioOpportunityContext", async original => ({ ...await original(),
  checkPortfolioOpportunityScope: vi.fn(), findPortfolioProspect: vi.fn(), ensurePortfolioProspect: vi.fn(), readPortfolioProspectSummary: vi.fn(),
}));
vi.mock("@/app/api/utils/prospectOpportunities", async original => ({ ...await original(),
  saveProspectOpportunity: vi.fn(), syncJointSolicitationOpportunities: vi.fn(),
}));
vi.mock("@/app/api/utils/blackbaud", () => ({
  buildBlackbaudOpportunityPayload: vi.fn(), createBlackbaudOpportunity: vi.fn(), getBlackbaudOpportunity: vi.fn(), updateBlackbaudOpportunity: vi.fn(),
}));
vi.mock("@/app/api/utils/nxtCreateReceipt", async original => ({ ...await original(),
  guardedNxtCreate: vi.fn(), completeNxtCreateReceipt: vi.fn(),
}));
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import { sendSubmissionEmail } from "@/app/api/utils/sendSubmissionEmail";
import { resolveConstituent } from "@/app/api/utils/constituents";
import { checkPortfolioOpportunityScope, findPortfolioProspect, ensurePortfolioProspect, readPortfolioProspectSummary } from "@/app/api/utils/portfolioOpportunityContext";
import { saveProspectOpportunity, syncJointSolicitationOpportunities } from "@/app/api/utils/prospectOpportunities";
import { buildBlackbaudOpportunityPayload, createBlackbaudOpportunity, getBlackbaudOpportunity, updateBlackbaudOpportunity } from "@/app/api/utils/blackbaud";
import { guardedNxtCreate, completeNxtCreateReceipt } from "@/app/api/utils/nxtCreateReceipt";
import { POST } from "./route";

const context = { sessionUser: { id: 2, name: "Admin", role: "admin" }, workspaceUser: { id: 44, name: "MGO", role: "mgo" }, isActing: true };
const body = { donorName: "Fictional Donor", opportunityTitle: "Scholarship", purpose: "Campaign", opportunityStage: "Cultivation", askAmount: 25000,
  expectedDate: "2027-06-01", blackbaudConstituentId: "100", createNewOpportunity: true,
  portfolioContext: { viewerId: 2, workspaceId: 44, constituentId: "100" } };
const payload = { constituent_id: "100", name: "Scholarship", purpose: "Campaign", status: "Cultivation", expected_amount: { value: 25000 }, expected_date: "2027-06-01" };
const prospect = { id: 7, user_id: 44, constituent_id: 6, blackbaud_constituent_id: "100" };
const request = (changes = {}) => new Request("https://example.com/api/submissions/opportunity-update", { method: "POST", body: JSON.stringify({ ...body, ...changes }) });
beforeEach(() => {
  vi.resetAllMocks(); auth.mockResolvedValue({ user: { email: "admin@example.com" } }); getWorkspaceUser.mockResolvedValue(context);
  findPortfolioProspect.mockResolvedValue(null); ensurePortfolioProspect.mockResolvedValue(prospect);
  readPortfolioProspectSummary.mockResolvedValue({ ...prospect, portfolio_open_opportunity_count: 1, portfolio_open_pipeline_amount: 25000 });
  buildBlackbaudOpportunityPayload.mockReturnValue(payload);
  createBlackbaudOpportunity.mockResolvedValue({ id: "812" });
  getBlackbaudOpportunity.mockResolvedValue({ ...payload, id: "812" });
  saveProspectOpportunity.mockResolvedValue({ prospectId: 7, opportunity: { id: 8 } });
  sql.mockResolvedValue([{ id: 9, prospect_id: 7, prospect_opportunity_id: 8 }]);
  guardedNxtCreate.mockImplementation(async ({ kind, payload, create, onReceipt }) => {
    const receipt = { id: "900", kind, payload, constituent_id: "100", state: "processing" };
    onReceipt(receipt); const result = await create();
    onReceipt({ ...receipt, state: "created", remote_id: result?.id }); return result;
  });
});

it("verifies the new NXT record then links it into the selected MGO's pipeline with separate admin authorship", async () => {
  const response = await POST(request()); const result = await response.json();
  expect(response.status).toBe(201);
  expect(result).toMatchObject({ verifiedOpportunityId: "812", blackbaudConstituentId: "100", blackbaudSync: { status: "synced" }, portfolioProspect: { user_id: 44, portfolio_open_pipeline_amount: 25000 } });
  expect(checkPortfolioOpportunityScope).toHaveBeenCalledWith(context, body.portfolioContext);
  expect(guardedNxtCreate).toHaveBeenCalledWith(expect.objectContaining({ ownerUserId: 44, enteredByUserId: 2, kind: "opportunity" }));
  expect(createBlackbaudOpportunity).toHaveBeenCalledExactlyOnceWith({ userId: 44, authUserId: 2, origin: "https://example.com", payload });
  expect(getBlackbaudOpportunity).toHaveBeenCalledExactlyOnceWith({ userId: 44, authUserId: 2, origin: "https://example.com", opportunityId: "812" });
  expect(ensurePortfolioProspect.mock.invocationCallOrder[0]).toBeGreaterThan(getBlackbaudOpportunity.mock.invocationCallOrder[0]);
  expect(saveProspectOpportunity).toHaveBeenCalledWith(expect.objectContaining({ userId: 44, prospectId: 7, constituentId: 6, blackbaudOpportunityId: "812", opportunityId: null, askAmount: 25000, jointMgoUserIds: [44] }));
  expect(resolveConstituent).not.toHaveBeenCalled();
  expect(updateBlackbaudOpportunity).not.toHaveBeenCalled();
  expect(syncJointSolicitationOpportunities).not.toHaveBeenCalled();
  expect(sendSubmissionEmail).not.toHaveBeenCalled();
  expect(completeNxtCreateReceipt).toHaveBeenCalledWith(expect.objectContaining({ id: "900", state: "created" }));
});
it("uses an existing exact-ID prospect without changing its identity", async () => {
  findPortfolioProspect.mockResolvedValue(prospect);
  expect((await POST(request({ linkedProspectId: 7 }))).status).toBe(201);
  expect(saveProspectOpportunity).toHaveBeenCalledWith(expect.objectContaining({ prospectId: 7, opportunityId: null }));
});
it.each([
  { linkedProspectId: 77 }, { linkedOpportunityId: 99 }, { jointMgoUserIds: [45] }, { blackbaudConstituentId: "101" },
  { createNewOpportunity: false }, { expectedDate: "2026-02-30" }, { askAmount: -1 },
])("rejects invalid or mismatched input before any NXT or local write: %j", async changes => {
  const response = await POST(request(changes));
  expect([400, 409]).toContain(response.status);
  expect(await response.json()).toMatchObject({ notSubmitted: true });
  expect(guardedNxtCreate).not.toHaveBeenCalled();
  expect(sql).not.toHaveBeenCalled();
  expect(ensurePortfolioProspect).not.toHaveBeenCalled();
});
it("rechecks workspace scope at save, not just when the panel opened", async () => {
  checkPortfolioOpportunityScope.mockRejectedValue(Object.assign(new Error("Workspace changed"), { portfolioPreflight: true, status: 409 }));
  expect((await POST(request())).status).toBe(409);
  expect(guardedNxtCreate).not.toHaveBeenCalled();
});
it.each(["unauthenticated", "executive", "inactive"])("blocks %s saves before any provider or local write", async mode => {
  if (mode === "unauthenticated") auth.mockResolvedValue(null);
  else getWorkspaceUser.mockResolvedValue({ ...context, sessionUser: { ...context.sessionUser, role: mode === "executive" ? "executive" : "admin", active: mode !== "inactive" } });
  const response = await POST(request());
  expect([401, 403]).toContain(response.status);
  expect(await response.json()).toMatchObject({ notSubmitted: true });
  expect(guardedNxtCreate).not.toHaveBeenCalled();
});
it.each(["name", "constituent_id", "purpose", "status", "expected_date", "expected_amount"])("protects an NXT readback mismatch in %s without creating app links", async field => {
  getBlackbaudOpportunity.mockResolvedValue({ ...payload, id: "812", [field]: field === "expected_amount" ? { value: 1 } : "different" });
  const response = await POST(request());
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ writeReceipt: { id: "900" } });
  expect(ensurePortfolioProspect).not.toHaveBeenCalled();
  expect(sql).not.toHaveBeenCalled();
  expect(completeNxtCreateReceipt).not.toHaveBeenCalled();
});
it.each(["provider create", "readback", "app link", "pipeline save", "receipt completion"])("holds %s failure for recovery without replaying, emailing or reporting success", async mode => {
  const failure = new Error("Fictional failure");
  if (mode === "provider create") createBlackbaudOpportunity.mockRejectedValue(failure);
  if (mode === "readback") getBlackbaudOpportunity.mockRejectedValue(failure);
  if (mode === "app link") ensurePortfolioProspect.mockRejectedValue(failure);
  if (mode === "pipeline save") saveProspectOpportunity.mockRejectedValue(failure);
  if (mode === "receipt completion") completeNxtCreateReceipt.mockRejectedValue(failure);
  const response = await POST(request());
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ writeReceipt: { id: "900" } });
  expect(createBlackbaudOpportunity).toHaveBeenCalledOnce();
  expect(sendSubmissionEmail).not.toHaveBeenCalled();
});
it("does not call NXT again when the existing durable create guard rejects a repeat", async () => {
  guardedNxtCreate.mockRejectedValue(Object.assign(new Error("Already submitted"), { writeReceipt: { id: "900", state: "created", kind: "opportunity", remote_id: "812" } }));
  expect((await POST(request())).status).toBe(409);
  expect(createBlackbaudOpportunity).not.toHaveBeenCalled();
  expect(ensurePortfolioProspect).not.toHaveBeenCalled();
});
it("keeps a verified save successful if its optional card summary cannot be read", async () => {
  readPortfolioProspectSummary.mockRejectedValue(new Error("summary temporarily unavailable"));
  const response = await POST(request());
  expect(response.status).toBe(201);
  expect(await response.json()).toMatchObject({ verifiedOpportunityId: "812", portfolioProspect: null });
});
