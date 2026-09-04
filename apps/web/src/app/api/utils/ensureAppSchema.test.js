import { expect, it, vi } from "vitest";

const { sqlMock } = vi.hoisted(() => ({ sqlMock: vi.fn().mockResolvedValue([]) }));
vi.mock("@/app/api/utils/sql", () => ({ default: sqlMock }));
import ensureAppSchema from "./ensureAppSchema";

it("migrates only the old Team Standings title, preserving report access and snapshots", async () => {
  await ensureAppSchema();
  const queries = sqlMock.mock.calls.map(([strings]) => strings.join(" ").replace(/\s+/g, " ").trim());
  const rename = queries.find((query) => query.startsWith("UPDATE report_configurations SET title = 'Team Standings'"));
  expect(rename).toBeDefined();
  expect(rename).toContain("WHERE report_key = 'executive-team-standings'");
  expect(rename).toContain("AND LOWER(TRIM(title)) = 'executive team standings'");
  expect(rename).not.toMatch(/visibility|specific_user_ids|snapshot|data_configuration/i);
  const initial = queries.find((query) => query.startsWith("INSERT INTO report_configurations") && query.includes("'executive-team-standings'"));
  expect(initial).toContain("'Team Standings'");
  expect(initial).toContain("ON CONFLICT (report_key) DO NOTHING");
});
