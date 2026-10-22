import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { getDefaultGivingSocietyConfigurations } from "./givingSocietyDefinitions";
import {
  templateFixture,
  wordFixture,
} from "../../../../test/societyLetterFixture";
import { validateLetterTemplate } from "./societyLetterDocuments";
import PizZip from "pizzip";
import {
  LETTER_COLUMNS,
  CONSTITUENT_LETTER_COLUMNS,
  householdsFromQuery,
  letterPeriod,
  letterNameMergeData,
} from "@/utils/societyLetters";
import {
  previewLetters,
  letterSourceSignature,
  letterWorkspace,
  prepareLetterBatch,
  updateLetterSettings,
  saveLetterTemplate,
  sendLetterBatch,
  verifyLetterEmail,
  refreshLetterSource,
  updateLetterExclusion,
  updateLetterRecipient,
  previewLetterRecipient,
} from "./societyLetterWorkflow";
import { advanceQueryList } from "./constituentQueryList";
import { getBlackbaudSavedQueryById } from "./blackbaud";
import { contactChoiceKey } from "@/utils/societyLetterContacts";
import { societyQuerySettings } from "../../../../test/societyQueryFixture";
import { exportSocietyLetterCsv } from "./societyLetterCsvExport";
import Papa from "papaparse";

