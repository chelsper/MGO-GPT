import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ProspectDetailSummary from "./ProspectDetailSummary";
import ProspectOpportunityCard from "./ProspectOpportunityCard";
import {
  ActiveOpportunitySection,
  ClosedOpportunityHistory,
} from "./ProspectOpportunitySections";
import ProspectDetailActivity from "./ProspectDetailActivity";
import { buildProspectTimeline } from "./prospectDetailPresentation";

beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  cleanup();
  vi.unstubAllGlobals();
});

const pledgeData = {
  byConstituentId: {
    100: {
      count: 1,
      totalCents: 500000,
      balanceCents: 200000,
      overdueCents: 50000,
      nextPaymentDueDate: "2026-12-01",
      verifiedAt: "2026-09-17T12:00:00Z",
      asOf: "2026-09-17",
    },
    999: { count: 9 },
  },
};
it.each(["loading", "error"])(
  "keeps the exact constituent's saved pledge during summary %s",
  (state) => {
    render(
      <ProspectDetailSummary
        linkedBlackbaudConstituentId={100}
        pledgeData={pledgeData}
        blackbaudSummaryLoading={state === "loading"}
        blackbaudSummaryError={state === "error"}
      />,
    );
    const notice = screen.getByRole("complementary", {
      name: "Saved pledge status",
    });
    expect(notice).toHaveTextContent("Total pledged$5,000.00");
    expect(notice).toHaveTextContent("Balance due$2,000.00");
    expect(notice).toHaveTextContent("Overdue amount$500.00");
    expect(notice).toHaveTextContent("Next payment dueDec 1, 2026");
    expect(notice).not.toHaveTextContent("9 pledges");
    expect(
      screen.getByText(
        state === "loading"
          ? "Loading Blackbaud summary..."
          : "Linked Blackbaud data could not be loaded right now.",
      ),
    ).toBeInTheDocument();
  },
);

it("renders supplied summary values and delegates narrative expansion without a read", () => {
  const onToggleNarrative = vi.fn();
  const props = {
    linkedBlackbaudConstituentId: "100",
    linkedBlackbaudConstituentProfileUrl:
      "https://example.test/constituent/100",
    onToggleNarrative,
    blackbaudSummary: {
      mapped: {
        constituent: {
          lookupId: "LOOKUP",
          preferredName: "Test Donor",
          email: "donor@example.test",
          phone: "555-0100",
          address: "1 Test Road",
        },
        lifetimeGiving: { totalGiving: 125000 },
        proposalSummary: [{ id: 1 }],
        prospectSummaryNarrative: "Saved narrative",
      },
    },
  };
  const view = render(<ProspectDetailSummary {...props} />);
  expect(screen.getByText("Lookup ID: LOOKUP")).toBeInTheDocument();
  expect(screen.getByText("donor@example.test")).toBeInTheDocument();
  expect(screen.getByText("$125,000.00")).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Open NXT profile" }),
  ).toHaveAttribute("href", props.linkedBlackbaudConstituentProfileUrl);
  expect(screen.queryByText("Saved narrative")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "NXT Summary" }));
  expect(onToggleNarrative).toHaveBeenCalledOnce();
  view.rerender(
    <ProspectDetailSummary {...props} showBlackbaudNarrativeSummary />,
  );
  expect(screen.getByText("Saved narrative")).toBeInTheDocument();
});

it("does not imply a pledge or linked identity for an unlinked prospect", () => {
  render(<ProspectDetailSummary pledgeData={pledgeData} />);
  expect(
    screen.getByText(/not linked to a Blackbaud constituent/),
  ).toBeInTheDocument();
  expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
});

