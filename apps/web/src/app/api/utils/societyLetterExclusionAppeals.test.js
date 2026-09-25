import { describe, expect, it, vi } from "vitest";
vi.mock("./blackbaud", () => ({
  blackbaudApiFetch: vi.fn(),
  isBlackbaudQuotaExceededError: () => false,
}));
import {
  exclusionAppealClient,
  exclusionAppealWorkspace,
  prepareExclusionAppeal,
  saveExclusionAppealPolicy,
  syncExclusionAppeal,
  verifyExclusionRemoval,
} from "./societyLetterExclusionAppeals";
import {
  updateLetterExclusion,
  letterSourceSignature,
} from "./societyLetterWorkflow";
import { letterPeriod } from "@/utils/societyLetters";

const today = "2026-09-25";
const ctx = { user: { id: 2 }, origin: "https://example.org" };
const definitions = [
  {
    key: "presidents",
    name: "President's Society",
    active: true,
    basis: "annual",
    displayOrder: 1,
  },
  {
    key: "ood",
    name: "Order of the Dolphin",
    active: true,
    basis: "annual",
    displayOrder: 2,
  },
];
const catalog = [
  {
    id: "772",
    lookup_id: "CY26OODEX-MGO",
    description: "CY 2026 OOD Letter Excluded - MGOGPT",
    inactive: false,
  },
  {
    id: "773",
    lookup_id: "CY26PRESSOCEX-MGO",
    description: "CY 2026 Pres Society Letter Excluded - MGO GPT",
    inactive: false,
  },
];
const policyBody = {
  confirm: true,
  appeals: {
    ood: {
      lookupId: catalog[0].lookup_id,
      description: catalog[0].description,
    },
    presidents: {
      lookupId: catalog[1].lookup_id,
      description: catalog[1].description,
    },
  },
};

async function setup(single = false) {
  const settings = {
    sourceMode: "society_queries",
    societyKeys: ["ood", "presidents"],
    periodBasis: "calendar_year",
  };
  const period = letterPeriod(settings, today);
  const row = {
    householdId: "10",
    name: "Alex and Pat Example",
    members: single ? ["10"] : ["10", "11"],
    period,
    societyKey: "presidents",
    societyName: "President's Society",
    rank: 0,
    qualifiedKeys: ["ood", "presidents"],
    memberNames: [
      { constituentId: "10", firstName: "Alex", lastName: "Example" },
      { constituentId: "11", firstName: "Pat", lastName: "Example" },
    ],
  };
  const state = {
    revision: 1,
    settings,
    readiness: {},
    history: [],
    exclusions: [],
    templates: {},
    job: { status: "complete" },
  };
  state.snapshot = {
    sources: definitions.map((d) => ({ societyKey: d.key })),
    period,
    rows: [row],
    signature: letterSourceSignature(state, definitions),
    generatedAt: new Date().toISOString(),
  };
  const saved = [];
  const store = {
    save: vi.fn(async () => {
      saved.push(structuredClone(state));
      state.revision++;
    }),
  };
  const assigned = { 10: [], 11: [] };
  const client = {
    catalog: vi.fn(async () => structuredClone(catalog)),
    profile: vi.fn(async (id) => ({
      id,
      type: "Individual",
      first: id === "10" ? "Alex" : "Pat",
      last: "Example",
      ...(!single ? { spouse: { id: id === "10" ? "11" : "10" } } : {}),
    })),
    appeals: vi.fn(async (id) => structuredClone(assigned[id])),
    create: vi.fn(async (id, appeal, date, comments) => {
      const entry = {
        id: String(1000 + Number(id)),
        constituent_id: id,
        appeal: { id: appeal.id },
        date: `${date}T00:00:00`,
        comments,
      };
      assigned[id].push(entry);
      return { id: entry.id };
    }),
  };
  await saveExclusionAppealPolicy(
    state,
    definitions,
    today,
    policyBody,
    store,
    ctx,
    client,
  );
  const body = {
    action: "exclude_recipient",
    householdId: "10",
    reason: "Sending to associated individuals instead",
    exclusionDate: today,
    confirmNxt: true,
  };
  const nxt = prepareExclusionAppeal(state, definitions, today, body);
  const item = await updateLetterExclusion(
    state,
    definitions,
    today,
    body,
    store,
    ctx.user.id,
    nxt,
  );
  return { state, row, item, body, store, client, assigned, saved };
}

