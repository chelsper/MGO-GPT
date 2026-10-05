import { describe, it, expect } from "vitest";
import {
  letterReviewView,
  letterReviewCounts,
  matchesLetterReview,
} from "./letterWorkspaceView";

const choice = {
  addressee: "Alex Example",
  salutation: "Alex",
  address: "10 Sample Street",
  email: "alex@example.org",
};
const row = {
  recipientCandidates: [choice],
  recipientReview: { status: "unreviewed", editable: true, values: null },
  issues: { post: "Preview only", email: "Preview only" },
  readiness: { post: { status: "unchecked", reasons: [] } },
};
const saved = (values = choice) => ({
  ...row,
  recipientReview: { ...row.recipientReview, status: "saved", values },
});

describe("saved-data letter workspace facets", () => {
  it("keeps optional postal preflight results out of recipient review without changing email or legacy checks", () => {
    const checked = {
      ...saved(),
      readiness: {
        post: { status: "needs_review" },
        email: { status: "needs_review" },
      },
    };
    expect(letterReviewView(checked, "post", null, true).attention).toEqual([]);
    expect(letterReviewView(checked, "post").attention).toEqual(["readiness"]);
    expect(letterReviewView(checked, "email", null, true).attention).toEqual([
      "readiness",
    ]);
    expect(
      letterReviewView(
        {
          ...checked,
          recipientReview: {
            ...checked.recipientReview,
            values: { ...choice, address: "" },
          },
        },
        "post",
        null,
        true,
      ).attention,
    ).toEqual(["address"]);
  });
  it("distinguishes an expired recipient review from changed recipient details", () => {
    const view = letterReviewView(
      {
        ...row,
        recipientReview: {
          status: "needs_review",
          reason: "expired",
          editable: true,
          values: choice,
        },
      },
      "post",
    );
    expect(view).toEqual({
      reviewed: false,
      needsReview: true,
      attention: ["expired"],
    });
  });
  it("keeps reviewed and readiness separate, and allows attention to overlap", () => {
    const checked = {
      ...saved(),
      readiness: {
        post: { status: "needs_review", reasons: ["Check expired"] },
      },
    };
    const views = [row, saved(), checked].map((item) =>
      letterReviewView(item, "post"),
    );
    expect(letterReviewCounts(views)).toEqual({
      all: 3,
      needs_review: 1,
      reviewed: 2,
      attention: 1,
    });
    expect(views[2]).toEqual({
      reviewed: true,
      needsReview: false,
      attention: ["readiness"],
    });
    expect(checked.readiness.post.status).toBe("needs_review");
  });
  it("does not treat unselected but available address or greeting choices as missing", () => {
    expect(
      letterReviewView({ ...row, address: "", salutation: "" }, "post")
        .attention,
    ).toEqual([]);
    expect(
      letterReviewView(
        {
          ...row,
          recipientCandidates: [
            { address: "", addressee: "", salutation: "" },
            choice,
          ],
        },
        "post",
      ).attention,
    ).toEqual([]);
  });
  it("honors deliberately blank saved values instead of falling back to the query", () => {
    expect(
      letterReviewView(saved({ ...choice, address: "" }), "post").attention,
    ).toEqual(["address"]);
    expect(
      letterReviewView(saved({ ...choice, email: "" }), "email").attention,
    ).toEqual(["email"]);
  });
  it("uses channel-specific missing contact checks and recognizes unselected returned emails", () => {
    const returned = {
      ...row,
      recipientCandidates: [
        {
          ...choice,
          email: "",
          emailCandidates: ["a@example.org", "b@example.org"],
        },
      ],
    };
    expect(letterReviewView(returned, "email").attention).toEqual([]);
    expect(
      letterReviewView(saved({ ...choice, address: "", email: "" }), "post")
        .attention,
    ).toEqual(["address"]);
    expect(
      letterReviewView(saved({ ...choice, address: "", email: "" }), "email")
        .attention,
    ).toEqual(["email"]);
  });
  it("flags changed or unavailable reviews without counting them as reviewed", () => {
    const view = letterReviewView(
      { ...row, recipientReview: { status: "needs_review", editable: false } },
      "post",
    );
    expect(view).toEqual({
      reviewed: false,
      needsReview: true,
      attention: ["changed", "unavailable"],
    });
    expect(matchesLetterReview(view, "reviewed")).toBe(false);
  });
  it("flags multiple organization contacts only until recipient choices are reviewed", () => {
    const org = {
      ...row,
      recipientCandidates: [
        {
          ...choice,
          organizationContacts: {
            constituencyCodes: ["Business"],
            contacts: [{ firstName: "Alex" }, { firstName: "Jordan" }],
          },
        },
      ],
    };
    expect(letterReviewView(org, "post").attention).toEqual(["contacts"]);
    expect(
      letterReviewView(
        { ...org, recipientReview: saved().recipientReview },
        "post",
      ).attention,
    ).toEqual([]);
  });
  it("does not invent review completion for legacy grouped rows", () => {
    const view = letterReviewView(
      { ...choice, issues: { post: "Global source issue" } },
      "post",
      "Global source issue",
    );
    expect(view).toEqual({
      reviewed: false,
      needsReview: false,
      attention: [],
    });
    expect(
      letterReviewView(
        { ...choice, issues: { post: "Postal mail not allowed" } },
        "post",
      ).attention,
    ).toEqual(["readiness"]);
  });
  it("uses saved eligibility only and never changes input records", () => {
    const input = {
      ...saved(),
      readiness: { post: { status: "ready_for_preview" } },
    };
    const before = JSON.stringify(input);
    expect(letterReviewView(input, "post").attention).toEqual([]);
    expect(JSON.stringify(input)).toBe(before);
  });
});
