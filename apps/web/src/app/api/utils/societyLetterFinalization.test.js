import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
vi.mock("./blackbaud", () => ({
  blackbaudApiFetch: vi.fn(),
  isBlackbaudQuotaExceededError: () => false,
}));
vi.mock("./societyLetterDocuments", () => ({
  renderSocietyLetter: vi.fn(() => ({
    document: Buffer.from("fictional letter"),
  })),
}));
import { createHash } from "node:crypto";
import { renderSocietyLetter } from "./societyLetterDocuments";
import { getGivingSocietyConfigurationSignature } from "./givingSocietyDefinitions";
import {
  recipientReviewForRow,
  saveLetterRecipientReview,
} from "./societyLetterRecipients";
import {
  runLetterReadiness,
  saveReadinessPolicy,
} from "./societyLetterReadiness";
import { letterPeriod, letterDisposition } from "@/utils/societyLetters";
import {
  previewFinalPostalLetter,
  finalizePostalLetter,
  syncLetterAppeals,
  assertLetterAppealsComplete,
} from "./societyLetterFinalization";
import {
  startPostalDraft,
  preparePostalDocument,
  draftPostalDocument,
  reviewPostalDocument,
  approvePostalDraft,
  discardPostalDraft,
  updateLetterDates,
  continuePostalBatch,
  savedPostalDocument,
  postalBatchDownload,
} from "./societyLetterPostalBatches";

