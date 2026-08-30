import { describe, expect, it } from "vitest";
import {
  canManageWorkspaceRole,
  canUseExecutiveViewRole,
  canUseMgoWorkspaceRole,
  canViewWorkspaceAsRole,
  getWorkspaceRoleLabel,
  getWorkspaceRoleLabels,
  isMgoRole,
  normalizeWorkspaceRole,
  normalizeWorkspaceRoles,
} from "./workspaceRoles";

describe("workspace roles", () => {
  it("normalizes legacy workspace roles to the supported role set", () => {
    expect(normalizeWorkspaceRole("reviewer")).toBe("advancement_services");
    expect(normalizeWorkspaceRole("advancement_admin")).toBe("advancement_services");
    expect(normalizeWorkspaceRole("executive_admin")).toBe("executive");
  });

  it("limits cross-MGO viewing to Executives and Admins", () => {
    expect(canUseExecutiveViewRole("executive")).toBe(true);
    expect(canUseExecutiveViewRole("admin")).toBe(true);
    expect(canUseExecutiveViewRole("mgo")).toBe(false);
    expect(canUseExecutiveViewRole("advancement_services")).toBe(false);
    expect(canUseExecutiveViewRole("executive,mgo")).toBe(true);
  });

  it("allows Admins, but not Executives, to view Executive workspaces", () => {
    expect(canViewWorkspaceAsRole("admin", "mgo")).toBe(true);
    expect(canViewWorkspaceAsRole("executive", "mgo")).toBe(true);
    expect(canViewWorkspaceAsRole("admin", "executive")).toBe(true);
    expect(canViewWorkspaceAsRole("executive", "executive")).toBe(false);
    expect(canViewWorkspaceAsRole("mgo", "mgo")).toBe(false);
  });

  it("keeps MGO workspace capabilities separate from report administration", () => {
    expect(canUseMgoWorkspaceRole("mgo")).toBe(true);
    expect(canUseMgoWorkspaceRole("executive")).toBe(true);
    expect(canUseMgoWorkspaceRole("advancement_services")).toBe(false);
    expect(isMgoRole("executive")).toBe(false);
    expect(canManageWorkspaceRole("advancement_services")).toBe(true);
    expect(canUseMgoWorkspaceRole("executive,mgo")).toBe(true);
    expect(isMgoRole("executive,mgo")).toBe(true);
  });

  it("supports multiple workspace roles in one stored value", () => {
    expect(normalizeWorkspaceRoles("executive, mgo, executive")).toEqual([
      "executive",
      "mgo",
    ]);
    expect(normalizeWorkspaceRole("executive, mgo")).toBe("executive");
    expect(getWorkspaceRoleLabel("executive,mgo")).toBe("Executive, MGO");
  });

  it("uses institution terminology only for displayed role labels", () => {
    const terminology = {
      mgo: "Gift Officer",
      advancementServices: "Data Services",
      executive: "Leadership",
    };

    expect(getWorkspaceRoleLabels(terminology)).toMatchObject({
      admin: "Admin",
      advancement_services: "Data Services",
      executive: "Leadership",
      mgo: "Gift Officer",
    });
    expect(getWorkspaceRoleLabel("executive,mgo", terminology)).toBe(
      "Leadership, Gift Officer",
    );
    expect(canUseMgoWorkspaceRole("executive,mgo")).toBe(true);
    expect(canManageWorkspaceRole("advancement_services")).toBe(true);
  });
});
