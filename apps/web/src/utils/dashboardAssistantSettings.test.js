import { expect, it } from "vitest";
import { DEFAULT_DASHBOARD_ASSISTANT, normalizeDashboardAssistant, validateDashboardAssistant } from "./dashboardAssistantSettings";
import { DEFAULT_ORGANIZATION_SETTINGS, normalizeOrganizationSettings, validateOrganizationSettings } from "./organizationSettings";
it("defaults to Nellie and accepts an organization's name and built-in avatar", () => {
  expect(normalizeDashboardAssistant()).toEqual(DEFAULT_DASHBOARD_ASSISTANT);
  expect(normalizeOrganizationSettings({ dashboard_assistant: { enabled: false, name: "Guide", avatar: "compass" } }).dashboardAssistant).toEqual({ enabled: false, name: "Guide", avatar: "compass" });
  expect(validateDashboardAssistant({ enabled: false, name: "Guide", avatar: "compass" })).toBeNull();
});
it.each([null, {}, { enabled: "yes", name: "Guide", avatar: "dolphin" }, { enabled: true, name: " ", avatar: "dolphin" }, { enabled: true, name: "x".repeat(41), avatar: "dolphin" }, { enabled: true, name: "Guide\n", avatar: "dolphin" }, { enabled: true, name: "Guide", avatar: "https://external/avatar.svg" }, { enabled: true, name: "Guide", avatar: "compass", userId: 7 }])("rejects malformed helper configuration %j", value => {
  expect(validateOrganizationSettings({ ...DEFAULT_ORGANIZATION_SETTINGS, dashboardAssistant: value })).toMatch(/helper name/);
});
