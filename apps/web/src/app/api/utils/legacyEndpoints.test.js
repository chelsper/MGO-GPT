// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { authMock, sqlMock } = vi.hoisted(() => ({ authMock: vi.fn(), sqlMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/app/api/utils/sql", () => ({ default: sqlMock }));
import { GET as allExport } from "../submissions/export-csv/route";
import { GET as personalExport } from "../submissions/export-my-csv/route";
import { GET as diagnostics } from "../admin/runtime-diagnostics/route";
import { POST as transcribe } from "../transcribe/route";
import { POST as constituent } from "../transcribe-constituent/route";
import { POST as opportunity } from "../transcribe-opportunity/route";
import { POST as upload } from "../upload/route";
import { POST as card } from "../read-business-card/route";
import { retiredIntegrationProxy } from "../../../../__create/retired-integration-proxy";
import { escapeCsvField } from "./submissionCsv";
import { readBoundedBody, validateMediaUrl } from "./legacyMediaInput";

const routes = [
  ["all export", allExport, "GET"], ["personal export", personalExport, "GET"],
  ["diagnostics", diagnostics, "GET"], ["transcription", transcribe, "POST"],
  ["constituent transcription", constituent, "POST"], ["opportunity transcription", opportunity, "POST"],
  ["upload", upload, "POST"], ["business card", card, "POST"],
];
const media = routes.filter(([, , method]) => method === "POST");
const transcribers = [transcribe, constituent, opportunity];
let actor, submissions, budgetAllowed, fetchMock;
function request(method = "POST", body = {}, headers = {}) {
  return new Request("https://app.example/api/feature?userId=1", {
    method,
    headers: { ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
      Cookie: "workspace_acting_user_id=1", ...headers },
    ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
  });
}
function fileRequest(type = "audio/webm", bytes = "fictional recording") {
  const form = new FormData();
  form.append("file", new File([bytes], "recording", { type }));
  return new Request("https://app.example/api/feature", { method: "POST", body: form });
}
function providerJson(value, status = 200) { return Response.json(value, { status }); }

