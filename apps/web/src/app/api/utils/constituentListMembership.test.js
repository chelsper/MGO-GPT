import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  sql: vi.fn(),
  read: vi.fn(),
  validate: vi.fn(),
  write: vi.fn(),
}));
vi.mock("./sql", () => ({ default: mocks.sql }));
vi.mock("./constituentListProvider", () => ({
  readMemberFields: mocks.read,
  validateMembershipValue: mocks.validate,
  writeListMembership: mocks.write,
  matchesListField: (field, source) =>
    field.category === source.fieldCategory &&
    (!source.fieldDescription || field.value === source.fieldDescription),
}));
import {
  addListMember,
  membershipReceiptKey,
} from "./constituentListMembership";
const source = { fieldCategory: "Interests", fieldDescription: "Golf" };
const context = {
  user: { id: 1 },
  origin: "https://example.test",
  constituentId: "123",
  source,
};
const field = { id: "9", category: "Interests", value: "Golf" };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.sql.mockImplementation(async (parts) =>
    parts.join(" ").includes("INSERT") ? [{ report_key: "claimed" }] : [],
  );
  mocks.read.mockResolvedValue([]);
  mocks.validate.mockResolvedValue({ category: "Interests", value: "Golf" });
  mocks.write.mockResolvedValue({ id: "9" });
});
it("isolates receipts by environment, constituent and source", () => {
  expect(membershipReceiptKey(context.origin, "123", source)).not.toBe(
    membershipReceiptKey("https://sandbox.test", "123", source),
  );
  expect(membershipReceiptKey(context.origin, "123", source)).toBe(
    membershipReceiptKey(context.origin, "123", {
      ...source,
      fieldDescription: "",
    }),
  );
});
it("blocks overlapping lists while another addition in that category is uncertain", async () => {
  mocks.sql.mockResolvedValueOnce([
    { payload: { state: "sending", value: "Tennis" } },
  ]);
  expect((await addListMember(context)).status).toBe("needs_verification");
  expect(mocks.write).not.toHaveBeenCalled();
});
it("allows a different value only after the prior addition is verified, with a compare-and-swap claim", async () => {
  mocks.sql.mockResolvedValueOnce([
    { payload: { state: "review", value: "Tennis" } },
  ]);
  mocks.read
    .mockResolvedValueOnce([{ ...field, value: "Tennis" }])
    .mockResolvedValueOnce([field]);
  expect((await addListMember(context)).status).toBe("added");
  const insert = mocks.sql.mock.calls.find(([parts]) =>
    parts.join(" ").includes("INSERT"),
  );
  expect(insert[0].join(" ")).toContain(
    "WHERE report_snapshots_cache.payload =",
  );
  expect(insert).toContain(
    JSON.stringify({ state: "review", value: "Tennis" }),
  );
});
it("does not send existing membership or a verification-only request", async () => {
  mocks.read.mockResolvedValueOnce([field]);
  expect((await addListMember(context)).status).toBe("already_present");
  expect((await addListMember({ ...context, verifyOnly: true })).status).toBe(
    "needs_verification",
  );
  expect(mocks.write).not.toHaveBeenCalled();
});
it("never sends without a persisted unique pre-write receipt and access recheck", async () => {
  mocks.sql.mockImplementation(async (parts) =>
    parts.join(" ").includes("INSERT") ? [] : [],
  );
  const beforeWrite = vi.fn();
  expect((await addListMember({ ...context, beforeWrite })).status).toBe(
    "needs_verification",
  );
  expect(beforeWrite).toHaveBeenCalledOnce();
  expect(mocks.write).not.toHaveBeenCalled();
});
it("verifies additions after one POST and preserves an uncertain receipt", async () => {
  mocks.read.mockResolvedValueOnce([]).mockResolvedValueOnce([field]);
  expect((await addListMember(context)).status).toBe("added");
  expect(mocks.write).toHaveBeenCalledOnce();
  mocks.sql.mockResolvedValueOnce([{ payload: { state: "review" } }]);
  expect((await addListMember(context)).status).toBe("needs_verification");
  expect(mocks.write).toHaveBeenCalledOnce();
});
it("records ambiguity after timeout instead of resending or invalidating a saved list", async () => {
  mocks.write.mockRejectedValueOnce(new Error("timeout"));
  expect((await addListMember(context)).status).toBe("needs_verification");
  expect(mocks.write).toHaveBeenCalledOnce();
  expect(
    mocks.sql.mock.calls.some(([parts]) => parts.join(" ").includes("DELETE")),
  ).toBe(false);
});
it("makes no write when duplicate check fails or source validation is unsupported", async () => {
  mocks.read.mockRejectedValueOnce(new Error("incomplete"));
  await expect(addListMember(context)).rejects.toThrow("incomplete");
  mocks.validate.mockRejectedValueOnce(new Error("unsupported"));
  await expect(addListMember(context)).rejects.toThrow("unsupported");
  expect(mocks.write).not.toHaveBeenCalled();
});
