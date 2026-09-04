import { describe, expect, it } from "vitest";
import {
  buildPoolActionBody,
  filterPoolEntries,
  getPoolContactState,
  isPoolEntryArchived,
} from "./prospectPool";

describe("prospect pool presentation and action boundaries", () => {
  it.each([null, "pending", "failed", "manual_required"])(
    "keeps %s assignments active",
    (state) => {
      expect(
        isPoolEntryArchived({
          solicitor_requested: true,
          solicitor_assignment_sync_state: state,
        }),
      ).toBe(false);
    },
  );

  it("archives only confirmed assignments and preserves their history", () => {
    const records = [
      {
        id: 1,
        prospect_name: "Active",
        solicitor_assignment_sync_state: "failed",
      },
      {
        id: 2,
        prospect_name: "Archived",
        solicitor_assignment_sync_state: "success",
        mgogpt_disposition_value: "Qualified - Major Gifts",
      },
    ];
    expect(filterPoolEntries(records).map((entry) => entry.id)).toEqual([1]);
    expect(filterPoolEntries(records, { archive: true })).toEqual([records[1]]);
    expect(records).toHaveLength(2);
  });

  it("searches and sorts without mixing active and archived records", () => {
    const records = [
      {
        id: 1,
        prospect_name: "Zoe",
        assigned_at: "2026-09-01",
        email: "zoe@example.org",
      },
      {
        id: 2,
        prospect_name: "Amy",
        assigned_at: "2026-08-01",
        blackbaud_constituent_id: "555",
      },
      {
        id: 3,
        prospect_name: "Amy",
        solicitor_assignment_sync_state: "success",
      },
    ];
    expect(filterPoolEntries(records).map((entry) => entry.id)).toEqual([2, 1]);
    expect(
      filterPoolEntries(records, { search: "ZOE@" }).map((entry) => entry.id),
    ).toEqual([1]);
    expect(
      filterPoolEntries(records, { search: "555" }).map((entry) => entry.id),
    ).toEqual([2]);
    expect(
      filterPoolEntries(records, { sort: "name" }).map((entry) => entry.id),
    ).toEqual([2, 1]);
    expect(
      filterPoolEntries(records, { sort: "newest" }).map((entry) => entry.id),
    ).toEqual([1, 2]);
  });

  it("does not equate no help requests with available contact details", () => {
    expect(getPoolContactState({ needs_contact_info: false })).toBe(
      "No email or phone available",
    );
    expect(getPoolContactState({ blackbaud_constituent_id: "55" })).toBe(
      "Contact details not loaded",
    );
    expect(
      getPoolContactState(
        {},
        {
          status: "ready",
          payload: {
            mapped: { constituent: { email: "Unavailable", phone: "" } },
          },
        },
      ),
    ).toBe("No email or phone available");
    expect(getPoolContactState({ email: "hello@example.org" })).toBe(
      "Contact details available",
    );
    expect(
      getPoolContactState({
        needs_contact_info: true,
        email: "hello@example.org",
      }),
    ).toBe("Contact info requested");
    expect(
      getPoolContactState({
        solicitor_requested: true,
        solicitor_assignment_sync_state: "failed",
      }),
    ).toBe("Assignment needs attention");
  });

  it("sends only help fields even if assignment or outcome fields are present", () => {
    expect(
      buildPoolActionBody("request_help", {
        solicitorRequested: true,
        mgogptDispositionValue: "Qualified - Major Gifts",
        contactInfoRequestNote: "Verify email",
      }),
    ).toEqual({
      requestAction: "request_help",
      needsContactInfo: true,
      contactInfoRequestNote: "Verify email",
    });
  });

  it("requires an outcome for assignment and keeps outcome-only saves separate", () => {
    expect(() => buildPoolActionBody("assign", {})).toThrow(
      "Choose an MGOGPT outcome",
    );
    expect(() => buildPoolActionBody("invalid", {})).toThrow(
      "Invalid prospect pool action",
    );
    const values = {
      needsContactInfo: true,
      solicitorRequested: true,
      mgogptDispositionValue: "Qualified - Major Gifts",
    };
    expect(buildPoolActionBody("save_outcome", values)).not.toHaveProperty(
      "solicitorRequested",
    );
    expect(buildPoolActionBody("assign", values)).toHaveProperty(
      "solicitorRequested",
      true,
    );
    expect(buildPoolActionBody("assign", values)).not.toHaveProperty(
      "needsContactInfo",
    );
  });
});
