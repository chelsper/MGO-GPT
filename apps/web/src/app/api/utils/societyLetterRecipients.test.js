import { describe, expect, it, vi } from "vitest";
import { contactChoiceKey } from "@/utils/societyLetterContacts";
import { formatLetterAddress } from "@/utils/societyLetters";
import {
  recipientReviewForRow,
  saveLetterRecipientReview,
  validateLetterRecipientChoices,
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
  it("keeps reviews through 15 days and retains wording for an age-only re-review", async () => {
    const { state, row, body, signature, save } = setup();
    await save();
    const saved = Object.values(state.recipient_reviews)[0];
    const clock = vi.spyOn(Date, "now");
    try {
      for (const days of [2, 14, 15]) {
        clock.mockReturnValue(Date.parse(saved.savedAt) + days * 86400000);
        state.snapshot.generatedAt = new Date(Date.now()).toISOString();
        expect(recipientReviewForRow(state, row, signature).status).toBe(
          "saved",
        );
      }
      clock.mockReturnValue(Date.parse(saved.savedAt) + 15 * 86400000 + 1);
      expect(recipientReviewForRow(state, row, signature)).toMatchObject({
        status: "needs_review",
        reason: "expired",
        values: { salutation: body.salutation },
      });
      row.members.push("99");
      expect(recipientReviewForRow(state, row, signature).values).toBeNull();
    } finally {
      clock.mockRestore();
    }
  });
  it("preserves an existing review when a refresh only adds the address comma", async () => {
    const { state, row, body, signature, save } = setup();
    const parts = {
      address_line_1: "11 Test St",
      address_line_2: "",
      city: "Jacksonville",
      state: "FL",
      zip: "32211",
      country: "",
    };
    row.recipientCandidates[1].addressParts = parts;
    row.recipientCandidates[1].address = formatLetterAddress(parts, false);
    body.reviewToken = recipientReviewForRow(state, row, signature).token;
    body.addressParts = parts;
    await save();
    // Emulate an older saved review without rewriting its timestamp or source token.
    Object.values(state.recipient_reviews)[0].values.address =
      formatLetterAddress(parts, false);
    const before = structuredClone(state.recipient_reviews);
    row.recipientCandidates[1].address = formatLetterAddress(parts);
    expect(recipientReviewForRow(state, row, signature)).toMatchObject({
      status: "saved",
      values: { address: "11 Test St\nJacksonville, FL 32211" },
    });
    expect(state.recipient_reviews).toEqual(before);
    row.recipientCandidates[1].addressParts.zip = "99999";
    expect(recipientReviewForRow(state, row, signature).status).toBe(
      "needs_review",
    );
  });
  it("retains separate address fields for legacy reviews that saved only the assembled address", async () => {
    const { state, row, body, signature, save } = setup();
    const parts = {
      address_line_1: "11 Test St",
      address_line_2: "",
      city: "Jacksonville",
      state: "FL",
      zip: "32211",
      country: "",
    };
    row.recipientCandidates[1].addressParts = parts;
    row.recipientCandidates[1].address = body.address;
    body.reviewToken = recipientReviewForRow(state, row, signature).token;
    await save();
    const saved = Object.values(state.recipient_reviews)[0];
    delete saved.values.addressParts;
    saved.values.address = body.address;
    expect(recipientReviewForRow(state, row, signature).values).toMatchObject({
      address: "11 Test St\nJacksonville, FL 32211",
      addressParts: parts,
    });
  });
  it("persists explicit name-field edits independently of source names, permissions, and appeals", async () => {
    const { row, body, state, signature, save } = setup();
    const original = structuredClone(row);
    body.nameOverrides = { first_name: " Lex ", first_names: "Lex and Pat" };
    await save();
    expect(
      recipientReviewForRow(state, row, signature).values.nameOverrides,
    ).toEqual({ first_name: "Lex", first_names: "Lex and Pat" });
    expect(row).toEqual(original);
    expect(state.history).toEqual([]);
    row.memberNames[0].preferredName = "Alexi";
    expect(recipientReviewForRow(state, row, signature).status).toBe(
      "needs_review",
    );
  });
  it.each([
    [],
    "names",
    { recipientConstituentId: "99" },
    { emailAllowed: true },
    { first_name: {} },
    { first_names: "A\nB" },
    { first_name: "x".repeat(301) },
  ])(
    "rejects invalid name overrides without saving: %j",
    async (nameOverrides) => {
      const { body, save, store } = setup();
      body.nameOverrides = nameOverrides;
      await expect(save()).rejects.toThrow();
      expect(store.save).not.toHaveBeenCalled();
    },
  );
  it("saves a returned organization contact choice without changing the qualifying IDs or permissions", async () => {
    const { row, state, body, signature, save } = setup();
    const contact = {
      role: "Main contact",
      firstName: "Taylor",
      lastName: "Contact",
    };
    row.recipientCandidates[0].organizationContacts = {
      constituencyCodes: ["Foundation"],
      contacts: [contact],
    };
    body.organizationContactKey = contactChoiceKey(contact);
    body.reviewToken = recipientReviewForRow(state, row, signature).token;
    await save();
    expect(recipientReviewForRow(state, row, signature).values).toMatchObject({
      organizationContactKey: body.organizationContactKey,
      recipientConstituentId: "10",
      addressConstituentId: "11",
    });
    expect(Object.values(state.recipient_reviews)[0].members).toEqual([
      "10",
      "11",
    ]);
    row.recipientCandidates[0].organizationContacts.contacts[0].firstName =
      "Changed";
    expect(recipientReviewForRow(state, row, signature).status).toBe(
      "needs_review",
    );
  });
  it("persists an optional multiline organization addressee while preserving membership, permissions, and history", async () => {
    const { row, state, body, signature, save } = setup();
    const contact = {
      role: "Main contact",
      firstName: "Taylor",
      lastName: "Contact",
    };
    row.recipientCandidates[0].organizationContacts = {
      keyIndicator: "organization",
      contacts: [contact],
    };
    body.organizationContactKey = contactChoiceKey(contact);
    body.includeOrganizationName = true;
    body.addressee = "Example Foundation\r\nAttn: Taylor Contact";
    body.reviewToken = recipientReviewForRow(state, row, signature).token;
    const original = structuredClone(row);
    await save();
    expect(recipientReviewForRow(state, row, signature).values).toMatchObject({
      includeOrganizationName: true,
      organizationContactKey: body.organizationContactKey,
      addressee: "Example Foundation\nAttn: Taylor Contact",
      salutation: body.salutation,
      address: body.address,
      recipientConstituentId: "10",
      addressConstituentId: "11",
    });
    expect(row).toEqual(original);
    expect(state.history).toEqual([]);
    expect(Object.values(state.recipient_reviews)[0].members).toEqual([
      "10",
      "11",
    ]);
  });
  it.each([true, "true", null, 1, {}])(
    "rejects an invalid or unbound organization option %j",
    async (includeOrganizationName) => {
      const { body, save, store } = setup();
      body.includeOrganizationName = includeOrganizationName;
      await expect(save()).rejects.toThrow(
        /Choose a returned organization contact/,
      );
      expect(store.save).not.toHaveBeenCalled();
    },
  );
  it.each([
    { includeOrganizationName: false, addressee: "Foundation\nContact" },
    { includeOrganizationName: true, addressee: "x".repeat(701) },
    { includeOrganizationName: true, addressee: "Foundation\u0000Contact" },
  ])(
    "validates the optional address block before saving: %j",
    async (values) => {
      const { row, state, body, signature, save, store } = setup();
      const contact = {
        role: "Main contact",
        firstName: "Taylor",
        lastName: "Contact",
      };
      row.recipientCandidates[0].organizationContacts = {
        keyIndicator: "organization",
        contacts: [contact],
      };
      Object.assign(body, values, {
        organizationContactKey: contactChoiceKey(contact),
        reviewToken: recipientReviewForRow(state, row, signature).token,
      });
      await expect(save()).rejects.toThrow(/Addressee must be/);
      expect(store.save).not.toHaveBeenCalled();
    },
  );
  it.each(["other-record", "not-organization", "forged", "wrong-type"])(
    "rejects %s contact choices before saving",
    async (kind) => {
      const { row, state, body, signature, save, store } = setup();
      const contact = {
        role: "Main contact",
        firstName: "Taylor",
        lastName: "Contact",
      };
      row.recipientCandidates[
        kind === "other-record" ? 1 : 0
      ].organizationContacts = {
        constituencyCodes: [
          kind === "not-organization" ? "Alumnus" : "Business",
        ],
        contacts: [contact],
      };
      body.organizationContactKey =
        kind === "forged"
          ? "not-a-choice"
          : kind === "wrong-type"
            ? {}
            : contactChoiceKey(contact);
      body.reviewToken = recipientReviewForRow(state, row, signature).token;
      await expect(save()).rejects.toThrow(/Choose an organization contact/);
      expect(store.save).not.toHaveBeenCalled();
    },
  );
  it("saves explicit address components but rejects components that disagree with the reviewed address", async () => {
    const { state, row, signature, body, save } = setup();
    body.addressParts = {
      address_line_1: "11 Test St",
      address_line_2: "",
      city: "Jacksonville",
      state: "FL",
      zip: "32211",
      country: "",
    };
    await save();
    expect(
      recipientReviewForRow(state, row, signature).values.addressParts,
    ).toEqual(body.addressParts);
    expect(() =>
      validateLetterRecipientChoices(state, row, signature, {
        ...body,
        address: "Some other address",
      }),
    ).toThrow(/do not match/);
  });
  it("uses only the selected address owner's saved parts and never parses an edited address", () => {
    const { state, row, signature, body } = setup();
    row.recipientCandidates[1].addressParts = { address_line_1: "11 Test St" };
    body.reviewToken = recipientReviewForRow(state, row, signature).token;
    expect(
      validateLetterRecipientChoices(state, row, signature, body).addressParts,
    ).toBeUndefined();
    body.address = "11 Test St";
    expect(
      validateLetterRecipientChoices(state, row, signature, body).addressParts,
    ).toEqual({ address_line_1: "11 Test St" });
  });
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
