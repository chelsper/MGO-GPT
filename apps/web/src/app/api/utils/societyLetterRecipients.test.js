import { describe, expect, it, vi } from "vitest";
import {
  recipientReviewForRow,
  saveLetterRecipientReview,
} from "./societyLetterRecipients";

function setup() {
  const row = {
    householdId: "10",
    members: ["10", "11"],
    period: { key: "2026", start: "2026-01-01", end: "2026-12-31" },
    sourceMode: "constituents",
    societyKey: "ood",
    qualifiedKeys: ["ood"],
    memberNames: [
      {
        constituentId: "10",
        name: "Alex Sample",
        firstName: "Alex",
        lastName: "Sample",
      },
      {
        constituentId: "11",
        name: "Pat Sample",
        firstName: "Pat",
        lastName: "Sample",
      },
    ],
    recipientCandidates: [
      {
        constituentId: "10",
        addressee: "Alex Sample",
        salutation: "Alex",
        address: "10 Test St",
        email: "",
        emailCandidates: ["alex@example.org", "alex2@example.org"],
      },
      {
        constituentId: "11",
        addressee: "Pat Sample",
        salutation: "Pat",
        address: "11 Test St",
        email: "pat@example.org",
      },
    ],
    emailAllowed: false,
    mailAllowed: false,
  };
  const signature = "source-v1";
  const state = {
    revision: 1,
    snapshot: { signature, rows: [row] },
    history: [],
    exclusions: [],
  };
  const body = {
    reviewToken: recipientReviewForRow(state, row, signature).token,
    confirm: true,
    recipientConstituentId: "10",
    addressConstituentId: "11",
    addressee: "Alex & Pat Sample",
    salutation: "Alex and Pat",
    address: "11 Test St\nJacksonville FL 32211",
    email: "",
  };
  const store = {
    save: vi.fn(async (next) => {
      next.revision += 1;
    }),
  };
  return {
    row,
    state,
    signature,
    body,
    store,
    save: () =>
      saveLetterRecipientReview(state, row, signature, body, store, 7),
  };
}

