import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AdvancementServicesHome from "./AdvancementServicesHome";
import { getNavigationItems } from "@/utils/appNavigation";

describe("Advancement Services workspace shortcuts", () => {
  it.each([false, true])("renders the same destinations as the menu exactly once (manage: %s)", (canManageWorkspace) => {
    const { container } = render(<AdvancementServicesHome canManageWorkspace={canManageWorkspace} />);
    const links = [...container.querySelectorAll("a")].map((node) => node.getAttribute("href"));
    const expected = getNavigationItems({ isReviewer: true, canManageWorkspace }).map((item) => item.href);
    expect(links.sort()).toEqual(expected.sort());
    expect(new Set(links).size).toBe(links.length);
    const reports = screen.getByRole("region", { name: "Reports & Exports" });
    expect(within(reports).getByRole("link", { name: /Pledge Payments/ })).toHaveAttribute("href", "/pledge-payments");
    expect(within(reports).getByRole("link", { name: /Top Prospect Exports/ })).toHaveAttribute("href", "/prospect-exports");
  });

  it("keeps settings collapsed but reporting tools immediately visible", () => {
    const { container } = render(<AdvancementServicesHome canManageWorkspace />);
    const settings = container.querySelector('a[href="/access-management"]').closest("details");
    expect(settings).not.toHaveAttribute("open");
    expect(container.querySelector('a[href="/pledge-payments"]').closest("details")).toBeNull();
    fireEvent.click(settings.querySelector("summary"));
    expect(settings).toHaveAttribute("open");
    expect(screen.getByRole("link", { name: /Security & Access/ })).toBeVisible();
  });

  it("uses numbered discussion alerts and explains overlapping queue totals without adding them", () => {
    render(<AdvancementServicesHome queueCounts={{ workQueue: 10, constituencyImports: 8, dataRequests: 2 }} openDiscussionItems={3} />);
    expect(screen.getByLabelText("3 open team discussion items")).toHaveTextContent("3");
    expect(screen.getByLabelText("8 unfinished constituency import batches")).toBeInTheDocument();
    fireEvent.click(screen.getByText("About queue counts"));
    expect(screen.getByText(/do not add the badges together/)).toBeVisible();
  });

  it("never fetches pledge or export data just to display shortcuts", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      const { rerender } = render(<AdvancementServicesHome canManageWorkspace />);
      fireEvent.click(screen.getByText("About queue counts"));
      rerender(<AdvancementServicesHome canManageWorkspace worklistFailed queueCounts={{ workQueue: 9 }} />);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(screen.getByRole("status")).toHaveTextContent("last successful check");
      expect(screen.getByLabelText("9 items in the work queue")).toBeInTheDocument();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
