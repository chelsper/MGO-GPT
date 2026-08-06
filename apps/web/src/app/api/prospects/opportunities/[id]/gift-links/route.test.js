import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const ensureAppSchemaMock = vi.fn();
const getWorkspaceUserMock = vi.fn();

const sqlQueue = [];
function queueSqlResult(value) {
  sqlQueue.push(value);
}
const sqlMockImpl = vi.fn(async () => sqlQueue.shift() ?? []);
function sqlTag(strings, ...values) {
  return sqlMockImpl(strings, ...values);
}

vi.mock("@/auth", () => ({
  auth: authMock,
}));

vi.mock("@/app/api/utils/ensureAppSchema", () => ({
  default: ensureAppSchemaMock,
}));

vi.mock("@/app/api/utils/getWorkspaceUser", () => ({
  default: getWorkspaceUserMock,
}));

vi.mock("@/app/api/utils/sql", () => ({
  default: sqlTag,
}));

describe("opportunity gift links route", () => {
  beforeEach(() => {
    sqlQueue.length = 0;
    sqlMockImpl.mockClear();
    authMock.mockReset();
    ensureAppSchemaMock.mockReset();
    getWorkspaceUserMock.mockReset();

    authMock.mockResolvedValue({ user: { email: "mgo@example.com" } });
    ensureAppSchemaMock.mockResolvedValue();
    getWorkspaceUserMock.mockResolvedValue({
      workspaceUser: {
        id: 44,
        name: "Leslie M. Redd",
        email: "lredd@example.com",
        role: "mgo",
      },
      sessionUser: {
        id: 44,
        name: "Leslie M. Redd",
        email: "lredd@example.com",
        role: "mgo",
      },
      isActing: false,
    });
  });

  it("saves selected gifts locally and marks NXT gift linking as manual review", async () => {
    const { POST } = await import("./route.js");

    queueSqlResult([
      {
        id: 301,
        prospect_id: 7,
        blackbaud_opportunity_id: "bb-opp-1",
        constituent_id: 88,
        user_id: 44,
      },
    ]);
    queueSqlResult([]);
    queueSqlResult([
      {
        id: 1,
        prospect_opportunity_id: 301,
        blackbaud_opportunity_id: "bb-opp-1",
        constituent_id: 88,
        blackbaud_gift_id: "gift-1",
        gift_date: "2026-07-20",
        gift_amount: "125.50",
        gift_type: "Donation",
        gift_fund: "Scholarship",
        applied_amount: "125.50",
        nxt_sync_state: "manual_required",
      },
    ]);

    const request = new Request("https://example.com/api/prospects/opportunities/301/gift-links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gifts: [
          {
            id: "gift-1",
            date: "2026-07-20",
            amount: 125.5,
            type: "Donation",
            fund: "Scholarship",
          },
        ],
      }),
    });

    const response = await POST(request, { params: { id: "301" } });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.nxtSync.state).toBe("manual_required");
    expect(payload.giftLinks).toHaveLength(1);
    expect(payload.giftLinks[0].blackbaud_gift_id).toBe("gift-1");

    const insertCall = sqlMockImpl.mock.calls.find(([strings]) =>
      strings.join("").includes("INSERT INTO prospect_opportunity_gift_links"),
    );
    expect(insertCall).toBeTruthy();
    expect(insertCall.slice(1)).toEqual(
      expect.arrayContaining([
        301,
        "bb-opp-1",
        88,
        "gift-1",
        "2026-07-20",
        125.5,
        "Donation",
        "Scholarship",
        44,
      ]),
    );
  });

  it("rejects requests without selected gifts", async () => {
    const { POST } = await import("./route.js");

    const request = new Request("https://example.com/api/prospects/opportunities/301/gift-links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gifts: [] }),
    });

    const response = await POST(request, { params: { id: "301" } });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toMatch(/select at least one gift/i);
    expect(sqlMockImpl).not.toHaveBeenCalled();
  });

  it("saves multiple selected gifts for one opportunity", async () => {
    const { POST } = await import("./route.js");

    queueSqlResult([
      {
        id: 301,
        prospect_id: 7,
        blackbaud_opportunity_id: "bb-opp-1",
        constituent_id: 88,
        user_id: 44,
      },
    ]);
    queueSqlResult([]);
    queueSqlResult([]);
    queueSqlResult([
      {
        id: 1,
        prospect_opportunity_id: 301,
        blackbaud_gift_id: "gift-1",
        gift_amount: "125.50",
        nxt_sync_state: "manual_required",
      },
      {
        id: 2,
        prospect_opportunity_id: 301,
        blackbaud_gift_id: "gift-2",
        gift_amount: "875.00",
        nxt_sync_state: "manual_required",
      },
    ]);

    const request = new Request("https://example.com/api/prospects/opportunities/301/gift-links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gifts: [
          {
            id: "gift-1",
            date: "2026-07-20",
            amount: 125.5,
            type: "Donation",
            fund: "Scholarship",
          },
          {
            id: "gift-2",
            date: "2026-07-21",
            amount: 875,
            type: "Donation",
            fund: "Annual Fund",
          },
        ],
      }),
    });

    const response = await POST(request, { params: { id: "301" } });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.giftLinks).toHaveLength(2);

    const insertCalls = sqlMockImpl.mock.calls.filter(([strings]) =>
      strings.join("").includes("INSERT INTO prospect_opportunity_gift_links"),
    );
    expect(insertCalls).toHaveLength(2);
    expect(insertCalls[0].slice(1)).toContain("gift-1");
    expect(insertCalls[1].slice(1)).toContain("gift-2");
  });

  it("unlinks a selected gift from an opportunity", async () => {
    const { DELETE } = await import("./route.js");

    queueSqlResult([{ id: 301 }]);
    queueSqlResult([{ id: 9 }]);
    queueSqlResult([
      {
        id: 10,
        prospect_opportunity_id: 301,
        blackbaud_gift_id: "gift-2",
        gift_amount: "875.00",
        nxt_sync_state: "manual_required",
      },
    ]);

    const request = new Request("https://example.com/api/prospects/opportunities/301/gift-links", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ giftLinkId: 9 }),
    });

    const response = await DELETE(request, { params: { id: "301" } });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.giftLinks).toHaveLength(1);
    expect(payload.message).toMatch(/unlinked in jumgogpt/i);

    const deleteCall = sqlMockImpl.mock.calls.find(([strings]) =>
      strings.join("").includes("DELETE FROM prospect_opportunity_gift_links"),
    );
    expect(deleteCall).toBeTruthy();
    expect(deleteCall.slice(1)).toEqual(expect.arrayContaining([9, 301]));
  });
});