const today = "2026-09-25";
const ctx = { user: { id: 7 }, origin: "https://example.org" };
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
const hash = (v) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
async function fixture(single = false, society = "presidents") {
  const settings = {
    sourceMode: "society_queries",
    societyKeys: ["presidents", "ood"],
    periodBasis: "calendar_year",
  };
  const period = letterPeriod(settings, today);
  const members = single ? ["10"] : ["10", "11"];
  const address = "10 Test St\nJacksonville FL 32211";
  const row = {
    householdId: "10",
    members,
    period,
    sourceMode: "society_queries",
    name: "Alex & Pat Sample",
    societyKey: society,
    societyName: definitions.find((d) => d.key === society).name,
    rank: society === "ood" ? 1 : 0,
    qualifiedKeys: society === "ood" ? ["ood"] : ["presidents", "ood"],
    coveredKeys: society === "ood" ? ["ood"] : ["presidents", "ood"],
    mailAllowed: false,
    emailAllowed: false,
    memberNames: members.map((id) => ({
      constituentId: id,
      firstName: id === "10" ? "Alex" : "Pat",
      lastName: "Sample",
    })),
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
  const state = {
    revision: 1,
    settings,
    templates: {
      v1: {
        version: "v1",
        societyKey: society,
        sequence: 1,
        filename: "letter.docx",
        usedFields: ["salutation", "address"],
      },
    },
    history: [],
    exclusions: [],
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
    rows: [row],
    sources: definitions.map((d) => ({ societyKey: d.key })),
    generatedAt: new Date().toISOString(),
  };
  const profiles = Object.fromEntries(
    members.map((id) => [
      id,
      {
        profile: {
          id,
          type: "Individual",
          first: id === "10" ? "Alex" : "Pat",
          last: "Sample",
          inactive: false,
          deceased: false,
          no_valid_address: false,
          ...(single ? {} : { spouse: { id: id === "10" ? "11" : "10" } }),
          address: {
            id: `a${id}`,
            constituent_id: id,
            address_lines: "10 Test St",
            city: "Jacksonville",
            state: "FL",
            postal_code: "32211",
            inactive: false,
            do_not_mail: false,
          },
        },
        appeals: [],
        preferences: [],
        consents: [],
      },
    ]),
  );
  const events = [];
  const persisted = new Map();
  const store = {
    save: vi.fn(async (s) => {
      s.revision++;
    }),
    reserve: vi.fn(async (items) => {
      events.push("reserve");
      items.forEach((i) => persisted.set(i.id, structuredClone(i)));
    }),
    saveLetterAppeals: vi.fn(async (i) => {
      events.push(
        `save:${i.letterAppeals.members.map((m) => m.status).join(",")}`,
      );
      persisted.set(i.id, structuredClone(i));
    }),
  };
  const reader = {
    member: vi.fn(async (id) => structuredClone(profiles[id])),
    appeal: vi.fn(async (id) => ({
      id,
      description:
        id === "100" ? "CY2026 Presidents Letter" : "CY2026 OOD Letter",
    })),
  };
  await saveReadinessPolicy(
    state,
    definitions,
    today,
    {
      confirm: true,
      appeals: {
        presidents: { id: "100", description: "CY2026 Presidents Letter" },
        ood: { id: "101", description: "CY2026 OOD Letter" },
      },
    },
    store,
    ctx,
    reader,
  );
  await saveLetterRecipientReview(
    state,
    row,
    signature,
    {
      confirm: true,
      reviewToken: recipientReviewForRow(state, row, signature).token,
      recipientConstituentId: "10",
      addressConstituentId: "10",
      addressee: "Alex & Pat Sample",
      salutation: "Alex and Pat",
      address,
      email: "alex@example.org",
    },
    store,
    7,
  );
  await runLetterReadiness(
    state,
    definitions,
    today,
    { action: "check_readiness", channel: "post" },
    store,
    ctx,
    reader,
  );
  reader.member.mockClear();
  const client = {
    catalog: vi.fn(async () =>
      Object.values(state.readiness.policy.appeals).map((a) => ({
        ...a,
        inactive: false,
      })),
    ),
    appeals: vi.fn(async (id) => structuredClone(profiles[id].appeals)),
    create: vi.fn(async (id, appeal, date, comments) => {
      events.push(`post:${id}`);
      const result = {
        id: String(200 + Number(id)),
        constituent_id: id,
        appeal: { id: appeal.id },
        date,
        comments,
      };
      profiles[id].appeals.push(result);
      return { id: result.id };
    }),
  };
  const preview = () =>
    previewFinalPostalLetter(state, definitions, today, { householdId: "10" });
  const finish = (body = {}) =>
    finalizePostalLetter(
      state,
      definitions,
      today,
      {
        householdId: "10",
        previewToken: preview().token,
        confirm: true,
        ...body,
      },
      store,
      ctx,
      reader,
      client,
    );
  const item = () => structuredClone([...persisted.values()][0]);
  const recover = (action = "verify_letter_appeals") => {
    state.history = [item()];
    return syncLetterAppeals(
      state,
      definitions,
      today,
      { action, deliveryId: state.history[0].id, confirm: true },
      store,
      ctx,
      reader,
      client,
    );
  };
  return {
    state,
    row,
    profiles,
    store,
    reader,
    client,
    events,
    item,
    preview,
    finish,
    recover,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${today}T15:00:00Z`));
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

async function draftFixture(format = "docx") {
  const f = await fixture();
  const documents = new Map();
  f.store.createPostalDraft = vi.fn(async (draft) => {
    f.state.postalDraft = structuredClone(draft);
    f.state.revision++;
  });
  f.store.savePostalDraft = vi.fn(async (draft, document) => {
    f.state.postalDraft =
      draft.status === "draft" ? structuredClone(draft) : null;
    if (document) documents.set(document.id, structuredClone(document));
    f.state.revision++;
  });
  f.store.approvePostalDraft = vi.fn(async (draft, items) => {
    f.state.history.push(...structuredClone(items));
    f.state.postalDraft = null;
    f.state.revision++;
  });
  const read = vi.fn(async (id) => structuredClone(documents.get(id)));
  if (format === "pdf") {
    vi.stubEnv("SOCIETY_PDF_ENABLED", "true");
    vi.stubEnv(
      "SOCIETY_PDF_CONVERTER_URL",
      "https://private.example.org/forms/libreoffice/convert",
    );
    vi.stubEnv("SOCIETY_PDF_CONVERTER_TOKEN", "fictional-token");
  }
  const id = await startPostalDraft(
    f.state,
    definitions,
    today,
    { householdIds: ["10"], format },
    f.store,
    ctx,
  );
  const body = { draftId: id, householdId: "10" };
  const prepare = () =>
    preparePostalDocument(
      f.state,
      definitions,
      today,
      body,
      f.store,
      async () => Buffer.from("%PDF-1.7\nfictional test\n%%EOF"),
    );
  const review = () =>
    reviewPostalDocument(
      f.state,
      definitions,
      today,
      {
        ...body,
        documentHash: f.state.postalDraft.entries[0].document.sha256,
        confirm: true,
      },
      f.store,
      ctx,
    );
  const approve = () =>
    approvePostalDraft(
      f.state,
      definitions,
      today,
      { draftId: id, confirm: true },
      f.store,
      ctx,
      read,
    );
  return { ...f, id, body, read, documents, prepare, review, approve };
}

describe("saved postal batch approvals", () => {
  it("retains a days-old recipient review while requiring fresh NXT delivery checks", async () => {
    const f = await draftFixture();
    const recipients = structuredClone(f.state.recipient_reviews);
    const later = "2026-09-28";
    vi.setSystemTime(new Date(`${later}T15:00:00Z`));
    await expect(
      updateLetterDates(
        f.state,
        definitions,
        later,
        { draftId: f.id, confirm: true },
        f.store,
        ctx,
      ),
    ).rejects.toThrow(/24 hours/);
    f.state.snapshot.generatedAt = new Date().toISOString();
    await runLetterReadiness(
      f.state,
      definitions,
      later,
      { action: "check_readiness", channel: "post" },
      f.store,
      ctx,
      f.reader,
    );
    await updateLetterDates(
      f.state,
      definitions,
      later,
      { draftId: f.id, confirm: true },
      f.store,
      ctx,
    );
    expect(f.state.postalDraft.entries[0].row.letterDate).toBe(later);
    expect(f.state.recipient_reviews).toEqual(recipients);
    expect(f.client.create).not.toHaveBeenCalled();
  });
  it("updates an older draft's date globally without resetting recipient reviews or changing history", async () => {
    const f = await draftFixture();
    await f.prepare();
    await f.review();
    const recipients = structuredClone(f.state.recipient_reviews);
    const originalDocument = f.state.postalDraft.entries[0].document;
    const history = structuredClone(f.state.history);
    const tomorrow = "2026-09-26";
    vi.setSystemTime(new Date(`${tomorrow}T14:00:00Z`));
    await updateLetterDates(
      f.state,
      definitions,
      tomorrow,
      { draftId: f.id, confirm: true },
      f.store,
      ctx,
    );
    const entry = f.state.postalDraft.entries[0];
    expect(entry.row.letterDate).toBe(tomorrow);
    expect(entry.document).toBeUndefined();
    expect(entry.reviewedHash).toBeUndefined();
    expect(f.state.recipient_reviews).toEqual(recipients);
    expect(f.state.history).toEqual(history);
    expect(f.documents.has(originalDocument.id)).toBe(true);
    expect(f.client.create).not.toHaveBeenCalled();
    await expect(
      approvePostalDraft(
        f.state,
        definitions,
        tomorrow,
        { draftId: f.id, confirm: true },
        f.store,
        ctx,
        f.read,
      ),
    ).rejects.toThrow(/Preview and approve every document/);
    await preparePostalDocument(
      f.state,
      definitions,
      tomorrow,
      f.body,
      f.store,
    );
    expect(renderSocietyLetter).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ letterDate: tomorrow }),
      tomorrow,
    );
  });
  it("does not reset current-date document approvals or mutate created letters", async () => {
    const f = await draftFixture();
    await f.prepare();
    await f.review();
    const before = structuredClone(f.state);
    await updateLetterDates(
      f.state,
      definitions,
      today,
      { draftId: f.id, confirm: true },
      f.store,
      ctx,
    );
    expect(f.state).toEqual(before);
    await f.approve();
    const approved = structuredClone(f.state);
    await updateLetterDates(
      f.state,
      definitions,
      "2026-09-26",
      { draftId: null, confirm: true },
      f.store,
      ctx,
    );
    expect(f.state).toEqual(approved);
  });
  it("requires confirmation and the current draft, and rejects a changed recipient rather than approving it silently", async () => {
    const f = await draftFixture();
    const before = structuredClone(f.state.postalDraft);
    await expect(
      updateLetterDates(
        f.state,
        definitions,
        "2026-09-26",
        { draftId: f.id },
        f.store,
        ctx,
      ),
    ).rejects.toThrow(/Confirm/);
    await expect(
      updateLetterDates(
        f.state,
        definitions,
        "2026-09-26",
        { draftId: "different", confirm: true },
        f.store,
        ctx,
      ),
    ).rejects.toThrow(/draft changed/);
    f.state.postalDraft.entries[0].row.salutation = "Old greeting";
    await expect(
      updateLetterDates(
        f.state,
        definitions,
        "2026-09-26",
        { draftId: f.id, confirm: true },
        f.store,
        ctx,
      ),
    ).rejects.toThrow(/More than the date changed/);
    expect(f.store.savePostalDraft).not.toHaveBeenCalled();
    expect(f.state.postalDraft.entries[0].row.letterDate).toBe(
      before.entries[0].row.letterDate,
    );
    expect(f.client.create).not.toHaveBeenCalled();
  });
  it("prepares, previews, and approves exact documents without applying an appeal", async () => {
    const f = await draftFixture();
    await f.prepare();
    const original = f.state.postalDraft.entries[0].document;
    const preview = await draftPostalDocument(
      f.state,
      definitions,
      today,
      f.body,
      f.read,
    );
    expect(preview.bytes.toString()).toBe("fictional letter");
    await f.review();
    const id = await f.approve();
    expect(id).toBe(f.id);
    expect(f.state.history[0].members).toEqual(["10", "11"]);
    expect(f.state.history[0].postalDocument).toEqual(original);
    expect(f.state.history[0].postalApproval).toMatchObject({ approvedBy: 7 });
    expect(
      f.state.history[0].letterAppeals.members.map((m) => m.status),
    ).toEqual(["pending", "pending"]);
    expect(f.client.create).not.toHaveBeenCalled();
    expect(f.reader.member).not.toHaveBeenCalled();
  });
  it("never converts again or changes the stored PDF after approval", async () => {
    const f = await draftFixture("pdf");
    await f.prepare();
    await f.prepare();
    await f.review();
    await f.approve();
    expect(f.documents.size).toBe(1);
    const item = f.state.history[0];
    expect(
      (await savedPostalDocument(item.postalDocument, f.read)).bytes.toString(),
    ).toContain("%PDF-");
    expect(item.postalDocument.format).toBe("pdf");
    await expect(postalBatchDownload([item], f.read)).rejects.toMatchObject({
      status: 409,
    });
    item.letterAppeals.status = "complete";
    item.letterAppeals.members.forEach((m) => {
      m.status = "verified";
    });
    expect((await postalBatchDownload([item], f.read)).length).toBeGreaterThan(
      0,
    );
  });
  it("requires matching document approval and final batch confirmation", async () => {
    const f = await draftFixture();
    await expect(f.approve()).rejects.toThrow(/every document/);
    await f.prepare();
    await expect(
      reviewPostalDocument(
        f.state,
        definitions,
        today,
        { ...f.body, documentHash: "wrong", confirm: true },
        f.store,
        ctx,
      ),
    ).rejects.toThrow(/exact saved document/);
    await expect(f.approve()).rejects.toThrow(/every document/);
    await f.review();
    await expect(
      approvePostalDraft(
        f.state,
        definitions,
        today,
        { draftId: f.id },
        f.store,
        ctx,
        f.read,
      ),
    ).rejects.toThrow(/Confirm/);
    expect(f.store.approvePostalDraft).not.toHaveBeenCalled();
  });
  it.each(["wording", "date", "template", "membership", "policy", "exclusion"])(
    "blocks stale %s approvals without writes",
    async (kind) => {
      const f = await draftFixture();
      await f.prepare();
      await f.review();
      let day = today;
      if (kind === "wording")
        Object.values(f.state.recipient_reviews)[0].values.salutation =
          "Changed";
      if (kind === "date") day = "2026-09-26";
      if (kind === "template") f.state.templates.v1.version = "v2";
      if (kind === "membership")
        f.state.snapshot.generatedAt = "2026-09-25T14:59:59Z";
      if (kind === "policy")
        f.state.readiness.policy.appeals.presidents.description = "Changed";
      if (kind === "exclusion")
        f.state.exclusions = [{ members: ["10"], period: f.row.period }];
      await expect(
        approvePostalDraft(
          f.state,
          definitions,
          day,
          { draftId: f.id, confirm: true },
          f.store,
          ctx,
          f.read,
        ),
      ).rejects.toThrow();
      expect(f.store.approvePostalDraft).not.toHaveBeenCalled();
      expect(f.client.create).not.toHaveBeenCalled();
    },
  );
  it("does not approve missing or corrupted stored files", async () => {
    const f = await draftFixture();
    await f.prepare();
    await f.review();
    f.documents.values().next().value.content =
      Buffer.from("tampered").toString("base64");
    await expect(f.approve()).rejects.toThrow(/could not be verified/);
    expect(f.store.approvePostalDraft).not.toHaveBeenCalled();
  });
  it("persists a draft after conversion failure with no reservation or appeal writes", async () => {
    const f = await draftFixture("pdf");
    await expect(
      preparePostalDocument(
        f.state,
        definitions,
        today,
        f.body,
        f.store,
        async () => {
          throw Error("offline");
        },
      ),
    ).rejects.toThrow("offline");
    expect(f.state.postalDraft.entries[0].document).toBeUndefined();
    expect(f.store.reserve).not.toHaveBeenCalled();
    expect(f.client.create).not.toHaveBeenCalled();
    await f.prepare();
    expect(f.documents.size).toBe(1);
  });
  it("continues one reserved household and retains partial receipts", async () => {
    const f = await draftFixture();
    await f.prepare();
    await f.review();
    await f.approve();
    const sync = (...args) => syncLetterAppeals(...args, f.reader, f.client);
    f.client.create.mockRejectedValueOnce(new Error("lost response"));
    await continuePostalBatch(
      f.state,
      definitions,
      today,
      { batchId: f.id, confirm: true },
      f.store,
      ctx,
      sync,
      f.read,
    );
    expect(f.client.create).toHaveBeenCalledTimes(1);
    await expect(
      continuePostalBatch(
        f.state,
        definitions,
        today,
        { batchId: f.id, confirm: true },
        f.store,
        ctx,
        sync,
        f.read,
      ),
    ).rejects.toThrow(/paused/);
    expect(f.client.create).toHaveBeenCalledTimes(1);
  });
  it("applies both member appeals and skips a completed batch on continuation", async () => {
    const f = await draftFixture();
    await f.prepare();
    await f.review();
    await f.approve();
    const sync = (...args) => syncLetterAppeals(...args, f.reader, f.client);
    await continuePostalBatch(
      f.state,
      definitions,
      today,
      { batchId: f.id, confirm: true },
      f.store,
      ctx,
      sync,
      f.read,
    );
    await continuePostalBatch(
      f.state,
      definitions,
      today,
      { batchId: f.id, confirm: true },
      f.store,
      ctx,
      sync,
      f.read,
    );
    expect(f.client.create.mock.calls.map((args) => args[0])).toEqual([
      "10",
      "11",
    ]);
    expect(f.state.history[0].letterAppeals.status).toBe("complete");
  });
  it("can discard only an unapproved draft, with explicit confirmation", async () => {
    const f = await draftFixture();
    await expect(discardPostalDraft(f.state, f.body, f.store)).rejects.toThrow(
      /Confirm/,
    );
    await discardPostalDraft(f.state, { ...f.body, confirm: true }, f.store);
    expect(f.state.postalDraft).toBeNull();
    expect(f.state.history).toEqual([]);
  });
  it("does not offer an implicit PDF fallback or duplicate drafts", async () => {
    const f = await fixture();
    vi.stubEnv("SOCIETY_PDF_ENABLED", "false");
    await expect(
      startPostalDraft(
        f.state,
        definitions,
        today,
        { householdIds: ["10"], format: "pdf" },
        f.store,
        ctx,
      ),
    ).rejects.toMatchObject({ status: 503 });
    const d = await draftFixture();
    await expect(
      startPostalDraft(
        d.state,
        definitions,
        today,
        { householdIds: ["10"], format: "docx" },
        d.store,
        ctx,
      ),
    ).rejects.toMatchObject({ status: 409 });
    for (const householdIds of [
      [],
      ["10", "10"],
      Array.from({ length: 11 }, (_, i) => String(i)),
      [10],
    ]) {
      await expect(
        startPostalDraft(
          f.state,
          definitions,
          today,
          { householdIds, format: "docx" },
          f.store,
          ctx,
        ),
      ).rejects.toThrow(/distinct ready/);
    }
  });
});

describe("final postal letters and household appeal receipts", () => {
  it("preview renders saved choices without any NXT calls or reservation", async () => {
    const f = await fixture();
    expect(f.preview().row.members).toEqual(["10", "11"]);
    expect(renderSocietyLetter).toHaveBeenCalled();
    expect(f.reader.member).not.toHaveBeenCalled();
    expect(f.client.catalog).not.toHaveBeenCalled();
    expect(f.store.reserve).not.toHaveBeenCalled();
  });
  it("creates one highest-tier letter and applies its appeal to BOTH IDs despite one selected recipient", async () => {
    const f = await fixture();
    await f.finish({ members: ["999"], channel: "email" });
    expect(f.store.reserve).toHaveBeenCalledTimes(1);
    expect(f.client.create.mock.calls.map((args) => args[0])).toEqual([
      "10",
      "11",
    ]);
    expect(
      f.client.create.mock.calls.every((args) => args[1].id === "100"),
    ).toBe(true);
    expect(f.item().coveredKeys).toEqual(["presidents", "ood"]);
    expect(f.item().letterAppeals.status).toBe("complete");
    expect(f.item().status).toBe("prepared");
    expect(f.item().selectionSummary).toMatchObject({
      version: 1,
      total: 1,
      selected: 1,
      notSelected: 0,
    });
    expect(f.events.indexOf("save:uncertain,pending")).toBeLessThan(
      f.events.indexOf("post:10"),
    );
    expect(f.events.indexOf("save:verified,uncertain")).toBeLessThan(
      f.events.indexOf("post:11"),
    );
    expect(() => assertLetterAppealsComplete([f.item()])).not.toThrow();
    f.state.history = [f.item()];
    expect(letterDisposition(f.row, f.state.history).status).toBe("held");
    expect(() => f.preview()).toThrow(/reserved letter/);
  });
  it("supports a single recipient and the lower tier without an invented spouse", async () => {
    const f = await fixture(true, "ood");
    await f.finish();
    expect(f.client.create).toHaveBeenCalledTimes(1);
    expect(f.client.create.mock.calls[0][1].id).toBe("101");
    expect(f.item().letterAppeals.members.map((m) => m.id)).toEqual(["10"]);
  });
  it("freezes final-letter selection counts and ignores client-supplied summary values", async () => {
    const f = await fixture();
    f.state.snapshot.rows.push({
      ...f.row,
      householdId: "20",
      members: ["20"],
    });
    const preview = f.preview();
    expect(preview.selectionSummary).toMatchObject({
      total: 2,
      selected: 1,
      notSelected: 1,
    });
    await f.finish({ selectionSummary: { total: 999, selected: 999 } });
    expect(f.item().selectionSummary).toEqual(preview.selectionSummary);
    f.state.snapshot.rows = [];
    expect(f.item().selectionSummary.total).toBe(2);
  });
  it.each([
    "confirmation",
    "token",
    "revision",
    "expired",
    "excluded",
    "unreviewed",
    "membership",
    "hierarchy",
  ])("blocks invalid %s before reservation or writes", async (kind) => {
    const f = await fixture();
    const token = f.preview().token;
    const body = {
      householdId: "10",
      previewToken: token,
      confirm: kind !== "confirmation",
    };
    if (kind === "token") body.previewToken = "bad";
    if (kind === "revision") f.state.revision++;
    if (kind === "expired") vi.setSystemTime(new Date("2026-09-27T15:00:00Z"));
    if (kind === "excluded")
      f.state.exclusions.push({ members: ["11"], period: f.row.period });
    if (kind === "unreviewed") f.state.recipient_reviews = {};
    if (kind === "membership") f.state.snapshot.signature = "changed";
    if (kind === "hierarchy") f.state.settings.societyKeys = ["ood"];
    await expect(
      finalizePostalLetter(
        f.state,
        definitions,
        today,
        body,
        f.store,
        ctx,
        f.reader,
        f.client,
      ),
    ).rejects.toThrow();
    expect(f.client.create).not.toHaveBeenCalled();
    expect(f.store.reserve).not.toHaveBeenCalled();
  });
  it.each([
    "spouse",
    "name",
    "restriction",
    "prior",
    "address",
    "inactive",
    "consent",
  ])("fresh %s check blocks BOTH writes", async (kind) => {
    const f = await fixture();
    if (kind === "spouse") f.profiles["11"].profile.spouse.id = "12";
    if (kind === "name") f.profiles["11"].profile.first = "Changed";
    if (kind === "restriction") f.profiles["11"].preferences.push({ id: "p" });
    if (kind === "prior")
      f.profiles["11"].appeals.push({ id: "a", appeal: { id: "100" } });
    if (kind === "address") f.profiles["10"].profile.address.do_not_mail = true;
    if (kind === "inactive") f.profiles["11"].profile.inactive = true;
    if (kind === "consent") f.profiles["11"].consents.push({ id: "c" });
    await expect(f.finish()).rejects.toThrow();
    expect(f.store.reserve).not.toHaveBeenCalled();
    expect(f.client.create).not.toHaveBeenCalled();
  });
  it("refuses an ambiguous appeal description before reservation", async () => {
    const f = await fixture();
    f.client.catalog.mockResolvedValue([
      { ...f.state.readiness.policy.appeals.presidents, inactive: false },
      { id: "900", description: "CY2026 Presidents Letter", inactive: false },
    ]);
    await expect(f.finish()).rejects.toThrow(/not unique/);
    expect(f.client.create).not.toHaveBeenCalled();
  });
  it("does not write if reservation or durable member intent cannot be saved", async () => {
    const f = await fixture();
    f.store.reserve.mockRejectedValueOnce(new Error("db down"));
    await expect(f.finish()).rejects.toThrow("db down");
    expect(f.client.create).not.toHaveBeenCalled();
    f.store.saveLetterAppeals.mockRejectedValue(new Error("lease lost"));
    await expect(f.finish()).rejects.toThrow("lease lost");
    expect(f.client.create).not.toHaveBeenCalled();
  });
  it("reconciles accepted-but-timeout without resubmitting, then continues only the spouse", async () => {
    const f = await fixture();
    const create = f.client.create.getMockImplementation();
    f.client.create.mockImplementationOnce(async (...args) => {
      await create(...args);
      throw new Error("timeout");
    });
    await f.finish();
    expect(f.item().letterAppeals.members.map((m) => m.status)).toEqual([
      "uncertain",
      "pending",
    ]);
    expect(() => assertLetterAppealsComplete([f.item()])).toThrow();
    expect(f.client.create).toHaveBeenCalledTimes(1);
    await f.recover();
    expect(f.client.create).toHaveBeenCalledTimes(1);
    expect(f.item().letterAppeals.members.map((m) => m.status)).toEqual([
      "verified",
      "pending",
    ]);
    await f.recover("continue_letter_appeals");
    expect(f.client.create.mock.calls.map((args) => args[0])).toEqual([
      "10",
      "11",
    ]);
    expect(f.item().letterAppeals.status).toBe("complete");
    expect(f.store.reserve).toHaveBeenCalledTimes(1);
  });
  it("never retries unresolved uncertain, 5xx, or missing-ID submissions", async () => {
    for (const failure of [
      new Error("timeout"),
      Object.assign(new Error("server"), { httpStatus: 500 }),
      null,
    ]) {
      const f = await fixture();
      f.client.create.mockImplementationOnce(async () => {
        if (failure) throw failure;
        return {};
      });
      await f.finish();
      await f.recover("continue_letter_appeals");
      expect(f.client.create).toHaveBeenCalledTimes(1);
      expect(f.item().letterAppeals.status).toBe("needs_review");
    }
  });
  it("requires explicit continuation after a definite rejection and rechecks history", async () => {
    const f = await fixture();
    f.client.create.mockRejectedValueOnce(
      Object.assign(new Error("rate limited"), { httpStatus: 429 }),
    );
    await f.finish();
    expect(f.item().letterAppeals.members[0].status).toBe("pending");
    await f.recover();
    expect(f.client.create).toHaveBeenCalledTimes(1);
    await f.recover("continue_letter_appeals");
    expect(f.client.create).toHaveBeenCalledTimes(3);
    expect(f.item().letterAppeals.status).toBe("complete");
  });
  it("preserves the first receipt if the second member fails", async () => {
    const f = await fixture();
    const create = f.client.create.getMockImplementation();
    f.client.create.mockImplementation(async (...args) => {
      if (args[0] === "11") throw new Error("network");
      return create(...args);
    });
    await f.finish();
    expect(f.item().letterAppeals.members.map((m) => m.status)).toEqual([
      "verified",
      "uncertain",
    ]);
    await f.recover();
    expect(f.client.create).toHaveBeenCalledTimes(2);
  });
  it.each(["duplicate", "removed", "changed"])(
    "never recreates or overwrites %s assignments",
    async (kind) => {
      const f = await fixture();
      await f.finish();
      if (kind === "duplicate")
        f.profiles["10"].appeals.push({
          ...f.profiles["10"].appeals[0],
          id: "999",
        });
      if (kind === "removed") f.profiles["10"].appeals = [];
      if (kind === "changed")
        f.profiles["10"].appeals[0].comments = "Other letter";
      await f.recover();
      expect(f.item().letterAppeals.status).toBe("needs_review");
      expect(f.client.create).toHaveBeenCalledTimes(2);
    },
  );
  it("does not continue after policy or spouse changes but still allows read-only verification", async () => {
    const f = await fixture();
    f.client.create.mockRejectedValueOnce(
      Object.assign(new Error("rejected"), { httpStatus: 400 }),
    );
    await f.finish();
    f.state.readiness.policy.appeals.presidents.id = "900";
    await f.recover("continue_letter_appeals");
    expect(f.client.create).toHaveBeenCalledTimes(1);
    await f.recover();
    expect(f.client.create).toHaveBeenCalledTimes(1);
  });
  it("allows identical appeal settings to be reverified without stranding a reserved letter", async () => {
    const f = await fixture();
    f.client.create.mockRejectedValueOnce(
      Object.assign(new Error("rejected"), { httpStatus: 400 }),
    );
    await f.finish();
    f.state.readiness.policy.savedAt = "2026-09-25T16:00:00Z";
    f.state.readiness.policy.savedBy = 99;
    await f.recover("continue_letter_appeals");
    expect(f.item().letterAppeals.status).toBe("complete");
    expect(f.client.create).toHaveBeenCalledTimes(3);
  });
});
