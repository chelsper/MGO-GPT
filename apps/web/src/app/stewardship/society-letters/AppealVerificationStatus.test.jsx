import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import AppealVerificationStatus from "./AppealVerificationStatus";

describe("appeal verification status", () => {
  it("shows automatic verification with an optional read-only fallback, not a required step", () => {
    const onVerify = vi.fn();
    render(
      <AppealVerificationStatus
        automatic
        onVerify={onVerify}
        receipt={{
          status: "needs_review",
          members: [{ id: "10", status: "uncertain" }],
        }}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "checked automatically",
    );
    expect(
      screen.getByRole("button", { name: "Verify NXT status (read only)" }),
    ).not.toBeVisible();
    fireEvent.click(screen.getByText("Check status manually (optional)"));
    fireEvent.click(
      screen.getByRole("button", { name: "Verify NXT status (read only)" }),
    );
    expect(onVerify).toHaveBeenCalledTimes(1);
  });
});
