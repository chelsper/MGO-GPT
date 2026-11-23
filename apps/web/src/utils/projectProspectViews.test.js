import { describe, it, expect } from "vitest";
import { decodeProjectViews, normalizeProjectView, projectViewProblem, projectViewStorageKey, matchesProjectTags } from "./projectProspectViews";
const settings = { mode: "any", tagIds: ["a", "b"], status: "active", groupSpouses: true, sort: { key: "ranking", direction: "descending" } };
const raw = views => JSON.stringify({ version: 1, views });
const view = { id: "v1", name: "My interests", settings };
describe("private project display preferences", () => {
  it("isolates viewers and projects, including delimiter characters", () => {
    const keys = [projectViewStorageKey("a:b", "c"), projectViewStorageKey("a", "b:c"), projectViewStorageKey("b", "c")];
    expect(new Set(keys).size).toBe(3);
    expect(projectViewStorageKey(null, "c")).toBeNull();
    expect(projectViewStorageKey("", "c")).toBeNull();
  });
  it("whitelists display preferences and excludes search, selected people and donor rows", () => {
    expect(normalizeProjectView({ ...settings, search: "Donor", selected: ["123"], rows: [["private"]], sort: { ...settings.sort, private: true } })).toEqual(settings);
    expect(decodeProjectViews(raw([{ ...view, donor: "private", settings: { ...settings, search: "private" } }]))).toEqual([view]);
  });
  it("normalizes repeated tags and removes unused tags for all people", () => {
    expect(normalizeProjectView({ ...settings, tagIds: ["b", "a", "a"] })).toEqual(settings);
    expect(normalizeProjectView({ ...settings, mode: "all" }).tagIds).toEqual([]);
  });
  it.each([null, { ...settings, mode: "unknown" }, { ...settings, tagIds: [] }, { ...settings, tagIds: [null] }, { ...settings, status: "missing" }, { ...settings, groupSpouses: "true" }, { ...settings, sort: {} }])("rejects malformed preferences %#", value => {
    expect(normalizeProjectView(value)).toBeNull();
  });
  it.each(["{", "x".repeat(100001), JSON.stringify({ version: 2, views: [] }), raw([view, view]), raw(Array.from({length: 13}, (_, i) => ({ ...view, id: String(i), name: String(i) }))), raw([{ ...view, name: "" }])])("does not silently reset invalid stored views %#", value => {
    expect(() => decodeProjectViews(value)).toThrow();
  });
  it("does not apply unavailable tags or sort columns", () => {
    expect(projectViewProblem(settings, [{ id: "a" }], [{ key: "ranking" }])).toContain("no longer available");
    expect(projectViewProblem(settings, [{ id: "a" }, { id: "b" }], [])).toContain("no longer visible");
    expect(projectViewProblem(settings, [{ id: "a" }, { id: "b" }], [{ key: "ranking" }])).toBe("");
  });
  it("matches tags on the same constituent without combining spouse tags", () => {
    expect(matchesProjectTags(new Set(["a"]), "any", ["a", "b"])).toBe(true);
    expect(matchesProjectTags(new Set(["a"]), "allSelected", ["a", "b"])).toBe(false);
    expect(matchesProjectTags(new Set(["a", "b"]), "allSelected", ["a", "b"])).toBe(true);
    expect(matchesProjectTags(undefined, "untagged", [])).toBe(true);
    expect(matchesProjectTags(new Set(["a"]), "untagged", [])).toBe(false);
    expect(matchesProjectTags(new Set(["a"]), "any", [])).toBe(false);
    expect(matchesProjectTags(undefined, "all", [])).toBe(true);
  });
});