describe("saved society letter recipients", () => {
  it("saves explicit joint wording and a spouse address without altering source rows or permissions", async () => {
    const { row, state, signature, body, store, save } = setup();
    const original = structuredClone(row);
    await save();
    expect(store.save).toHaveBeenCalledOnce();
    expect(row).toEqual(original);
    expect(state.history).toEqual([]);
    const review = recipientReviewForRow(state, row, signature);
    expect(review).toMatchObject({
      status: "saved",
      savedBy: 7,
      values: {
        addressee: body.addressee,
        addressConstituentId: "11",
        email: "",
      },
    });
    expect(review.savedAt).toBeTruthy();
    expect(review.values).not.toHaveProperty("mailAllowed");
    expect(review.values).not.toHaveProperty("emailAllowed");
  });
  it("preserves choices after a snapshot replacement and reordered identical candidates", async () => {
    const { row, state, signature, save } = setup();
    await save();
    const refreshed = structuredClone(row);
    refreshed.members.reverse();
    refreshed.recipientCandidates.reverse();
    refreshed.memberNames.reverse();
    state.snapshot = {
      signature,
      generatedAt: "2026-09-25",
      rows: [refreshed],
    };
    expect(recipientReviewForRow(state, refreshed, signature).status).toBe(
      "saved",
    );
  });
  it.each([
    (row) => {
      row.recipientCandidates[0].address = "Changed address";
    },
    (row) => {
      row.recipientCandidates[1].salutation = "Changed greeting";
    },
    (row) => {
      row.recipientCandidates[0].emailCandidates.push("new@example.org");
    },
    (row) => {
      row.memberNames[0].firstName = "Changed name";
    },
    (row) => {
      row.societyKey = "presidents";
      row.qualifiedKeys.push("presidents");
    },
    (row) => {
      row.members = ["10"];
      row.recipientCandidates.pop();
    },
  ])(
    "requires a new explicit review when source information changes %#",
    async (change) => {
      const { row, state, signature, save } = setup();
      await save();
      change(row);
      expect(recipientReviewForRow(state, row, signature)).toMatchObject({
        status: "needs_review",
        values: null,
      });
    },
  );
  it("does not reuse a prior period or transfer choices to another constituent with the same name", async () => {
    const { row, state, signature, save } = setup();
    await save();
    const newYear = { ...row, period: { ...row.period, key: "2027" } };
    expect(recipientReviewForRow(state, newYear, signature).status).toBe(
      "unreviewed",
    );
    const stranger = { ...row, householdId: "55", members: ["55"] };
    expect(recipientReviewForRow(state, stranger, signature).status).toBe(
      "unreviewed",
    );
  });
  it("requires review after source settings change, even if the same rows return", async () => {
    const { row, state, save } = setup();
    await save();
    expect(recipientReviewForRow(state, row, "source-v2")).toMatchObject({
      status: "needs_review",
      editable: false,
      values: null,
    });
    state.snapshot.signature = "source-v2";
    expect(recipientReviewForRow(state, row, "source-v2")).toMatchObject({
      status: "needs_review",
      editable: true,
      values: null,
    });
  });
  it("supports an individual and explicitly selected email", async () => {
    const { row, state, signature, body, save } = setup();
    row.members = ["10"];
    row.recipientCandidates.pop();
    body.addressConstituentId = "10";
    body.email = "alex2@example.org";
    body.reviewToken = recipientReviewForRow(state, row, signature).token;
    await save();
    expect(recipientReviewForRow(state, row, signature).values.email).toBe(
      "alex2@example.org",
    );
  });
  it.each([
    { confirm: false },
    { reviewToken: "old" },
    { recipientConstituentId: "99" },
    { addressConstituentId: "99" },
    { email: "pat@example.org" },
    { email: "unknown@example.org" },
    { email: "alex@example.org;alex2@example.org" },
    { addressee: "" },
    { salutation: "\u0000" },
    { salutation: "Line\nTwo" },
    { address: "x".repeat(2001) },
    { addressee: {} },
  ])("rejects unsafe or stale choices without saving %j", async (changes) => {
    const { body, store, save } = setup();
    Object.assign(body, changes);
    await expect(save()).rejects.toThrow();
    expect(store.save).not.toHaveBeenCalled();
  });
  it("never selects a spouse whose own record was not returned", async () => {
    const { row, body, state, signature, store, save } = setup();
    row.recipientCandidates.pop();
    body.recipientConstituentId = "11";
    body.reviewToken = recipientReviewForRow(state, row, signature).token;
    await expect(save()).rejects.toThrow(/returned records/);
    expect(store.save).not.toHaveBeenCalled();
  });
  it.each(["excluded", "prepared", "mailed"])(
    "does not edit %s households or frozen letters",
    async (status) => {
      const { state, row, store, save } = setup();
      if (status === "excluded")
        state.exclusions = [{ period: row.period, members: row.members }];
      else
        state.history = [
          {
            householdId: "10",
            period: row.period,
            members: row.members,
            status,
            societyKey: "ood",
            coveredKeys: ["ood"],
            rank: 1,
          },
        ];
      await expect(save()).rejects.toMatchObject({ status: 409 });
      expect(store.save).not.toHaveBeenCalled();
    },
  );
  it("does not retain an unsaved mutation after a persistence failure", async () => {
    const { store, state, save } = setup();
    store.save.mockRejectedValueOnce(new Error("Lease expired"));
    await expect(save()).rejects.toThrow("Lease expired");
    expect(state.recipient_reviews).toBeUndefined();
  });
  it("ignores client permission and merge-name overrides", async () => {
    const { body, state, row, signature, save } = setup();
    Object.assign(body, {
      mailAllowed: true,
      emailAllowed: true,
      firstName: "Injected",
      sourceMode: "grouped",
    });
    await save();
    const values = recipientReviewForRow(state, row, signature).values;
    expect(values).not.toHaveProperty("mailAllowed");
    expect(values).not.toHaveProperty("firstName");
    expect(row.mailAllowed).toBe(false);
  });
});