describe("society exclusion appeal policy", () => {
  it("resolves lookup codes to immutable IDs and selects the highest qualifying tier", async () => {
    const { state, item } = await setup();
    expect(exclusionAppealWorkspace(state, definitions, today).current).toBe(
      true,
    );
    expect(item.nxt.appeal.id).toBe("773");
    expect(item.nxt.comments).toBe("Sending to associated individuals instead");
    expect(item.exclusionDate).toBe(today);
    expect(state.history).toEqual([]);
  });
  it.each([
    "inactive",
    "ambiguous",
    "wrong-description",
    "wrong-code",
    "sent-appeal",
  ])("rejects %s mappings without saving", async (kind) => {
    const { state, store, client } = await setup();
    const next = structuredClone(catalog);
    const body = structuredClone(policyBody);
    if (kind === "inactive") next[0].inactive = true;
    if (kind === "ambiguous")
      next.push({ ...next[0], id: "999", lookup_id: "DUPLICATE" });
    if (kind === "wrong-description") body.appeals.ood.description += " typo";
    if (kind === "wrong-code") body.appeals.ood.lookupId = "missing";
    if (kind === "sent-appeal")
      state.readiness.policy = { appeals: { ood: { id: "772" } } };
    client.catalog.mockResolvedValue(next);
    store.save.mockClear();
    await expect(
      saveExclusionAppealPolicy(
        state,
        definitions,
        today,
        body,
        store,
        ctx,
        client,
      ),
    ).rejects.toThrow();
    expect(store.save).not.toHaveBeenCalled();
  });
  it.each([
    { exclusionDate: "2026-02-30" },
    { exclusionDate: "2026-09-26" },
    { reason: " " },
    { reason: "x".repeat(501) },
    { confirmNxt: false },
  ])("requires a confirmed date and reason: %j", async (change) => {
    const { state, body } = await setup();
    expect(() =>
      prepareExclusionAppeal(state, definitions, today, { ...body, ...change }),
    ).toThrow();
  });
  it("rejects stale period, hierarchy, membership and changed highest tier", async () => {
    const { state, body, row } = await setup();
    expect(() =>
      prepareExclusionAppeal(state, definitions, "2027-01-01", body),
    ).toThrow();
    row.societyKey = "ood";
    expect(() =>
      prepareExclusionAppeal(state, definitions, today, body),
    ).toThrow(/hierarchy/);
    row.societyKey = "presidents";
    state.snapshot.generatedAt = "2020-01-01";
    expect(() =>
      prepareExclusionAppeal(state, definitions, today, body),
    ).toThrow(/refresh/);
  });
});

