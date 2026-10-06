import { describe, expect, it } from "vitest";
import { completeImportContactCollection } from "./importContactCollection";

describe("complete contact reads", () => {
  it.each([[], { value: [], count: 0 }, { items: [{ id: "1" }] }, { data: [] }, { results: [] }])("accepts complete collections: %j", (payload) => {
    expect(Array.isArray(completeImportContactCollection(payload))).toBe(true);
  });
  it.each([null, {}, { message: "unavailable" }, { value: "bad" }, { value: [null] }, { value: [], count: 10 }, { value: [], next_link: "/next" }, { value: [], has_more: true }])("never treats malformed/partial data as missing contacts: %j", (payload) => {
    expect(() => completeImportContactCollection(payload)).toThrow(/incomplete contact information/);
  });
});
