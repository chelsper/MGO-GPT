import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ sql: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: mocks.sql }));
import { loadDiscussionNextStep, createDiscussionNextStep } from "./discussionNextStep";

let context, users;
beforeEach(() => {
  vi.clearAllMocks();
  context = { sessionUser: { id: 2, role: "admin" }, workspaceUser: { id: 7, role: "mgo" }, isActing: true };
  users = [{ id: 7, role: "mgo", active: true }, { id: 8, role: "mgo", active: true }, { id: 9, role: "executive", active: true }];
  mocks.sql.mockImplementation(async parts => {
    const text = parts.join("");
    if (text.includes("FROM discussion_items di")) return [{ id: 50, owner_user_id: 7, version: "version" }];
    if (text.includes("FROM constituents c")) return [
      { constituent_id: 1, blackbaud_constituent_id: "123", name: "Donor" },
      { constituent_id: 2, blackbaud_constituent_id: "123", name: "Same donor" },
      { constituent_id: 3, blackbaud_constituent_id: null, user_id: 7, name: "Local donor" },
    ];
    if (text.includes("FROM users u")) return users;
    return [];
  });
});
it("deduplicates topics only by canonical NXT system ID and restricts Admin owner choices to editable workspaces", async () => {
  const data = await loadDiscussionNextStep(50, context);
  expect(data.topics.map(topic => topic.key)).toEqual(["nxt:123", "local:3"]);
  expect(data.owners.map(owner => owner.id)).toEqual([7, 8]);
  expect(mocks.sql.mock.calls[0][0].join("?")).toContain("dip.user_id = ?");
  expect(mocks.sql.mock.calls[2][0].join("?")).toContain("dip.user_id = u.id");
});
it("lets an MGO create only in their own workspace", async () => {
  context = { sessionUser: users[0], workspaceUser: users[0] };
  expect((await loadDiscussionNextStep(50, context)).owners.map(owner => owner.id)).toEqual([7]);
});
it("does not read topics, owners, or tasks for an invisible discussion", async () => {
  mocks.sql.mockResolvedValueOnce([]);
  expect(await loadDiscussionNextStep(50, context)).toBeNull();
  expect(mocks.sql).toHaveBeenCalledTimes(1);
});
it("uses a source lock and unique origin, never the primary-task or discussion-write helpers", async () => {
  mocks.sql.transaction = vi.fn(async () => [[], [{ id: 40, already_exists: true }]]);
  const result = await createDiscussionNextStep({ id: 50, context, source: { version: "version" }, owner: users[0],
    topic: { key: "nxt:123", constituent_id: 1, name: "Donor", blackbaud_constituent_id: "123" }, draft: { title: "Call", dueDate: null } });
  expect(result.already_exists).toBe(true);
  expect(mocks.sql.transaction).toHaveBeenCalledOnce();
  const text = mocks.sql.mock.calls.map(([parts]) => parts.join("?")).join("\n");
  expect(text).toContain("FOR UPDATE");
  expect(text).toContain("ON CONFLICT (source_discussion_id, owner_user_id, source_topic_key)");
  expect(text).toContain("'General', 'Open', FALSE, FALSE");
  expect(text).toContain("target.role = ?");
  expect(text).toContain("di.updated_at = ?::timestamptz");
  expect(text).not.toContain("UPDATE prospects");
  expect(text).not.toContain("UPDATE discussion_items");
});
