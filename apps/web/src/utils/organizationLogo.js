export const MAX_LOGO_BYTES = 96 * 1024;
export const MAX_LOGO_DIMENSION = 512;
export const MAX_LOGO_UPLOAD_BYTES = 2 * 1024 * 1024;
const PREFIX = "data:image/png;base64,";

// Only bounded, inline PNGs can become branding. Never fetch a supplied URL.
export function isOrganizationLogo(value) {
  if (typeof value !== "string" || !value.startsWith(PREFIX) || value.length > PREFIX.length + Math.ceil(MAX_LOGO_BYTES / 3) * 4) return false;
  const encoded = value.slice(PREFIX.length);
  if (!encoded || encoded.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return false;
  try {
    const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
    if (bytes.length > MAX_LOGO_BYTES || bytes.length < 57 || ![137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)) return false;
    const view = new DataView(bytes.buffer);
    let offset = 8;
    let imageData = false;
    while (offset + 12 <= bytes.length) {
      const length = view.getUint32(offset);
      const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
      if (offset + length + 12 > bytes.length) return false;
      if (offset === 8) {
        if (type !== "IHDR" || length !== 13) return false;
        const width = view.getUint32(offset + 8);
        const height = view.getUint32(offset + 12);
        if (!width || !height || width > MAX_LOGO_DIMENSION || height > MAX_LOGO_DIMENSION) return false;
      } else if (type === "IHDR") return false;
      if (!["IHDR", "PLTE", "tRNS", "IDAT", "IEND", "sRGB", "gAMA", "cHRM", "pHYs"].includes(type)) return false;
      if (type === "IDAT" && length) imageData = true;
      offset += length + 12;
      if (type === "IEND") return length === 0 && imageData && offset === bytes.length;
    }
  } catch { return false; }
  return false;
}

export async function prepareOrganizationLogo(file) {
  if (!file || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new Error("Choose a PNG, JPEG, or WebP image. SVG and animated formats are not supported.");
  if (!file.size || file.size > MAX_LOGO_UPLOAD_BYTES) throw new Error("Choose a logo smaller than 2 MB.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("This image could not be opened. Try a different logo."));
      image.src = url;
    });
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 16_000_000) throw new Error("Choose a logo with no more than 16 million pixels.");
    // Re-encode locally to remove metadata and keep the saved branding lightweight.
    for (const maximum of [512, 384, 256, 128]) {
      const scale = Math.min(1, maximum / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Image preview is unavailable in this browser.");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const result = canvas.toDataURL("image/png");
      if (isOrganizationLogo(result)) return result;
    }
    throw new Error("This logo is too detailed. Try a simpler or smaller image.");
  } finally { URL.revokeObjectURL(url); }
}
