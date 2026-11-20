import { beforeEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  create: vi.fn(),
  fundraisers: vi.fn(),
}));
vi.mock("./blackbaud", async (original) => ({
  ...(await original()),
  blackbaudApiFetch: mocks.api,
}));
vi.mock("./nxtCreateReceipt", async (original) => ({
  ...(await original()),
  guardedNxtCreate: mocks.create,
}));
vi.mock("./actionFundraisers", () => ({
  resolveActionFundraiserIds: mocks.fundraisers,
}));
import {
  outreachActionPayload,
  outreachActionMatches,
  submitOutreachAction,
} from "./projectOutreachActions";
import { result, ids, report } from "../../../../test/fixtures/projectOutreach";
let event, store, payload;
const context = {
  user: { id: 8, name: "Fictional Caller" },
  origin: "https://app.test",
};
beforeEach(() => {
  vi.clearAllMocks();
  event = {
    id: ids.event,
    constituent_id: "123",
    actor_id: 8,
    state: "draft",
    result: {
      ...result,
      interactionType: "Solicitation",
      projectTitle: report.title,
    },
  };
  payload = outreachActionPayload(event, context.user, ["88"]);
  store = {
    event: vi.fn(async () => event),
    claim: vi.fn(async () => {}),
    checkpoint: vi.fn(async () => {}),
    hold: vi.fn(async () => {}),
    confirm: vi.fn(async () => {}),
    unclaimUnsent: vi.fn(async () => {}),
    receipt: vi.fn(async () => ({ id: 91, remote_id: "909" })),
  };
  mocks.fundraisers.mockResolvedValue(["88"]);
  mocks.create.mockImplementation(async (options) => {
    const receipt = { id: 91, remote_id: null };
    options.onReceipt(receipt);
    await options.create();
    options.onReceipt({ ...receipt, remote_id: "909" });
    return { id: "909" };
  });
  mocks.api.mockImplementation(async (path, options) =>
    path.includes("/constituents/")
      ? { id: "123" }
      : options.method === "GET"
        ? { ...payload, id: "909" }
        : { id: "909" },
  );
});
describe("outreach action safety", () => {
  it("builds a completed call attributed to its author with a unique project reference", () => {
    expect(payload).toMatchObject({
      constituent_id: "123",
      category: "Phone Call",
      completed: true,
      direction: "Outbound",
      type: "Solicitation",
      fundraisers: ["88"],
    });
    expect(payload.description).toContain(`JU-PO-${ids.event}`);
    expect(
      outreachActionPayload(
        { ...event, result: { ...event.result, outcome: "contact_issue" } },
        context.user,
        ["88"],
      ).category,
    ).toBe("Task/Other");
    expect(
      outreachActionPayload(
        { ...event, result: { ...event.result, nextDate: "2026-12-01" } },
        context.user,
        ["88"],
      ).description,
    ).toContain("No separate planned NXT action");
  });
  it("requires exact identity, date, notes, type and fundraiser when verifying", () => {
    expect(
      outreachActionMatches({ ...payload, id: "909" }, payload, "909"),
    ).toBe(true);
    for (const patch of [
      { id: "910" },
      { constituent_id: "456" },
      { completed: false },
      { type: "Other" },
      { date: "2026-11-21" },
      { description: "changed" },
      { fundraisers: ["99"] },
      { summary: "Changed" },
      { category: "Email" },
    ])
      expect(
        outreachActionMatches(
          { ...payload, id: "909", ...patch },
          payload,
          "909",
        ),
      ).toBe(false);
  });
  it("claims before creating, uses no write retries, checkpoints and confirms every field", async () => {
    expect(await submitOutreachAction(context, store, event.id)).toEqual({
      state: "confirmed",
      actionId: "909",
    });
    expect(store.claim).toHaveBeenCalledWith(context, event, payload);
    expect(store.claim.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.create.mock.invocationCallOrder[0],
    );
    expect(mocks.api.mock.calls.map(([, o]) => o.method)).toEqual([
      "GET",
      "POST",
      "GET",
      "PATCH",
      "GET",
    ]);
    expect(
      mocks.api.mock.calls.find(([, o]) => o.method === "POST")[1].body,
    ).not.toHaveProperty("type");
    expect(
      mocks.api.mock.calls.find(([, o]) => o.method === "PATCH")[1].body.type,
    ).toBe("Solicitation");
    for (const [, options] of mocks.api.mock.calls)
      expect(options).toMatchObject({
        userId: 8,
        authUserId: 8,
        maxRetries: 0,
      });
    expect(store.confirm).toHaveBeenCalledWith(
      context,
      expect.objectContaining({ payload }),
      "909",
      { id: 91, remote_id: "909" },
    );
  });
  it("never submits when profile identity or fundraiser verification fails", async () => {
    mocks.api.mockResolvedValueOnce({ id: "456" });
    await expect(
      submitOutreachAction(context, store, event.id),
    ).rejects.toThrow(/no action/);
    expect(store.claim).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
    mocks.fundraisers.mockRejectedValueOnce(new Error("not connected"));
    await expect(
      submitOutreachAction(context, store, event.id),
    ).rejects.toThrow();
    expect(store.claim).not.toHaveBeenCalled();
  });
  it.each(["create", "patch", "verify"])(
    "holds an uncertain %s without resending",
    async (failure) => {
      if (failure === "create")
        mocks.create.mockImplementationOnce(async (options) => {
          options.onReceipt({ id: 91 });
          throw new Error("timeout");
        });
      else {
        let reads = 0;
        mocks.api.mockImplementation(async (path, options) => {
          if (path.includes("/constituents/")) return { id: "123" };
          if (failure === "patch" && options.method === "PATCH")
            throw new Error("timeout");
          if (options.method === "GET" && ++reads === 2)
            return { ...payload, id: "909", description: "wrong" };
          return { ...payload, id: "909" };
        });
      }
      expect((await submitOutreachAction(context, store, event.id)).state).toBe(
        "review",
      );
      expect(store.hold).toHaveBeenCalledWith(event.id);
      expect(store.confirm).not.toHaveBeenCalled();
    },
  );
  it.each(["processing", "review", "confirmed"])(
    "does not create again for a %s outcome",
    async (state) => {
      event.state = state;
      await submitOutreachAction(context, store, event.id);
      expect(mocks.api).not.toHaveBeenCalled();
      expect(mocks.create).not.toHaveBeenCalled();
    },
  );
  it("recovers using only GET and saved receipt; mismatches cannot clear protection", async () => {
    event = { ...event, state: "review", payload };
    await submitOutreachAction(context, store, event.id, { verify: true });
    expect(mocks.api.mock.calls.map(([, o]) => o.method)).toEqual(["GET"]);
    expect(mocks.create).not.toHaveBeenCalled();
    mocks.api.mockResolvedValueOnce({
      ...payload,
      id: "909",
      description: "Changed",
    });
    await expect(
      submitOutreachAction(context, store, event.id, { verify: true }),
    ).rejects.toThrow(/does not match/);
    await expect(
      submitOutreachAction(context, store, event.id, {
        verify: true,
        actionId: "999",
      }),
    ).rejects.toThrow(/existing action/);
  });
  it("requires a durable receipt and refuses to verify a still-running submission", async () => {
    event = {
      ...event,
      state: "processing",
      payload,
      updated_at: new Date().toISOString(),
    };
    await expect(
      submitOutreachAction(context, store, event.id, { verify: true }),
    ).rejects.toThrow(/still be running/);
    event.state = "review";
    store.receipt.mockResolvedValue(null);
    await expect(
      submitOutreachAction(context, store, event.id, { verify: true }),
    ).rejects.toThrow(/No durable/);
    expect(mocks.api).not.toHaveBeenCalled();
  });
  it("reopens only a proven unsent outcome blocked by an unrelated receipt", async () => {
    mocks.create.mockRejectedValueOnce(
      Object.assign(new Error("guard refused"), {
        writeReceipt: { id: 92, payload: { description: "different" } },
      }),
    );
    expect((await submitOutreachAction(context, store, event.id)).state).toBe(
      "draft",
    );
    expect(store.unclaimUnsent).toHaveBeenCalled();
    expect(mocks.api.mock.calls.map(([, o]) => o.method)).toEqual(["GET"]);
  });
});
