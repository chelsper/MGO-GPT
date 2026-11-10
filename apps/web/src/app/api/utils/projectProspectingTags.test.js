import { describe, expect, it, vi } from "vitest";
vi.mock("./sql", () => ({ default: vi.fn() }));
import { validateProjectTagMutation } from "./projectProspectingTags";
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
});
