import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import WorkspaceStartPaths from "./WorkspaceStartPaths";
import { getNavigationItems } from "@/utils/appNavigation";

describe("Workspace start paths", () => {
  it.each([false, true])("renders only the supplied workspace's primary links without fetching (reviewer: %s)", isReviewer => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      const items = getNavigationItems({ isReviewer, canManageWorkspace: true, isAdmin: true });
      const { rerender } = render(<WorkspaceStartPaths items={items} />);
      const links = within(screen.getByRole("navigation", { name: "Main workspace paths" })).getAllByRole("link");
      expect(links.map(link => link.getAttribute("href"))).toEqual(isReviewer
        ? ["/submissions", "/constituency-import", "/prospect-exports"] : ["/my-top-prospects", "/follow-ups", "/reports"]);
      expect(screen.queryByRole("link", { name: /Integration Health/ })).not.toBeInTheDocument();
      rerender(<WorkspaceStartPaths items={items} queueCounts={{ workQueue: 6, constituencyImports: 8 }} openDiscussionItems={2} />);
      if (isReviewer) {
        expect(screen.getByLabelText("6 items in the work queue")).toBeInTheDocument();
        expect(links[1].querySelector("[aria-label]")).toBeNull();
      } else expect(screen.getByLabelText("2 open team discussion items")).toHaveTextContent("2");
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally { fetchSpy.mockRestore(); }
  });

  it.each([0, -1, NaN, 1.5, "3"])("does not show a misleading discussion badge for %s", openDiscussionItems => {
    render(<WorkspaceStartPaths items={getNavigationItems({ isReviewer: false })} openDiscussionItems={openDiscussionItems} />);
    expect(screen.queryByLabelText(/open team discussion/)).not.toBeInTheDocument();
  });

  it("omits the section when no primary destination is available", () => {
    const { container } = render(<WorkspaceStartPaths items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
