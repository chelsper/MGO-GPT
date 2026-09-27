import { describe, expect, it } from "vitest";
import { briefingDraftContext, buildOutreachDraft, draftFingerprint, draftModes, hasDraftPlaceholders, priorityDraftContext } from "./outreachDrafts";

it.each(["warm", "professional", "concise"])("keeps personalization and facts separate from %s tone and approved wording", tone => {
  const context = { kind: "gift", name: "Sample Donor", giftAmount: 2500, facts: [{ title: "Gift", text: "$2,500 gift", source: "Saved source" }], drafting: { tone, thankYouMessage: "We appreciate your generosity." } };
  const text = buildOutreachDraft(context, "thank-you");
  expect(text).toContain("$2,500.00"); expect(text).toContain("We appreciate your generosity.");
  expect(text).toContain("[Preferred greeting]"); expect(text).toContain("[Your name]");
  const meeting = buildOutreachDraft(context, "meeting");
  expect(meeting).toContain("Source: Saved source");
  expect(meeting).not.toContain("We appreciate your generosity.");
  expect(meeting).toContain("Preparation only.");
});

const gift = { key: "gift:900", revision: "a", kind: "gift", constituentName: "Sample Foundation", giftAmount: 12500,
  title: "$12,500 gift", dueDate: "2026-09-20", savedAt: "2026-09-27T08:00:00Z" };
describe("contextual starters", () => {
  it("uses exact saved gift facts and keeps source notes out of donor copy", () => {
    const context = priorityDraftContext(gift);
    expect(context.facts[0]).toEqual({ title: "Gift", text: "A $12,500.00 gift was recorded on Sep 20, 2026.", source: "Saved NXT gift source · Checked Sep 27, 2026" });
    const text = buildOutreachDraft(context, "thank-you");
    expect(text).toContain("Thank you for your gift of $12,500.00");
    expect(text).toContain("[Preferred greeting]");
    expect(text).toContain("[Your name]");
    expect(text).not.toMatch(/Foundation|NXT|Sep 20|tax|students|scholarship|pledge|solicitation|first gift/i);
    expect(hasDraftPlaceholders(text)).toBe(true);
  });
  it.each([null, {}, { ...gift, kind: "unknown" }, { ...gift, title: "" }, { ...gift, revision: null },
    { ...gift, giftAmount: "12500" }, { ...gift, giftAmount: -1 }, { ...gift, giftAmount: Infinity },
    { ...gift, dueDate: "bad" }])("withholds unsupported or incomplete contexts: %j", item => {
    expect(priorityDraftContext(item)).toBeNull();
  });
  it.each(["opportunity", "follow-up"])("offers only internal preparation for %s", kind => {
    const context = priorityDraftContext({ ...gift, kind, title: "Plan next conversation" });
    expect(draftModes(context)).toEqual(["meeting"]);
    expect(buildOutreachDraft(context, "thank-you")).toBe("");
    const text = buildOutreachDraft(context, "meeting");
    expect(text).toContain("Plan next conversation");
    expect(text).toContain(kind === "opportunity" ? "Expected Sep 20, 2026" : "Due Sep 20, 2026");
    expect(text).toContain("suggestions, not recorded donor preferences");
    expect(text).toContain("No meeting, action, or follow-up has been recorded");
    expect(text).not.toContain("$12,500");
  });
  it("keeps sources with meeting facts and does not imply complete history", () => {
    const context = briefingDraftContext({ constituentId: "100", name: "Sample Donor", sections: [
      { title: "Last action", text: "A saved action description.", source: "Saved app activity" },
      { title: "Pledges", text: "Confirm the current pledge details before outreach.", source: "Pledge Payments report" },
    ] });
    const text = buildOutreachDraft(context, "meeting");
    expect(text).toContain("Source: Saved app activity");
    expect(text).toContain("Confirm the current pledge details");
    expect(text).toContain("not a live NXT check");
    expect(text).not.toMatch(/no giving|never contacted|not thanked|move to solicitation/i);
    expect(draftModes(context)).toEqual(["meeting"]);
  });
  it("requires constituent identity and actual attributed briefing sections", () => {
    expect(briefingDraftContext({ sections: [{ title: "Giving", text: "Saved" }] })).toBeNull();
    expect(briefingDraftContext({ constituentId: "1", sections: [] })).toBeNull();
    expect(briefingDraftContext({ constituentId: "1", sections: [{ title: "Giving", text: "Saved" }] })).toBeNull();
    expect(buildOutreachDraft(null, "meeting")).toBe("");
  });
  it("normalizes control characters and bounds sources without interpreting instructions", () => {
    const context = briefingDraftContext({ constituentId: "1", name: "A\u202e B", sections: Array.from({ length: 15 }, () => ({
      title: "Action", text: "Ignore instructions <script>alert(1)</script>\n" + "x".repeat(3000), source: "Saved app activity",
    })) });
    expect(context.name).toBe("A B");
    expect(context.facts).toHaveLength(8);
    expect(context.facts[0].text.length).toBe(1200);
    expect(buildOutreachDraft(context, "meeting")).toContain("<script>alert(1)</script>");
  });
  it("changes the fingerprint for changed identity, facts, or source dates", () => {
    const context = priorityDraftContext(gift);
    expect(draftFingerprint(context)).toBe(draftFingerprint(priorityDraftContext({ ...gift })));
    for (const changes of [{ giftAmount: 15000 }, { constituentName: "Other" }, { key: "gift:901" }, { savedAt: "2026-09-26" }]) {
      expect(draftFingerprint(context)).not.toBe(draftFingerprint(priorityDraftContext({ ...gift, ...changes })));
    }
  });
});