describe("durable exclusion write-back", () => {
  it("writes and verifies each spouse once, with date and reason, never letter-sent history", async () => {
    const { state, item, store, client, saved } = await setup();
    await syncExclusionAppeal(state, item, store, ctx, client);
    expect(client.create).toHaveBeenCalledTimes(2);
    expect(client.create).toHaveBeenCalledWith(
      "10",
      item.nxt.appeal,
      today,
      item.reason,
    );
    expect(item.nxt.status).toBe("complete");
    expect(
      saved.some(
        (s) => s.exclusions[0]?.nxt?.members[0].status === "uncertain",
      ),
    ).toBe(true);
    await syncExclusionAppeal(state, item, store, ctx, client);
    expect(client.create).toHaveBeenCalledTimes(2);
    expect(state.history).toEqual([]);
  });
  it("supports individual and organization records without spouses", async () => {
    const { state, item, store, client } = await setup(true);
    client.profile.mockResolvedValue({ id: "10", type: "Organization" });
    await syncExclusionAppeal(state, item, store, ctx, client);
    expect(item.nxt.status).toBe("complete");
    expect(client.create).toHaveBeenCalledTimes(1);
  });
  it("preserves an existing appeal and its original comments/date", async () => {
    const { state, item, store, client, assigned } = await setup();
    assigned["10"] = [
      {
        id: "old",
        appeal: { id: "773" },
        date: "2026-01-01",
        comments: "Existing reason",
      },
    ];
    await syncExclusionAppeal(state, item, store, ctx, client);
    expect(item.nxt.members[0].status).toBe("existing");
    expect(client.create).toHaveBeenCalledTimes(1);
    expect(assigned["10"][0].comments).toBe("Existing reason");
  });
  it.each(["spouse", "name", "duplicate", "renamed-appeal", "permission"])(
    "holds before writes for %s",
    async (kind) => {
      const { state, item, store, client, assigned } = await setup();
      if (kind === "spouse")
        client.profile.mockResolvedValue({
          id: "10",
          type: "Individual",
          spouse: { id: "999" },
        });
      if (kind === "name")
        client.profile.mockResolvedValue({
          id: "10",
          type: "Individual",
          spouse: { id: "11" },
          first: "Changed",
        });
      if (kind === "duplicate")
        assigned["11"] = [
          { id: "a", appeal: { id: "773" } },
          { id: "b", appeal: { id: "773" } },
        ];
      if (kind === "renamed-appeal")
        client.catalog.mockResolvedValue([
          { ...catalog[1], description: "Different appeal" },
        ]);
      if (kind === "permission")
        client.appeals.mockRejectedValue(new Error("403"));
      await syncExclusionAppeal(state, item, store, ctx, client);
      expect(client.create).not.toHaveBeenCalled();
      expect(item.nxt.status).toBe("needs_review");
      expect(item.restoredAt).toBeUndefined();
    },
  );
  it("does not POST unless the uncertain marker was durably saved", async () => {
    const { state, item, store, client } = await setup();
    store.save.mockImplementation(async () => {
      throw new Error("lease expired");
    });
    await expect(
      syncExclusionAppeal(state, item, store, ctx, client),
    ).rejects.toThrow();
    expect(client.create).not.toHaveBeenCalled();
  });
  it("never resubmits a timed-out create when NXT still shows nothing", async () => {
    const { state, item, store, client } = await setup();
    client.create.mockRejectedValue(new Error("timeout"));
    await syncExclusionAppeal(state, item, store, ctx, client);
    expect(item.nxt.members[0].status).toBe("uncertain");
    await syncExclusionAppeal(state, item, store, ctx, client);
    expect(client.create).toHaveBeenCalledTimes(1);
    await expect(verifyExclusionRemoval(item, ctx, client)).rejects.toThrow(
      /uncertain/,
    );
  });
  it.each([403, 429])(
    "keeps a definitively rejected POST (%s) pending for explicit retry",
    async (httpStatus) => {
      const { state, item, store, client } = await setup(true);
      client.create.mockRejectedValueOnce(
        Object.assign(new Error("rejected"), { httpStatus }),
      );
      await syncExclusionAppeal(state, item, store, ctx, client);
      expect(item.nxt.members[0].status).toBe("pending");
      expect(item.nxt.message).toContain("rejected");
      await syncExclusionAppeal(state, item, store, ctx, client);
      expect(item.nxt.status).toBe("complete");
    },
  );
  it("reconciles an accepted but timed-out create before continuing the other spouse", async () => {
    const { state, item, store, client, assigned } = await setup();
    client.create.mockImplementationOnce(async (id, appeal, date, comments) => {
      assigned[id].push({
        id: "100",
        appeal: { id: appeal.id },
        date,
        comments,
      });
      throw new Error("response lost");
    });
    await syncExclusionAppeal(state, item, store, ctx, client);
    await syncExclusionAppeal(state, item, store, ctx, client, true);
    expect(item.nxt.members.map((m) => m.status)).toEqual([
      "verified",
      "pending",
    ]);
    expect(client.create).toHaveBeenCalledTimes(1);
    await syncExclusionAppeal(state, item, store, ctx, client);
    expect(client.create).toHaveBeenCalledTimes(2);
    expect(item.nxt.status).toBe("complete");
  });
  it("will not certify a mismatching date/comment or create a second appeal", async () => {
    const { state, item, store, client, assigned } = await setup(true);
    client.create.mockImplementation(async () => {
      assigned["10"].push({
        id: "100",
        appeal: { id: "773" },
        date: today,
        comments: "wrong",
      });
      return { id: "100" };
    });
    await syncExclusionAppeal(state, item, store, ctx, client);
    await syncExclusionAppeal(state, item, store, ctx, client);
    expect(item.nxt.status).toBe("needs_review");
    expect(client.create).toHaveBeenCalledTimes(1);
  });
  it("blocks restoring until the appeal is removed in NXT and verified absent", async () => {
    const { state, item, store, client, assigned } = await setup();
    await syncExclusionAppeal(state, item, store, ctx, client);
    await expect(verifyExclusionRemoval(item, ctx, client)).rejects.toThrow(
      /Remove/,
    );
    assigned["10"] = [];
    assigned["11"] = [];
    await expect(
      verifyExclusionRemoval(item, ctx, client),
    ).resolves.toBeUndefined();
  });
  it("does not recreate a confirmed appeal removed outside the app", async () => {
    const { state, item, store, client, assigned } = await setup(true);
    await syncExclusionAppeal(state, item, store, ctx, client);
    assigned["10"] = [];
    await syncExclusionAppeal(state, item, store, ctx, client);
    expect(client.create).toHaveBeenCalledTimes(1);
    expect(item.nxt.status).toBe("needs_review");
  });
});