beforeEach(() => {
  actor = { id: 47, active: true, role: "mgo" };
  submissions = [];
  budgetAllowed = true;
  authMock.mockReset().mockResolvedValue({ user: { email: "real@example.com", id: "1", role: "admin" } });
  sqlMock.mockReset().mockImplementation(async (parts) => {
    const query = parts.join("?");
    if (query.includes("FROM users")) return actor ? [actor] : [];
    if (query.includes("FROM submissions")) return submissions;
    if (query.includes("INSERT INTO report_snapshots_cache")) return budgetAllowed ? [{ report_key: "usage" }] : [];
    throw new Error("Unexpected SQL");
  });
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe.each(routes)("%s authorization", (_name, handler, method) => {
  it("denies signed-out access before database or provider use", async () => {
    authMock.mockResolvedValue(null);
    const req = request(method);
    const response = await handler(req);
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(req.bodyUsed).toBe(false);
    expect(sqlMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([false, null, undefined])("denies active=%s before reading private data or processing input", async (active) => {
    actor.active = active;
    const req = request(method);
    const response = await handler(req);
    expect(response.status).toBe(403);
    expect(req.bodyUsed).toBe(false);
    expect(sqlMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("does not provision an unknown signed-in user", async () => {
    actor = null;
    expect((await handler(request(method))).status).toBe(403);
    expect(sqlMock).toHaveBeenCalledTimes(1);
  });
  it("fails closed without leaking database errors", async () => {
    sqlMock.mockRejectedValue(new Error("SECRET database credential"));
    const response = await handler(request(method));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("SECRET");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("CSV ownership and role boundary", () => {
  it("uses the real database owner, not session IDs, query IDs, or acting cookies", async () => {
    const response = await personalExport(request("GET"));
    expect(response.status).toBe(200);
    expect(sqlMock.mock.calls[0].slice(1)).toEqual(["real@example.com"]);
    expect(sqlMock.mock.calls[1][0].join(" ")).toContain("WHERE s.user_id");
    expect(sqlMock.mock.calls[1].slice(1)).toEqual([47]);
    expect(response.headers.get("content-type")).toContain("text/csv");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it.each(["mgo", "executive", "unknown"])("denies all-export to %s despite a forged session role", async (role) => {
    actor.role = role;
    expect((await allExport(request("GET"))).status).toBe(403);
    expect(sqlMock).toHaveBeenCalledTimes(1);
  });
  it.each(["admin", "reviewer", "advancement_services", "mgo,admin"])("permits all-export for %s", async (role) => {
    actor.role = role;
    expect((await allExport(request("GET"))).status).toBe(200);
    expect(sqlMock.mock.calls[1][0].join(" ")).not.toContain("WHERE s.user_id");
  });
  it("escapes notes once and protects spreadsheet formulas", async () => {
    submissions = [{ id: 1, notes: 'He said "hello", then left', transcript: "=HYPERLINK(\"https://invalid\")" }];
    const output = await (await personalExport(request("GET"))).text();
    expect(output).toContain('"He said ""hello"", then left"');
    expect(output).toContain(`"'=HYPERLINK(""https://invalid"")"`);
  });
  it.each(["=SUM(1)", "+1", "-1", "@formula", "\t=1", " \r=1"])("keeps %j literal", (value) => {
    expect(escapeCsvField(value).replace(/^"/, "")).toMatch(/^'/);
  });
  it("allows only actual Admins to read diagnostics", async () => {
    expect((await diagnostics(request("GET"))).status).toBe(403);
    actor.role = "admin";
    expect((await diagnostics(request("GET"))).status).toBe(200);
  });
});

describe.each(media)("%s mutation boundary", (_name, handler) => {
  it.each([{ Origin: "https://evil.example" }, { Origin: "null" }, { "Sec-Fetch-Site": "cross-site" }])(
    "rejects explicit cross-site commands", async (headers) => {
      const req = request("POST", {}, headers);
      expect((await handler(req)).status).toBe(403);
      expect(req.bodyUsed).toBe(false);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
  it("validates input without consuming provider budget", async () => {
    expect((await handler(request("POST", {}, { Origin: "https://app.example" }))).status).toBe(400);
    expect(sqlMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe.each(transcribers)("transcription safeguards", (handler) => {
  it("supports direct audio and preserves structured output", async () => {
    fetchMock.mockResolvedValueOnce(providerJson({ text: "Fictional donor visit" }))
      .mockResolvedValueOnce(providerJson({ choices: [{ message: { content: '{"donorName":"Fictional"}' } }] }));
    const response = await handler(fileRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, transcript: "Fictional donor visit", extractedFields: { donorName: "Fictional" } });
    expect(sqlMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/integrations/transcribe-audio/whisperv3",
      expect.objectContaining({ method: "POST", signal: expect.any(AbortSignal), body: expect.any(FormData) }));
  });
  it("accepts a trusted legacy audio URL without following redirects", async () => {
    fetchMock.mockResolvedValueOnce(new Response("recording", { headers: { "Content-Type": "audio/mp4" } }))
      .mockResolvedValueOnce(providerJson({ text: "" }));
    expect((await handler(request("POST", { audioUrl: "https://ucarecdn.com/example/" }))).status).toBe(200);
    expect(fetchMock).toHaveBeenNthCalledWith(1, "https://ucarecdn.com/example/", expect.objectContaining({ redirect: "error", signal: expect.any(AbortSignal) }));
  });
  it("rejects private/external URLs before fetching", async () => {
    expect((await handler(request("POST", { audioUrl: "http://169.254.169.254/metadata" }))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("rejects non-audio files", async () => {
    expect((await handler(fileRequest("text/html"))).status).toBe(415);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("bounds remote content even when the URL is trusted", async () => {
    fetchMock.mockResolvedValueOnce(new Response("recording", {
      headers: { "Content-Type": "audio/mp4", "Content-Length": "99999999" },
    }));
    expect((await handler(request("POST", { audioUrl: "https://ucarecdn.com/example/" }))).status).toBe(413);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("fails closed if the durable budget cannot be checked", async () => {
    sqlMock.mockResolvedValueOnce([actor]).mockRejectedValueOnce(new Error("PRIVATE DATABASE DETAIL"));
    const response = await handler(fileRequest());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("PRIVATE");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("honors shared throttling before calling a provider", async () => {
    budgetAllowed = false;
    const response = await handler(fileRequest());
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("600");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("keeps a successful transcript when extraction fails", async () => {
    fetchMock.mockResolvedValueOnce(providerJson({ text: "Keep this transcript" }))
      .mockResolvedValueOnce(new Response("SECRET", { status: 500 }));
    expect(await (await handler(fileRequest())).json()).toEqual({ transcript: "Keep this transcript", extractedFields: null, success: true });
  });
  it("does not expose provider response bodies", async () => {
    fetchMock.mockResolvedValueOnce(new Response("SECRET", { status: 400 }));
    const response = await handler(fileRequest());
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("SECRET");
  });
});

describe("bounded media and retired proxy", () => {
  it.each(["http://ucarecdn.com/a", "https://ucarecdn.com.evil.example/a", "https://evil.example@ucarecdn.com/a",
    "https://ucarecdn.com:444/a", "http://127.0.0.1", "file:///etc/passwd", "https://[::1]/"])("rejects %s", (url) => {
    expect(() => validateMediaUrl(url)).toThrow();
  });
  it("permits only the explicitly configured CDN origin, not a suffix match", () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_CREATE_USER_CONTENT_URL", "https://uploads.example.com/files");
    expect(validateMediaUrl("https://uploads.example.com/a")).toBe("https://uploads.example.com/a");
    expect(() => validateMediaUrl("https://uploads.example.com.evil/a")).toThrow();
  });
  it("stops a chunked download that exceeds the limit without a content-length", async () => {
    const canceled = vi.fn();
    let index = 0;
    const stream = new ReadableStream({
      pull(controller) { controller.enqueue(new Uint8Array(3)); index += 1; if (index > 4) controller.close(); },
      cancel: canceled,
    });
    await expect(readBoundedBody(new Response(stream), 4)).rejects.toMatchObject({ status: 413 });
    expect(canceled).toHaveBeenCalled();
  });
  it("rejects an oversized request before reading its body", async () => {
    const req = request("POST", {}, { "Content-Length": "99999999" });
    expect((await upload(req)).status).toBe(413);
    expect(req.bodyUsed).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("uploads an authorized file as bounded bytes rather than forwarding an arbitrary URL", async () => {
    fetchMock.mockResolvedValue(providerJson({ url: "https://ucarecdn.com/example/", mimeType: "image/png" }));
    const response = await upload(fileRequest("image/png", "fictional PNG"));
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith("https://create.xyz/api/v0/upload",
      expect.objectContaining({ body: expect.any(Buffer), signal: expect.any(AbortSignal) }));
  });
  it("supports base64 images and recognizable raw audio", async () => {
    fetchMock.mockImplementation(async () => providerJson({ url: "https://ucarecdn.com/example/" }));
    expect((await upload(request("POST", { base64: "data:image/png;base64,ZmFrZQ==" }))).status).toBe(200);
    expect((await upload(new Request("https://app.example/api/upload", { method: "POST", body: "RIFFrecording", headers: { "Content-Type": "application/octet-stream" } }))).status).toBe(200);
  });
  it("accepts a normal-sized base64 image without regex recursion limits", async () => {
    fetchMock.mockResolvedValue(providerJson({ url: "https://ucarecdn.com/example/" }));
    const base64 = `data:image/png;base64,${Buffer.alloc(1024 * 1024).toString("base64")}`;
    expect((await upload(request("POST", { base64 }))).status).toBe(200);
  });
  it("does not upload arbitrary URLs or unsupported file types", async () => {
    expect((await upload(request("POST", { url: "https://private.example" }))).status).toBe(400);
    expect((await upload(fileRequest("text/html"))).status).toBe(415);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("throttles uploads and cards before provider use", async () => {
    budgetAllowed = false;
    expect((await upload(fileRequest("image/png"))).status).toBe(429);
    expect((await card(request("POST", { imageDataUrl: "data:image/png;base64,ZmFrZQ==" }))).status).toBe(429);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("never proxies a direct integration request", async () => {
    const response = retiredIntegrationProxy();
    expect(response.status).toBe(410);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
