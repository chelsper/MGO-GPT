import { expect, it } from "vitest";
import { DEFAULT_DASHBOARD_ASSISTANT, normalizeDashboardAssistant, validateDashboardAssistant } from "./dashboardAssistantSettings";
import { DEFAULT_ORGANIZATION_SETTINGS, normalizeOrganizationSettings, validateOrganizationSettings } from "./organizationSettings";
it("defaults to Nellie and accepts an organization's name and built-in avatar", () => {
  expect(normalizeDashboardAssistant()).toEqual(DEFAULT_DASHBOARD_ASSISTANT);
  expect(normalizeOrganizationSettings({ dashboard_assistant: { enabled: false, name: "Guide", avatar: "compass" } }).dashboardAssistant).toEqual({ ...DEFAULT_DASHBOARD_ASSISTANT, enabled: false, name: "Guide", avatar: "compass" });
  expect(validateDashboardAssistant({ enabled: false, name: "Guide", avatar: "compass" })).toBeNull();
});
it("keeps legacy behavior and accepts explicit per-organization preferences", () => {
  const value = { ...DEFAULT_DASHBOARD_ASSISTANT, followUpDays: 14, opportunityDays: 60, recentGiftDays: 90, giftMinimum: 500, majorGiftMinimum: 5000, tone: "professional", thankYouMessage: "We appreciate your support.\nPlease stay in touch." };
  expect(validateDashboardAssistant(value)).toBeNull();
  expect(normalizeDashboardAssistant(value)).toEqual(value);
});
it.each([{ followUpDays: 0 }, { opportunityDays: 91 }, { recentGiftDays: "30" }, { recentGiftDays: 1.5 }, { giftMinimum: -1 }, { majorGiftMinimum: 10000001 }, { tone: "anything" }, { thankYouMessage: "x".repeat(1201) }, { thankYouMessage: "unsafe\u202e" }, { giftMinimum: 10000, majorGiftMinimum: 10000 }])("rejects invalid new preferences %j", patch => {
  expect(validateDashboardAssistant({ ...DEFAULT_DASHBOARD_ASSISTANT, ...patch })).toBeTruthy();
});
it("falls back safely when persisted optional fields are malformed", () => {
  expect(normalizeDashboardAssistant({ followUpDays: -1, tone: "unknown", thankYouMessage: {} })).toEqual(DEFAULT_DASHBOARD_ASSISTANT);
  expect(normalizeDashboardAssistant({ giftMinimum: 20000, majorGiftMinimum: 5000 }).majorGiftMinimum).toBeGreaterThan(20000);
});
it.each([null, {}, { enabled: "yes", name: "Guide", avatar: "dolphin" }, { enabled: true, name: " ", avatar: "dolphin" }, { enabled: true, name: "x".repeat(41), avatar: "dolphin" }, { enabled: true, name: "Guide\n", avatar: "dolphin" }, { enabled: true, name: "Guide", avatar: "https://external/avatar.svg" }, { enabled: true, name: "Guide", avatar: "compass", userId: 7 }])("rejects malformed helper configuration %j", value => {
  expect(validateOrganizationSettings({ ...DEFAULT_ORGANIZATION_SETTINGS, dashboardAssistant: value })).toMatch(/helper name/);
});