const gift = {
  id: 91,
  blackbaud_gift_id: "GIFT-1",
  gift_amount: 1250,
  gift_date: "2026-09-01",
  gift_type: "Cash",
  gift_fund: "Scholarship",
  nxt_sync_state: "manual_required",
};
const opportunity = {
  id: 2,
  title: "Funded campaign",
  current_stage: "Funded",
  closed_amount: 100,
  linked_gifts: [gift],
  updated_at: "2026-09-01",
  close_date: "2026-09-01",
};
function cardProps(overrides = {}) {
  return {
    opportunity,
    canLinkGift: true,
    onEdit: vi.fn(),
    onUnlinkGift: vi.fn(),
    onLinkGift: vi.fn(),
    renderRollover: vi.fn(() => null),
    renderStewardshipOpportunitySection: vi.fn(() => null),
    ...overrides,
  };
}
it("displays linked-gift credit and delegates controls with the original identities", () => {
  const props = cardProps();
  render(<ProspectOpportunityCard {...props} />);
  expect(screen.getByText("$1,250")).toBeInTheDocument();
  expect(screen.getByText(/Amount Funded \$1,250/)).toBeInTheDocument();
  expect(
    screen.getByText(/Scholarship.*NXT link needs manual review/),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Unlink gift" }));
  fireEvent.click(screen.getByRole("button", { name: "Link recent gift" }));
  fireEvent.click(screen.getByRole("button", { name: "Edit Opportunity" }));
  expect(props.onUnlinkGift).toHaveBeenCalledWith(opportunity, gift);
  expect(props.onLinkGift).toHaveBeenCalledWith(opportunity);
  expect(props.onEdit).toHaveBeenCalledWith(opportunity);
});

it("hides mutation controls in read-only opportunity display", () => {
  render(<ProspectOpportunityCard {...cardProps({ readOnly: true })} />);
  expect(screen.getByText("Linked gifts in JUMGOGPT")).toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

it("disables only the gift link being unlinked, including system-ID fallback", () => {
  const props = cardProps({
    opportunity: {
      ...opportunity,
      linked_gifts: [
        { ...gift, id: undefined },
        { ...gift, id: 92 },
      ],
    },
    unlinkingGiftLinkId: "GIFT-1",
  });
  render(<ProspectOpportunityCard {...props} />);
  expect(screen.getByRole("button", { name: "Unlinking..." })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Unlink gift" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Unlinking..." }));
  expect(props.onUnlinkGift).not.toHaveBeenCalled();
});

it("does not offer gift linking without constituent identity", () => {
  render(<ProspectOpportunityCard {...cardProps({ canLinkGift: false })} />);
  expect(
    screen.queryByRole("button", { name: "Link recent gift" }),
  ).not.toBeInTheDocument();
});

it("places the parent's editor below the heading and suppresses display-only controls", () => {
  const props = cardProps({
    editor: <input aria-label="Parent-owned draft" defaultValue="Draft" />,
  });
  render(<ProspectOpportunityCard {...props} />);
  expect(screen.getByText("Funded campaign")).toBeInTheDocument();
  expect(screen.getByRole("textbox")).toHaveValue("Draft");
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(props.renderRollover).not.toHaveBeenCalled();
  expect(props.renderStewardshipOpportunitySection).not.toHaveBeenCalled();
});

const emptyGroups = { active: [], recentClosed: [], olderClosed: [] };
it("keeps supplied opportunity order and closed history collapsed", () => {
  const opportunityGroups = {
    active: [{ id: "B" }, { id: "A" }],
    recentClosed: [{ id: "Recent" }],
    olderClosed: [{ id: "Older" }],
  };
  const renderOpportunityCard = (item) => (
    <p key={item.id} data-testid="opportunity">
      {item.id}
    </p>
  );
  render(
    <>
      <ActiveOpportunitySection
        opportunityGroups={opportunityGroups}
        renderOpportunityCard={renderOpportunityCard}
      />
      <ClosedOpportunityHistory
        opportunityGroups={opportunityGroups}
        renderOpportunityCard={renderOpportunityCard}
      />
    </>,
  );
  expect(
    screen.getAllByTestId("opportunity").map((item) => item.textContent),
  ).toEqual(["B", "A", "Recent", "Older"]);
  expect(
    screen.getByText("Older or undated closed history (1)").closest("details"),
  ).not.toHaveAttribute("open");
});

it("shows active empty guidance and hides save feedback while editing", () => {
  const props = {
    opportunityGroups: emptyGroups,
    opportunityEditFeedback: "Saved locally.",
  };
  const view = render(<ActiveOpportunitySection {...props} />);
  expect(
    screen.getByText(/No active linked opportunities/),
  ).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("Saved locally.");
  view.rerender(
    <ActiveOpportunitySection {...props} editingOpportunityId={1} />,
  );
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

it("does not render a closed-history shell when there are no closed opportunities", () => {
  const { container } = render(
    <ClosedOpportunityHistory opportunityGroups={emptyGroups} />,
  );
  expect(container).toBeEmptyDOMElement();
});

const timelineEvents = buildProspectTimeline(
  [
    {
      id: 1,
      update_title: "Call recap",
      update_date: "2026-09-02",
      update_notes: "Follow up next week",
    },
  ],
  [
    {
      id: 2,
      submission_type: "donor_update",
      date_submitted: "2026-09-01",
      notes: "Saved submission",
      reviewer_notes: "Checked",
    },
  ],
);
function activityProps(overrides = {}) {
  return {
    timelineEvents,
    expandedTimelineId: "progress-1",
    onToggleEvent: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    renderDeleteConfirmation: vi.fn(() => null),
    renderEditor: vi.fn(() => <p>Parent-owned editor</p>),
    ...overrides,
  };
}
it("delegates activity controls without creating editor state or making requests", () => {
  const props = activityProps({
    highlights: <p>Saved latest gift and action</p>,
  });
  render(<ProspectDetailActivity {...props} />);
  expect(screen.getByText("Saved latest gift and action")).toBeInTheDocument();
  expect(
    screen.getByText("Activity log (2)").closest("details"),
  ).toHaveAttribute("open");
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]);
  fireEvent.click(screen.getByRole("button", { name: "Hide details" }));
  expect(props.onEdit).toHaveBeenCalledWith(timelineEvents[0]);
  expect(props.onDelete).toHaveBeenCalledWith(timelineEvents[0]);
  expect(props.onToggleEvent).toHaveBeenCalledWith("progress-1");
  expect(props.renderEditor).not.toHaveBeenCalled();
});

it("preserves read-only activity inspection without editing or deletion", () => {
  render(
    <ProspectDetailActivity
      {...activityProps({ readOnly: true, expandedTimelineId: "submission-2" })}
    />,
  );
  expect(
    screen.queryByRole("button", { name: "Edit" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Delete" }),
  ).not.toBeInTheDocument();
  expect(screen.getByText("Submission details")).toBeInTheDocument();
  expect(screen.getByText("Reviewer note: Checked")).toBeInTheDocument();
});

it("renders a parent editor only for the expanded matching progress event", () => {
  const props = activityProps({ editingUpdateId: 1 });
  const view = render(<ProspectDetailActivity {...props} />);
  expect(screen.getByText("Parent-owned editor")).toBeInTheDocument();
  expect(props.renderEditor).toHaveBeenCalledWith(timelineEvents[0]);
  view.rerender(
    <ProspectDetailActivity {...props} expandedTimelineId="submission-2" />,
  );
  expect(screen.queryByText("Parent-owned editor")).not.toBeInTheDocument();
});

it("respects the parent's deletion busy state", () => {
  const props = activityProps({ isDeleting: true });
  render(<ProspectDetailActivity {...props} />);
  screen.getAllByRole("button", { name: "Delete" }).forEach((button) => {
    expect(button).toBeDisabled();
    fireEvent.click(button);
  });
  expect(props.onDelete).not.toHaveBeenCalled();
});

it("keeps an empty activity log collapsed while retaining highlights", () => {
  render(
    <ProspectDetailActivity
      {...activityProps({
        timelineEvents: [],
        expandedTimelineId: null,
        highlights: <p>Latest saved action</p>,
      })}
    />,
  );
  expect(
    screen.getByText("Activity log (0)").closest("details"),
  ).not.toHaveAttribute("open");
  expect(screen.getByText("Latest saved action")).toBeInTheDocument();
});
