import { describe, expect, it } from "vitest";
import {
  canUserViewCustomFieldReport,
  canUserViewReport,
  normalizeReportVisibility,
  parseReportSpecificUserIds,
} from "./reportAccess";

describe("report access", () => {
  it("uses all users when a saved visibility value is missing or invalid", () => {
    expect(normalizeReportVisibility()).toBe("all_users");
    expect(normalizeReportVisibility("unexpected")).toBe("all_users");
  });

  it("limits executive reports to executives while preserving admin access", () => {
    const executiveReport = { visibility: "executive", specificUserIds: [] };

    expect(
      canUserViewReport({ ...executiveReport, user: { id: 1, role: "admin" } }),
    ).toBe(true);
    expect(
      canUserViewReport({ ...executiveReport, user: { id: 2, role: "executive" } }),
    ).toBe(true);
    expect(
      canUserViewReport({ ...executiveReport, user: { id: 3, role: "mgo" } }),
    ).toBe(false);
    expect(
      canUserViewReport({
        ...executiveReport,
        user: { id: 4, role: "advancement_services" },
      }),
    ).toBe(false);
  });

  it("uses only configured active-user IDs for specific-user reports", () => {
    const specificUsersReport = {
      visibility: "specific_users",
      specificUserIds: [3, 7],
    };

    expect(
      canUserViewReport({ ...specificUsersReport, user: { id: 3, role: "mgo" } }),
    ).toBe(true);
    expect(
      canUserViewReport({ ...specificUsersReport, user: { id: 8, role: "mgo" } }),
    ).toBe(false);
    expect(
      canUserViewReport({ ...specificUsersReport, user: { id: 1, role: "admin" } }),
    ).toBe(true);
    expect(parseReportSpecificUserIds("[3, \"7\", \"invalid\"]")).toEqual([3, 7]);
  });

  it("does not give administrators an automatic Custom Field Report bypass", () => {
    const report = { active: true, specificUserIds: [7, 12] };

    expect(
      canUserViewCustomFieldReport({ ...report, user: { id: 1, role: "admin" } }),
    ).toBe(false);
    expect(
      canUserViewCustomFieldReport({ ...report, user: { id: 7, role: "mgo" } }),
    ).toBe(true);
    expect(
      canUserViewCustomFieldReport({ ...report, user: { id: 12, role: "admin" } }),
    ).toBe(true);
    expect(
      canUserViewCustomFieldReport({ ...report, active: false, user: { id: 7, role: "mgo" } }),
    ).toBe(false);
  });

  it("respects an explicit-user policy without changing the standard report policy", () => {
    const explicitUserPolicy = {
      allowedVisibilities: ["specific_users"],
      adminRoleBypass: false,
    };

    expect(
      canUserViewReport({
        visibility: "specific_users",
        specificUserIds: [7],
        accessPolicy: explicitUserPolicy,
        user: { id: 1, role: "admin" },
      }),
    ).toBe(false);
    expect(
      canUserViewReport({
        visibility: "specific_users",
        specificUserIds: [7],
        accessPolicy: explicitUserPolicy,
        user: { id: 7, role: "mgo" },
      }),
    ).toBe(true);
    expect(
      canUserViewReport({
        visibility: "all_users",
        specificUserIds: [],
        accessPolicy: explicitUserPolicy,
        user: { id: 7, role: "mgo" },
      }),
    ).toBe(false);
  });
});
