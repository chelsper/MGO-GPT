import { expect, it } from "vitest";
import {
  receiptCommand,
  receiptFilters,
  formatReceivedDate,
} from "./stewardshipReceipts";
const command = {
  operation: "record",
  viewerKey: "2",
  requestId: "1",
  itemId: "12",
  version: 1,
  token: "74512c41-89cd-41be-946e-10a056cae491",
  receivedOn: "2026-09-30",
  note: " At visit ",
  confirmed: true,
};
it("requires explicit confirmation and normalizes only safe receipt fields", () => {
  expect(receiptCommand(command)).toEqual({ ...command, note: "At visit", stockQuantity: 0 });
  expect(formatReceivedDate("2026-09-30")).toBe("Sep 30, 2026");
  expect(formatReceivedDate(null)).toBe("Date not recorded");
});
it.each([-1, 0.5, "1", 1000001, null])("rejects invalid stock deductions %s", stockQuantity => {
  expect(receiptCommand({ ...command, stockQuantity })).toBeNull();
});
it.each([
  { confirmed: false },
  { confirmed: "true" },
  { token: "bad" },
  { itemId: 12 },
  { requestId: "0" },
  { receivedOn: "2026-02-30" },
  { receivedOn: "2026-02-29" },
  { version: 0 },
  { note: "x".repeat(2001) },
  { constituentId: "forged" },
  { itemSnapshot: {} },
])("rejects %o", (change) => {
  expect(receiptCommand({ ...command, ...change })).toBeNull();
});
it("requires a reason for non-destructive corrections", () => {
  const correction = {
    operation: "void",
    viewerKey: "2",
    requestId: "1",
    id: "6",
    version: 2,
    reason: " Wrong item ",
  };
  expect(receiptCommand(correction).reason).toBe("Wrong item");
  expect(receiptCommand({ ...correction, reason: "" })).toBeNull();
  expect(receiptCommand({ ...correction, operation: "delete" })).toBeNull();
});
it("bounds search/cursors and excludes corrections by default", () => {
  expect(receiptFilters(new URLSearchParams())).toEqual({
    search: "",
    includeVoided: false,
    itemId: null,
    constituentId: null,
    requestId: null,
    before: null,
  });
  expect(
    receiptFilters(
      new URLSearchParams("search=Blanket&includeVoided=true&before=23"),
    ),
  ).toMatchObject({ search: "Blanket", includeVoided: true, before: "23" });
  for (const query of [
    "before=0",
    "itemId=abc",
    "includeVoided=yes",
    `search=${"a".repeat(161)}`,
  ])
    expect(receiptFilters(new URLSearchParams(query))).toBeNull();
});
