import { describe, it, expect } from "vitest";
import {
  automaticAppealCheck,
  beginAutomaticAppealCheck,
  finishAutomaticAppealCheck,
  nextAutomaticAppealCheck,
  canResumeLetterAppeals,
  letterAppealRecovery,
} from "./societyLetterVerification";

const now = Date.parse("2026-10-08T12:00:00Z");
const receipt = () => ({
  status: "needs_review",
  checkedAt: new Date(now).toISOString(),
  members: [
    { id: "10", status: "uncertain", attemptedAt: new Date(now).toISOString() },
  ],
});

describe("automatic read-only appeal reconciliation", () => {
  it("only clears stopped recovery for safe pending work or a known expired provider pause", () => {
    const r = {
      status: "needs_review",
      members: [{ id: "10", status: "pending" }],
      verificationFailure: {
        httpStatus: 429,
        checkedAt: new Date(now).toISOString(),
        retryAfterMs: 60000,
      },
    };
    expect(canResumeLetterAppeals(r, now)).toBe(false);
    expect(canResumeLetterAppeals(r, now + 60000)).toBe(true);
    r.members[0].status = "uncertain";
    expect(canResumeLetterAppeals(r, now + 60000)).toBe(false);
    r.members[0].status = "pending";
    r.verificationFailure = { httpStatus: 403 };
    expect(letterAppealRecovery(r, now)).toBe("connection");
    expect(canResumeLetterAppeals(r, now)).toBe(false);
    delete r.verificationFailure;
    expect(canResumeLetterAppeals(r, now)).toBe(false);
    r.recoveryAction = "recipient";
    expect(letterAppealRecovery(r, now)).toBe("recipient");
    expect(canResumeLetterAppeals(r, now)).toBe(false);
  });
  it("checks uncertain submissions only, after the initial delay", () => {
    const r = receipt();
    expect(automaticAppealCheck(r, now).delay).toBe(5000);
    expect(beginAutomaticAppealCheck(r, now)).toBe(false);
    expect(r.verification).toBeUndefined();
    expect(beginAutomaticAppealCheck(r, now + 5000)).toBe(true);
    expect(r.verification).toMatchObject({ attempts: 1, status: "checking" });
    expect(beginAutomaticAppealCheck(r, now + 5000)).toBe(false);
    for (const status of ["pending", "verified", "existing", "not_applicable"])
      expect(
        automaticAppealCheck(
          { ...receipt(), members: [{ id: "10", status }] },
          now,
        ),
      ).toBeNull();
    expect(
      automaticAppealCheck({ ...receipt(), status: "complete" }, now),
    ).toBeNull();
  });
  it("persists at most three checks, including interrupted checks", () => {
    let r = receipt();
    let clock = now + 5000;
    for (let attempt = 1; attempt <= 3; attempt++) {
      expect(beginAutomaticAppealCheck(r, clock)).toBe(true);
      expect(r.verification.attempts).toBe(attempt);
      finishAutomaticAppealCheck(r, new Error("Not yet confirmed"), clock);
      r = structuredClone(r);
      if (attempt < 3) clock = Date.parse(r.verification.nextCheckAt);
    }
    expect(r.verification.status).toBe("needs_review");
    expect(automaticAppealCheck(r, clock + 86400000)).toBeNull();
    const interrupted = receipt();
    for (let attempt = 0; attempt < 3; attempt++) {
      expect(
        beginAutomaticAppealCheck(interrupted, now + 5000 + attempt * 120000),
      ).toBe(true);
    }
    expect(automaticAppealCheck(interrupted, now + 86400000)).toBeNull();
  });
  it("honors provider cooldowns from new and legacy receipts", () => {
    const r = receipt();
    r.members[0].lastWriteFailure = {
      checkedAt: new Date(now).toISOString(),
      retryAfterMs: 300000,
    };
    expect(automaticAppealCheck(r, now).delay).toBe(300000);
    expect(beginAutomaticAppealCheck(r, now + 5000)).toBe(false);
    expect(beginAutomaticAppealCheck(r, now + 300000)).toBe(true);
    finishAutomaticAppealCheck(
      r,
      { httpStatus: 429, retryAfterMs: 600000 },
      now + 300000,
    );
    expect(automaticAppealCheck(r, now + 300000).delay).toBe(600000);
  });
  it("stops on permission failures or success without altering member write eligibility", () => {
    const r = receipt();
    beginAutomaticAppealCheck(r, now + 5000);
    finishAutomaticAppealCheck(r, { httpStatus: 403 }, now + 5000);
    expect(automaticAppealCheck(r, now + 86400000)).toBeNull();
    expect(r.members[0].status).toBe("uncertain");
    const success = receipt();
    beginAutomaticAppealCheck(success, now + 5000);
    success.members[0].status = "verified";
    finishAutomaticAppealCheck(success, null, now + 5000);
    expect(success.verification.status).toBe("complete");
    expect(automaticAppealCheck(success, now + 86400000)).toBeNull();
  });
  it("does not reset the budget for unrelated receipt changes", () => {
    const r = receipt();
    beginAutomaticAppealCheck(r, now + 5000);
    finishAutomaticAppealCheck(r, { httpStatus: 403 }, now + 5000);
    r.message = "Another status message";
    r.checkedAt = new Date(now + 60000).toISOString();
    expect(automaticAppealCheck(r, now + 86400000)).toBeNull();
  });
  it("chooses the oldest eligible receipt and never checks cancelled or restored work", () => {
    const r = receipt();
    const data = {
      history: [
        {
          id: "cancelled",
          channel: "post",
          status: "cancelled",
          letterAppeals: r,
        },
        { id: "email", channel: "email", status: "prepared", letterAppeals: r },
        { id: "letter", channel: "post", status: "prepared", letterAppeals: r },
      ],
      exclusions: [
        { id: "restored", restoredAt: new Date(now).toISOString(), nxt: r },
        {
          id: "exclusion",
          nxt: { ...r, checkedAt: new Date(now - 10000).toISOString() },
        },
      ],
    };
    expect(nextAutomaticAppealCheck(data, now).body).toEqual({
      action: "verify_exclusion_appeal",
      exclusionId: "exclusion",
      automatic: true,
    });
    data.exclusions[1].nxt.status = "complete";
    expect(nextAutomaticAppealCheck(data, now).body).toEqual({
      action: "verify_letter_appeals",
      deliveryId: "letter",
      automatic: true,
    });
  });
});
