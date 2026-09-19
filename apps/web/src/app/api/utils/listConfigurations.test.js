import { beforeEach, expect, it, vi } from "vitest";
vi.mock("./sql", () => ({ default: vi.fn() }));
import sql from "./sql";
import {
  listConfigurations,
  saveListConfiguration,
  serializeList,
} from "./listConfigurations";
const source = {
  version: 1,
  source: "custom_field",
  fieldCategory: "Interests",
  fieldDescription: "",
};
const record = {
  report_key: "list-demo",
  title: "Demo",
  description: "",
  active: true,
  specific_user_ids: [1],
  data_configuration: source,
  revision: "v1",
};
const user = { id: 1, active: true, role: "admin" };
beforeEach(() => {
  vi.clearAllMocks();
  sql.mockResolvedValue([record]);
});
it("requires active explicit viewers even for admins; separates membership permission", () => {
  expect(serializeList(record, user)).toMatchObject({
    canView: true,
    canManageMembers: true,
  });
  expect(serializeList(record, { ...user, id: 2 })).toMatchObject({
    canView: false,
    canManageMembers: false,
  });
  expect(serializeList(record, { ...user, active: false }).canView).toBe(false);
  expect(serializeList(record, { ...user, role: "mgo" })).toMatchObject({
    canView: true,
    canManageMembers: false,
  });
  expect(serializeList({ ...record, active: false }, user).canView).toBe(false);
});
it("preserves legacy access but prevents membership writes on query-only lists", () => {
  const queryOnly = { ...record, data_configuration: { ...source, source: "saved_query", queryId: "123", fieldCategory: "" } };
  expect(serializeList(queryOnly, user)).toMatchObject({ canView: true, canManageMembers: false });
  const legacy = { ...record, report_key: "future-made-phase-ii", visibility: "specific_users", specific_user_ids: [2] };
  expect(serializeList(legacy, user).canView).toBe(true);
  expect(serializeList(legacy, { ...user, role: "mgo" }).canView).toBe(false);
});
it("keeps unshared lists out of normal users' configuration responses", async () => {
  expect(await listConfigurations({ ...user, role: "mgo", id: 2 })).toEqual([]);
  expect(await listConfigurations({ ...user, id: 2 })).toHaveLength(1);
});
it("creates disabled drafts without NXT access or new tables", async () => {
  sql.mockImplementation(async (parts, ...values) => [
    { ...record, report_key: values[0], active: false, specific_user_ids: [] },
  ]);
  const saved = await saveListConfiguration({
    user,
    create: true,
    body: {
      configurationSchema: "constituent-list-v1",
      title: "New List",
      description: "",
      dataConfiguration: source,
    },
  });
  expect(saved).toMatchObject({
    active: false,
    canView: false,
    specificUserIds: [],
  });
  expect(sql.mock.calls[0][0].join(" ")).toContain("'constituent_list'");
});
it("rejects active creation, arbitrary sources, stale revision and unknown fields", async () => {
  await expect(
    saveListConfiguration({ user, create: true, body: { active: true } }),
  ).rejects.toThrow(/disabled/);
  await expect(
    saveListConfiguration({
      user,
      body: { reportKey: "list-demo", title: "Renamed", revision: "old" },
    }),
  ).rejects.toThrow(/changed/);
  await expect(
    saveListConfiguration({
      user,
      body: {
        reportKey: "list-demo",
        revision: "v1",
        dataConfiguration: { ...source, source: "query" },
      },
    }),
  ).rejects.toThrow(/custom-field/);
  await expect(
    saveListConfiguration({
      user,
      body: { reportKey: "list-demo", revision: "v1", sourceQueryId: "123" },
    }),
  ).rejects.toThrow(/Unknown/);
});
it("retains omitted source and access fields under a revision compare", async () => {
  await saveListConfiguration({
    user,
    body: { reportKey: "list-demo", revision: "v1", title: "Renamed" },
  });
  const update = sql.mock.calls.find(([parts]) =>
    parts.join(" ").includes("UPDATE report_configurations"),
  );
  expect(update[0].join(" ")).toContain("updated_at::text =");
  expect(update).toContain(JSON.stringify(source));
  expect(update).toContain(JSON.stringify([1]));
});
it("requires all assigned users to be active when enabling access", async () => {
  sql.mockResolvedValueOnce([record]).mockResolvedValueOnce([]);
  await expect(
    saveListConfiguration({
      user,
      body: {
        reportKey: "list-demo",
        revision: "v1",
        active: true,
        specificUserIds: [2],
      },
    }),
  ).rejects.toThrow(/inactive/);
  expect(sql).toHaveBeenCalledTimes(2);
});