describe("NXT exclusion client contract", () => {
  it("uses the documented Data Integration payload and disables POST retries", async () => {
    const fetcher = vi.fn().mockResolvedValue({ id: "44" });
    await exclusionAppealClient(ctx, fetcher).create(
      "10",
      { description: "Exclusion" },
      today,
      "Reason",
    );
    expect(fetcher).toHaveBeenCalledWith(
      "/nxt-data-integration/v1/re/constitappeals",
      expect.objectContaining({
        method: "POST",
        maxRetries: 0,
        timeoutMs: 5000,
        body: {
          constituent_id: 10,
          appeal_description: "Exclusion",
          appeal_date: today,
          comments: "Reason",
        },
      }),
    );
  });
  it.each([
    { count: 2, value: [] },
    { value: [] },
    { count: 0, value: [], next_link: "https://example.org" },
    {
      count: 1,
      value: [{ id: "1", constituent_id: "99", appeal: { id: "773" } }],
    },
  ])("rejects incomplete constituent appeal evidence %j", async (payload) => {
    await expect(
      exclusionAppealClient(ctx, vi.fn().mockResolvedValue(payload)).appeals(
        "10",
      ),
    ).rejects.toThrow();
  });
  it("checks catalog count instead of an extraneous final next_link", async () => {
    const result = await exclusionAppealClient(
      ctx,
      vi
        .fn()
        .mockResolvedValue({ count: 2, value: catalog, next_link: "/next" }),
    ).catalog();
    expect(result).toHaveLength(2);
  });
  it("rejects a partial catalog and non-int32 IDs without a write", async () => {
    const fetcher = vi.fn().mockResolvedValue({ count: 3, value: catalog });
    const client = exclusionAppealClient(ctx, fetcher);
    await expect(client.catalog()).rejects.toThrow();
    expect(() => client.create("2147483648", {}, today, "reason")).toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
