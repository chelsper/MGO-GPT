import { describe, expect, it } from "vitest";
import { getImportWriteResults, hasImportRetryHold, hasImportWriteHistory, importWriteCanRetry, importWritePlanKey } from "./importWriteResults";

describe("import write history", () => {
  it("retains earlier successful results when legacy retries only saved a subset", () => {
    const first = { writeIndex: 0, status: "applied" };
    const last = { writeIndex: 1, status: "applied" };
    expect(getImportWriteResults({ attempts: [{ results: [first, { writeIndex: 1, status: "failed" }] }], results: [last] })).toEqual([first, last]);
  });
  it.each(["Applied", "Applying", "Failed"])("protects %s rows even if old audit fields are empty", (status) => expect(hasImportWriteHistory({ status })).toBe(true));
  it("protects attempted rows returned to manual review", () => expect(hasImportWriteHistory({ status: "Needs Review", blackbaud_result: { results: [{ writeIndex: 0, status: "unconfirmed" }] } })).toBe(true));
  it("never retries unknown writes or legacy creation timeouts", () => {
    expect(importWriteCanRetry({ status: "failed", retrySafe: false })).toBe(false);
    expect(importWriteCanRetry({ status: "failed", type: "email_address", message: "Blackbaud 504 timeout" })).toBe(false);
    expect(importWriteCanRetry({ status: "failed", type: "email_address", message: "Request interrupted" })).toBe(false);
    expect(importWriteCanRetry({ status: "failed", type: "email_address", message: "Blackbaud 400 Bad Request" })).toBe(true);
    expect(importWriteCanRetry({ status: "unconfirmed" })).toBe(false);
    expect(importWriteCanRetry({ status: "failed", retrySafe: true })).toBe(true);
  });
  it("hides retry when any write in the row has an uncertain outcome", () => {
    expect(hasImportRetryHold({ results: [{ writeIndex: 0, status: "failed", retrySafe: true }, { writeIndex: 1, status: "unconfirmed" }] })).toBe(true);
    expect(hasImportRetryHold({ results: [{ writeIndex: 0, status: "failed", retrySafe: true }] })).toBe(false);
  });
  it("uses a stable plan key but detects changed values or order", () => {
    expect(importWritePlanKey([{ type: "phone", number: "123" }])).toBe(importWritePlanKey([{ number: "123", type: "phone" }]));
    expect(importWritePlanKey([{ type: "phone", number: "123" }])).not.toBe(importWritePlanKey([{ type: "phone", number: "124" }]));
  });
});
