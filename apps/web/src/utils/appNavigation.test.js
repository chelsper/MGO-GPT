import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { portfolioGivingTitle } from "./portfolioGivingTitle";
import {
  getBreadcrumbs,
  getNavigationItems,
  getPrimaryNavigationItems,
  groupNavigationItems,
  isNavigationItemActive,
} from "./appNavigation";

describe("app navigation", () => {
  it.each([
    [false, false, false], [false, true, true], [true, false, false], [true, true, false], [true, true, true],
  ])("omits deferred Family Import while preserving ready import tools (%s, %s, %s)", (isReviewer, canManageWorkspace, isAdmin) => {
    const items = getNavigationItems({ isReviewer, canManageWorkspace, isAdmin });
    expect(items.some(item => item.href === "/family-import")).toBe(false);
    for (const href of ["/constituency-import", "/import-history"]) {
      expect(items.filter(item => item.href === href)).toHaveLength(isReviewer ? 1 : 0);
    }
    expect(groupNavigationItems(items).every(group => group.items.length > 0)).toBe(true);
  });

  it("keeps the direct Family Import route and its Home breadcrumb intact", () => {
    expect(existsSync(resolve("src/app/family-import/page.jsx"))).toBe(true);
    expect(getBreadcrumbs("/family-import")).toEqual([{ label: "Home", href: "/" }, { label: "Family Import" }]);
  });

  it.each([false, true])("points all visible workflow destinations to existing pages (reviewer: %s)", isReviewer => {
    for (const item of getNavigationItems({ isReviewer, canManageWorkspace: true, isAdmin: true })) {
      expect(existsSync(resolve("src/app", `.${item.href}`, "page.jsx")), item.href).toBe(true);
    }
  });

  it.each([false, true])("changes only reviewer descriptions, without mutating shared navigation or pluralizing labels (manage: %s)", canManageWorkspace => {
    const options = { isReviewer: true, canManageWorkspace, isAdmin: canManageWorkspace };
    const defaults = getNavigationItems(options);
    const configured = getNavigationItems({ ...options, roleLabels: { mgo: "Gift Officer" } });
    expect(configured.map(({ description, ...item }) => item)).toEqual(defaults.map(({ description, ...item }) => item));
    expect(configured.find(item => item.href === "/prospect-exports").description).toContain("Gift Officer workspaces");
    expect(defaults.find(item => item.href === "/prospect-exports").description).toContain("MGO workspaces");
    expect(getNavigationItems({ ...options, roleLabels: { mgo: " " } })).toEqual(defaults);
    expect(getNavigationItems(options)).toEqual(defaults);
    expect(getNavigationItems({ ...options, isReviewer: false, roleLabels: { mgo: "Admin" } }))
      .toEqual(getNavigationItems({ ...options, isReviewer: false }));
  });
  it.each([
    ["/report-configurations", "Report Access & Configurations"],
    ["/organization-configurations", "Organization Settings"],
    ["/access-management", "Security & Access"],
    ["/blackbaud-mapping", "Field Settings"],
  ])("uses Setup Hub as the parent of %s for workspace managers only", (path, label) => {
    expect(getBreadcrumbs(path, { canManageWorkspace: true })).toEqual([
      { label: "Home", href: "/" }, { label: "Setup Hub", href: "/setup" }, { label },
    ]);
    expect(getBreadcrumbs(path, { canManageWorkspace: false })).toEqual([
      { label: "Home", href: "/" }, { label },
    ]);
  });

  it("does not change report viewing, personal account, or Setup Hub's own parent", () => {
    for (const path of ["/setup", "/settings", "/reports", "/reports/executive-team-standings", "/my-top-prospects"]) {
      expect(getBreadcrumbs(path, { canManageWorkspace: true })).toEqual(getBreadcrumbs(path));
    }
  });

  it.each([false, true])("shows Setup Hub only to workspace managers in either view (reviewer: %s)", isReviewer => {
    expect(getNavigationItems({ isReviewer, canManageWorkspace: false }).some(item => item.href === "/setup")).toBe(false);
    expect(getNavigationItems({ isReviewer, canManageWorkspace: true }).filter(item => item.href === "/setup")).toHaveLength(1);
    expect(getBreadcrumbs("/setup").at(-1).label).toBe("Setup Hub");
  });
  it.each([false, true])("shows Integration Health only to actual Admins in either view (reviewer: %s)", isReviewer => {
    expect(getNavigationItems({ isReviewer, canManageWorkspace: true, isAdmin: false }).some(item => item.href === "/integration-health")).toBe(false);
    const items = getNavigationItems({ isReviewer, canManageWorkspace: true, isAdmin: true });
    expect(items.filter(item => item.href === "/integration-health")).toHaveLength(1);
    expect(getBreadcrumbs("/integration-health").at(-1).label).toBe("Integration Health");
  });
  it.each([false, true])("offers one shared follow-up workspace and preserves old discussion navigation (reviewer: %s)", (isReviewer) => {
    const items = getNavigationItems({ isReviewer, canManageWorkspace: true });
    expect(items.filter(item => item.href === "/follow-ups")).toHaveLength(1);
    expect(items.find(item => item.href === "/follow-ups").label).toBe("Follow-ups & Discussion");
    expect(items.some(item => item.href === "/team-discussion")).toBe(false);
    expect(isNavigationItemActive("/team-discussion", "/follow-ups")).toBe(true);
    expect(getBreadcrumbs("/follow-ups").at(-1).label).toBe("Follow-ups & Discussion");
    expect(getBreadcrumbs("/team-discussion").at(-1).label).toBe("Follow-ups & Discussion");
  });
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
      "Requests",
      "Imports",
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

  it("preserves the MGO sections and does not surface reviewer-only tools there", () => {
    const items = getNavigationItems({ isReviewer: false, canManageWorkspace: false });
    expect(groupNavigationItems(items).map((group) => group.section)).toEqual(["My Work", "Team & Support", "Requests & Review"]);
    expect(items.some((item) => ["/pledge-payments", "/prospect-exports", "/import-history"].includes(item.href))).toBe(false);
  });

  it.each([
    [false, false, false], [false, true, true], [true, false, false], [true, true, false], [true, true, true],
  ])("promotes only the active workspace's paths with every allowed link once (%s, %s, %s)", (isReviewer, canManageWorkspace, isAdmin) => {
    const items = getNavigationItems({ isReviewer, canManageWorkspace, isAdmin });
    const original = [...items];
    const primary = getPrimaryNavigationItems(items);
    expect(primary.map(item => item.href)).toEqual(isReviewer
      ? ["/submissions", "/constituency-import", "/prospect-exports"]
      : ["/my-top-prospects", "/follow-ups", "/reports"]);
    expect(primary.every(item => Boolean(item.description))).toBe(true);
    const groups = groupNavigationItems(items, { promotePrimary: true });
    expect(groups[0]).toEqual({ section: "Start here", items: primary });
    expect(groups.flatMap(group => group.items).map(item => item.href).sort())
      .toEqual(items.map(item => item.href).sort());
    expect(items).toEqual(original);
  });

  it("does not create an empty primary group or invent unavailable shortcuts", () => {
    const items = getNavigationItems({ isReviewer: false }).filter(item => !item.primaryOrder);
    expect(getPrimaryNavigationItems(items)).toEqual([]);
    expect(groupNavigationItems(items, { promotePrimary: true })).toEqual(groupNavigationItems(items));
  });

  it("builds explicit report breadcrumbs and highlights report routes", () => {
    expect(getBreadcrumbs("/reports/executive-team-standings")).toEqual([
      { label: "Home", href: "/" },
      { label: portfolioGivingTitle(), href: "/reports" },
      { label: "Team Standings" },
    ]);
    expect(getBreadcrumbs("/reports/alumni-family-engagement")).toEqual([
      { label: "Home", href: "/" },
      { label: portfolioGivingTitle(), href: "/reports" },
      { label: "Alumni & Family Engagement" },
    ]);
    expect(isNavigationItemActive("/reports/alumni-family-engagement", "/reports")).toBe(true);
    expect(isNavigationItemActive("/report-configurations", "/reports")).toBe(false);
  });
});
