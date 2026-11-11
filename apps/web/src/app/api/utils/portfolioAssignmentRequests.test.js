import { beforeEach, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ query: vi.fn(), transaction: vi.fn() }));
vi.mock("./sql", () => ({ default: Object.assign(db.query, { transaction: db.transaction }) }));
import { savePortfolioAssignmentRequest } from "./portfolioAssignmentRequests";
const args = { user: { id: 7, name: "Demo Fundraiser", email: "demo@example.test" }, constituentId: "123", constituentName: "Example Donor", reason: "We met at an event." };
const request = { id: 1, status: "Open", request_type: "Portfolio assignment request" };
beforeEach(() => {
  vi.resetAllMocks();
  db.query.mockImplementation((parts, ...values) => ({ text: parts.join("?"), values }));
  db.transaction.mockResolvedValue([[], [request], [request]]);
});
it("queues a local request in the existing Advancement Services data queue", async () => {
  expect(await savePortfolioAssignmentRequest(args)).toEqual({ request, created: true });
  const [statements, options] = db.transaction.mock.calls[0];
  expect(options).toEqual({ isolationLevel: "ReadCommitted" });
  expect(statements[0].text).toContain("pg_advisory_xact_lock");
  expect(statements[0].values).toEqual(["portfolio-assignment-request:7:123"]);
  expect(statements[1].text).toContain("INSERT INTO data_change_requests");
  expect(statements[1].text).toContain("WHERE NOT EXISTS");
  expect(statements[1].values).toContain("Portfolio assignment request");
  expect(statements[1].values).toContainEqual(expect.stringContaining("does not update NXT"));
  expect(statements[1].values).toContainEqual(expect.stringContaining("Demo Fundraiser"));
  expect(statements[1].values).toContainEqual(expect.stringContaining("We met at an event."));
  expect(statements.every(q => !/UPDATE users|INSERT INTO prospects|INSERT INTO constituents/.test(q.text))).toBe(true);
});
it("reuses an open request without replacing its reason or reviewer notes", async () => {
  db.transaction.mockResolvedValue([[], [], [{ ...request, status: "In Progress", reviewer_notes: "Checking current assignments" }]]);
  expect(await savePortfolioAssignmentRequest(args)).toMatchObject({ created: false, request: { status: "In Progress", reviewer_notes: "Checking current assignments" } });
  expect(db.transaction.mock.calls[0][0].some(q => q.text.includes("UPDATE"))).toBe(false);
});
it("keeps requests separate from contact updates and from other users", async () => {
  await savePortfolioAssignmentRequest(args);
  const insert = db.transaction.mock.calls[0][0][1];
  expect(insert.text).toContain("requester_user_id =");
  expect(insert.text).toContain("blackbaud_constituent_id =");
  expect(insert.text).toContain("request_type =");
  expect(insert.text).toContain("source_context =");
  expect(insert.text).toContain("status IN ('Open', 'In Progress')");
});
it("status checks only read saved requests for the signed-in user", async () => {
  db.query.mockResolvedValue([request]);
  expect(await savePortfolioAssignmentRequest({ ...args, verifyOnly: true })).toEqual({ request, created: false });
  expect(db.transaction).not.toHaveBeenCalled();
  expect(db.query.mock.calls[0].slice(1)).toEqual([7, "123", "Portfolio assignment request", "constituent_lookup_assignment"]);
});
it("does not report success when nothing was saved", async () => {
  db.transaction.mockResolvedValue([[], [], []]);
  await expect(savePortfolioAssignmentRequest(args)).rejects.toThrow("not saved");
  db.query.mockResolvedValue([]);
  expect(await savePortfolioAssignmentRequest({ ...args, verifyOnly: true })).toEqual({ request: null, created: false });
});
