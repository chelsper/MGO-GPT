import { describe, expect, it } from "vitest";
import { newFundraisingTracker, moneyCents, trackerFingerprint, presentFundraisingTracker } from "./fundraisingTracker";
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
