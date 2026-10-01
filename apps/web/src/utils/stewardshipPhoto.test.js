import { expect, it } from "vitest";
import { validPhotoChange, prepareGiftPhoto } from "./stewardshipPhoto";
import { validateInventoryCommand } from "./stewardshipInventory";
const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jVh0AAAAASUVORK5CYII=";
const photo = { operation: "replace", dataUrl: png, alt: "Green blanket" };
const command = { operation: "update", viewerKey: "auth-2", id: "1", version: 1, name: "Blanket", description: "", location: "", availability: "unknown" };
it("accepts bounded inline photos and explicit description/removal changes", () => {
  expect(validPhotoChange(photo, true)).toBe(true);
  expect(validPhotoChange({ operation: "describe", alt: "Green" })).toBe(true);
  expect(validPhotoChange({ operation: "remove" })).toBe(true);
  expect(validateInventoryCommand({ ...command, photo })).toMatchObject({ photo });
  expect(validateInventoryCommand(command)).not.toHaveProperty("photo");
});
it.each([null, [], { ...photo, alt: " " }, { ...photo, alt: "a".repeat(241) }, { ...photo, extra: true },
  { ...photo, dataUrl: "https://remote.test/image.png" }, { ...photo, dataUrl: "data:image/svg+xml;base64,AAAA" },
  { ...photo, dataUrl: "data:image/png;base64,AAAA" }, { operation: "remove", dataUrl: png }, { operation: "unknown" }])("rejects invalid photo commands: %o", value => {
  expect(validPhotoChange(value)).toBe(false);
  expect(validateInventoryCommand({ ...command, photo: value })).toBeNull();
});
it("does not describe or remove a photo on an unsaved item", () => {
  expect(validPhotoChange({ operation: "describe", alt: "Green" }, true)).toBe(false);
  expect(validPhotoChange({ operation: "remove" }, true)).toBe(false);
});
it("uses photo-specific upload errors without contacting a service", async () => {
  await expect(prepareGiftPhoto({ type: "image/png", size: 3 * 1024 * 1024 })).rejects.toThrow("photo smaller than 2 MB");
});
