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
import {
  letterPeriod,
  letterDisposition,
  normalizeLetterMergeSettings,
} from "@/utils/societyLetters";
import { readinessReader } from "./societyLetterReadinessNxt";
import { finishSelectedLetterAppeals } from "./societyLetterBulkAppeals";
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
  // Production approval must work without a separate manual preflight.
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
  const recover = (action = "verify_letter_appeals", extra = {}) => {
    state.history = [item()];
    return syncLetterAppeals(
      state,
      definitions,
      today,
      { action, deliveryId: state.history[0].id, confirm: true, ...extra },
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
  it.each(["running", "paused"])(
    "does not let an optional %s preflight block document preparation or approval",
    async (status) => {
      const f = await draftFixture();
      f.state.readiness.job = { status, id: "optional-check" };
      await f.prepare();
      await f.review();
      await f.approve();
      expect(f.state.history).toHaveLength(1);
      expect(f.reader.member).not.toHaveBeenCalled();
      expect(f.client.create).not.toHaveBeenCalled();
    },
  );
  it.each(["restriction", "prior letter", "NXT unavailable", "rate limited"])(
    "automatically blocks both members' appeal writes on %s even without manual preflight",
    async (kind) => {
      const f = await draftFixture();
      expect(f.state.readiness.results).toEqual({});
      await f.prepare();
      await f.review();
      await f.approve();
      expect(f.reader.member).not.toHaveBeenCalled();
      if (kind === "restriction")
        f.profiles["11"].preferences.push({ id: "do-not-mail" });
      if (kind === "prior letter")
        f.profiles["11"].appeals.push({ id: "a", appeal: { id: "100" } });
      if (kind === "NXT unavailable" || kind === "rate limited")
        f.reader.member.mockRejectedValueOnce(
          Object.assign(new Error(kind), {
            httpStatus: kind === "rate limited" ? 429 : 503,
          }),
        );
      await continuePostalBatch(
        f.state,
        definitions,
        today,
        { batchId: f.id, confirm: true },
        f.store,
        ctx,
        (...args) => syncLetterAppeals(...args, f.reader, f.client),
        f.read,
      );
      expect(f.reader.member).toHaveBeenCalled();
      expect(f.client.create).not.toHaveBeenCalled();
      expect(f.state.history[0].letterAppeals.status).toBe("needs_review");
      await expect(
        postalBatchDownload(f.state.history, f.read),
      ).rejects.toMatchObject({ status: 409 });
    },
  );
  it("prepares ten PDFs resumably and applies each member's appeal only once after approval", async () => {
    const f = await draftFixture("pdf");
    vi.stubEnv("SOCIETY_PDF_MAX_BATCH_SIZE", "10");
    f.state.postalDraft = null;
    const ids = Array.from({ length: 10 }, (_, i) => String((i + 1) * 10));
    for (const id of ids.slice(1)) {
      const row = structuredClone(f.row);
      const spouse = String(Number(id) + 1);
      row.householdId = id;
      row.members = [id, spouse];
      row.memberNames.forEach((member, i) => {
        member.constituentId = row.members[i];
      });
      row.recipientCandidates[0].constituentId = id;
      f.state.snapshot.rows.push(row);
      for (const [index, member] of row.members.entries()) {
        const profile = structuredClone(f.profiles[index ? "11" : "10"]);
        profile.profile.id = member;
        profile.profile.spouse.id = row.members[1 - index];
        profile.profile.address.id = `a${member}`;
        profile.profile.address.constituent_id = member;
        f.profiles[member] = profile;
      }
      await saveLetterRecipientReview(
        f.state,
        row,
        f.state.snapshot.signature,
        {
          ...row.recipientCandidates[0],
          confirm: true,
          reviewToken: recipientReviewForRow(
            f.state,
            row,
            f.state.snapshot.signature,
          ).token,
          recipientConstituentId: id,
          addressConstituentId: id,
        },
        f.store,
        ctx.user.id,
      );
    }
    f.store.createPostalDraft.mockClear();
    await expect(
      startPostalDraft(
        f.state,
        definitions,
        today,
        {
          householdIds: [...ids, "110"],
          format: "pdf",
        },
        f.store,
        ctx,
      ),
    ).rejects.toThrow("Choose 1-10 distinct ready households");
    expect(f.store.createPostalDraft).not.toHaveBeenCalled();
    const draftId = await startPostalDraft(
      f.state,
      definitions,
      today,
      {
        householdIds: ids,
        format: "pdf",
      },
      f.store,
      ctx,
    );
    const convert = vi.fn(async () => {
      if (convert.mock.calls.length === 5)
        throw new Error("Temporary conversion failure");
      return Buffer.from(
        `%PDF-1.7\nfictional ${convert.mock.calls.length}\n%%EOF`,
      );
    });
    const prepare = (householdId) =>
      preparePostalDocument(
        f.state,
        definitions,
        today,
        { draftId, householdId },
        f.store,
        convert,
      );
    for (const id of ids.slice(0, 4)) await prepare(id);
    const saved = structuredClone(f.state.postalDraft.entries.slice(0, 4));
    await expect(prepare(ids[4])).rejects.toThrow(
      "Temporary conversion failure",
    );
    expect(f.documents.size).toBe(4);
    expect(f.state.postalDraft.entries.slice(0, 4)).toEqual(saved);
    expect(f.client.create).not.toHaveBeenCalled();

    // Reopening the draft reuses saved documents instead of converting them again.
    for (const id of ids) await prepare(id);
    expect(convert).toHaveBeenCalledTimes(11);
    expect(f.documents.size).toBe(10);
    expect(f.state.postalDraft.entries.slice(0, 4)).toEqual(saved);
    await expect(
      approvePostalDraft(
        f.state,
        definitions,
        today,
        {
          draftId,
          confirm: true,
        },
        f.store,
        ctx,
        f.read,
      ),
    ).rejects.toThrow(/Preview and approve every document/);
    for (const entry of f.state.postalDraft.entries) {
      await reviewPostalDocument(
        f.state,
        definitions,
        today,
        {
          draftId,
          householdId: entry.householdId,
          documentHash: entry.document.sha256,
          confirm: true,
        },
        f.store,
        ctx,
      );
    }
    await approvePostalDraft(
      f.state,
      definitions,
      today,
      {
        draftId,
        confirm: true,
      },
      f.store,
      ctx,
      f.read,
    );
    expect(f.state.history).toHaveLength(10);
    expect(f.client.create).not.toHaveBeenCalled();
    const advance = () =>
      continuePostalBatch(
        f.state,
        definitions,
        today,
        {
          batchId: draftId,
          confirm: true,
        },
        f.store,
        ctx,
        (...args) => syncLetterAppeals(...args, f.reader, f.client),
        f.read,
      );
    for (let i = 0; i < 10; i++) {
      await advance();
      expect(f.client.create).toHaveBeenCalledTimes((i + 1) * 2);
    }
    await advance();
    expect(f.client.create).toHaveBeenCalledTimes(20);
    expect(new Set(f.client.create.mock.calls.map(([id]) => id)).size).toBe(20);
    expect(
      f.state.history.every((item) => item.letterAppeals.status === "complete"),
    ).toBe(true);
    expect(
      (await postalBatchDownload(f.state.history, f.read)).length,
    ).toBeGreaterThan(0);
  });
  it("enforces a lower configured PDF limit on the server before saving or updating appeals", async () => {
    const f = await draftFixture("pdf");
    f.state.postalDraft = null;
    f.store.createPostalDraft.mockClear();
    vi.stubEnv("SOCIETY_PDF_MAX_BATCH_SIZE", "3");
    await expect(
      startPostalDraft(
        f.state,
        definitions,
        today,
        { householdIds: ["10", "20", "30", "40"], format: "pdf" },
        f.store,
        ctx,
      ),
    ).rejects.toThrow("Choose 1-3 households");
    expect(f.store.createPostalDraft).not.toHaveBeenCalled();
    expect(f.events).not.toContain("reserve");
    await startPostalDraft(
      f.state,
      definitions,
      today,
      { householdIds: ["10"], format: "pdf" },
      f.store,
      ctx,
    );
    expect(f.store.createPostalDraft).toHaveBeenCalledOnce();
    expect(f.state.postalDraft.format).toBe("pdf");
  });
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
  it.each([
    "wording",
    "template",
    "template-content",
    "membership",
    "policy",
    "exclusion",
  ])("blocks stale %s approvals without writes", async (kind) => {
    const f = await draftFixture();
    await f.prepare();
    await f.review();
    let day = today;
    if (kind === "wording")
      Object.values(f.state.recipient_reviews)[0].values.salutation = "Changed";
    if (kind === "template") f.state.templates.v1.version = "v2";
    if (kind === "template-content")
      f.state.templates.v1.content = "Changed bytes";
    if (kind === "membership")
      f.state.snapshot.rows[0].memberNames[1].lastName = "Changed";
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
  });
  it.each([false, true])(
    "keeps exact document approval after a routine refresh and a new day (legacy: %s)",
    async (legacy) => {
      const f = await draftFixture();
      await f.prepare();
      await f.review();
      const entry = f.state.postalDraft.entries[0];
      if (legacy) {
        delete entry.fingerprintVersion;
        entry.fingerprint = "old-generatedAt-based-fingerprint";
        const template = {
          ...f.state.templates.v1,
          content: "fictional bytes",
          subject: "",
          emailBody: "",
        };
        template.version = hash([
          template.content,
          template.subject,
          template.emailBody,
          normalizeLetterMergeSettings(template.mergeSettings),
        ]);
        f.state.templates = { [template.version]: template };
        entry.row.templateVersion = template.version;
      }
      const savedDocument = structuredClone(entry.document);
      const reviewedAt = entry.reviewedAt;
      vi.setSystemTime(new Date("2026-09-26T15:00:00Z"));
      f.state.snapshot.generatedAt = new Date().toISOString();
      await approvePostalDraft(
        f.state,
        definitions,
        "2026-09-26",
        { draftId: f.id, confirm: true },
        f.store,
        ctx,
        f.read,
      );
      expect(f.state.history[0].postalDocument).toEqual(savedDocument);
      expect(f.state.history[0].postalApproval.reviewedAt).toBe(reviewedAt);
      expect(f.state.history[0].letterDate).toBe(today);
      expect(f.state.history[0].letterAppeals.date).toBe(today);
      expect(f.client.create).not.toHaveBeenCalled();
    },
  );
  it("allows one explicit approval of all prepared documents without opening them again", async () => {
    const f = await draftFixture("pdf");
    await f.prepare();
    await approvePostalDraft(
      f.state,
      definitions,
      today,
      { draftId: f.id, confirm: true, approvePreparedDocuments: true },
      f.store,
      ctx,
      f.read,
    );
    expect(f.state.history[0].postalApproval).toMatchObject({
      reviewedBy: 7,
      approvedBy: 7,
    });
    expect(f.client.create).not.toHaveBeenCalled();
  });
  it.each(["missing", "corrupted", "expired-review"])(
    "bulk approval still blocks %s documents",
    async (kind) => {
      const f = await draftFixture();
      if (kind !== "missing") await f.prepare();
      if (kind === "corrupted")
        f.documents.values().next().value.content = "corrupt";
      if (kind === "expired-review")
        Object.values(f.state.recipient_reviews)[0].savedAt =
          "2026-09-01T00:00:00Z";
      await expect(
        approvePostalDraft(
          f.state,
          definitions,
          today,
          { draftId: f.id, confirm: true, approvePreparedDocuments: true },
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
  it("keeps both names and suppression IDs but assigns only the full constituent, resumably", async () => {
    const f = await fixture();
    f.profiles["10"].profile.is_constituent = true;
    f.profiles["11"].profile.is_constituent = false;
    f.profiles["11"].consents = null;
    f.profiles["11"].consentUnavailable = "relationship_only";
    f.profiles["10"].consents = [
      {
        id: "15",
        channel: "Email",
        constituent_consent_response: "OptIn",
        consent_date: "2026-09-01T00:00:00Z",
      },
    ];
    await f.finish();
    const item = f.item();
    expect(item.members).toEqual(["10", "11"]);
    expect(item.addressee).toBe("Alex & Pat Sample");
    expect(item.letterAppeals.status).toBe("complete");
    expect(item.letterAppeals.members[1]).toMatchObject({
      id: "11",
      status: "not_applicable",
      reason: "relationship_only",
    });
    expect(f.client.create).toHaveBeenCalledTimes(1);
    expect(f.client.create.mock.calls[0][0]).toBe("10");
    expect(() => assertLetterAppealsComplete([item])).not.toThrow();
    await f.recover();
    expect(f.client.create).toHaveBeenCalledTimes(1);
    expect(
      letterDisposition(
        { ...f.row, householdId: "11", members: ["11"] },
        [item],
        [],
      ).status,
    ).toBe("held");
    expect(
      letterDisposition(
        { ...f.row, householdId: "11", members: ["11"] },
        [{ ...item, status: "mailed" }],
        [],
      ).status,
    ).toBe("covered");
  });
  it.each(["both-relationship", "unlinked", "restricted", "unknown-partner"])(
    "does not skip spouse safety for %s",
    async (kind) => {
      const f = await fixture();
      f.profiles["10"].profile.is_constituent = true;
      f.profiles["11"].profile.is_constituent = false;
      f.profiles["11"].consents = null;
      f.profiles["11"].consentUnavailable = "relationship_only";
      if (kind === "both-relationship")
        f.profiles["10"].profile.is_constituent = false;
      if (kind === "unknown-partner")
        delete f.profiles["10"].profile.is_constituent;
      if (kind === "unlinked") f.profiles["11"].profile.spouse.id = "99";
      if (kind === "restricted")
        f.profiles["11"].preferences = [{ solicit_code: "Do not mail" }];
      await expect(f.finish()).rejects.toThrow();
      expect(f.store.reserve).not.toHaveBeenCalled();
      expect(f.client.create).not.toHaveBeenCalled();
    },
  );
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
    "deceased",
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
    if (kind === "deceased") f.profiles["11"].profile.deceased = true;
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
  it.each(["consent", "unavailable-spouse"])(
    "real reader keeps %s review ahead of both appeal writes",
    async (scenario) => {
      const f = await fixture();
      const fetcher = vi.fn(async (path) => {
        const id = path.match(/constituents\/(\d+)/)[1];
        if (path.includes("/consents?")) {
          if (scenario === "unavailable-spouse" && id === "11")
            throw Object.assign(new Error("provider body"), {
              httpStatus: 404,
            });
          const value =
            scenario === "consent" && id === "10"
              ? [
                  {
                    id: "15",
                    channel: "Email",
                    constituent_consent_response: "OptIn",
                  },
                ]
              : [];
          return { count: value.length, value };
        }
        if (
          path.endsWith("/appeals") ||
          path.endsWith("/constituentsolicitcodes")
        )
          return { count: 0, value: [] };
        return { ...f.profiles[id].profile, is_constituent: id === "10" };
      });
      f.reader.member = readinessReader(ctx, fetcher).member;
      await expect(f.finish()).rejects.toThrow(
        scenario === "consent"
          ? /consent instructions/
          : /not a full constituent/,
      );
      expect(f.store.reserve).not.toHaveBeenCalled();
      expect(f.client.create).not.toHaveBeenCalled();
      expect(f.state.history).toEqual([]);
      expect(
        fetcher.mock.calls.every(([, options]) => options.method === "GET"),
      ).toBe(true);
    },
  );
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
  it("bulk recovery reconciles an accepted timeout and writes only the missing spouse without another letter or approval", async () => {
    const f = await fixture();
    const create = f.client.create.getMockImplementation();
    f.client.create.mockImplementationOnce(async (...args) => {
      await create(...args);
      throw new Error("timeout");
    });
    await f.finish();
    f.state.history = [f.item()];
    const item = f.state.history[0];
    item.postalDocument = { id: "frozen-approved-document" };
    item.postalApproval = { approvedAt: "2026-09-25T14:00:00Z" };
    const before = structuredClone(item);
    const read = vi.fn();
    const result = await finishSelectedLetterAppeals(
      f.state,
      definitions,
      today,
      { confirm: true, deliveryIds: [item.id], deliveryId: item.id },
      f.store,
      ctx,
      (...args) => syncLetterAppeals(...args, f.reader, f.client),
      read,
    );
    expect(result).toMatchObject({ status: "complete", stop: false });
    expect(f.client.create.mock.calls.map((args) => args[0])).toEqual([
      "10",
      "11",
    ]);
    expect(f.store.reserve).toHaveBeenCalledOnce();
    expect(item.postalDocument).toEqual(before.postalDocument);
    expect(item.postalApproval).toEqual(before.postalApproval);
    expect(item.letterAppeals.date).toBe(before.letterAppeals.date);
    expect(item.letterAppeals.comments).toBe(before.letterAppeals.comments);
    expect(() => assertLetterAppealsComplete([item])).not.toThrow();
  });
  it.each([401, 403, 429, 503, null])(
    "returns a selection-wide stop for NXT connection/write failure %s",
    async (httpStatus) => {
      const f = await fixture();
      f.client.create.mockRejectedValueOnce(
        Object.assign(new Error("rejected"), { httpStatus: 422 }),
      );
      await f.finish();
      f.client.create.mockRejectedValueOnce(
        Object.assign(new Error("service failed"), { httpStatus }),
      );
      const result = await f.recover("continue_letter_appeals");
      expect(result).toMatchObject({ status: "needs_review", stop: true });
      expect(f.client.create).toHaveBeenCalledTimes(2);
      expect(f.item().letterAppeals.members[1].status).toBe("pending");
    },
  );
  it("returns a selection-wide stop for rate-limited reads without posting anything", async () => {
    const f = await fixture();
    f.client.create.mockRejectedValueOnce(
      Object.assign(new Error("rejected"), { httpStatus: 422 }),
    );
    await f.finish();
    f.reader.member.mockRejectedValueOnce(
      Object.assign(new Error("cooldown"), { retryAfterMs: 60000 }),
    );
    const result = await f.recover("continue_letter_appeals");
    expect(result.stop).toBe(true);
    expect(f.client.create).toHaveBeenCalledTimes(1);
  });
  it("keeps unresolved prior writes in Needs attention while allowing other selected letters to be checked", async () => {
    const f = await fixture();
    f.client.create.mockRejectedValueOnce(new Error("timeout"));
    await f.finish();
    const result = await f.recover("continue_letter_appeals");
    expect(result).toMatchObject({ status: "needs_review", stop: false });
    expect(result.message).toContain("unconfirmed or was removed");
    expect(f.client.create).toHaveBeenCalledTimes(1);
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
  it("automatically reconciles a saved uncertain letter using only GETs, with intent persisted first", async () => {
    const f = await fixture();
    const create = f.client.create.getMockImplementation();
    f.client.create.mockImplementationOnce(async (...args) => {
      await create(...args);
      throw new Error("lost response");
    });
    await f.finish();
    f.client.create.mockClear();
    f.client.appeals.mockClear();
    f.reader.member.mockClear();
    await f.recover("verify_letter_appeals", { automatic: true });
    expect(f.client.appeals).not.toHaveBeenCalled();
    vi.advanceTimersByTime(5000);
    const read = f.client.appeals.getMockImplementation();
    f.client.appeals.mockImplementation(async (id) => {
      expect(f.item().letterAppeals.verification).toMatchObject({
        attempts: 1,
        status: "checking",
      });
      return read(id);
    });
    await f.recover("verify_letter_appeals", { automatic: true });
    expect(f.item().letterAppeals.members.map((m) => m.status)).toEqual([
      "verified",
      "pending",
    ]);
    expect(f.item().letterAppeals.verification.status).toBe("complete");
    expect(f.client.create).not.toHaveBeenCalled();
    expect(f.reader.member).not.toHaveBeenCalled();
    expect(f.store.reserve).toHaveBeenCalledTimes(1);
  });
  it("stops automatically verifying an unresolved letter after three persisted checks", async () => {
    const f = await fixture(true);
    f.client.create.mockRejectedValueOnce(new Error("lost response"));
    await f.finish();
    f.client.create.mockClear();
    f.client.appeals.mockClear();
    vi.advanceTimersByTime(5000);
    for (let attempt = 1; attempt <= 3; attempt++) {
      await f.recover("verify_letter_appeals", { automatic: true });
      const check = f.item().letterAppeals.verification;
      expect(check.attempts).toBe(attempt);
      if (check.nextCheckAt) vi.setSystemTime(new Date(check.nextCheckAt));
    }
    expect(f.item().letterAppeals.verification.status).toBe("needs_review");
    const reads = f.client.appeals.mock.calls.length;
    vi.advanceTimersByTime(86400000);
    await f.recover("verify_letter_appeals", { automatic: true });
    expect(f.client.appeals).toHaveBeenCalledTimes(reads);
    expect(f.client.create).not.toHaveBeenCalled();
    expect(f.item().letterAppeals.members[0].status).toBe("uncertain");
  });
  it("honors a read cooldown, never writes, and blocks an automatic write action", async () => {
    const f = await fixture(true);
    f.client.create.mockRejectedValueOnce(new Error("lost response"));
    await f.finish();
    f.client.create.mockClear();
    f.client.appeals.mockClear();
    vi.advanceTimersByTime(5000);
    f.client.appeals.mockRejectedValueOnce(
      Object.assign(new Error("cooldown"), {
        httpStatus: 429,
        retryAfterMs: 300000,
      }),
    );
    await f.recover("verify_letter_appeals", { automatic: true });
    expect(f.item().letterAppeals.verificationFailure).toMatchObject({
      httpStatus: 429,
      retryAfterMs: 300000,
    });
    vi.advanceTimersByTime(299999);
    await f.recover("verify_letter_appeals", { automatic: true });
    expect(f.client.appeals).toHaveBeenCalledTimes(1);
    await expect(
      f.recover("continue_letter_appeals", { automatic: true }),
    ).rejects.toThrow("read-only");
    expect(f.client.create).not.toHaveBeenCalled();
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
