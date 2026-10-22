import { EndpointError, reserveMediaUsage } from "./legacyEndpointAccess";

export const MAX_MEDIA_BYTES = 4 * 1024 * 1024;
const MAX_REQUEST_BYTES = 4.5 * 1024 * 1024;
const AUDIO_TYPES = new Map([
  ["audio/wav", "wav"], ["audio/x-wav", "wav"], ["audio/mpeg", "mp3"],
  ["audio/mp3", "mp3"], ["audio/ogg", "ogg"], ["audio/webm", "webm"],
  ["audio/mp4", "m4a"], ["audio/m4a", "m4a"], ["audio/x-m4a", "m4a"],
  ["audio/aac", "aac"], ["audio/flac", "flac"],
]);

export async function readBoundedBody(source, limit = MAX_REQUEST_BYTES) {
  if (Number(source.headers.get("content-length")) > limit) {
    throw new EndpointError("This file is too large. Please use a smaller file.", 413);
  }
  if (!source.body) return new Uint8Array();
  const reader = source.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new EndpointError("This file is too large. Please use a smaller file.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

export async function readMediaRequest(request) {
  const bytes = await readBoundedBody(request);
  const type = request.headers.get("content-type") || "";
  try {
    if (type.startsWith("multipart/form-data")) {
      const form = await new Response(bytes, { headers: { "Content-Type": type } }).formData();
      const file = form.get("file");
      if (!(file instanceof File) || !file.size) throw new Error("Missing file");
      if (file.size > MAX_MEDIA_BYTES) throw new EndpointError("Files must be 4 MB or smaller.", 413);
      return { file };
    }
    if (type.startsWith("application/json")) {
      return { json: JSON.parse(new TextDecoder().decode(bytes)) };
    }
    return { bytes };
  } catch (error) {
    if (error instanceof EndpointError) throw error;
    throw new EndpointError("Please provide a valid file or JSON request.");
  }
}

export function validateMediaUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new EndpointError("The uploaded file URL is invalid."); }
  const origins = new Set(["https://ucarecdn.com"]);
  const configured = process.env.NEXT_PUBLIC_BASE_CREATE_USER_CONTENT_URL;
  if (configured) {
    try { origins.add(new URL(configured).origin); } catch { /* Invalid config does not widen access. */ }
  }
  if (url.protocol !== "https:" || url.username || url.password || !origins.has(url.origin)) {
    throw new EndpointError("Please upload the file through the app instead of using an external URL.");
  }
  return url.href;
}

export async function downloadMedia(url) {
  const response = await fetch(validateMediaUrl(url), {
    redirect: "error", signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new EndpointError("The uploaded file could not be downloaded. Please upload it again.", 400);
  return {
    bytes: await readBoundedBody(response, MAX_MEDIA_BYTES),
    type: (response.headers.get("content-type") || "").split(";")[0].toLowerCase(),
  };
}

function audioFile(bytes, type) {
  const mime = type.split(";")[0].toLowerCase();
  const extension = AUDIO_TYPES.get(mime);
  if (!extension) throw new EndpointError("Please use a supported audio recording.", 415);
  if (!bytes.byteLength) throw new EndpointError("The audio recording is empty.");
  return new File([bytes], `audio.${extension}`, { type: mime });
}

export async function getAuthorizedAudio(request, user) {
  const input = await readMediaRequest(request);
  if (input.file) {
    const result = audioFile(await input.file.arrayBuffer(), input.file.type);
    await reserveMediaUsage(user);
    return result;
  }
  if (!input.json?.audioUrl) throw new EndpointError("No audio URL or audio file provided.");
  const url = validateMediaUrl(input.json.audioUrl);
  await reserveMediaUsage(user);
  const { bytes, type } = await downloadMedia(url);
  return audioFile(bytes, type);
}

const UPLOAD_TYPES = new Set([
  ...AUDIO_TYPES.keys(), "image/jpeg", "image/png", "image/gif", "image/webp",
  "application/pdf", "text/plain", "text/csv", "application/msword",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

function validateUpload(bytes, type) {
  if (!bytes.byteLength) throw new EndpointError("No file provided.");
  if (bytes.byteLength > MAX_MEDIA_BYTES) throw new EndpointError("Files must be 4 MB or smaller.", 413);
  const mime = (type || "").split(";")[0].toLowerCase();
  if (mime && mime !== "application/octet-stream") {
    if (!UPLOAD_TYPES.has(mime)) throw new EndpointError("This file type is not supported.", 415);
  } else {
    // Raw mobile/buffer uploads have no MIME type. Require a recognizable
    // image, document, or audio container rather than accepting HTML/scripts.
    const header = Buffer.from(bytes).subarray(0, 16);
    const text = header.toString("latin1");
    if (!/^(%PDF-|PK\x03\x04|\xff\xd8\xff|\x89PNG\r\n\x1a\n|GIF8|RIFF|OggS|ID3|fLaC|\x1a\x45\xdf\xa3|\xd0\xcf\x11\xe0)/.test(text) &&
        text.slice(4, 8) !== "ftyp" && !(header[0] === 0xff && (header[1] & 0xe0) === 0xe0)) {
      throw new EndpointError("Please select a supported file with its file type.", 415);
    }
  }
  return Buffer.from(bytes);
}

export async function getAuthorizedUpload(request, user) {
  const input = await readMediaRequest(request);
  if (input.json?.url) {
    const url = validateMediaUrl(input.json.url);
    await reserveMediaUsage(user);
    const remote = await downloadMedia(url);
    return validateUpload(remote.bytes, remote.type);
  }
  let bytes = input.bytes;
  let type = request.headers.get("content-type");
  if (input.file) {
    bytes = await input.file.arrayBuffer();
    type = input.file.type;
  } else if (input.json) {
    const value = input.json.base64;
    if (typeof value !== "string") throw new EndpointError("Provide a file, URL, or base64 upload.");
    const dataUrl = value.match(/^data:([^;,]+);base64,(.*)$/s);
    const encoded = dataUrl ? dataUrl[2] : value;
    if (encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
      throw new EndpointError("The base64 file is invalid.");
    }
    bytes = Buffer.from(encoded, "base64");
    type = dataUrl?.[1] || "";
  }
  const buffer = validateUpload(bytes || new Uint8Array(), type);
  await reserveMediaUsage(user);
  return buffer;
}
