import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildResendFromAddress, sendSubmissionEmail } from "./sendSubmissionEmail";
const { ensureSchema } = vi.hoisted(() => ({ ensureSchema: vi.fn() }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: ensureSchema }));

beforeEach(() => { ensureSchema.mockReset(); });

describe("submission review email routing", () => {
  it.each(["donor_update", "opportunity_update"])("does not generate approval email or DB writes for routine %s", async (type) => {
    await sendSubmissionEmail({ id: 78, status: "Pending", interaction_type: "Cultivation", blackbaud_sync_status: "not_requested" }, type);
    expect(ensureSchema).not.toHaveBeenCalled();
  });
  it.each([
    [{ interaction_type: "Data update" }, "donor_update"],
    [{ blackbaud_sync_status: "failed" }, "opportunity_update"],
    [{ status: "Needs Clarification" }, "donor_update"],
    [{}, "constituent_suggestion"],
  ])("keeps real requests and failures on the notification path: %j", async (fields, type) => {
    ensureSchema.mockRejectedValue(new Error("Notification path reached"));
    await expect(sendSubmissionEmail({ id: 78, status: "Pending", blackbaud_sync_status: "not_requested", ...fields }, type)).rejects.toThrow("Notification path reached");
  });
});

describe("buildResendFromAddress", () => {
  it("uses the configured display name without changing the verified sender address", () => {
    expect(
      buildResendFromAddress(
        "JUMGOGPT",
        "Existing Sender <notifications@ju.edu>",
      ),
    ).toBe("JUMGOGPT <notifications@ju.edu>");
  });

  it("sanitizes unsafe display-name characters", () => {
    expect(buildResendFromAddress("JUMGOGPT <Notifications>", "alerts@ju.edu")).toBe(
      "JUMGOGPT Notifications <alerts@ju.edu>",
    );
  });
});
