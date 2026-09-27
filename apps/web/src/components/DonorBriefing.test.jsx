import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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
});
