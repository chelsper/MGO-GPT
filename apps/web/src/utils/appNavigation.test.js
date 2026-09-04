import { describe, expect, it } from "vitest";
import {
  getBreadcrumbs,
  getNavigationItems,
  groupNavigationItems,
  isNavigationItemActive,
} from "./appNavigation";

describe("app navigation", () => {
  it("adds administration destinations only to managed reviewer workspaces", () => {
    const reviewerItems = getNavigationItems({ isReviewer: true, canManageWorkspace: false });
    const adminItems = getNavigationItems({ isReviewer: true, canManageWorkspace: true });

    expect(reviewerItems.some((item) => item.href === "/report-configurations")).toBe(false);
    expect(adminItems.some((item) => item.href === "/report-configurations")).toBe(true);
    expect(getNavigationItems({ isReviewer: false, canManageWorkspace: true })[0].href)
      .toBe("/my-top-prospects");
  });

  it("groups links in workflow order", () => {
    const groups = groupNavigationItems(
      getNavigationItems({ isReviewer: true, canManageWorkspace: true }),
    );

    expect(groups.map((group) => group.section)).toEqual([
      "My Work",
      "Team & Support",
      "Requests & Review",
      "Admin & Workspace",
    ]);
  });

  it("builds explicit report breadcrumbs and highlights report routes", () => {
    expect(getBreadcrumbs("/reports/alumni-family-engagement")).toEqual([
      { label: "Home", href: "/" },
      { label: "My Reports", href: "/reports" },
      { label: "Alumni & Family Engagement" },
    ]);
    expect(isNavigationItemActive("/reports/alumni-family-engagement", "/reports")).toBe(true);
    expect(isNavigationItemActive("/report-configurations", "/reports")).toBe(false);
  });
});
