import { describe, expect, it } from "vitest";
import {
  JU_GIFT_STARTERS,
  inventoryNameKey,
  validateInventoryCommand,
} from "./stewardshipInventory";

export const create = {
  operation: "create",
  viewerKey: "auth-1",
  requestId: "18d02230-07b2-4f12-8967-3e0b0147c900",
  name: "JU Blanket",
  description: "",
  location: "",
  availability: "unknown",
};
describe("gift inventory commands", () => {
  it("uses only known gift names, without claiming NXT IDs, stock or quantities", () => {
    expect(JU_GIFT_STARTERS).toHaveLength(26);
    expect(new Set(JU_GIFT_STARTERS.map((item) => item.key)).size).toBe(26);
    expect(JU_GIFT_STARTERS.map((item) => item.name)).not.toContain(
      "Other Gift",
    );
    expect(
      JU_GIFT_STARTERS.every(
        (item) => Object.keys(item).sort().join(",") === "key,name",
      ),
    ).toBe(true);
  });
  it("normalizes names for deduplication while preserving display text", () => {
    expect(inventoryNameKey("  JU   Blanket\n")).toBe("ju blanket");
    expect(
      validateInventoryCommand({ ...create, name: " JU Blanket " }).name,
    ).toBe("JU Blanket");
  });
  it.each([
    null,
    [],
    {},
    { ...create, operation: "toString" },
    { ...create, name: " " },
    { ...create, name: "a".repeat(161) },
    { ...create, availability: "__proto__" },
    { ...create, availability: "in_stock" },
    { ...create, quantity: 0 },
    { ...create, nxtId: "123" },
    { ...create, requestId: "" },
    { ...create, viewerKey: "" },
    { ...create, location: "x".repeat(241) },
    { ...create, description: "x".repeat(2001) },
  ])("rejects malformed or extra data", (body) => {
    expect(validateInventoryCommand(body)).toBeNull();
  });
  it.each([0, -1, 1.1, "1", 2147483647])(
    "rejects invalid version %s",
    (version) => {
      expect(
        validateInventoryCommand({
          operation: "restore",
          viewerKey: "x",
          id: "1",
          version,
        }),
      ).toBeNull();
    },
  );
  it("limits imports to a nonempty distinct selection of known keys", () => {
    const key = JU_GIFT_STARTERS[0].key;
    for (const keys of [[], ["unknown"], [key, key], key])
      expect(
        validateInventoryCommand({ operation: "import", viewerKey: "x", keys }),
      ).toBeNull();
    expect(
      validateInventoryCommand({
        operation: "import",
        viewerKey: "x",
        keys: [key],
      }),
    ).toBeTruthy();
  });
  it("requires versioned archive or restore, and optional archive reason", () => {
    expect(
      validateInventoryCommand({
        operation: "archive",
        viewerKey: "x",
        id: "1",
        version: 2,
        reason: " No longer offered ",
      }).reason,
    ).toBe("No longer offered");
    expect(
      validateInventoryCommand({
        operation: "restore",
        viewerKey: "x",
        id: "1",
        version: 2,
      }),
    ).toBeTruthy();
    expect(
      validateInventoryCommand({
        operation: "restore",
        viewerKey: "x",
        id: "1",
        version: 2,
        reason: "x",
      }),
    ).toBeNull();
  });
});
