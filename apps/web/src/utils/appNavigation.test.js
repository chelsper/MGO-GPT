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
      "Daily Work",
      "Reports & Exports",
      "Requests & Imports",
      "Tools & Guidance",
      "Admin & Workspace",
    ]);
  });

  it.each([false, true])("includes every reviewer destination exactly once, including reporting tools (manage: %s)", (canManageWorkspace) => {
    const items = getNavigationItems({ isReviewer: true, canManageWorkspace });
    const groups = groupNavigationItems(items);
    expect(groups.flatMap((group) => group.items)).toHaveLength(items.length);
    expect(new Set(items.map((item) => item.href)).size).toBe(items.length);
    const reports = groups.find((group) => group.section === "Reports & Exports");
    expect(reports.items.map((item) => item.href)).toEqual([
      "/pledge-payments", "/prospect-exports", ...(canManageWorkspace ? ["/report-configurations"] : []),
    ]);
    expect(items.every((item) => Boolean(item.description))).toBe(true);
  });

  it("keeps the MGO menu unchanged and does not surface reviewer-only tools there", () => {
    const items = getNavigationItems({ isReviewer: false, canManageWorkspace: true });
    expect(groupNavigationItems(items).map((group) => group.section)).toEqual(["My Work", "Team & Support", "Requests & Review"]);
    expect(items.some((item) => ["/pledge-payments", "/prospect-exports"].includes(item.href))).toBe(false);
  });

  it("builds explicit report breadcrumbs and highlights report routes", () => {
    expect(getBreadcrumbs("/reports/executive-team-standings")).toEqual([
      { label: "Home", href: "/" },
      { label: "My Reports", href: "/reports" },
      { label: "Team Standings" },
    ]);
    expect(getBreadcrumbs("/reports/alumni-family-engagement")).toEqual([
      { label: "Home", href: "/" },
      { label: "My Reports", href: "/reports" },
      { label: "Alumni & Family Engagement" },
    ]);
    expect(isNavigationItemActive("/reports/alumni-family-engagement", "/reports")).toBe(true);
    expect(isNavigationItemActive("/report-configurations", "/reports")).toBe(false);
  });
});
