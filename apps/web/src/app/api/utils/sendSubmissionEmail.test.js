import { describe, expect, it } from "vitest";

import { buildResendFromAddress } from "./sendSubmissionEmail";

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
