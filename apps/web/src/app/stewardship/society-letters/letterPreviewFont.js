import regular from "@/assets/fonts/carlito/Carlito-Regular.ttf?url";
import bold from "@/assets/fonts/carlito/Carlito-Bold.ttf?url";
import italic from "@/assets/fonts/carlito/Carlito-Italic.ttf?url";
import boldItalic from "@/assets/fonts/carlito/Carlito-BoldItalic.ttf?url";

const faces = [
  [regular, "400", "normal"],
  [bold, "700", "normal"],
  [italic, "400", "italic"],
  [boldItalic, "700", "italic"],
];

export async function loadLetterPreviewFont(frame, signal) {
  try {
    // Only the parent reads bundled assets. The document keeps its no-network CSP.
    for (const [asset, weight, style] of faces) {
      signal.throwIfAborted();
      const url = new URL(asset, window.location.href);
      if (url.origin !== window.location.origin)
        throw new Error("Invalid asset");
      const response = await fetch(url.href, {
        signal,
        credentials: "omit",
        redirect: "error",
      });
      if (!response.ok) throw new Error("Font unavailable");
      const bytes = await response.arrayBuffer();
      if (!bytes.byteLength || bytes.byteLength > 1024 * 1024)
        throw new Error("Invalid font");
      const face = new frame.contentWindow.FontFace("Carlito", bytes, {
        weight,
        style,
      });
      await face.load();
      signal.throwIfAborted();
      frame.contentDocument.fonts.add(face);
    }
  } catch {
    throw new Error("The letter font could not be loaded. Try preview again.");
  }
}
