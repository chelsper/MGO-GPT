import { describe, expect, it } from "vitest";
import { submissionQueueGroupSql } from "./submissionReviewSql";
import { CLOSED_SUBMISSION_STATUSES, MANUAL_SUBMISSION_REQUEST_PATTERN } from "@/utils/submissionReview";

describe("submission count SQL", () => {
  it("uses the same manual-request markers and closed states as the client", () => {
    const query = submissionQueueGroupSql();
    expect(query).toContain(MANUAL_SUBMISSION_REQUEST_PATTERN);
    CLOSED_SUBMISSION_STATUSES.forEach((status) => expect(query).toContain(`'${status}'`));
    expect(query.indexOf("= 'failed'")).toBeLessThan(query.indexOf("IN ('synced', 'success')"));
    expect(query).toContain("s.status");
    expect(query).toContain("s.blackbaud_sync_error");
    expect(query).toContain("IN ('', 'not_requested')");
    expect(query).toContain("THEN 'waiting'");
  });

  it("rejects SQL supplied in place of an internal alias", () => {
    expect(() => submissionQueueGroupSql("s; DROP TABLE submissions")).toThrow("Invalid");
  });
});
