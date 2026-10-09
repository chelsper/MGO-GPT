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
  letterReadinessWorkspace,
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
  it("distinguishes membership refresh, continuation, and appeal-setup repairs without writes", async () => {
    const { state } = await setup();
    expect(
      letterReadinessWorkspace(state, definitions, today).blocker,
    ).toBeNull();
    state.snapshot.generatedAt = "2026-09-20T15:00:00Z";
    expect(
      letterReadinessWorkspace(state, definitions, today).blocker,
    ).toMatchObject({ code: "membership_stale", action: "refresh" });
    state.job = { status: "running" };
    expect(
      letterReadinessWorkspace(state, definitions, today).blocker,
    ).toMatchObject({ code: "refresh_incomplete", action: "resume" });
    state.job.status = "failed";
    expect(
      letterReadinessWorkspace(state, definitions, today).blocker.action,
    ).toBe("refresh");
    state.job.status = "complete";
    state.snapshot.generatedAt = new Date().toISOString();
    state.readiness.policy = null;
    expect(
      letterReadinessWorkspace(state, definitions, today).blocker,
    ).toMatchObject({ code: "appeals_unconfigured", action: "appeals" });
  });
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
  it.each([false, true])(
    "accepts Florida and FL as the same preferred US address (NXT full name: %s)",
    async (fullName) => {
      const { state, row, template, recipient } = await setup();
      const members = { 10: member("10", "11"), 11: member("11", "10") };
      members[10].profile.address.state = fullName ? "Florida" : "FL";
      const saved = {
        ...row,
        ...recipient,
        address: `10 Test St\nJacksonville, ${fullName ? "FL" : "Florida"} 32211`,
      };
      expect(
        evaluateLetterReadiness(
          saved,
          template,
          members,
          state.readiness.policy,
          definitions,
          today,
          "post",
        ).status,
      ).toBe("ready_for_preview");
    },
  );
  it.each([
    ["valid", () => {}, "ready_for_preview"],
    [
      "no mail",
      (m) => {
        m.profile.address.do_not_mail = true;
      },
      "needs_review",
    ],
    [
      "unknown permission",
      (m) => {
        delete m.profile.address.do_not_mail;
      },
      "needs_review",
    ],
    [
      "inactive address",
      (m) => {
        m.profile.address.inactive = true;
      },
      "needs_review",
    ],
    [
      "inactive organization",
      (m) => {
        m.profile.inactive = true;
      },
      "needs_review",
    ],
    [
      "invalid address",
      (m) => {
        m.profile.no_valid_address = true;
      },
      "needs_review",
    ],
    [
      "expired",
      (m) => {
        m.profile.address.end = today;
      },
      "needs_review",
    ],
    [
      "seasonal",
      (m) => {
        m.profile.address.seasonal_start = { m: 6, d: 1 };
      },
      "needs_review",
    ],
    [
      "postal consent restriction",
      (m) => {
        m.consents.push({
          id: "s1",
          channel: "Mail",
          constituent_consent_response: "OptOut",
        });
      },
      "needs_review",
    ],
  ])(
    "verifies an organization-name address prefix without bypassing %s checks",
    async (_label, mutate, status) => {
      const { state, row, template, recipient } = await setup();
      const org = member("10");
      Object.assign(org.profile, {
        type: "Organization",
        name: "Example Foundation",
      });
      mutate(org);
      expect(
        evaluateLetterReadiness(
          {
            ...row,
            ...recipient,
            members: ["10"],
            address: `Example Foundation\n${address}`,
          },
          template,
          { 10: org },
          state.readiness.policy,
          definitions,
          today,
          "post",
        ).status,
      ).toBe(status);
    },
  );
  it.each([
    [
      "no mail",
      (m) => {
        m.profile.address.do_not_mail = true;
      },
    ],
    [
      "unknown mail flag",
      (m) => {
        delete m.profile.address.do_not_mail;
      },
    ],
    [
      "inactive",
      (m) => {
        m.profile.address.inactive = true;
      },
    ],
    [
      "invalid address",
      (m) => {
        m.profile.no_valid_address = true;
      },
    ],
    [
      "foreign owner",
      (m) => {
        m.profile.address.constituent_id = "99";
      },
    ],
    [
      "future",
      (m) => {
        m.profile.address.start = "2027-01-01";
      },
    ],
    [
      "expired",
      (m) => {
        m.profile.address.end = today;
      },
    ],
    [
      "seasonal",
      (m) => {
        m.profile.address.seasonal_start = { m: 6, d: 1 };
      },
    ],
  ])(
    "keeps the %s restriction even when the state name is equivalent",
    async (_label, mutate) => {
      const { state, row, template, recipient } = await setup();
      const members = { 10: member("10", "11"), 11: member("11", "10") };
      mutate(members[10]);
      const saved = {
        ...row,
        ...recipient,
        address: "10 Test St\nJacksonville, Florida 32211",
      };
      expect(
        evaluateLetterReadiness(
          saved,
          template,
          members,
          state.readiness.policy,
          definitions,
          today,
          "post",
        ).status,
      ).toBe("needs_review");
    },
  );
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
  it.each([
    { solicit_code: "No Solicitation" },
    { solicit_code: "No E-Mail" },
    { solicit_code: "Do not mail" },
    { solicit_code: "Custom contact instruction" },
    { end_date: "invalid" },
    { end_date: "2026-02-30" },
    { end_date: "2026-01-01T05:00:00Z" },
  ])("does not use contact codes as society-letter holds: %j", async (code) => {
    const { state, row, reader, run } = await setup();
    reader.member.mockImplementation(async (id) => ({
      ...member(id, id === "10" ? "11" : "10"),
      preferences: [code],
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
  it.each(["address_line_2", "country"])(
    "allows a blank optional %s after checking the complete preferred address",
    async (field) => {
      const { state, row, template, recipient } = await setup();
      const single = { ...row, ...recipient, members: ["10"] };
      const data = member("10");
      const check = () =>
        evaluateLetterReadiness(
          single,
          { ...template, usedFields: [...template.usedFields, field] },
          { 10: data },
          state.readiness.policy,
          definitions,
          today,
          "post",
        );
      expect(check().status).toBe("ready_for_preview");
      data.profile.address.do_not_mail = true;
      expect(check().status).toBe("needs_review");
    },
  );
  it.each(["address_line_1", "city", "state", "zip", "society_name"])(
    "still holds missing required %s merge values",
    async (field) => {
      const { state, row, template, recipient } = await setup();
      const single = { ...row, ...recipient, members: ["10"], societyName: "" };
      expect(
        evaluateLetterReadiness(
          single,
          { ...template, usedFields: [field] },
          { 10: member("10") },
          state.readiness.policy,
          definitions,
          today,
          "post",
        ).status,
      ).toBe("needs_review");
    },
  );
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
  it("ignores email contact codes but keeps explicit email opt-outs and consent checks", async () => {
    const { state, row, template, recipient } = await setup();
    const data = member("10");
    data.preferences = [
      { solicit_code: "No E-Mail" },
      { solicit_code: "No Solicitation" },
    ];
    const check = () =>
      evaluateLetterReadiness(
        { ...row, ...recipient, members: ["10"] },
        template,
        { 10: data },
        state.readiness.policy,
        definitions,
        today,
        "email",
      );
    expect(check().status).toBe("ready_for_preview");
    data.profile.email.do_not_email = true;
    expect(check().status).toBe("needs_review");
    data.profile.email.do_not_email = false;
    data.profile.requests_no_email = true;
    expect(check().status).toBe("needs_review");
    data.profile.requests_no_email = false;
    data.consents = [
      {
        id: "c",
        channel: "Email",
        constituent_consent_response: "OptOut",
        consent_date: today,
      },
    ];
    expect(check().status).toBe("needs_review");
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
  const appealCatalog = () => [
    {
      id: "100",
      lookup_id: "CY26PRESSOC-MGO",
      description: "CY2026 Presidents Letter",
      inactive: false,
    },
    {
      id: "101",
      lookup_id: "CY26OOD-MGO",
      description: "CY2026 OOD Letter",
      inactive: false,
    },
  ];
  const codePolicy = () => ({
    confirm: true,
    appeals: {
      presidents: {
        lookupId: "CY26PRESSOC-MGO",
        description: "CY2026 Presidents Letter",
      },
      ood: { lookupId: "CY26OOD-MGO", description: "CY2026 OOD Letter" },
    },
  });
  it("resolves both appeal codes with one complete catalog GET and saves verified IDs atomically", async () => {
    const { state, store } = await setup();
    const history = structuredClone(state.history);
    const fetcher = vi.fn(async () => ({
      count: 2,
      value: appealCatalog(),
      next_link: "/ignored",
    }));
    store.save.mockClear();
    await saveReadinessPolicy(
      state,
      definitions,
      today,
      codePolicy(),
      store,
      ctx,
      readinessReader(ctx, fetcher),
    );
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(
      "/fundraising/v1/appeals?include_inactive=true&limit=5000",
      expect.objectContaining({
        method: "GET",
        timeoutMs: 5000,
        maxRetries: 0,
      }),
    );
    expect(store.save).toHaveBeenCalledOnce();
    expect(state.readiness.policy.appeals.presidents).toEqual({
      id: "100",
      lookupId: "CY26PRESSOC-MGO",
      description: "CY2026 Presidents Letter",
    });
    expect(state.readiness.policy.appeals.ood.id).toBe("101");
    expect(state.history).toEqual(history);
  });
  it.each([
    "unknown",
    "description",
    "inactive",
    "unknown-active",
    "duplicate-code",
    "duplicate-description",
    "partial",
    "exclusion",
    "same-society",
    "both-identifiers",
    "invalid-id",
    "throttled",
  ])("rejects %s and preserves all previous settings", async (scenario) => {
    const { state, store } = await setup();
    const catalog = appealCatalog();
    const body = codePolicy();
    if (scenario === "unknown") body.appeals.ood.lookupId = "NOT-FOUND";
    if (scenario === "description")
      body.appeals.ood.description = "Wrong description";
    if (scenario === "inactive") catalog[1].inactive = true;
    if (scenario === "unknown-active") delete catalog[1].inactive;
    if (scenario === "duplicate-code")
      catalog.push({ ...catalog[1], id: "102", description: "Other letter" });
    if (scenario === "duplicate-description")
      catalog.push({ ...catalog[1], id: "102", lookup_id: "OTHER" });
    if (scenario === "exclusion")
      state.readiness.exclusionPolicy = { appeals: { ood: { id: "101" } } };
    if (scenario === "same-society")
      body.appeals.ood = { ...body.appeals.presidents };
    if (scenario === "both-identifiers") body.appeals.presidents.id = "999";
    if (scenario === "invalid-id") catalog[1].id = "../invalid";
    const fetcher = vi.fn(async () => {
      if (scenario === "throttled") throw new Error("quota");
      return {
        count: catalog.length + (scenario === "partial" ? 1 : 0),
        value: catalog,
      };
    });
    const before = structuredClone(state);
    store.save.mockClear();
    await expect(
      saveReadinessPolicy(
        state,
        definitions,
        today,
        body,
        store,
        ctx,
        readinessReader(ctx, fetcher),
      ),
    ).rejects.toThrow();
    expect(store.save).not.toHaveBeenCalled();
    expect(state).toEqual(before);
    expect(
      fetcher.mock.calls.every(([, options]) => options.method === "GET"),
    ).toBe(true);
  });
  it("treats numeric lookup codes as codes and never substitutes a system ID", async () => {
    const fetcher = vi.fn(async () => ({
      count: 1,
      value: [{ ...appealCatalog()[0], id: "999", lookup_id: "100" }],
    }));
    const reader = readinessReader(ctx, fetcher);
    expect(
      await reader.appealByCode("100", "CY2026 Presidents Letter"),
    ).toMatchObject({ id: "999", lookupId: "100" });
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("preserves explicit numeric-ID setup and verifies active status", async () => {
    const fetcher = vi.fn(async () => appealCatalog()[0]);
    expect(await readinessReader(ctx, fetcher).appeal("100")).toEqual({
      id: "100",
      lookupId: "CY26PRESSOC-MGO",
      description: "CY2026 Presidents Letter",
    });
    expect(fetcher.mock.calls[0][0]).toBe("/fundraising/v1/appeals/100");
    fetcher.mockResolvedValue({ ...appealCatalog()[0], inactive: true });
    await expect(readinessReader(ctx, fetcher).appeal("100")).rejects.toThrow(
      /inactive/,
    );
  });
  it.each([
    {},
    { value: [] },
    { count: 1, value: [] },
    {
      count: 2,
      value: [
        { id: "1", description: "A" },
        { id: "1", description: "B" },
      ],
    },
    { count: 1, value: [null] },
    { count: 1, value: [{ id: "1" }] },
  ])(
    "rejects an incomplete or malformed appeal catalog %j",
    async (payload) => {
      const fetcher = vi.fn(async () => payload);
      await expect(
        readinessReader(ctx, fetcher).appealByCode("CODE", "A"),
      ).rejects.toThrow(/catalog/);
      expect(fetcher).toHaveBeenCalledOnce();
    },
  );
  const payloads = () => [
    member("10").profile,
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
      "/commpref/v1/constituents/10/consents?most_recent_only=true",
    ]);
    for (const [, options] of fetcher.mock.calls)
      expect(options).toMatchObject({
        method: "GET",
        timeoutMs: 5000,
        maxRetries: 0,
      });
  });
  it("does not fetch or require access to contact-code records", async () => {
    const fetcher = vi.fn(async (path) => {
      if (path.endsWith("/constituentsolicitcodes"))
        throw Object.assign(new Error("Contact-code access denied"), {
          httpStatus: 403,
        });
      if (path.endsWith("/constituents/10")) return member("10").profile;
      return { count: 0, value: [] };
    });
    expect(await readinessReader(ctx, fetcher).member("10")).toMatchObject({
      profile: { id: "10" },
      appeals: [],
      consents: [],
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(
      fetcher.mock.calls.some(([path]) =>
        path.endsWith("/constituentsolicitcodes"),
      ),
    ).toBe(false);
  });
  it("accepts request-scoped consent rows without a repeated constituent ID", async () => {
    const consent = {
      id: "15",
      channel: "Email",
      constituent_consent_response: "OptIn",
      consent_date: "2026-09-01T00:00:00Z",
    };
    const responses = payloads();
    responses[2] = { count: 1, value: [consent] };
    const fetcher = vi.fn(async () => responses.shift());
    expect((await readinessReader(ctx, fetcher).member("10")).consents).toEqual(
      [consent],
    );
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("distinguishes the known relationship-only consent 404 from an empty consent list", async () => {
    const responses = payloads();
    responses[0].is_constituent = false;
    const fetcher = vi.fn(async (path) => {
      if (path.includes("/consents?"))
        throw Object.assign(new Error("provider body"), {
          httpStatus: 404,
          blackbaudErrorCode: 404,
          blackbaudErrorName: "ResourceNotFound",
        });
      return responses.shift();
    });
    expect(await readinessReader(ctx, fetcher).member("10")).toMatchObject({
      consents: null,
      consentUnavailable: "relationship_only",
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it.each([true, undefined])(
    "never treats ResourceNotFound as empty for full or unknown constituent status %s",
    async (isConstituent) => {
      const responses = payloads();
      responses[0].is_constituent = isConstituent;
      const fetcher = vi.fn(async (path) => {
        if (path.includes("/consents?"))
          throw Object.assign(new Error("provider body"), {
            httpStatus: 404,
            blackbaudErrorCode: 404,
            blackbaudErrorName: "ResourceNotFound",
          });
        return responses.shift();
      });
      await expect(readinessReader(ctx, fetcher).member("10")).rejects.toThrow(
        /consent records/,
      );
    },
  );
  it.each([
    {},
    { value: [] },
    { count: 1, value: [] },
    { count: 0, value: [], next_link: "https://evil.test" },
    { count: 0, value: [], nextLink: "/next" },
    { count: 0, value: [], continuation_token: "next" },
    { count: 1, value: [null] },
    { count: 1, value: [{}] },
    { count: 1, value: [{ id: "15", constituent_id: "11" }] },
    { count: 1, value: [{ id: "15", constituent_id: null }] },
    { count: 2, value: [{ id: "15" }, { id: "15" }] },
  ])(
    "still rejects malformed, partial, or conflicting consent rows %j",
    async (invalid) => {
      const responses = payloads();
      responses[2] = invalid;
      const fetcher = vi.fn(async () => responses.shift());
      await expect(readinessReader(ctx, fetcher).member("10")).rejects.toThrow(
        /incomplete or conflicting consent records.*ID 10/,
      );
      expect(fetcher).toHaveBeenCalledTimes(3);
    },
  );
  it.each([1])(
    "still requires constituent ownership on collection %s",
    async (index) => {
      const responses = payloads();
      responses[index] = { count: 1, value: [{ id: "15" }] };
      await expect(
        readinessReader(
          ctx,
          vi.fn(async () => responses.shift()),
        ).member("10"),
      ).rejects.toThrow(/incomplete or conflicting/);
    },
  );
  it.each([true, false])(
    "explains a consent 404 for a found profile (full constituent: %s), never treating it as empty",
    async (isConstituent) => {
      const responses = payloads();
      Object.assign(responses[0], {
        name: "Alex Sample",
        is_constituent: isConstituent,
      });
      const providerError = Object.assign(
        new Error("private provider details"),
        { httpStatus: 404 },
      );
      const fetcher = vi.fn(async (path) => {
        if (path.includes("/consents?")) throw providerError;
        return responses.shift();
      });
      const error = await readinessReader(ctx, fetcher)
        .member("10")
        .catch((error) => error);
      expect(error.status).toBe(422);
      expect(error.message).toContain(
        "consent records for Alex Sample (ID 10)",
      );
      expect(error.message).toContain(
        isConstituent ? "profile was found" : "not a full constituent",
      );
      expect(error.message).not.toContain("private provider details");
      expect(fetcher).toHaveBeenCalledTimes(3);
    },
  );
  it.each([401, 403, 429, 500])(
    "preserves consent HTTP %s for connection/cooldown handling",
    async (httpStatus) => {
      const responses = payloads();
      const providerError = Object.assign(new Error("unavailable"), {
        httpStatus,
      });
      const fetcher = vi.fn(async (path) => {
        if (path.includes("/consents?")) throw providerError;
        return responses.shift();
      });
      await expect(readinessReader(ctx, fetcher).member("10")).rejects.toBe(
        providerError,
      );
      expect(fetcher).toHaveBeenCalledTimes(3);
    },
  );
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
