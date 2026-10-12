import { describe, expect, it, vi } from "vitest";
import {
  triageState,
  triageRequest,
  triageDefinitions,
  triageToday,
} from "../../../../test/societyLetterTriageStateFixture";
import { confirmStraightforwardRecipients } from "./societyLetterBulkRecipientReviews";
import { letterWorkspace } from "./societyLetterWorkflow";
import { exportSocietyLetterCsv } from "./societyLetterCsvExport";
import Papa from "papaparse";

vi.mock("./blackbaud", () => ({
  blackbaudApiFetch: vi.fn(() => {
    throw new Error("No live NXT calls allowed");
  }),
  isBlackbaudQuotaExceededError: () => false,
}));
function setup(count = 2) {
  const state = triageState(count),
    body = triageRequest(state);
  const store = {
    save: vi.fn(async (next) => {
      next.revision += 1;
    }),
  };
  return {
    state,
    body,
    store,
    save: () =>
      confirmStraightforwardRecipients(
        state,
        triageDefinitions,
        triageToday,
        body,
        store,
        7,
      ),
  };
}
describe("atomic bulk recipient review", () => {
  it("supports 5,000 straightforward recipients in one save without the document batch limit", async () => {
    const { state, store, save } = setup(5000);
    await save();
    expect(Object.keys(state.recipient_reviews)).toHaveLength(5000);
    expect(store.save).toHaveBeenCalledOnce();
  }, 15000);
  it("saves all suggestions once, enables the existing CSV path, and leaves history and NXT untouched", async () => {
    const { state, store, save } = setup(65),
      before = structuredClone(state);
    await save();
    expect(store.save).toHaveBeenCalledOnce();
    expect(state.revision).toBe(2);
    expect(Object.values(state.recipient_reviews)).toHaveLength(65);
    expect(
      Object.values(state.recipient_reviews).every(
        (review) => review.savedBy === 7 && review.values.salutation === "Al",
      ),
    ).toBe(true);
    const workspace = letterWorkspace(state, triageDefinitions, triageToday);
    expect(
      workspace.rows.every((row) => row.recipientReview.status === "saved"),
    ).toBe(true);
    const csv = exportSocietyLetterCsv(workspace, {
      revision: 2,
      periodKey: workspace.period.key,
      societyKey: "presidents_society",
      letterDate: triageToday,
      householdIds: workspace.rows.map((row) => row.householdId),
      csvFormat: { salutation: "household_preferred" },
    });
    expect(csv.count).toBe(65);
    expect(Papa.parse(csv.csv, { header: true }).data[0]).toMatchObject({
      address_line_1: "10 Test Street",
      city: "Example City",
      state: "FL",
      zip: "00123",
    });
    expect(state.history).toEqual(before.history);
    expect(state.snapshot).toEqual(before.snapshot);
    expect(state.exclusions).toEqual(before.exclusions);
    expect(state.templates).toEqual(before.templates);
  });
  it.each([
    "confirm",
    "empty",
    "duplicate",
    "unknown",
    "token",
    "revision",
    "suggestionsRevision",
    "oldSource",
    "refreshing",
    "address",
    "names",
    "org",
    "shared",
    "expired",
    "hiddenShared",
    "tooMany",
  ])("refuses %s before saving any recipient", async (kind) => {
    const { state, body, store, save } = setup();
    const row = state.snapshot.rows[1];
    if (kind === "confirm") body.confirm = false;
    if (kind === "empty") body.recipients = [];
    if (kind === "tooMany")
      body.recipients = Array.from({ length: 5001 }, (_, index) => ({
        householdId: String(index),
        reviewToken: "test",
      }));
    if (kind === "duplicate") body.recipients.push(body.recipients[0]);
    if (kind === "unknown") body.recipients[1].householdId = "999";
    if (kind === "token") body.recipients[1].reviewToken = "old";
    if (["revision", "suggestionsRevision"].includes(kind)) body[kind] = 0;
    if (kind === "oldSource") state.snapshot.signature = "old";
    if (kind === "refreshing") state.job = { status: "running" };
    if (kind === "address") row.recipientCandidates[0].addressParts.zip = "";
    if (kind === "names") row.memberNames = [];
    if (kind === "org")
      row.recipientCandidates[0].organizationContacts = {
        keyIndicator: "organization",
        contacts: [],
      };
    if (["shared", "hiddenShared"].includes(kind)) {
      row.recipientCandidates[0] = {
        ...state.snapshot.rows[0].recipientCandidates[0],
        constituentId: row.householdId,
      };
      if (kind === "hiddenShared") {
        row.societyKey = "order_of_the_dolphin";
        body.recipients.pop();
      }
    }
    if (kind === "expired") {
      await save();
      Object.values(state.recipient_reviews).forEach((review) => {
        review.savedAt = "2020-01-01T12:00:00Z";
      });
      Object.assign(body, triageRequest(state));
      store.save.mockClear();
    }
    const before = structuredClone(state);
    await expect(save()).rejects.toThrow();
    expect(store.save).not.toHaveBeenCalled();
    expect(state).toEqual(before);
  });
  it("does not overwrite an existing review and preserves other reviews when only new rows are selected", async () => {
    const { state, body, save, store } = setup();
    body.recipients.pop();
    await save();
    const existing = structuredClone(state.recipient_reviews);
    Object.assign(body, triageRequest(state));
    await expect(save()).rejects.toThrow("individual review");
    expect(state.recipient_reviews).toEqual(existing);
    body.recipients.shift();
    await save();
    expect(state.recipient_reviews).toMatchObject(existing);
    expect(store.save).toHaveBeenCalledTimes(2);
  });
  it("keeps memory unchanged when persistence fails", async () => {
    const { state, store, save } = setup(),
      before = structuredClone(state);
    store.save.mockRejectedValue(new Error("Database unavailable"));
    await expect(save()).rejects.toThrow("Database unavailable");
    expect(state).toEqual(before);
  });
  it("requires fresh suggestions after a completed save, rather than duplicating reviews on retry", async () => {
    const { state, store, save } = setup();
    await save();
    const before = structuredClone(state);
    await expect(save()).rejects.toThrow("workspace changed");
    expect(store.save).toHaveBeenCalledOnce();
    expect(state).toEqual(before);
  });
});
