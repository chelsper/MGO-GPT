import { describe, expect, it, vi } from "vitest";
import { letterAppealChoices } from "./societyLetterAppealChoices";

const ctx = { user: { id: 7 }, origin: "https://example.org" };
const appeal = {
  id: "100",
  lookup_id: "CY26OOD",
  description: "2026 OOD Letter Sent",
  inactive: false,
};
const fetcher = (rows) =>
  vi.fn().mockResolvedValue({ count: rows.length, value: rows });

describe("read-only appeal choices", () => {
  it("makes one bounded GET and returns only code/description choices", async () => {
    const read = fetcher([
      { ...appeal, privateField: "not returned" },
      {
        ...appeal,
        id: "101",
        lookup_id: "100",
        description: "2026 President's Letter",
      },
    ]);
    expect(await letterAppealChoices(ctx, read)).toEqual({
      appeals: [
        { lookupId: "CY26OOD", description: "2026 OOD Letter Sent" },
        { lookupId: "100", description: "2026 President's Letter" },
      ],
      omittedCount: 0,
    });
    expect(read).toHaveBeenCalledExactlyOnceWith(
      "/fundraising/v1/appeals?include_inactive=true&limit=5000",
      {
        userId: 7,
        origin: ctx.origin,
        method: "GET",
        timeoutMs: 5000,
        maxRetries: 0,
      },
    );
  });
  it.each([
    { inactive: true },
    { inactive: undefined },
    { lookup_id: "" },
    { lookup_id: " code " },
    { lookup_id: "x".repeat(101) },
    { description: "" },
    { description: " trailing " },
    { description: "x".repeat(301) },
    { id: "../path" },
  ])("does not offer unusable or inactive choices: %j", async (change) => {
    expect(
      await letterAppealChoices(ctx, fetcher([{ ...appeal, ...change }])),
    ).toEqual({ appeals: [], omittedCount: 1 });
  });
  it.each(["code", "description"])(
    "omits ambiguous %s matches even if the duplicate is inactive",
    async (kind) => {
      const duplicate = {
        ...appeal,
        id: "101",
        inactive: true,
        lookup_id: kind === "code" ? "cy26ood" : "OTHER",
        description:
          kind === "description" ? "2026 ood letter sent" : "Other letter",
      };
      expect(
        (await letterAppealChoices(ctx, fetcher([appeal, duplicate]))).appeals,
      ).toEqual([]);
    },
  );
  it.each([
    { count: 2, value: [appeal] },
    { count: 2, value: [appeal, appeal] },
    { value: [] },
    { count: 1, value: [{ ...appeal, description: null }] },
    {
      count: 5001,
      value: Array.from({ length: 5001 }, (_, i) => ({
        ...appeal,
        id: String(i + 1),
      })),
    },
  ])(
    "rejects incomplete/invalid catalogs without following links",
    async (payload) => {
      const read = vi
        .fn()
        .mockResolvedValue({
          ...payload,
          next_link: "https://untrusted.example",
        });
      await expect(letterAppealChoices(ctx, read)).rejects.toThrow(
        /complete appeal catalog/,
      );
      expect(read).toHaveBeenCalledOnce();
    },
  );
  it.each([403, 429, 500])(
    "sanitizes NXT errors (%s) and does not retry",
    async (status) => {
      const read = vi
        .fn()
        .mockRejectedValue(
          Object.assign(new Error("Private upstream detail"), {
            httpStatus: status,
          }),
        );
      await expect(letterAppealChoices(ctx, read)).rejects.toMatchObject({
        status: status === 429 ? 429 : 502,
      });
      expect(read).toHaveBeenCalledOnce();
      try {
        await letterAppealChoices(ctx, read);
      } catch (error) {
        expect(error.message).not.toContain("Private upstream");
      }
    },
  );
});
