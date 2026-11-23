import { it, expect, vi } from "vitest";
vi.mock("./sql", () => ({
  default: () => {
    throw new Error("No real DB in unit tests");
  },
}));
import { readOutreachPriorities } from "./outreachPriorities";
const context = { userId: 8, origin: "https://app.test", today: "2026-11-22" };
it("uses one parameterized aggregate SELECT with persisted access and separate ownership scopes", async () => {
  const db = vi
    .fn()
    .mockResolvedValue([
      {
        key: "fictional",
        open: "1",
        overdue: "1",
        today: "0",
        upcoming: "0",
        drafts: "2",
        verification: "0",
      },
    ]);
  expect(await readOutreachPriorities(context, db)).toEqual([
    {
      key: "fictional",
      open: 1,
      overdue: 1,
      today: 0,
      upcoming: 0,
      drafts: 2,
      verification: 0,
    },
  ]);
  expect(db).toHaveBeenCalledTimes(1);
  const [query, args] = db.mock.calls[0];
  expect(args).toEqual([8, "https://app.test", "2026-11-22", 8]);
  for (const guard of [
    "u.active=TRUE",
    "v.active=TRUE",
    "r.specific_user_ids @> jsonb_build_array(v.id)",
    "r.active=TRUE",
    "specific_user_ids @>",
    "t.assignee_id=$1",
    "e.actor_id=$1",
    "t.origin=$2",
    "r.configuration_kind='constituent_list'",
  ])
    expect(query).toContain(guard);
  expect(query).not.toMatch(
    /INSERT|UPDATE|DELETE|access_token|refresh_token|t\.name|e\.result/i,
  );
});
it("separates the selected caller from the authorized viewer without broadening project sharing", async () => {
  const db = vi.fn().mockResolvedValue([]);
  await readOutreachPriorities({ ...context, viewerId: 7 }, db);
  expect(db.mock.calls[0][1]).toEqual([8, "https://app.test", "2026-11-22", 7]);
  expect(db.mock.calls[0][0]).toContain("v.id=u.id OR");
  await expect(readOutreachPriorities({ ...context, viewerId: 0 }, db)).rejects.toMatchObject({ status: 400 });
});
it("rejects invalid identity/date and oversized results", async () => {
  const db = vi.fn().mockResolvedValue(Array(1001).fill({}));
  await expect(
    readOutreachPriorities({ ...context, userId: 0 }, db),
  ).rejects.toMatchObject({ status: 400 });
  await expect(
    readOutreachPriorities({ ...context, today: "bad" }, db),
  ).rejects.toMatchObject({ status: 400 });
  expect(db).not.toHaveBeenCalled();
  await expect(readOutreachPriorities(context, db)).rejects.toMatchObject({
    status: 422,
  });
});
