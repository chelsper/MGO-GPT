import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import WorkflowNotice, { actionNoticeKind } from "./WorkflowNotice";
afterEach(cleanup);

it.each([null, {}, { state: "review" }, { state: "unknown", message: "Saved successfully" }])("does not infer verification from message text: %j", receipt => {
  expect(actionNoticeKind(receipt)).toBe("verification");
  render(<WorkflowNotice kind={actionNoticeKind(receipt)}>Check the saved submission; do not resend.</WorkflowNotice>);
  expect(screen.getByRole("status")).toHaveClass("bg-amber-50");
  expect(screen.getByText("Needs verification")).toBeVisible();
});
it("distinguishes saved in app from verified NXT outcomes", () => {
  const { rerender } = render(<WorkflowNotice kind="app">No NXT action was created.</WorkflowNotice>);
  expect(screen.getByText("Saved in app")).toBeVisible();
  expect(screen.queryByText("Verified in NXT")).not.toBeInTheDocument();
  rerender(<WorkflowNotice kind={actionNoticeKind({ state: "saved" })}>An action was verified.</WorkflowNotice>);
  expect(screen.getByText("Verified in NXT")).toBeVisible();
});
it("does not label pending submissions successful", () => {
  render(<WorkflowNotice kind={actionNoticeKind({ state: "processing" })}>Wait for saved status.</WorkflowNotice>);
  expect(screen.getByText("Submission pending")).toBeVisible();
  expect(screen.getByRole("status")).toHaveClass("bg-amber-50");
});