vi.mock("./constituentQueryList", () => ({ advanceQueryList: vi.fn() }));
vi.mock("./blackbaud", () => ({ getBlackbaudSavedQueryById: vi.fn() }));
vi.mock("./sendSubmissionEmail", () => ({
  buildResendFromAddress: (name, email) => `${name} <${email}>`,
}));
const definitions = getDefaultGivingSocietyConfigurations();
const today = "2026-09-22";
const query = {
  headers: Object.values(LETTER_COLUMNS),
  tableRows: [
    [
      "10",
      "10|11",
      "Sample Household",
      "presidents_society",
      "Alex & Pat",
      "Alex & Pat",
      "10 Test St",
      "sample@example.org",
      "Yes",
      "Yes",
      "2026-01-01",
      "2026-12-31",
    ],
  ],
};
function setup() {
  const settings = {
    queryId: "123",
    periodBasis: "calendar_year",
    fiscalYearStartMonth: 7,
    startDate: "",
    endDate: "",
    societyKeys: definitions.map((d) => d.key),
    columns: LETTER_COLUMNS,
  };
  const period = letterPeriod(settings, today);
  const template = {
    ...validateLetterTemplate(templateFixture()),
    societyKey: "presidents_society",
    sequence: 1,
  };
  const state = {
    revision: 4,
    settings,
    history: [],
    templates: { [template.version]: template },
    job: null,
  };
  state.snapshot = {
    signature: letterSourceSignature(state, definitions),
    period,
    generatedAt: new Date().toISOString(),
    rows: householdsFromQuery(query, settings, definitions, period),
  };
  const store = {
    save: vi.fn(),
    reserve: vi.fn(),
    transition: vi.fn(async (item, from, to, providerId) => {
      expect(item.status).toBe(from);
      item.status = to;
      item.providerId = providerId;
    }),
  };
  return { state, store, body: { channel: "post", householdIds: ["10"] } };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("STEWARDSHIP_EMAIL_ENABLED", "true");
  vi.stubEnv("RESEND_API_KEY", "fake-test-key");
  vi.stubEnv("RESEND_FROM_EMAIL", "notifications@example.org");
});
afterEach(() => vi.unstubAllEnvs());
function draftSetup() {
  const { state, store } = setup();
  state.settings.sourceMode = "constituents";
  const row = state.snapshot.rows[0];
  Object.assign(row, {
    sourceMode: "constituents",
    mailAllowed: false,
    emailAllowed: false,
    recipientCandidates: [
      {
        constituentId: "10",
        addressee: "Alex Sample",
        salutation: "Alex",
        address: "10 Test St",
        email: "alex@example.org",
      },
    ],
  });
  state.snapshot.signature = letterSourceSignature(state, definitions);
  const view = letterWorkspace(state, definitions, today);
  return {
    state,
    store,
    body: {
      householdId: "10",
      reviewToken: view.rows[0].recipientReview.token,
      templateVersion: view.templates.find(
        (t) => t.societyKey === row.societyKey,
      ).version,
      recipientConstituentId: "10",
      addressConstituentId: "10",
      addressee: "Alex & Pat Sample",
      salutation: "Alex and Pat",
      address: "Updated draft address",
      email: "",
    },
  };
}
describe("society letter workflow", () => {
  it("exports saved recipient overrides through the real workspace without touching history, and enforces review expiry", async () => {
    const { state, store, body } = draftSetup();
    state.settings = societyQuerySettings();
    state.snapshot.rows[0].sourceMode = "society_queries";
    state.snapshot.signature = letterSourceSignature(state, definitions);
    body.reviewToken = letterWorkspace(
      state,
      definitions,
      today,
    ).rows[0].recipientReview.token;
    body.confirm = true;
    await updateLetterRecipient(state, definitions, today, body, store, 7);
    const workspace = letterWorkspace(state, definitions, today);
    expect(workspace.setup.membershipCurrent).toBe(true);
    const request = {
      revision: workspace.revision,
      societyKey: "presidents_society",
      periodKey: workspace.period.key,
      householdIds: ["10"],
      letterDate: today,
    };
    const before = structuredClone(state);
    store.save.mockClear();
    const exported = exportSocietyLetterCsv(workspace, request);
    const parsed = Papa.parse(exported.csv, { header: true });
    expect(parsed.data[0]).toMatchObject({
      addressee: "Alex & Pat Sample",
      salutation: "Alex and Pat",
      address: "Updated draft address",
      app_member_ids: "10|11",
    });
    expect(state).toEqual(before);
    expect(store.save).not.toHaveBeenCalled();
    expect(store.reserve).not.toHaveBeenCalled();
    expect(store.transition).not.toHaveBeenCalled();
    const saved = Object.values(state.recipient_reviews)[0];
    const clock = vi
      .spyOn(Date, "now")
      .mockReturnValue(Date.parse(saved.savedAt) + 16 * 86400000);
    try {
      expect(() =>
        exportSocietyLetterCsv(
          letterWorkspace(state, definitions, today),
          request,
        ),
      ).toThrow("eligible recipients changed");
    } finally {
      clock.mockRestore();
    }
  });
  it("publishes actual Word requirements for both document readiness and the recipient editor", () => {
    const { state } = draftSetup();
    state.settings.sourceMode = "society_queries";
    state.snapshot.rows[0].sourceMode = "society_queries";
    const template = {
      ...validateLetterTemplate({
        ...templateFixture(),
        content: wordFixture("{first_name} {city}").generate({
          type: "base64",
        }),
      }),
      societyKey: "presidents_society",
      sequence: 1,
      usedFields: ["salutation"],
    };
    state.templates = { [template.version]: template };
    state.snapshot.signature = letterSourceSignature(state, definitions);
    const before = structuredClone(state);
    const workspace = letterWorkspace(state, definitions, today);
    expect(
      workspace.templates.find(
        (item) => item.societyKey === "presidents_society",
      ).usedFields,
    ).toEqual(expect.arrayContaining(["first_name", "city"]));
    expect(workspace.rows[0].documentReadiness.blockers).toContainEqual(
      expect.objectContaining({
        field: "city",
        action: "recipient",
        focus: "city",
      }),
    );
    expect(workspace.rows[0].documentReadiness.status).toBe("blocked");
    expect(state).toEqual(before);
  });
  it("keeps an organization and its contact on separate lines through save, reload, and letter rendering", async () => {
    const { state, store, body } = draftSetup();
    const contact = {
      role: "Main contact",
      firstName: "Alexandra",
      preferredName: "Lex",
      lastName: "Contact",
    };
    const row = state.snapshot.rows[0];
    row.members = ["10"];
    row.name = "Example Foundation";
    row.recipientCandidates[0].organizationContacts = {
      keyIndicator: "organization",
      contacts: [contact],
    };
    row.recipientCandidates[0].addressee = "Example Foundation";
    const template = {
      ...validateLetterTemplate({
        ...templateFixture(),
        content: wordFixture(
          "{addressee} | {address} | Dear {first_name},",
        ).generate({ type: "base64" }),
      }),
      societyKey: "presidents_society",
      sequence: 2,
    };
    state.templates[template.version] = template;
    const choices = {
      ...body,
      confirm: true,
      templateVersion: template.version,
      reviewToken: letterWorkspace(state, definitions, today).rows[0]
        .recipientReview.token,
      organizationContactKey: contactChoiceKey(contact),
      includeOrganizationName: true,
      addressee: "Example Foundation\nAttn: Alexandra Contact",
      salutation: "Lex",
    };
    await updateLetterRecipient(state, definitions, today, choices, store, 7);
    const saved = letterWorkspace(state, definitions, today).rows[0];
    expect(saved.recipientReview.values).toMatchObject({
      includeOrganizationName: true,
      addressee: choices.addressee,
      recipientConstituentId: "10",
      addressConstituentId: "10",
    });
    expect(saved.addressee).toBe(choices.addressee);
    const result = previewLetterRecipient(state, definitions, today, {
      ...choices,
      ...saved.recipientReview.values,
      reviewToken: saved.recipientReview.token,
    });
    const xml = new PizZip(result.document).file("word/document.xml").asText();
    expect(xml).toMatch(
      /Example Foundation<\/w:t>.*?<w:br\/>.*?Attn: Alexandra Contact/,
    );
    expect(xml).toContain("Updated draft address | Dear Lex,");
    expect(result.text).toBe("Dear Lex, please see your attached letter.");
    expect(state.history).toEqual([]);
    expect(saved.members).toEqual(["10"]);
    expect(saved.mailAllowed).toBe(false);
    expect(store.reserve).not.toHaveBeenCalled();
    expect(getBlackbaudSavedQueryById).not.toHaveBeenCalled();
    expect(advanceQueryList).not.toHaveBeenCalled();
  });
  it("keeps individual name edits through save, reload, and Word preview without NXT or delivery changes", async () => {
    const { state, store, body } = draftSetup();
    const template = {
      ...validateLetterTemplate({
        ...templateFixture(),
        content: wordFixture("{addressee} | Dear {first_names},").generate({
          type: "base64",
        }),
      }),
      societyKey: "presidents_society",
      sequence: 2,
    };
    state.templates[template.version] = template;
    const choices = {
      ...body,
      confirm: true,
      templateVersion: template.version,
      addressee: "Alexandra and Patricia Sample",
      nameOverrides: { first_names: "Lex and Patti" },
    };
    await updateLetterRecipient(state, definitions, today, choices, store, 7);
    const saved = letterWorkspace(state, definitions, today).rows[0];
    expect(saved.recipientReview.values.nameOverrides).toEqual({
      first_names: "Lex and Patti",
    });
    const result = previewLetterRecipient(state, definitions, today, {
      ...choices,
      ...saved.recipientReview.values,
      reviewToken: saved.recipientReview.token,
    });
    const xml = new PizZip(result.document).file("word/document.xml").asText();
    expect(xml).toContain(
      "Alexandra and Patricia Sample | Dear Lex and Patti,",
    );
    expect(state.history).toEqual([]);
    expect(saved.members).toEqual(["10", "11"]);
    expect(saved.mailAllowed).toBe(false);
    expect(store.reserve).not.toHaveBeenCalled();
    expect(getBlackbaudSavedQueryById).not.toHaveBeenCalled();
    expect(advanceQueryList).not.toHaveBeenCalled();
  });
  it("reports setup from saved source and snapshot identity without treating it as delivery readiness", () => {
    const { state } = setup();
    state.settings.societyKeys = definitions
      .filter((d) => d.active && d.basis === "annual")
      .map((d) => d.key);
    state.snapshot.signature = letterSourceSignature(state, definitions);
    state.snapshot.generatedAt = "2020-01-01T00:00:00Z";
    const before = structuredClone(state);
    const view = letterWorkspace(state, definitions, today);
    expect(view.setup).toMatchObject({
      sourceConfigured: true,
      membershipCurrent: true,
    });
    expect(view.sourceIssue).toMatch(/more than 24 hours/);
    expect(state).toEqual(before);
    const key = view.setup.key;
    state.settings.queryId = "456";
    const changed = letterWorkspace(state, definitions, today);
    expect(changed.setup.membershipCurrent).toBe(false);
    expect(changed.setup.key).not.toBe(key);
    expect(
      letterWorkspace(state, definitions, "2027-01-01").setup.membershipCurrent,
    ).toBe(false);
    state.settings = null;
    expect(
      letterWorkspace(state, definitions, today).setup.sourceConfigured,
    ).toBe(false);
    expect(getBlackbaudSavedQueryById).not.toHaveBeenCalled();
    expect(advanceQueryList).not.toHaveBeenCalled();
  });
  it("merges unsaved recipient choices with the highest selected society template without persisting or enabling delivery", () => {
    const { state, store, body } = draftSetup();
    const before = structuredClone(state);
    const result = previewLetterRecipient(state, definitions, today, {
      ...body,
      societyKey: "order_of_the_dolphin",
      mailAllowed: true,
      emailAllowed: true,
    });
    const xml = new PizZip(result.document).file("word/document.xml").asText();
    expect(xml).toContain("Alex and Pat");
    expect(result.subject).toContain("President");
    expect(state).toEqual(before);
    expect(store.save).not.toHaveBeenCalled();
    expect(store.reserve).not.toHaveBeenCalled();
    expect(advanceQueryList).not.toHaveBeenCalled();
    expect(getBlackbaudSavedQueryById).not.toHaveBeenCalled();
    expect(() =>
      previewLetters(state, definitions, today, {
        channel: "post",
        householdIds: ["10"],
      }),
    ).toThrow(/preview only/i);
  });
  it.each([
    { householdId: "unknown" },
    { reviewToken: "stale" },
    { templateVersion: "old" },
    { recipientConstituentId: "999" },
    { addressConstituentId: "999" },
    { email: "injected@example.org" },
  ])("rejects unsafe draft choices %j", (override) => {
    const { state, body } = draftSetup();
    expect(() =>
      previewLetterRecipient(state, definitions, today, {
        ...body,
        ...override,
      }),
    ).toThrow();
  });
  it("refuses drafts from old periods, stale sources, and prepared or excluded households", () => {
    const { state, body } = draftSetup();
    expect(() =>
      previewLetterRecipient(state, definitions, "2027-01-01", body),
    ).toThrow(/changed/i);
    const snapshot = state.snapshot;
    state.snapshot = { ...snapshot, signature: "stale" };
    expect(() =>
      previewLetterRecipient(state, definitions, today, body),
    ).toThrow(/changed/i);
    state.snapshot = snapshot;
    state.exclusions = [{ members: ["10"], period: snapshot.period }];
    expect(() =>
      previewLetterRecipient(state, definitions, today, body),
    ).toThrow(/changed/i);
    state.exclusions = [];
    state.history = [{ ...snapshot.rows[0], status: "prepared" }];
    expect(() =>
      previewLetterRecipient(state, definitions, today, body),
    ).toThrow(/changed/i);
  });
  it("projects saved recipient choices and merge names without clearing preview delivery gates", async () => {
    const { state, store, body } = setup();
    state.settings.sourceMode = "constituents";
    const row = state.snapshot.rows[0];
    Object.assign(row, {
      sourceMode: "constituents",
      addressee: "",
      salutation: "",
      address: "",
      email: "",
      mailAllowed: false,
      emailAllowed: false,
      memberNames: [
        { constituentId: "10", firstName: "Alex", lastName: "Sample" },
        { constituentId: "11", firstName: "Pat", lastName: "Sample" },
      ],
      recipientCandidates: [
        {
          constituentId: "11",
          addressee: "Pat Sample",
          salutation: "Pat",
          address: "10 Test Street",
          email: "pat@example.org",
        },
      ],
    });
    state.snapshot.signature = letterSourceSignature(state, definitions);
    const before = letterWorkspace(state, definitions, today).rows[0];
    await updateLetterRecipient(
      state,
      definitions,
      today,
      {
        householdId: "10",
        confirm: true,
        reviewToken: before.recipientReview.token,
        recipientConstituentId: "11",
        addressConstituentId: "11",
        addressee: "Pat & Alex Sample",
        salutation: "Pat and Alex",
        address: "10 Test Street",
        email: "",
      },
      store,
      7,
    );
    const saved = letterWorkspace(state, definitions, today).rows[0];
    expect(saved.recipientReview.status).toBe("saved");
    expect(saved.addressee).toBe("Pat & Alex Sample");
    expect(letterNameMergeData(saved)).toMatchObject({
      first_name: "Pat",
      spouse_first_name: "Alex",
    });
    expect(saved.issues.post).toMatch(/preview only/i);
    expect(saved.issues.email).toMatch(/preview only/i);
    expect(saved.mailAllowed).toBe(false);
    expect(row.addressee).toBe("");
    await expect(
      prepareLetterBatch(
        state,
        definitions,
        today,
        { ...body, confirm: true },
        store,
        7,
      ),
    ).rejects.toThrow(/preview only/i);
    expect(store.reserve).not.toHaveBeenCalled();
    expect(advanceQueryList).not.toHaveBeenCalled();
    expect(getBlackbaudSavedQueryById).not.toHaveBeenCalled();
    row.recipientCandidates[0].address = "New address";
    const changed = letterWorkspace(state, definitions, today).rows[0];
    expect(changed.recipientReview.status).toBe("needs_review");
    expect(changed.address).toBe("");
    await expect(
      updateLetterRecipient(
        state,
        definitions,
        "2027-01-01",
        { householdId: "10" },
        store,
        7,
      ),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("blocks missing name values before reserving or sending and freezes mapped names in prepared letters", async () => {
    const { state, store, body } = setup();
    const template = {
      ...validateLetterTemplate({
        ...templateFixture(),
        content: wordFixture("Dear {first_name},").generate({ type: "base64" }),
        emailBody: "Hello {first_name}",
        mergeSettings: { fields: ["first_name", "society_name"] },
      }),
      societyKey: "presidents_society",
      sequence: 2,
    };
    state.templates[template.version] = template;
    expect(
      letterWorkspace(state, definitions, today).rows[0].issues.post,
    ).toMatch(/Missing name value/);
    await expect(
      prepareLetterBatch(
        state,
        definitions,
        today,
        { ...body, confirm: true },
        store,
        1,
      ),
    ).rejects.toThrow(/Missing name value/);
    expect(store.reserve).not.toHaveBeenCalled();
    expect(store.transition).not.toHaveBeenCalled();
    state.snapshot.rows[0].firstName = "Alex";
    const preview = previewLetters(state, definitions, today, body);
    expect(preview.rows[0].coverMessage).toBe("Hello Alex");
    await prepareLetterBatch(
      state,
      definitions,
      today,
      { ...body, confirm: true, previewToken: preview.token },
      store,
      1,
    );
    const items = store.reserve.mock.calls[0][0];
    expect(items[0].firstName).toBe("Alex");
    expect(items[0].templateVersion).toBe(template.version);
    state.snapshot.rows[0].firstName = "Changed later";
    expect(items[0].firstName).toBe("Alex");
  });
  it("saves an exclusion without preparing, sending, or querying and restores with audit history", async () => {
    const { state, store, body } = setup();
    const history = [...state.history];
    await updateLetterExclusion(
      state,
      definitions,
      today,
      { action: "exclude_recipient", householdId: "10", reason: "Please wait" },
      store,
      7,
    );
    const excluded = state.exclusions[0];
    expect(excluded).toMatchObject({
      members: ["10", "11"],
      reason: "Please wait",
      excludedBy: 7,
    });
    expect(letterWorkspace(state, definitions, today).rows[0].status).toBe(
      "excluded",
    );
    expect(() => previewLetters(state, definitions, today, body)).toThrow(
      /excluded/,
    );
    expect(state.history).toEqual(history);
    expect(store.reserve).not.toHaveBeenCalled();
    expect(advanceQueryList).not.toHaveBeenCalled();
    expect(getBlackbaudSavedQueryById).not.toHaveBeenCalled();
    await updateLetterExclusion(
      state,
      definitions,
      today,
      { action: "restore_recipient", exclusionId: excluded.id },
      store,
      8,
    );
    expect(excluded.restoredBy).toBe(8);
    expect(excluded.restoredAt).toBeTruthy();
    expect(letterWorkspace(state, definitions, today).exclusions).toEqual([]);
    expect(previewLetters(state, definitions, today, body).rows).toHaveLength(
      1,
    );
    expect(store.save).toHaveBeenCalledTimes(2);
  });
  it("retains exclusions across refresh, a changed household head, higher tiers and overlapping periods", async () => {
    const { state, store } = setup();
    await updateLetterExclusion(
      state,
      definitions,
      today,
      { action: "exclude_recipient", householdId: "10", reason: "" },
      store,
      7,
    );
    state.snapshot = structuredClone(state.snapshot);
    Object.assign(state.snapshot.rows[0], {
      householdId: "11",
      members: ["11", "10"],
      societyKey: "higher_society",
      rank: 0,
    });
    expect(letterWorkspace(state, definitions, today).rows[0].status).toBe(
      "excluded",
    );
    state.settings = {
      ...state.settings,
      periodBasis: "custom",
      startDate: "2026-06-01",
      endDate: "2027-05-31",
    };
    state.snapshot.period = letterPeriod(state.settings, today);
    state.snapshot.rows[0].period = state.snapshot.period;
    expect(letterWorkspace(state, definitions, today).rows[0].status).toBe(
      "excluded",
    );
  });
  it("does not suppress a new non-overlapping year or unrelated individual", async () => {
    const { state, store } = setup();
    await updateLetterExclusion(
      state,
      definitions,
      today,
      { action: "exclude_recipient", householdId: "10", reason: "" },
      store,
      7,
    );
    Object.assign(state.snapshot.rows[0], {
      householdId: "12",
      members: ["12"],
    });
    expect(letterWorkspace(state, definitions, today).rows[0].status).toBe(
      "ready",
    );
    Object.assign(state.snapshot.rows[0], {
      householdId: "10",
      members: ["10"],
    });
    state.snapshot.period = letterPeriod(state.settings, "2027-01-01");
    state.snapshot.rows[0].period = state.snapshot.period;
    const next = letterWorkspace(state, definitions, "2027-01-01");
    expect(next.rows[0].status).toBe("ready");
    expect(next.exclusions).toEqual([]);
  });
  it("keeps absent recipients excluded and allows restoration without recreating membership", async () => {
    const { state, store } = setup();
    await updateLetterExclusion(
      state,
      definitions,
      today,
      { action: "exclude_recipient", householdId: "10", reason: "" },
      store,
      7,
    );
    state.snapshot.rows = [];
    expect(letterWorkspace(state, definitions, today).exclusions).toHaveLength(
      1,
    );
    await updateLetterExclusion(
      state,
      definitions,
      today,
      { action: "restore_recipient", exclusionId: state.exclusions[0].id },
      store,
      8,
    );
    expect(letterWorkspace(state, definitions, today).rows).toEqual([]);
  });
  it("allows organizing a preview source without lifting its delivery boundary", async () => {
    const { state, store, body } = setup();
    state.settings.sourceMode = "constituents";
    state.snapshot.signature = letterSourceSignature(state, definitions);
    await updateLetterExclusion(
      state,
      definitions,
      today,
      { action: "exclude_recipient", householdId: "10", reason: "" },
      store,
      7,
    );
    await updateLetterExclusion(
      state,
      definitions,
      today,
      { action: "restore_recipient", exclusionId: state.exclusions[0].id },
      store,
      7,
    );
    expect(() => previewLetters(state, definitions, today, body)).toThrow(
      /preview only/,
    );
    expect(store.reserve).not.toHaveBeenCalled();
  });
  it.each(["prepared", "pending_email", "sending", "needs_review", "mailed"])(
    "does not exclude a %s letter or erase delivery history",
    async (status) => {
      const { state, store } = setup();
      state.history = [{ ...state.snapshot.rows[0], status }];
      await expect(
        updateLetterExclusion(
          state,
          definitions,
          today,
          { action: "exclude_recipient", householdId: "10", reason: "" },
          store,
          7,
        ),
      ).rejects.toThrow(/no longer/);
      expect(store.save).not.toHaveBeenCalled();
      expect(state.history[0].status).toBe(status);
    },
  );
  it("rejects stale source mappings, missing households and excessive reason text", async () => {
    const { state, store } = setup();
    for (const payload of [
      { householdId: "99", reason: "" },
      { householdId: "10", reason: "x".repeat(501) },
    ])
      await expect(
        updateLetterExclusion(
          state,
          definitions,
          today,
          { action: "exclude_recipient", ...payload },
          store,
          7,
        ),
      ).rejects.toThrow();
    state.settings.queryId = "999";
    await expect(
      updateLetterExclusion(
        state,
        definitions,
        today,
        { action: "exclude_recipient", householdId: "10", reason: "" },
        store,
        7,
      ),
    ).rejects.toThrow(/current source settings/);
    expect(store.save).not.toHaveBeenCalled();
  });
  it("shows a constituent household preview but blocks letter preparation server-side", async () => {
    const { state, body, store } = setup();
    state.settings.sourceMode = "constituents";
    state.snapshot.signature = letterSourceSignature(state, definitions);
    expect(letterWorkspace(state, definitions, today).sourceIssue).toMatch(
      /preview only/,
    );
    expect(() => previewLetters(state, definitions, today, body)).toThrow(
      /preview only/,
    );
    await expect(
      prepareLetterBatch(
        state,
        definitions,
        today,
        { ...body, confirm: true },
        store,
        1,
      ),
    ).rejects.toThrow(/preview only/);
    expect(store.reserve).not.toHaveBeenCalled();
    expect(getBlackbaudSavedQueryById).not.toHaveBeenCalled();
  });
  it("verifies system ID metadata before running a constituent query and retains prior results on failure", async () => {
    const { state, store } = setup();
    state.settings = {
      ...state.settings,
      sourceMode: "constituents",
      columns: CONSTITUENT_LETTER_COLUMNS,
    };
    const saved = state.snapshot;
    vi.mocked(getBlackbaudSavedQueryById).mockResolvedValue({
      select_fields: [],
    });
    await refreshLetterSource(
      state,
      definitions,
      today,
      { action: "refresh" },
      store,
      { user: { id: 1 }, origin: "https://example.org" },
    );
    expect(state.job.status).toBe("needs_review");
    expect(state.job.message).toMatch(/System Record ID/);
    expect(state.snapshot).toBe(saved);
    expect(advanceQueryList).not.toHaveBeenCalled();
  });
  it("groups a validated query without profile lookups and ignores changing query execution statistics", async () => {
    const { state, store } = setup();
    state.settings = {
      ...state.settings,
      sourceMode: "constituents",
      columns: CONSTITUENT_LETTER_COLUMNS,
      querySocietyKey: "order_of_the_dolphin",
      queryPeriodStart: "2026-01-01",
      queryPeriodEnd: "2026-12-31",
    };
    const definition = {
      select_fields: [
        {
          query_field: {
            available_field_name: "System Record ID",
            selected_field_name: "System Record ID",
            node_path: [{ id: "296" }],
          },
        },
        {
          query_field: {
            available_field_name: "System Record ID",
            selected_field_name: "Spouse System Record ID",
            node_path: [{ id: "10516" }],
          },
        },
      ],
    };
    vi.mocked(getBlackbaudSavedQueryById)
      .mockResolvedValueOnce({ ...definition, num_records: 0 })
      .mockResolvedValueOnce({ ...definition, num_records: 1 });
    vi.mocked(advanceQueryList).mockImplementation(async ({ job }) => ({
      job: { ...job, stage: "complete" },
      snapshot: {
        headers: Object.values(CONSTITUENT_LETTER_COLUMNS).filter(Boolean),
        tableRows: [
          [
            "10",
            "11",
            "Alex Sample",
            "Alex",
            "10 Test St",
            "",
            "Jacksonville",
            "FL",
            "32211",
            "alex@example.org",
          ],
        ],
        generatedAt: new Date().toISOString(),
      },
    }));
    await refreshLetterSource(
      state,
      definitions,
      today,
      { action: "refresh" },
      store,
      { user: { id: 1 }, origin: "https://example.org" },
    );
    expect(state.job.status).toBe("complete");
    expect(state.snapshot.rows[0].members).toEqual(["10", "11"]);
    expect(getBlackbaudSavedQueryById).toHaveBeenCalledTimes(2);
    expect(
      advanceQueryList.mock.calls[0][0].source.leadFundraiser.enabled,
    ).toBe(false);
    const saved = state.snapshot;
    vi.mocked(getBlackbaudSavedQueryById)
      .mockResolvedValueOnce(definition)
      .mockResolvedValueOnce({
        ...definition,
        filter_fields: [{ changed: true }],
      });
    await refreshLetterSource(
      state,
      definitions,
      today,
      { action: "refresh" },
      store,
      { user: { id: 1 }, origin: "https://example.org" },
    );
    expect(state.job.status).toBe("needs_review");
    expect(state.job.message).toMatch(/changed during/);
    expect(state.snapshot).toBe(saved);
  });
  it("opens the unconfigured workspace without a snapshot or any external reads", () => {
    const output = letterWorkspace(
      {
        revision: 0,
        settings: null,
        snapshot: null,
        templates: {},
        history: [],
        job: null,
      },
      definitions,
      today,
    );
    expect(output.rows).toEqual([]);
    expect(output.period).toBeNull();
    expect(output.sourceIssue).toMatch(/Configure/);
    expect(advanceQueryList).not.toHaveBeenCalled();
  });
  it("requires confirmation to restart another user's unfinished query without clearing history", async () => {
    const { state, store } = setup();
    const snapshot = state.snapshot;
    state.job = { id: "old-job", status: "running", ownerId: 99 };
    state.history = [{ ...state.snapshot.rows[0], status: "mailed" }];
    const context = { user: { id: 1 }, origin: "https://example.org" };
    await expect(
      refreshLetterSource(
        state,
        definitions,
        today,
        { action: "restart" },
        store,
        context,
      ),
    ).rejects.toThrow(/Confirm/);
    expect(advanceQueryList).not.toHaveBeenCalled();
    vi.mocked(advanceQueryList).mockImplementation(async ({ job }) => ({
      job: { ...job, stage: "query" },
      snapshot: null,
    }));
    await refreshLetterSource(
      state,
      definitions,
      today,
      { action: "restart", confirm: true },
      store,
      context,
    );
    expect(state.job.id).not.toBe("old-job");
    expect(state.job.ownerId).toBe(1);
    expect(state.history).toHaveLength(1);
    expect(state.snapshot).toBe(snapshot);
  });
  it("prepares only from the reviewed preview and persists frozen recipient/template choices", async () => {
    const { state, store, body } = setup();
    const preview = previewLetters(state, definitions, today, body);
    await expect(
      prepareLetterBatch(
        state,
        definitions,
        today,
        { ...body, confirm: true, previewToken: "wrong" },
        store,
        1,
      ),
    ).rejects.toThrow(/Review/);
    const batchId = await prepareLetterBatch(
      state,
      definitions,
      today,
      { ...body, confirm: true, previewToken: preview.token },
      store,
      1,
    );
    expect(store.reserve).toHaveBeenCalledOnce();
    expect(store.reserve.mock.calls[0][0][0]).toMatchObject({
      batchId,
      status: "prepared",
      householdId: "10",
      members: ["10", "11"],
      templateVersion: preview.rows[0].templateVersion,
      selectionSummary: preview.selectionSummary,
      coveredKeys: ["presidents_society", "order_of_the_dolphin"],
    });
    expect(preview.selectionSummary).toMatchObject({
      total: 1,
      selected: 1,
      notSelected: 0,
    });
  });
  it("blocks stale previews, changed periods, stale membership and repeated household IDs", async () => {
    const { state, store, body } = setup();
    const preview = previewLetters(state, definitions, today, body);
    state.revision += 1;
    await expect(
      prepareLetterBatch(
        state,
        definitions,
        today,
        { ...body, confirm: true, previewToken: preview.token },
        store,
        1,
      ),
    ).rejects.toThrow(/Review/);
    expect(() =>
      previewLetters(state, definitions, "2027-01-01", body),
    ).toThrow(/Refresh/);
    expect(() =>
      previewLetters(state, definitions, today, {
        ...body,
        householdIds: ["10", "10"],
      }),
    ).toThrow(/distinct/);
    state.snapshot.generatedAt = "2020-01-01";
    expect(() => previewLetters(state, definitions, today, body)).toThrow(
      /24 hours/,
    );
  });
  it("freezes server-derived selection counts and rejects changed selection context", async () => {
    const { state, store, body } = setup();
    const source = state.snapshot.rows[0];
    state.snapshot.rows.push({ ...source, householdId: "20", members: ["20"] });
    const preview = previewLetters(state, definitions, today, body);
    expect(preview.selectionSummary).toMatchObject({
      total: 2,
      selected: 1,
      notSelected: 1,
    });
    const request = {
      ...body,
      confirm: true,
      previewToken: preview.token,
      selectionSummary: { total: 999 },
    };
    await prepareLetterBatch(state, definitions, today, request, store, 1);
    expect(store.reserve.mock.calls[0][0][0].selectionSummary).toEqual(
      preview.selectionSummary,
    );
    state.snapshot.rows.push({ ...source, householdId: "30", members: ["30"] });
    await expect(
      prepareLetterBatch(state, definitions, today, request, store, 1),
    ).rejects.toThrow(/Review the current/);
    expect(store.reserve).toHaveBeenCalledOnce();
  });
  it("blocks a refresh/settings change from erasing the period ledger", async () => {
    const { state, store } = setup();
    state.history = [{ ...state.snapshot.rows[0], status: "mailed" }];
    await expect(
      updateLetterSettings(
        state,
        definitions,
        today,
        {
          settings: {
            ...state.settings,
            periodBasis: "fiscal_year",
            confirmSource: true,
          },
        },
        store,
        1,
      ),
    ).rejects.toThrow(/migration/);
    expect(store.save).not.toHaveBeenCalled();
  });
  it("allows a non-overlapping new custom period while retaining earlier acknowledgments", async () => {
    const { state, store } = setup();
    state.history = [{ ...state.snapshot.rows[0], status: "mailed" }];
    await updateLetterSettings(
      state,
      definitions,
      today,
      {
        settings: {
          ...state.settings,
          periodBasis: "custom",
          startDate: "2027-01-01",
          endDate: "2027-12-31",
          confirmSource: true,
        },
      },
      store,
      1,
    );
    expect(state.history).toHaveLength(1);
    expect(state.settings.startDate).toBe("2027-01-01");
    expect(letterWorkspace(state, definitions, today).rows).toEqual([]);
  });
  it("never exposes template bytes in a workspace read or triggers NXT work", () => {
    const { state } = setup();
    const output = letterWorkspace(state, definitions, today);
    expect(JSON.stringify(output)).not.toContain(
      Object.values(state.templates)[0].content,
    );
    expect(advanceQueryList).not.toHaveBeenCalled();
    expect(output.rows[0].status).toBe("ready");
  });
  it("preserves the old snapshot on invalid refreshed identities", async () => {
    const { state, store } = setup();
    const old = state.snapshot;
    vi.mocked(advanceQueryList).mockResolvedValue({
      job: { status: "complete" },
      snapshot: { ...query, tableRows: [["bad"]] },
    });
    await refreshLetterSource(
      state,
      definitions,
      today,
      { action: "refresh" },
      store,
      { user: { id: 1 }, origin: "https://example.org" },
    );
    expect(state.snapshot).toBe(old);
    expect(state.job.status).toBe("needs_review");
  });
  it("refreshes one saved query without requesting constituent or gift scans", async () => {
    const { state, store } = setup();
    vi.mocked(advanceQueryList).mockResolvedValue({
      job: { id: "job", status: "complete" },
      snapshot: { ...query, generatedAt: new Date().toISOString() },
    });
    await refreshLetterSource(
      state,
      definitions,
      today,
      { action: "refresh" },
      store,
      { user: { id: 1 }, origin: "https://example.org" },
    );
    expect(advanceQueryList.mock.calls[0][0].source).toEqual({
      source: "query",
      queryId: "123",
      leadFundraiser: { enabled: false },
    });
    expect(state.snapshot.rows).toHaveLength(1);
    expect(state.job.status).toBe("complete");
  });
  it("keeps immutable template contents for already prepared letters", async () => {
    const { state, store } = setup();
    const previous = Object.values(state.templates)[0];
    await saveLetterTemplate(
      state,
      {
        societyKey: "presidents_society",
        template: {
          ...templateFixture(),
          subject: "Updated recognition letter",
        },
      },
      today,
      store,
      1,
      definitions,
    );
    expect(state.templates[previous.version]).toBe(previous);
    expect(Object.keys(state.templates)).toHaveLength(2);
  });
  it("edits saved merge fields without uploading Word again and leaves the prior version frozen", async () => {
    const { state, store } = setup();
    const previous = Object.values(state.templates)[0];
    const previousCopy = JSON.stringify(previous);
    await saveLetterTemplate(
      state,
      {
        societyKey: "presidents_society",
        existingVersion: previous.version,
        template: {
          mergeSettings: {
            fields: ["salutation", "first_name", "society_name"],
            dateFormat: "long_us",
          },
          emailBody: "Dear {first_name}, here is your letter.",
        },
      },
      today,
      store,
      1,
      definitions,
    );
    expect(JSON.stringify(previous)).toBe(previousCopy);
    const current = Object.values(state.templates).find(
      (t) => t.version !== previous.version,
    );
    expect(current.content).toBe(previous.content);
    expect(current.filename).toBe(previous.filename);
    const reloaded = letterWorkspace(
      JSON.parse(JSON.stringify(state)),
      definitions,
      today,
    );
    expect(
      reloaded.templates.find((t) => t.societyKey === "presidents_society")
        .mergeSettings,
    ).toEqual({
      fields: ["salutation", "first_name", "society_name"],
      dateFormat: "long_us",
    });
    expect(
      reloaded.templates.find((t) => t.societyKey === "presidents_society")
        .content,
    ).toBeUndefined();
    expect(store.reserve).not.toHaveBeenCalled();
    await expect(
      saveLetterTemplate(
        state,
        {
          societyKey: "presidents_society",
          existingVersion: previous.version,
          template: {},
        },
        today,
        store,
        1,
        definitions,
      ),
    ).rejects.toThrow(/changed/);
  });
  it("rejects reuse of another society's template or mixing replacement and reuse", async () => {
    const { state, store } = setup();
    const previous = Object.values(state.templates)[0];
    await expect(
      saveLetterTemplate(
        state,
        {
          societyKey: "order_of_the_dolphin",
          existingVersion: previous.version,
          template: {},
        },
        today,
        store,
        1,
        definitions,
      ),
    ).rejects.toThrow(/changed/);
    await expect(
      saveLetterTemplate(
        state,
        {
          societyKey: "presidents_society",
          existingVersion: previous.version,
          template: templateFixture(),
        },
        today,
        store,
        1,
        definitions,
      ),
    ).rejects.toThrow(/not both/);
    expect(store.save).not.toHaveBeenCalled();
  });
  async function emailSetup() {
    const context = setup();
    context.body.channel = "email";
    const preview = previewLetters(
      context.state,
      definitions,
      today,
      context.body,
    );
    const batchId = await prepareLetterBatch(
      context.state,
      definitions,
      today,
      { ...context.body, confirm: true, previewToken: preview.token },
      context.store,
      1,
    );
    context.state.history = context.store.reserve.mock.calls[0][0];
    return { ...context, batchId };
  }
  it("requires explicit environment activation even for email preparation", () => {
    vi.stubEnv("STEWARDSHIP_EMAIL_ENABLED", "false");
    const { state, body } = setup();
    expect(() =>
      previewLetters(state, definitions, today, { ...body, channel: "email" }),
    ).toThrow(/not been enabled/);
  });
  it("records submission before transport, uses idempotency, and does not send again", async () => {
    const { state, store, batchId } = await emailSetup();
    const send = vi.fn(async (url, options) => {
      expect(state.history[0].status).toBe("sending");
      expect(options.headers["Idempotency-Key"]).toBe(
        `society-letter:${state.history[0].id}`,
      );
      const message = JSON.parse(options.body);
      expect(message.to).toEqual(["sample@example.org"]);
      expect(message.attachments).toHaveLength(1);
      expect(message.tags[0].value).toBe(state.history[0].id);
      return Response.json({ id: "01a0ca5d-b64e-75bc-902c-e60535d42f84" });
    });
    await sendLetterBatch(
      state,
      { batchId, confirm: true },
      store,
      { notificationSenderName: "Test" },
      send,
    );
    expect(state.history[0].status).toBe("emailed");
    await sendLetterBatch(
      state,
      { batchId, confirm: true },
      store,
      { notificationSenderName: "Test" },
      send,
    );
    expect(send).toHaveBeenCalledOnce();
  });
  it("fails closed after a timeout and does not automatically retry an uncertain send", async () => {
    const { state, store, batchId } = await emailSetup();
    const send = vi.fn().mockRejectedValue(new Error("timeout"));
    await sendLetterBatch(state, { batchId, confirm: true }, store, {}, send);
    expect(state.history[0].status).toBe("needs_review");
    await sendLetterBatch(state, { batchId, confirm: true }, store, {}, send);
    expect(send).toHaveBeenCalledOnce();
  });
  it("keeps a durable sending hold if the final database save fails", async () => {
    const { state, store, batchId } = await emailSetup();
    const normal = store.transition.getMockImplementation();
    store.transition
      .mockImplementationOnce(normal)
      .mockRejectedValueOnce(new Error("database disconnected"));
    const send = vi
      .fn()
      .mockResolvedValue(
        Response.json({ id: "01a0ca5d-b64e-75bc-902c-e60535d42f84" }),
      );
    await expect(
      sendLetterBatch(state, { batchId, confirm: true }, store, {}, send),
    ).rejects.toThrow(/database/);
    expect(state.history[0].status).toBe("sending");
    await sendLetterBatch(state, { batchId, confirm: true }, store, {}, send);
    expect(send).toHaveBeenCalledOnce();
  });
  it("blocks old queued recipients without sending", async () => {
    const { state, store, batchId } = await emailSetup();
    state.history[0].preparedAt = "2020-01-01";
    const send = vi.fn();
    await expect(
      sendLetterBatch(state, { batchId, confirm: true }, store, {}, send),
    ).rejects.toThrow(/24 hours/);
    expect(send).not.toHaveBeenCalled();
  });
  it("reconciles only a matching tagged provider receipt without issuing a send", async () => {
    const { state, store } = await emailSetup();
    const item = state.history[0];
    item.status = "sending";
    const providerId = "01a0ca5d-b64e-75bc-902c-e60535d42f84";
    const read = vi.fn().mockResolvedValue(
      Response.json({
        id: providerId,
        to: [item.email],
        tags: [{ name: "society_letter_id", value: item.id }],
        last_event: "delivered",
      }),
    );
    await verifyLetterEmail(
      state,
      { deliveryId: item.id, providerId },
      store,
      read,
    );
    expect(item.status).toBe("delivered");
    expect(read.mock.calls[0][1].method).toBeUndefined();
    item.status = "sending";
    read.mockResolvedValue(
      Response.json({
        id: providerId,
        to: [item.email],
        tags: [],
        last_event: "delivered",
      }),
    );
    await expect(
      verifyLetterEmail(
        state,
        { deliveryId: item.id, providerId },
        store,
        read,
      ),
    ).rejects.toThrow(/matched/);
  });
});
