import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();

vi.mock("@/auth", () => ({ auth: authMock }));

function makeRequest(body) {
  return new Request("https://example.com/api/read-business-card", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("business card reader route", () => {
  beforeEach(() => {
    authMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("requires an authenticated user before calling the AI integration", async () => {
    authMock.mockResolvedValue(null);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { POST } = await import("./route.js");

    const response = await POST(
      makeRequest({ imageDataUrl: "data:image/jpeg;base64,ZmFrZQ==" }),
    );

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a non-image payload without calling the AI integration", async () => {
    authMock.mockResolvedValue({ user: { email: "mgo@example.com" } });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { POST } = await import("./route.js");

    const response = await POST(
      makeRequest({ imageDataUrl: "data:text/plain;base64,ZmFrZQ==" }),
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toContain("JPEG, PNG, or WebP");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns structured fields extracted by the AI integration", async () => {
    authMock.mockResolvedValue({ user: { email: "mgo@example.com" } });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  name: "Ada Lovelace",
                  organization: "Analytical Engines",
                  email: "ada@example.com",
                  phone: "555-0100",
                  notes: "Founder",
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { POST } = await import("./route.js");

    const response = await POST(
      makeRequest({ imageDataUrl: "data:image/jpeg;base64,ZmFrZQ==" }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/integrations/chat-gpt/conversationgpt4",
      expect.objectContaining({ method: "POST" }),
    );
    expect(payload.extractedFields).toMatchObject({
      name: "Ada Lovelace",
      email: "ada@example.com",
    });
  });
});
