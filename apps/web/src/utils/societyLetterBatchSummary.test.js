import { describe, expect, it } from "vitest";
import {
  letterBatchSummary,
  letterSelectionSummary,
  savedLetterSelection,
} from "./societyLetterBatchSummary";

const period = { key: "2026", start: "2026-01-01", end: "2026-12-31" };
const row = (id, overrides = {}) => ({
  householdId: id,
  members: [id],
  period,
  societyKey: "presidents",
  societyName: "President's Society",
  rank: 0,
  coveredKeys: ["presidents", "ood"],
  channel: "post",
  status: "prepared",
  ...overrides,
});
const receipt = (members, overrides = {}) => ({
  status: "complete",
  appeal: {
    id: "100",
    lookupId: "CY26-PRES",
    description: "2026 President letter",
  },
  date: "2026-09-27",
  members: members.map((id) => ({ id, status: "verified" })),
  ...overrides,
});

describe("society letter batch summaries", () => {
  it("counts joint and single letters, unique constituent IDs, and only the actual highest society letter", () => {
    const result = letterBatchSummary([
      row("10", { members: ["10", "11"] }),
      row("20", { societyKey: "ood", societyName: "Order of the Dolphin" }),
      row("10", { members: ["10", "11"], status: "cancelled" }),
    ]);
    expect(result.counts).toMatchObject({
      letters: 3,
      joint: 2,
      single: 1,
      constituents: 3,
      prepared: 2,
      cancelled: 1,
    });
    expect(result.societies.map((s) => [s.name, s.letters])).toEqual([
      ["President's Society", 2],
      ["Order of the Dolphin", 1],
    ]);
  });
  it("separates prepared, mailed, queued, provider accepted, delivered, uncertain and cancelled", () => {
    const items = [
      row("1"),
      row("2", { status: "mailed" }),
      ...[
        "pending_email",
        "emailed",
        "delivered",
        "sending",
        "needs_review",
        "cancelled",
        "unknown",
      ].map((status, i) => row(String(i + 3), { status, channel: "email" })),
    ];
    const { counts } = letterBatchSummary(items);
    expect(counts).toMatchObject({
      prepared: 1,
      mailed: 1,
      queued: 1,
      emailSent: 2,
      delivered: 1,
      attention: 3,
      cancelled: 1,
    });
    expect(
      counts.prepared +
        counts.mailed +
        counts.queued +
        counts.emailSent +
        counts.attention +
        counts.cancelled,
    ).toBe(items.length);
  });
  it("does not call a reserved letter prepared until ALL member receipts are verified", () => {
    const { counts, appeals } = letterBatchSummary([
      row("1", {
        members: ["1", "2"],
        letterAppeals: receipt(["1", "2"], {
          status: "needs_review",
          members: [
            { id: "1", status: "verified" },
            { id: "2", status: "uncertain" },
          ],
        }),
      }),
      row("3", { members: ["3", "4"], letterAppeals: receipt(["3"]) }),
      row("5", { letterAppeals: receipt(["5"]) }),
    ]);
    expect(counts).toMatchObject({ prepared: 1, attention: 2 });
    expect(appeals[0]).toMatchObject({
      id: "100",
      lookupId: "CY26-PRES",
      confirmed: 3,
      total: 5,
    });
  });
  it("keeps exact appeal descriptions, dates, and periods separate and never infers legacy assignments", () => {
    const { appeals, societies, unrecordedAppeals } = letterBatchSummary([
      row("1", { letterAppeals: receipt(["1"]) }),
      row("2", {
        letterAppeals: receipt(["2"], {
          appeal: { id: "100", description: "Renamed appeal" },
        }),
      }),
      row("3", { letterAppeals: receipt(["3"], { date: "2026-09-28" }) }),
      row("4", {
        period: { key: "2025", start: "2025-01-01", end: "2025-12-31" },
        letterAppeals: receipt(["4"]),
      }),
      row("5"),
    ]);
    expect(appeals).toHaveLength(4);
    expect(societies).toHaveLength(2);
    expect(unrecordedAppeals).toBe(1);
  });
  it("counts unrecorded or larger households separately instead of guessing spouses", () => {
    const { counts } = letterBatchSummary([
      row("1", { members: [] }),
      row("2", { members: ["2", "3", "4"] }),
      row("5", { members: ["5", "5"] }),
    ]);
    expect(counts).toMatchObject({
      joint: 0,
      single: 1,
      other: 2,
      constituents: 4,
    });
  });
  it("freezes selection counts from the entire same-period saved query, deduplicated by household", () => {
    const selected = row("1");
    const state = {
      snapshot: {
        rows: [
          selected,
          row("2"),
          row("2"),
          row("3"),
          row("4"),
          row("5"),
          row("6", {
            period: { key: "2025", start: "2025-01-01", end: "2025-12-31" },
          }),
        ],
      },
      history: [row("4", { status: "mailed" }), row("5")],
      exclusions: [{ householdId: "3", members: ["3"], period }],
    };
    const summary = letterSelectionSummary(state, [selected]);
    expect(summary).toEqual({
      version: 1,
      total: 5,
      selected: 1,
      notSelected: 1,
      excluded: 1,
      covered: 1,
      reserved: 1,
    });
    expect(JSON.stringify(summary)).not.toContain("members");
    state.snapshot.rows = [];
    expect(summary.total).toBe(5);
    expect(savedLetterSelection([{ selectionSummary: summary }])).toEqual(
      summary,
    );
  });
  it("does not invent historical skip counts or accept mismatched or partial snapshots", () => {
    expect(savedLetterSelection([row("1")])).toBeNull();
    const summary = {
      version: 1,
      total: 4,
      selected: 2,
      notSelected: 2,
      excluded: 0,
      covered: 0,
      reserved: 0,
    };
    expect(
      savedLetterSelection([
        { selectionSummary: summary },
        { selectionSummary: summary },
      ]),
    ).toEqual(summary);
    expect(savedLetterSelection([{ selectionSummary: summary }])).toBeNull();
    expect(
      savedLetterSelection([{ selectionSummary: summary }, {}]),
    ).toBeNull();
    expect(
      savedLetterSelection([
        {
          selectionSummary: {
            ...summary,
            selected: 1,
            total: 3,
            notSelected: -1,
          },
        },
      ]),
    ).toBeNull();
  });
});
