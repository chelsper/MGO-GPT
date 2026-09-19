import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  identity: vi.fn(),
  categories: vi.fn(),
  values: vi.fn(),
}));
vi.mock("./blackbaud", () => ({
  blackbaudApiFetch: mocks.fetch,
  getBlackbaudConstituentById: mocks.identity,
  listBlackbaudConstituentCustomFieldCategories: mocks.categories,
  listBlackbaudConstituentCustomFieldCategoryValues: mocks.values,
}));
vi.mock("./sql", () => ({ default: vi.fn() }));
import {
  matchesListField,
  parseListPage,
  readListPage,
  readListIdentity,
  readMemberFields,
  validateMembershipValue,
  writeListMembership,
} from "./constituentListProvider";
const source = {
  fieldCategory: "Prospect Research",
  fieldDescription: "Future. Made. Phase II",
};
const context = {
  user: {
    id: 1,
    name: "An administrator with a name far longer than fifty characters",
  },
  origin: "https://example.test",
  source,
  constituentId: "123",
};
const field = {
  id: "7",
  parent_id: "123",
  category: source.fieldCategory,
  value: source.fieldDescription,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetch.mockResolvedValue({ count: 1, value: [field] });
});
it("matches actual custom-field values, not comments or fuzzy punctuation", () => {
  expect(matchesListField(field, source)).toBe(true);
  expect(
    matchesListField(
      {
        ...field,
        value: "Future Made Phase II",
        comment: source.fieldDescription,
      },
      source,
    ),
  ).toBe(false);
  expect(
    matchesListField(
      { ...field, value: "Anything" },
      { ...source, fieldDescription: "" },
    ),
  ).toBe(true);
});
it("requests only the configured category/value with bounded no-retry pages", async () => {
  await readListPage(context);
  expect(mocks.fetch).toHaveBeenCalledWith(
    "/constituent/v1/constituents/customfields",
    expect.objectContaining({
      maxRetries: 0,
      searchParams: {
        category: source.fieldCategory,
        value: source.fieldDescription,
        limit: 100,
        offset: 0,
        include_count: true,
      },
    }),
  );
  mocks.fetch.mockResolvedValue({
    count: 1,
    value: [{ ...field, value: "Different" }],
  });
  await expect(readListPage(context)).rejects.toThrow(/outside/);
});
it("fails closed on malformed, truncated, oversized and unsafe continuation responses", () => {
  for (const payload of [
    {},
    { value: null },
    { count: 2, value: [field] },
    { count: 0, value: [field] },
    { count: 10001, value: [] },
    { value: [{ category: "x" }] },
    { value: [field], next_link: "https://evil.test/customfields?offset=1" },
    {
      value: [field],
      next_link:
        "https://api.sky.blackbaud.com/constituent/v1/constituents/customfields?offset=0",
    },
  ])
    expect(() => parseListPage(payload)).toThrow();
  expect(parseListPage({ count: 0, value: [] })).toEqual({
    fields: [],
    nextOffset: null,
    count: 0,
  });
  expect(
    parseListPage({
      count: 2,
      value: [field],
      next_link:
        "https://api.sky.blackbaud.com/constituent/v1/constituents/customfields?offset=1",
    }).nextOffset,
  ).toBe(1);
});
it("verifies names from the authoritative returned ID rather than a requested-ID fallback", async () => {
  mocks.identity.mockResolvedValue({
    blackbaudConstituentId: "123",
    name: "Test Donor",
    lookupId: "L123",
    raw: { id: "123" },
  });
  expect(await readListIdentity(context)).toEqual({
    constituentId: "123",
    name: "Test Donor",
    lookupId: "L123",
  });
  mocks.identity.mockResolvedValue({
    blackbaudConstituentId: "123",
    name: "Test Donor",
    raw: {},
  });
  await expect(readListIdentity(context)).rejects.toThrow(/verify/);
});
it("checks complete single-record fields and rejects wrong-parent fields", async () => {
  expect(await readMemberFields(context)).toHaveLength(1);
  mocks.fetch.mockResolvedValue({ value: [{ ...field, parent_id: "456" }] });
  await expect(readMemberFields(context)).rejects.toThrow(/inconsistent/);
});
it("validates supported category types and existing code-table choices", async () => {
  mocks.categories.mockResolvedValue([
    { name: source.fieldCategory, type: "CodeTableEntry" },
  ]);
  mocks.values.mockResolvedValue([source.fieldDescription]);
  expect(
    await validateMembershipValue({
      ...context,
      value: source.fieldDescription,
    }),
  ).toEqual({ category: source.fieldCategory, value: source.fieldDescription });
  await expect(
    validateMembershipValue({ ...context, value: "Unknown new code" }),
  ).rejects.toThrow(/existing NXT/);
  mocks.categories.mockResolvedValue([
    { name: source.fieldCategory, type: "Date" },
  ]);
  await expect(
    validateMembershipValue({ ...context, value: "2026-01-01" }),
  ).rejects.toThrow(/Text and Code Table/);
});
it("writes the documented value property once and limits audit comments to 50 characters", async () => {
  await writeListMembership({
    ...context,
    category: source.fieldCategory,
    value: source.fieldDescription,
  });
  const options = mocks.fetch.mock.calls[0][1];
  expect(options).toMatchObject({
    method: "POST",
    maxRetries: 0,
    body: {
      category: source.fieldCategory,
      parent_id: "123",
      value: source.fieldDescription,
    },
  });
  expect(options.body).not.toHaveProperty("description");
  expect(options.body.comment.length).toBeLessThanOrEqual(50);
});
