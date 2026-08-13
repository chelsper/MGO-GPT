import { describe, expect, it } from "vitest";
import {
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
});
