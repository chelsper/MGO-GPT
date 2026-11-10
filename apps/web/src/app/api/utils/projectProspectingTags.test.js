import { describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ query: vi.fn(), transaction: vi.fn() }));
vi.mock("./sql", () => ({ default: Object.assign(db.query, { transaction: db.transaction }) }));
import { mutateProjectTags, validateProjectTagMutation } from "./projectProspectingTags";
const context = { report: { revision: "r1" } };
const state = { snapshot: { generatedAt: "s1" }, identity: { ids: ["123", "456"] } };
const body = { action: "apply", revision: "r1", snapshotAt: "s1", tagId: "55f50c08-3151-4d2d-81ef-881f7629b4a6", constituentIds: ["123"] };
describe("project tag write validation", () => {
  it("allows distinct mapped members only", () => expect(validateProjectTagMutation(body, context, state)).toEqual({ ids: ["123"] }));
  it.each([{ revision: "old" }, { snapshotAt: "old" }, { constituentIds: ["999"] }, { constituentIds: [123] }, { constituentIds: ["123", "123"] },
    { constituentIds: [] }, { constituentIds: Array(101).fill("123") }, { tagId: "invalid" }, { action: "deleteProject" }, { name: "extra" }, { other: true }])("rejects unsafe mutation %j", patch => {
    expect(() => validateProjectTagMutation({ ...body, ...patch }, context, state)).toThrow();
  });
  it("blocks missing identity or snapshot", () => {
    expect(() => validateProjectTagMutation(body, context, { ...state, identity: { error: "Needs mapping" } })).toThrow("Needs mapping");
    expect(() => validateProjectTagMutation(body, context, { ...state, snapshot: null })).toThrow(/saved list changed/);
  });
  it("can create a local tag without any query output and never accepts members on create", () => {
    expect(validateProjectTagMutation({ action: "create", name: "Team interest", revision: "r1" }, context, {})).toMatchObject({ tag: { name: "Team interest" } });
    expect(() => validateProjectTagMutation({ ...body, action: "create", name: "Team interest" }, context, state)).toThrow();
  });
  it("explicitly types every UNION audit actor parameter for Neon", async () => {
    db.query.mockImplementation((parts, ...values) => ({
      text: parts.reduce((query, part, i) => query + part + (i < values.length ? `$${i + 1}` : ""), ""), values,
    }));
    db.transaction.mockResolvedValue([[], [], [], [{ report_key: "list-fictional" }], [{ id: body.tagId, name: "Leadership", changed: 0 }]]);
    await mutateProjectTags({ ...context, report: { ...context.report, key: "list-fictional" }, user: { id: "7" } },
      { ...state, keys: { snapshot: "fixture" } }, { action: "create", name: "Leadership", revision: "r1" });
    const query = db.transaction.mock.calls.at(-1)[0].at(-1);
    const audit = query.text.split("INSERT INTO project_prospect_tag_events")[1];
    const actors = [...audit.matchAll(/\$(\d+)::bigint/g)];
    expect(actors).toHaveLength(3);
    for (const [, index] of actors) expect(query.values[Number(index) - 1]).toBe("7");
  });
});
