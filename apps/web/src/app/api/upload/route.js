import upload from "@/app/api/utils/upload";

export const runtime = "nodejs";

async function readRequestBuffer(request) {
  const arrayBuffer = await request.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function POST(request) {
  try {
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");

      if (!(file instanceof File)) {
        return Response.json({ error: "No file provided" }, { status: 400 });
      }

      const arrayBuffer = await file.arrayBuffer();
      const result = await upload({ buffer: Buffer.from(arrayBuffer) });
      return Response.json(result);
    }

    if (contentType.includes("application/json")) {
      const body = await request.json();
      const { url, base64 } = body || {};

      if (!url && !base64) {
        return Response.json(
          { error: "Either url or base64 is required" },
          { status: 400 },
        );
      }

      const result = await upload({ url, base64 });
      return Response.json(result);
    }

    const buffer = await readRequestBuffer(request);
    if (!buffer.length) {
      return Response.json({ error: "No upload body provided" }, { status: 400 });
    }

    const result = await upload({ buffer });
    return Response.json(result);
  } catch (error) {
    console.error("Upload route error:", error);
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to upload file",
      },
      { status: 500 },
    );
  }
}
