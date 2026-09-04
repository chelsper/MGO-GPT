import { beforeEach, describe, expect, it, vi } from "vitest";
const { sqlMock } = vi.hoisted(() => ({ sqlMock: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: sqlMock }));
import {
  canUserViewDashboard,
  mergeDashboardConfigurationPatch,
  saveDashboardConfiguration,
  serializeDashboardConfiguration,
} from "./dashboardConfigurations";

const record = {
  report_key: "dashboard-demo",
  title: "Demo",
  description: "Details",
  active: false,
  specific_user_ids: [],
  data_configuration: { version: 1, panels: [] },
  revision: "revision",
};
const manager = { id: 1, active: true, role: "admin" };

describe("dashboard configuration access and patches", () => {
  beforeEach(() => vi.clearAllMocks());
  it("never grants managers a public access bypass", () => {
    expect(
      canUserViewDashboard({
        user: manager,
        active: false,
        specificUserIds: [1],
      }),
    ).toBe(false);
    expect(
      canUserViewDashboard({
        user: manager,
        active: true,
        specificUserIds: [],
      }),
    ).toBe(false);
    expect(
      canUserViewDashboard({
        user: manager,
        active: true,
        specificUserIds: [1],
      }),
    ).toBe(true);
    expect(
      canUserViewDashboard({
        user: { ...manager, active: false },
        active: true,
        specificUserIds: [1],
      }),
    ).toBe(false);
    expect(serializeDashboardConfiguration(record, manager)).toMatchObject({
      canView: false,
      canPreview: true,
      active: false,
    });
  });
  it("preserves omitted fields for configure-only and access-only updates", () => {
    const current = serializeDashboardConfiguration(
      { ...record, active: true, specific_user_ids: [1] },
      manager,
    );
    const configured = mergeDashboardConfigurationPatch(current, {
      title: "New",
    });
    expect(configured).toMatchObject({
      title: "New",
      active: true,
      specificUserIds: [1],
      dataConfiguration: record.data_configuration,
    });
    const access = mergeDashboardConfigurationPatch(current, {
      active: false,
      specificUserIds: [],
    });
    expect(access).toMatchObject({
      title: "Demo",
      description: "Details",
      dataConfiguration: record.data_configuration,
    });
  });
  it("rejects public visibility, nonboolean activation, missing allowlist and malformed IDs", () => {
    const current = serializeDashboardConfiguration(record, manager);
    expect(() =>
      mergeDashboardConfigurationPatch(current, { visibility: "all_users" }),
    ).toThrow(/specific-user/);
    expect(() =>
      mergeDashboardConfigurationPatch(current, { active: "false" }),
    ).toThrow(/boolean/);
    expect(() =>
      mergeDashboardConfigurationPatch(current, { active: true }),
    ).toThrow(/at least one/);
    expect(() =>
      mergeDashboardConfigurationPatch(current, { specificUserIds: [true] }),
    ).toThrow(/positive user IDs/);
  });
  it("creates private disabled drafts and handles key conflicts", async () => {
    sqlMock.mockResolvedValueOnce([record]).mockResolvedValueOnce([]);
    const result = await saveDashboardConfiguration({
      body: {
        title: "Demo",
        description: "Details",
        dataConfiguration: record.data_configuration,
      },
      user: manager,
      create: true,
    });
    expect(result).toMatchObject({
      active: false,
      specificUserIds: [],
      canView: false,
    });
    const insert = sqlMock.mock.calls[0];
    expect(insert[1]).toMatch(/^dashboard-/);
    expect(insert).toContain(false);
    await expect(
      saveDashboardConfiguration({
        body: { title: "Demo" },
        user: manager,
        create: true,
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("rejects activation during creation before persistence", async () => {
    await expect(
      saveDashboardConfiguration({
        body: { title: "Demo", active: true, specificUserIds: [1] },
        user: manager,
        create: true,
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(sqlMock).not.toHaveBeenCalled();
  });
  it("validates every selected user is active before persistence", async () => {
    sqlMock.mockResolvedValueOnce([record]).mockResolvedValueOnce([{ id: 1 }]);
    await expect(
      saveDashboardConfiguration({
        body: {
          reportKey: record.report_key,
          active: true,
          specificUserIds: [1, 2],
        },
        user: manager,
      }),
    ).rejects.toThrow(/inactive/);
    expect(sqlMock).toHaveBeenCalledTimes(2);
  });
  it("uses field-preserving SQL and a configuration revision guard", async () => {
    sqlMock
      .mockResolvedValueOnce([record])
      .mockResolvedValueOnce([{ ...record, title: "New" }]);
    await saveDashboardConfiguration({
      body: { reportKey: record.report_key, title: "New" },
      user: manager,
    });
    const update = sqlMock.mock.calls[1];
    expect(update[0].join(" ")).toMatch(/active = CASE WHEN/);
    expect(update[0].join(" ")).toMatch(/updated_at::text =/);
    expect(update).toContain("revision");
  });
  it("keeps static source provenance through presentation and access edits", async () => {
    const manual = {
      ...record,
      value_provenance: {
        v: {
          updatedAt: "2026-09-01T12:00:00.000Z",
          updatedBy: { id: 1, name: "Original" },
        },
      },
      data_configuration: {
        version: 1,
        panels: [
          {
            key: "p",
            title: "Panel",
            layout: "metric",
            width: "half",
            rows: [{ key: "r", label: "R" }],
            columns: [{ key: "c", label: "C" }],
            values: [
              {
                key: "v",
                rowKey: "r",
                columnKey: "c",
                source: "static",
                staticValue: 0,
              },
            ],
          },
        ],
      },
    };
    const data = structuredClone(manual.data_configuration);
    data.panels[0].title = "Retitled";
    sqlMock.mockResolvedValueOnce([manual]).mockResolvedValueOnce([manual]);
    await saveDashboardConfiguration({
      body: { reportKey: manual.report_key, dataConfiguration: data },
      user: manager,
    });
    expect(sqlMock.mock.calls[1]).toContain(
      JSON.stringify(manual.value_provenance),
    );
    expect(
      serializeDashboardConfiguration(manual, manager).staticValueProvenance.v
        .updatedBy.name,
    ).toBe("Original");
  });
});
