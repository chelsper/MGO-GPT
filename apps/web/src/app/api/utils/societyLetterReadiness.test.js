import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("./blackbaud", () => ({
  blackbaudApiFetch: vi.fn(),
  isBlackbaudQuotaExceededError: (e) => e.quota === true,
}));
import { createHash } from "node:crypto";
import { getGivingSocietyConfigurationSignature } from "./givingSocietyDefinitions";
import { letterHierarchy, letterPeriod } from "@/utils/societyLetters";
import {
  saveLetterRecipientReview,
  recipientReviewForRow,
} from "./societyLetterRecipients";
import { readinessReader } from "./societyLetterReadinessNxt";
import {
  evaluateLetterReadiness,
  runLetterReadiness,
  saveReadinessPolicy,
  letterReadinessForRow,
} from "./societyLetterReadiness";

const hash = (v) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
const today = "2026-09-24";
const ctx = { user: { id: 7 }, origin: "https://example.org" };
const definitions = [
  {
    key: "presidents",
    name: "President's Society",
    basis: "annual",
    active: true,
    displayOrder: 1,
  },
  {
    key: "ood",
    name: "Order of the Dolphin",
    basis: "annual",
    active: true,
    displayOrder: 2,
  },
];
const address = "10 Test St\nJacksonville FL 32211";
function member(id, spouse) {
  return {
    profile: {
      id,
      type: "Individual",
      first: id === "10" ? "Alex" : "Pat",
      last: "Sample",
      inactive: false,
      deceased: false,
      no_valid_address: false,
      requests_no_email: false,
      ...(spouse ? { spouse: { id: spouse } } : {}),
      address: {
        id: `a${id}`,
        constituent_id: id,
        address_lines: "10 Test St",
        city: "Jacksonville",
        state: "FL",
        postal_code: "32211",
        country: "United States",
        inactive: false,
        do_not_mail: false,
      },
      email: {
        id: `e${id}`,
        constituent_id: id,
        address: "alex@example.org",
        inactive: false,
        do_not_email: false,
      },
    },
    appeals: [],
    preferences: [],
    consents: [],
  };
}
async function setup() {
  const settings = {
    sourceMode: "society_queries",
    societyKeys: ["presidents", "ood"],
    periodBasis: "calendar_year",
  };
  const period = letterPeriod(settings, today);
  const row = {
    householdId: "10",
    members: ["10", "11"],
    period,
    sourceMode: "society_queries",
    name: "Alex & Pat Sample",
    societyKey: "ood",
    societyName: "Order of the Dolphin",
    rank: 1,
    qualifiedKeys: ["ood"],
    coveredKeys: ["ood"],
    mailAllowed: false,
    emailAllowed: false,
    memberNames: [
      { constituentId: "10", firstName: "Alex", lastName: "Sample" },
      { constituentId: "11", firstName: "Pat", lastName: "Sample" },
    ],
    recipientCandidates: [
      {
        constituentId: "10",
        addressee: "Alex & Pat Sample",
        salutation: "Alex and Pat",
        address,
        email: "alex@example.org",
      },
    ],
  };
  const template = {
    version: "v1",
    societyKey: "ood",
    sequence: 1,
    usedFields: ["first_name", "address", "salutation"],
  };
  const state = {
    revision: 1,
    settings,
    templates: { v1: template },
    exclusions: [],
    history: [],
    job: { status: "complete" },
    readiness: {},
  };
  const signature = hash([
    settings,
    getGivingSocietyConfigurationSignature(definitions),
  ]);
  state.snapshot = {
    signature,
    period,
    generatedAt: new Date().toISOString(),
    rows: [row],
    sources: [{ societyKey: "presidents" }, { societyKey: "ood" }],
  };
  const store = {
    save: vi.fn(async (next) => {
      next.revision++;
    }),
  };
  const reader = {
    appeal: vi.fn(async (id) => ({
      id,
      description:
        id === "100" ? "CY2026 Presidents Letter" : "CY2026 OOD Letter",
    })),
    member: vi.fn(async (id) => member(id, id === "10" ? "11" : "10")),
  };
  const policyBody = {
    confirm: true,
    appeals: {
      presidents: { id: "100", description: "CY2026 Presidents Letter" },
      ood: { id: "101", description: "CY2026 OOD Letter" },
    },
  };
  await saveReadinessPolicy(
    state,
    definitions,
    today,
    policyBody,
    store,
    ctx,
    reader,
  );
  const recipientBody = {
    confirm: true,
    reviewToken: recipientReviewForRow(state, row, signature).token,
    recipientConstituentId: "10",
    addressConstituentId: "10",
    addressee: "Alex & Pat Sample",
    salutation: "Alex and Pat",
    address,
    email: "alex@example.org",
  };
  await saveLetterRecipientReview(
    state,
    row,
    signature,
    recipientBody,
    store,
    7,
  );
  const recipient = recipientReviewForRow(state, row, signature).values;
  const run = (body) =>
    runLetterReadiness(
      state,
      definitions,
      today,
      body || { action: "check_readiness", channel: "post" },
      store,
      ctx,
      reader,
    );
  return {
    state,
    row,
    template,
    store,
    reader,
    run,
    recipient,
    policyBody,
    signature,
  };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-24T20:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("read-only society readiness", () => {
  it("holds an NXT exclusion appeal without treating it as a sent letter", async () => {
    const { state, row, template, recipient } = await setup();
    const members = { 10: member("10", "11"), 11: member("11", "10") };
    members["11"].appeals = [{ appeal: { id: "772" } }];
    const policy = {
      periodKey: row.period.key,
      appeals: { ood: { id: "772" } },
    };
    const result = evaluateLetterReadiness(
      { ...row, ...recipient },
      template,
      members,
      state.readiness.policy,
      definitions,
      today,
      "post",
      policy,
    );
    expect(result.status).toBe("needs_review");
    expect(result.reasons[0]).toContain("exclusion appeal");
    expect(state.history).toEqual([]);
    const nextPeriod = { ...policy, periodKey: "another-period" };
    expect(
      evaluateLetterReadiness(
        { ...row, ...recipient },
        template,
        members,
        state.readiness.policy,
        definitions,
        today,
        "post",
        nextPeriod,
      ).status,
    ).toBe("ready_for_preview");
  });
  it("rejects reusing an exclusion appeal as a sent appeal", async () => {
    const { state, store, reader, policyBody } = await setup();
    state.readiness.exclusionPolicy = { appeals: { ood: { id: "101" } } };
    await expect(
      saveReadinessPolicy(
        state,
        definitions,
        today,
        policyBody,
        store,
        ctx,
        reader,
      ),
    ).rejects.toThrow(/separate from exclusion/);
  });
  it("checks both spouses and preserves membership, choices, delivery flags, and history", async () => {
    const { state, row, run, reader } = await setup();
    const original = structuredClone({
      snapshot: state.snapshot,
      reviews: state.recipient_reviews,
      history: state.history,
    });
    await run();
    expect(reader.member.mock.calls).toEqual([["10"], ["11"]]);
    expect(state.readiness.job).toMatchObject({
      status: "complete",
      cursor: 1,
    });
    expect(
      letterReadinessForRow(state, definitions, today, row, "post").status,
    ).toBe("ready_for_preview");
    expect({
      snapshot: state.snapshot,
      reviews: state.recipient_reviews,
      history: state.history,
    }).toEqual(original);
    expect(row.mailAllowed).toBe(false);
    expect(
      letterReadinessForRow(state, definitions, today, row, "email").status,
    ).toBe("unchecked");
  });
  it.each(["100", "101"])(
    "covers either spouse with same/higher appeal %s regardless of assignment date",
    async (id) => {
      const { state, row, reader, run } = await setup();
      reader.member.mockImplementation(async (cid) => ({
        ...member(cid, cid === "10" ? "11" : "10"),
        appeals: cid === "11" ? [{ appeal: { id }, date: "2025-12-01" }] : [],
      }));
      await run();
      expect(
        letterReadinessForRow(state, definitions, today, row, "post").status,
      ).toBe("already_acknowledged");
      expect(state.history).toEqual([]);
    },
  );
  it("allows a higher tier after a lower-tier appeal", async () => {
    const { state, row, template, recipient } = await setup();
    const high = {
      ...row,
      ...recipient,
      societyKey: "presidents",
      qualifiedKeys: ["presidents", "ood"],
    };
    const members = { 10: member("10", "11"), 11: member("11", "10") };
    members["10"].appeals = [{ appeal: { id: "101" } }];
    expect(
      evaluateLetterReadiness(
        high,
        template,
        members,
        state.readiness.policy,
        definitions,
        today,
        "post",
      ).status,
    ).toBe("ready_for_preview");
  });
  it("does not suppress a household using an outdated spouse link", async () => {
    const { state, row, reader, run } = await setup();
    reader.member.mockImplementation(async (id) => ({
      ...member(id, "99"),
      appeals: [{ appeal: { id: "100" } }],
    }));
    await run();
    expect(
      letterReadinessForRow(state, definitions, today, row, "post").status,
    ).toBe("needs_review");
  });
  it.each([
    ["changed spouse", (m) => (m.profile.spouse.id = "99")],
    ["unknown status", (m) => delete m.profile.deceased],
    ["inactive", (m) => (m.profile.inactive = true)],
    ["deceased", (m) => (m.profile.deceased = true)],
    ["changed name", (m) => (m.profile.first = "Changed")],
    [
      "solicit restriction",
      (m) => (m.preferences = [{ solicit_code: "No mail" }]),
    ],
    [
      "invalid restriction date",
      (m) => (m.preferences = [{ end_date: "invalid" }]),
    ],
    [
      "impossible restriction date",
      (m) => (m.preferences = [{ end_date: "2026-02-30" }]),
    ],
    ["consent instructions", (m) => (m.consents = [{ consent: "OptOut" }])],
    ["unknown appeal", (m) => (m.appeals = [{}])],
    ["no mail", (m) => (m.profile.address.do_not_mail = true)],
    ["unknown mail flag", (m) => delete m.profile.address.do_not_mail],
    ["inactive address", (m) => (m.profile.address.inactive = true)],
    [
      "address changed",
      (m) => (m.profile.address.address_lines = "99 Other St"),
    ],
    [
      "seasonal address",
      (m) => (m.profile.address.seasonal_start = { m: 6, d: 1 }),
    ],
    ["future address", (m) => (m.profile.address.start = "2027-01-01")],
    ["foreign address owner", (m) => (m.profile.address.constituent_id = "99")],
  ])("holds %s rather than approving", async (_name, mutate) => {
    const { state, row, run, reader } = await setup();
    reader.member.mockImplementation(async (id) => {
      const m = member(id, id === "10" ? "11" : "10");
      if (id === "10") mutate(m);
      return m;
    });
    await run();
    expect(
      letterReadinessForRow(state, definitions, today, row, "post").status,
    ).toBe("needs_review");
  });
  it("ignores only clearly expired solicit codes", async () => {
    const { state, row, reader, run } = await setup();
    reader.member.mockImplementation(async (id) => ({
      ...member(id, id === "10" ? "11" : "10"),
      preferences: [{ end_date: "2026-01-01T05:00:00Z" }],
    }));
    await run();
    expect(
      letterReadinessForRow(state, definitions, today, row, "post").status,
    ).toBe("ready_for_preview");
  });
  it("supports an individual with no spouse", async () => {
    const { state, row, template, recipient } = await setup();
    const single = { ...row, ...recipient, members: ["10"] };
    expect(
      evaluateLetterReadiness(
        single,
        template,
        { 10: member("10") },
        state.readiness.policy,
        definitions,
        today,
        "post",
      ).status,
    ).toBe("ready_for_preview");
  });
  it("holds missing merge values", async () => {
    const { state, row, template, recipient } = await setup();
    const single = { ...row, ...recipient, members: ["10"] };
    expect(
      evaluateLetterReadiness(
        single,
        { ...template, usedFields: ["spouse_first_name"] },
        { 10: member("10") },
        state.readiness.policy,
        definitions,
        today,
        "post",
      ).status,
    ).toBe("needs_review");
  });
  it("checks email flags without changing email consent", async () => {
    const { state, row, run, reader } = await setup();
    reader.member.mockImplementation(async (id) => {
      const m = member(id, id === "10" ? "11" : "10");
      m.profile.requests_no_email = true;
      return m;
    });
    await run({ action: "check_readiness", channel: "email" });
    expect(
      letterReadinessForRow(state, definitions, today, row, "email").status,
    ).toBe("needs_review");
    expect(row.emailAllowed).toBe(false);
  });
  it("does not pull NXT for missing recipient choices", async () => {
    const { state, row, reader, run } = await setup();
    state.recipient_reviews = {};
    await run();
    expect(reader.member).not.toHaveBeenCalled();
    expect(
      letterReadinessForRow(
        state,
        definitions,
        today,
        row,
        "post",
      ).reasons.join(),
    ).toContain("recipient choices");
  });
  it.each([
    "stale",
    "higher missing",
    "source changed",
    "period changed",
    "query incomplete",
  ])("blocks %s sources before NXT", async (reason) => {
    const { state, run, reader } = await setup();
    if (reason === "stale") state.snapshot.generatedAt = "2026-09-20T00:00:00Z";
    if (reason === "higher missing") state.snapshot.sources.pop();
    if (reason === "source changed") state.snapshot.signature = "old";
    if (reason === "period changed") state.snapshot.period.key = "old";
    if (reason === "query incomplete") state.job.status = "running";
    await expect(run()).rejects.toThrow(/membership|refresh/i);
    expect(reader.member).not.toHaveBeenCalled();
  });
  it.each(["template", "recipient", "exclusion", "source time", "age"])(
    "invalidates results after %s changes",
    async (change) => {
      const { state, row, run } = await setup();
      await run();
      if (change === "template") state.templates.v1.version = "v2";
      if (change === "recipient")
        Object.values(state.recipient_reviews)[0].values.salutation = "New";
      if (change === "exclusion")
        state.exclusions.push({
          id: "x",
          householdId: "10",
          members: ["10"],
          period: row.period,
          reason: "No letter",
        });
      if (change === "source time")
        state.snapshot.generatedAt = "2026-09-24T19:00:00Z";
      if (change === "age") vi.advanceTimersByTime(86400001);
      expect(
        letterReadinessForRow(state, definitions, today, row, "post").status,
      ).not.toBe("ready_for_preview");
    },
  );
  it("pauses on rate limits without advancing the household and resumes once", async () => {
    const { state, row, reader, run } = await setup();
    reader.member.mockRejectedValueOnce(
      Object.assign(new Error("quota"), { quota: true, retryAfterMs: 120000 }),
    );
    await run();
    expect(state.readiness.job).toMatchObject({ status: "paused", cursor: 0 });
    const body = { action: "resume_readiness", jobId: state.readiness.job.id };
    await expect(run(body)).rejects.toThrow(/cooling/);
    vi.advanceTimersByTime(120001);
    await run(body);
    expect(state.readiness.job.cursor).toBe(1);
    expect(
      letterReadinessForRow(state, definitions, today, row, "post").status,
    ).toBe("ready_for_preview");
    await expect(run(body)).rejects.toThrow(/changed/);
  });
  it("pauses on permission errors without exposing NXT error bodies", async () => {
    const { state, reader, run } = await setup();
    reader.member.mockRejectedValueOnce(
      Object.assign(new Error("private raw error"), { httpStatus: 403 }),
    );
    await run();
    expect(state.readiness.job.status).toBe("paused");
    expect(JSON.stringify(state.readiness)).not.toContain("private raw error");
  });
  it("resumes the next household without repeating completed NXT checks", async () => {
    const { state, row, run, reader, store, signature } = await setup();
    const second = {
      ...structuredClone(row),
      householdId: "20",
      members: ["20"],
      memberNames: [
        { constituentId: "20", firstName: "Pat", lastName: "Sample" },
      ],
      recipientCandidates: [
        { ...row.recipientCandidates[0], constituentId: "20" },
      ],
    };
    state.snapshot.rows.push(second);
    await saveLetterRecipientReview(
      state,
      second,
      signature,
      {
        ...recipientReviewForRow(state, row, signature).values,
        confirm: true,
        reviewToken: recipientReviewForRow(state, second, signature).token,
        recipientConstituentId: "20",
        addressConstituentId: "20",
      },
      store,
      7,
    );
    reader.member.mockImplementation(async (id) =>
      member(id, id === "10" ? "11" : id === "11" ? "10" : undefined),
    );
    await run();
    expect(state.readiness.job).toMatchObject({ status: "running", cursor: 1 });
    const firstResult = letterReadinessForRow(
      state,
      definitions,
      today,
      row,
      "post",
    );
    const resume = {
      action: "resume_readiness",
      jobId: state.readiness.job.id,
    };
    reader.member.mockRejectedValueOnce(
      Object.assign(new Error("quota"), {
        quota: true,
        retryAfterMs: 60000,
      }),
    );
    await run(resume);
    expect(state.readiness.job).toMatchObject({ status: "paused", cursor: 1 });
    expect(
      letterReadinessForRow(state, definitions, today, row, "post"),
    ).toEqual(firstResult);
    vi.advanceTimersByTime(60001);
    await run(resume);
    expect(state.readiness.job).toMatchObject({
      status: "complete",
      cursor: 2,
    });
    expect(reader.member.mock.calls).toEqual([["10"], ["11"], ["20"], ["20"]]);
    expect(
      letterReadinessForRow(state, definitions, today, second, "post").status,
    ).toBe("ready_for_preview");
  });
  it("rejects stale job IDs, another owner, and overlapping runs", async () => {
    const { state, run, reader, store } = await setup();
    reader.member.mockRejectedValueOnce(new Error("timeout"));
    await run();
    await expect(run()).rejects.toThrow(/existing/);
    await expect(
      run({ action: "resume_readiness", jobId: "wrong" }),
    ).rejects.toThrow(/changed/);
    await expect(
      runLetterReadiness(
        state,
        definitions,
        today,
        { action: "resume_readiness", jobId: state.readiness.job.id },
        store,
        { ...ctx, user: { id: 8 } },
        reader,
      ),
    ).rejects.toThrow(/reviewer/);
    await run({ action: "cancel_readiness", jobId: state.readiness.job.id });
    expect(state.readiness.job.status).toBe("cancelled");
  });
  it("rejects IDs outside the holding list", async () => {
    const { reader, run } = await setup();
    await expect(
      run({
        action: "check_readiness",
        channel: "post",
        householdIds: ["999"],
      }),
    ).rejects.toThrow(/current/);
    expect(reader.member).not.toHaveBeenCalled();
  });
  it("verifies appeal IDs and descriptions and requires confirmation", async () => {
    const { state, reader, store, policyBody } = await setup();
    await expect(
      saveReadinessPolicy(
        state,
        definitions,
        today,
        { ...policyBody, confirm: false },
        store,
        ctx,
        reader,
      ),
    ).rejects.toThrow(/Confirm/);
    policyBody.appeals.ood.description = "Incorrect";
    await expect(
      saveReadinessPolicy(
        state,
        definitions,
        today,
        policyBody,
        store,
        ctx,
        reader,
      ),
    ).rejects.toThrow(/does not match/);
    expect(state.readiness.policy.appeals.ood.description).toBe(
      "CY2026 OOD Letter",
    );
  });
});

describe("readiness NXT reader", () => {
  const payloads = () => [
    member("10").profile,
    { count: 0, value: [] },
    { count: 0, value: [] },
    { count: 0, value: [] },
  ];
  it("uses only bounded GETs to fixed endpoints", async () => {
    const responses = payloads();
    const fetcher = vi.fn(async () => responses.shift());
    await readinessReader(ctx, fetcher).member("10");
    expect(fetcher.mock.calls.map((c) => c[0])).toEqual([
      "/constituent/v1/constituents/10",
      "/constituent/v1/constituents/10/appeals",
      "/commpref/v1/constituents/10/constituentsolicitcodes",
      "/commpref/v1/constituents/10/consents?most_recent_only=true",
    ]);
    for (const [, options] of fetcher.mock.calls)
      expect(options).toMatchObject({
        method: "GET",
        timeoutMs: 5000,
        maxRetries: 0,
      });
  });
  it.each([
    {},
    { value: [] },
    { count: 1, value: [] },
    { count: 0, value: [], next_link: "https://evil.test" },
    { count: 1, value: [{ id: "a", constituent_id: "11" }] },
    {
      count: 2,
      value: [
        { id: "a", constituent_id: "10" },
        { id: "a", constituent_id: "10" },
      ],
    },
  ])("rejects incomplete/foreign collections %j", async (invalid) => {
    const responses = payloads();
    responses[1] = invalid;
    const fetcher = vi.fn(async () => responses.shift());
    await expect(readinessReader(ctx, fetcher).member("10")).rejects.toThrow(
      /incomplete/,
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("does not substitute lookup IDs or fallback identities", async () => {
    const fetcher = vi.fn(async () => ({
      ...member("11").profile,
      lookup_id: "10",
    }));
    await expect(readinessReader(ctx, fetcher).member("10")).rejects.toThrow(
      /identity/,
    );
    await expect(
      readinessReader(ctx, fetcher).member("../../99"),
    ).rejects.toThrow(/system record/);
  });
});
