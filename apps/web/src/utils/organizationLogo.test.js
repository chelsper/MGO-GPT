import { afterEach, expect, it, vi } from "vitest";
import { isOrganizationLogo, prepareOrganizationLogo, MAX_LOGO_BYTES } from "./organizationLogo";
import { DEFAULT_ORGANIZATION_SETTINGS, normalizeOrganizationSettings, validateOrganizationSettings } from "./organizationSettings";

const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jVh0AAAAASUVORK5CYII=";
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("accepts a small inline PNG and normalizes old profiles to initials", () => {
  expect(isOrganizationLogo(png)).toBe(true);
  expect(normalizeOrganizationSettings({ logo_data_url: png }).logoDataUrl).toBe(png);
  expect(normalizeOrganizationSettings({}).logoDataUrl).toBeNull();
  expect(validateOrganizationSettings({ ...DEFAULT_ORGANIZATION_SETTINGS, logoDataUrl: png })).toBeNull();
});

it.each(["https://tracker.test/logo.png", "javascript:alert(1)", "data:image/svg+xml;base64,PHN2Zy8+", "data:text/html;base64,PGgxPkhlbGxvPC9oMT4=", "data:image/png;base64,AAAA", "", 7, {}])("rejects unsafe or malformed logo %s", value => {
  expect(isOrganizationLogo(value)).toBe(false);
  expect(validateOrganizationSettings({ ...DEFAULT_ORGANIZATION_SETTINGS, logoDataUrl: value })).toMatch(/valid logo/);
  expect(normalizeOrganizationSettings({ logoDataUrl: value }).logoDataUrl).toBeNull();
});

it("rejects excessive dimensions, trailing payloads, unsupported chunks, and oversized images", () => {
  const original = Buffer.from(png.split(",")[1], "base64");
  const wide = Buffer.from(original); wide.writeUInt32BE(20000, 16);
  const chunk = Buffer.from(original); chunk.write("acTL", 37);
  for (const bytes of [wide, chunk, Buffer.concat([original, Buffer.from("<script>")]), Buffer.alloc(MAX_LOGO_BYTES + 1)])
    expect(isOrganizationLogo(`data:image/png;base64,${bytes.toString("base64")}`)).toBe(false);
});

it("rejects source formats and oversized inputs before decoding or uploading", async () => {
  const network = vi.fn(); vi.stubGlobal("fetch", network);
  await expect(prepareOrganizationLogo({ type: "image/svg+xml", size: 100 })).rejects.toThrow("PNG, JPEG, or WebP");
  await expect(prepareOrganizationLogo({ type: "image/png", size: 3 * 1024 * 1024 })).rejects.toThrow("2 MB");
  expect(network).not.toHaveBeenCalled();
});

it("re-encodes and resizes locally, revoking the temporary URL", async () => {
  const revokeObjectURL = vi.fn();
  vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:test"), revokeObjectURL });
  vi.stubGlobal("Image", class { naturalWidth = 2048; naturalHeight = 1024; set src(value) { queueMicrotask(() => this.onload()); } });
  const drawImage = vi.fn();
  const canvas = { width: 0, height: 0, getContext: () => ({ drawImage }), toDataURL: vi.fn(() => png) };
  vi.spyOn(document, "createElement").mockReturnValue(canvas);
  expect(await prepareOrganizationLogo({ type: "image/jpeg", size: 5000 })).toBe(png);
  expect(canvas.width).toBe(512); expect(canvas.height).toBe(256);
  expect(canvas.toDataURL).toHaveBeenCalledWith("image/png");
  expect(revokeObjectURL).toHaveBeenCalledWith("blob:test");
});

it("cleans up failed image decoding without changing any saved data", async () => {
  const revokeObjectURL = vi.fn();
  vi.stubGlobal("URL", { createObjectURL: () => "blob:bad", revokeObjectURL });
  vi.stubGlobal("Image", class { set src(value) { queueMicrotask(() => this.onerror()); } });
  await expect(prepareOrganizationLogo({ type: "image/png", size: 100 })).rejects.toThrow("could not be opened");
  expect(revokeObjectURL).toHaveBeenCalledWith("blob:bad");
});
