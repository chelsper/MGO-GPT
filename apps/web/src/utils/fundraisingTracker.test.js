import { describe, expect, it } from "vitest";
import { newFundraisingTracker, moneyCents, trackerFingerprint, presentFundraisingTracker, TRACKER_DONOR_VERSION } from "./fundraisingTracker";
import { validateDashboardConfiguration, normalizeDashboardConfiguration } from "@/app/api/utils/dashboardConfiguration";
import { buildReportLayoutTemplate, parseReportLayoutTemplate } from "./reportLayoutTemplates";

const panel = () => ({ ...newFundraisingTracker("campaign", true), funds: [{ id: "123", name: "A-Train Campaign" }] });
const config = (p) => ({ version: 1, panels: [p] });

describe("fundraising campaign configuration", () => {
  it("seeds the requested goal, 75% milestone and all-time side-by-side display", () => {
    expect(newFundraisingTracker("campaign", true)).toMatchObject({ title: "The A-Train Campaign", goal: 250000, milestone: 187500, display: "both", period: "all_time", funds: [] });
    expect(validateDashboardConfiguration(config(panel()))).toBe("");
    expect(normalizeDashboardConfiguration(config(panel())).panels[0]).toEqual(panel());
  });
  it.each([
    { goal: 0 }, { goal: Infinity }, { goal: 12.345 }, { milestone: 250000 }, { milestone: -1 },
    { display: "sum" }, { funds: [{ id: "../123", name: "Invalid" }] },
    { funds: [{ id: "123", name: "A" }, { id: "123", name: "B" }] },
    { funds: Array.from({ length: 26 }, (_, i) => ({ id: String(i + 1), name: "Fund" })) },
    { period: "date_range", startDate: "2026-02-30", endDate: "2026-12-31" },
    { period: "date_range", startDate: "2027-01-01", endDate: "2026-12-31" },
    { values: [{ staticValue: 90000 }] },
  ])("rejects invalid settings %j", (change) => expect(validateDashboardConfiguration(config({ ...panel(), ...change }))).not.toBe(""));
  it("limits the number of trackers and validates date ranges", () => {
    expect(validateDashboardConfiguration({ version: 1, panels: Array.from({ length: 5 }, (_, i) => ({ ...panel(), key: `c${i}` })) })).toMatch(/at most 4/);
    expect(validateDashboardConfiguration(config({ ...panel(), period: "date_range", startDate: "2026-01-01", endDate: "2026-12-31" }))).toBe("");
    expect(moneyCents(0.29)).toBe(29);
    expect(moneyCents("12")).toBeNull();
  });
  it("invalidates source edits but not goal, title, milestone or display edits", () => {
    const p = panel();
    const saved = { fingerprint: trackerFingerprint(p), committedCents: 100, receivedCents: 0, refreshedAt: "2026-09-24T12:00:00Z" };
    expect(presentFundraisingTracker({ ...p, goal: 300000, milestone: 200000, display: "received", title: "Renamed" }, saved).receivedCents).toBe(0);
    expect(presentFundraisingTracker({ ...p, funds: [{ id: "999", name: "Other" }] }, saved).committedCents).toBeNull();
    expect(presentFundraisingTracker({ ...p, period: "date_range", startDate: "2026-01-01", endDate: "2026-12-31" }, saved).committedCents).toBeNull();
  });
  it("transfers only layout, never environment-specific funds or financial settings", () => {
    const template = buildReportLayoutTemplate({ title: "Campaign", description: "", dataConfiguration: config(panel()) });
    expect(template.panels[0]).toEqual({ key: "campaign", title: "The A-Train Campaign", layout: "fundraising_tracker", width: "full" });
    const imported = parseReportLayoutTemplate(JSON.stringify(template));
    expect(imported).toMatchObject({ active: false, specificUserIds: [], dataConfiguration: { panels: [{ funds: [], goal: 100000, milestone: null, period: "all_time" }] } });
    template.panels[0].funds = [{ id: "123", name: "Source fund" }];
    expect(() => parseReportLayoutTemplate(JSON.stringify(template))).toThrow(/unsupported panel fields/);
  });
});

describe("public campaign donor data", () => {
  const saved = () => ({ fingerprint: trackerFingerprint(panel()), committedCents: 100000, receivedCents: 25000,
    pledgedCents: 100000, refreshedAt: "2026-10-13T12:00:00Z", donorVersion: TRACKER_DONOR_VERSION,
    donors: [{ key: "constituent:42", kind: "constituent", constituentId: "42", name: "Example Donor", pledgedCents: 100000, receivedCents: 25000, committedCents: 100000 }] });

  it("only publishes allowlisted display values and is safe to present again on the client", () => {
    const cache = saved();
    cache.pending = { ownerId: 1, donors: { private: true }, nameIds: ["99"], next: "private continuation" };
    cache.donors[0].email = "private@example.test";
    const result = presentFundraisingTracker(panel(), cache);
    expect(result.donors[0]).toEqual(saved().donors[0]);
    expect(result.pending).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/private|ownerId|nameIds|email/);
    expect(presentFundraisingTracker(panel(), result)).toEqual(result);
  });

  it("retains legacy campaign totals without inventing a zero pledge amount or donor list", () => {
    const cache = saved();
    delete cache.donorVersion;
    expect(presentFundraisingTracker(panel(), cache)).toMatchObject({ committedCents: 100000, receivedCents: 25000, pledgedCents: null, donors: null });
    expect(presentFundraisingTracker({ ...panel(), funds: [{ id: "456", name: "Other" }] }, saved())).toMatchObject({ committedCents: null, donors: null });
  });

  it.each(["pledgedCents", "receivedCents", "committedCents"])("rejects a donor table that does not reconcile %s", (field) => {
    const cache = saved();
    cache.donors[0][field] += 1;
    expect(presentFundraisingTracker(panel(), cache)).toMatchObject({ donors: null, pledgedCents: null, committedCents: 100000 });
  });

  it("rejects duplicated IDs and invalid amounts instead of understating or overstating donor giving", () => {
    const cache = saved();
    cache.donors.push({ ...cache.donors[0], pledgedCents: 0, receivedCents: 0, committedCents: 0 });
    expect(presentFundraisingTracker(panel(), cache).donors).toBeNull();
    cache.donors = [{ ...saved().donors[0], receivedCents: "25000" }];
    expect(presentFundraisingTracker(panel(), cache).donors).toBeNull();
  });

  it("never exposes an identity on anonymous or unresolved rows", () => {
    for (const kind of ["anonymous", "unavailable"]) {
      const cache = saved();
      cache.donors[0].kind = kind;
      const result = presentFundraisingTracker(panel(), cache);
      expect(result.donors[0]).toMatchObject({ key: kind, constituentId: null });
      expect(JSON.stringify(result)).not.toContain("Example Donor");
      expect(JSON.stringify(result)).not.toContain("constituent:42");
    }
  });
});
