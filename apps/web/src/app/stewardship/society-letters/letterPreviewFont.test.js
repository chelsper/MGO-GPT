import { afterEach, describe, expect, it, vi } from "vitest";
import { loadLetterPreviewFont } from "./letterPreviewFont";

afterEach(() => vi.unstubAllGlobals());
function fixture() {
  const add = vi.fn();
  const load = vi.fn(async function () {
    return this;
  });
  const Face = vi.fn(function (family, bytes, settings) {
    Object.assign(this, { family, bytes, ...settings, load });
  });
  return {
    frame: {
      contentWindow: { FontFace: Face },
      contentDocument: { fonts: { add } },
    },
    add,
    Face,
    load,
  };
}
describe("bundled preview fonts", () => {
  it("loads all four faces from this app without document network permissions", async () => {
    const fetchMock = vi.fn(
      async () => new Response(new Uint8Array([0, 1, 0, 0])),
    );
    vi.stubGlobal("fetch", fetchMock);
    const f = fixture();
    const signal = new AbortController().signal;
    await loadLetterPreviewFont(f.frame, signal);
    expect(f.add).toHaveBeenCalledTimes(4);
    expect(
      f.Face.mock.calls.map(([family, , settings]) => [family, settings]),
    ).toEqual([
      ["Carlito", { weight: "400", style: "normal" }],
      ["Carlito", { weight: "700", style: "normal" }],
      ["Carlito", { weight: "400", style: "italic" }],
      ["Carlito", { weight: "700", style: "italic" }],
    ]);
    for (const [url, options] of fetchMock.mock.calls) {
      expect(new URL(url).origin).toBe(window.location.origin);
      expect(options).toEqual({
        credentials: "omit",
        redirect: "error",
        signal,
      });
    }
  });
  it("fails closed on missing, oversized, invalid, or cancelled fonts", async () => {
    for (const failure of ["missing", "large", "invalid", "cancelled"]) {
      const f = fixture();
      const controller = new AbortController();
      const fetchMock = vi.fn(
        async () =>
          new Response(
            new Uint8Array(failure === "large" ? 1024 * 1024 + 1 : 4),
            { status: failure === "missing" ? 404 : 200 },
          ),
      );
      vi.stubGlobal("fetch", fetchMock);
      if (failure === "cancelled") controller.abort();
      if (failure === "invalid")
        f.load.mockRejectedValueOnce(new Error("invalid"));
      await expect(
        loadLetterPreviewFont(f.frame, controller.signal),
      ).rejects.toThrow("letter font could not be loaded");
      expect(f.add).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledTimes(failure === "cancelled" ? 0 : 1);
    }
  });
});
