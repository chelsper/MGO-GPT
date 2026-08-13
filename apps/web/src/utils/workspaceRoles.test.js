import { describe, expect, it } from "vitest";
import {
  canManageWorkspaceRole,
  canUseExecutiveViewRole,
  canUseMgoWorkspaceRole,
  isMgoRole,
  normalizeWorkspaceRole,
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
  });

  it("keeps MGO workspace capabilities separate from report administration", () => {
    expect(canUseMgoWorkspaceRole("mgo")).toBe(true);
    expect(canUseMgoWorkspaceRole("executive")).toBe(true);
    expect(canUseMgoWorkspaceRole("advancement_services")).toBe(false);
    expect(isMgoRole("executive")).toBe(false);
    expect(canManageWorkspaceRole("advancement_services")).toBe(true);
  });
});
