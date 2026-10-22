import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import DonorBriefing from "./DonorBriefing";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("renders saved text without requests or interpreted HTML", () => {
  vi.stubGlobal("fetch", vi.fn());
  render(<DonorBriefing constituentId="100" nextStep={{ status: "Open", title: "<img src=x onerror=alert(1)>" }} />);
  const briefing = screen.getByRole("region", { name: "Donor briefing" });
  expect(briefing).toHaveTextContent("<img src=x onerror=alert(1)>");
  expect(briefing.querySelector("img")).toBeNull();
  expect(screen.queryByText("Last gift")).not.toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});
it("offers an honest quiet empty state instead of inferred advice", () => {
  render(<DonorBriefing constituentId="100" />);
  expect(screen.getByText("There isn't enough saved information for a briefing yet.")).toBeVisible();
  expect(screen.queryByText(/No gifts|No actions|recommended/i)).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Prepare for a meeting" })).toBeNull();
});
it("reuses existing briefing facts without a request and clears drafts on donor or workspace changes", () => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  vi.stubGlobal("fetch", vi.fn());
  const props = { constituentId: "100", draftScope: "7:10", name: "Sample Donor", nextStep: { status: "Open", title: "Plan the visit" } };
  const view = render(<DonorBriefing {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Prepare for a meeting" }));
  expect(screen.getByRole("textbox").value).toContain("Source: Saved next step");
  expect(screen.queryByRole("button", { name: "Thank-you draft" })).toBeNull();
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Personal meeting notes" } });
  view.rerender(<DonorBriefing {...props} draftScope="7:20" />);
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Prepare for a meeting" }));
  expect(screen.queryByDisplayValue("Personal meeting notes")).toBeNull();
  view.rerender(<DonorBriefing {...props} constituentId="200" />);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});
