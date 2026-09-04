import { afterEach, it, expect, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import GiftReportActions, { GiftRowActions, stewardshipActionHref } from "./GiftReportActions";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const donor = { constituentId: "100", name: "Donor" };
const recipient = { constituentId: "200", name: "Recipient" };
const group = { giftId: "999", hardCreditDonor: donor, softCreditRecipients: [recipient], receivedAmount: 20000,
  giftType: "Donation", fundDescriptions: ["Scholarships"], date: "2026-08-01" };
function view(enabled = true) {
  return <GiftReportActions enabled={enabled} ready groups={[group]}>
    <div data-testid="donor"><GiftRowActions constituent={donor} group={group} /></div>
    <div data-testid="recipient"><GiftRowActions constituent={recipient} group={group} /></div>
  </GiftReportActions>;
}
it("prefills the existing action workflow with Stewardship, the recipient and return route", () => {
  const url = new URL(stewardshipActionHref(recipient), "https://example.org");
  expect(url.pathname).toBe("/action-opportunity-update");
  expect(Object.fromEntries(url.searchParams)).toMatchObject({ mode: "action", actionType: "Stewardship", blackbaudConstituentId: "200", returnTo: "/reports" });
});
it("shows the link only for an open opportunity and saves the exact report gift for the selected recipient", async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ byConstituentId: {
    "100": [], "200": [{ id: "51", name: "Science campaign", status: "Solicitation" }],
  } })).mockResolvedValueOnce(Response.json({ nxtSync: { message: "Saved; NXT manual review required." } }));
  vi.stubGlobal("fetch", fetchMock);
  render(view());
  expect(await screen.findByRole("button", { name: "Link to Opportunity" })).toBeInTheDocument();
  expect(within(screen.getByTestId("donor")).queryByRole("button", { name: "Link to Opportunity" })).toBeNull();
  fireEvent.click(within(screen.getByTestId("recipient")).getByRole("button", { name: "Link to Opportunity" }));
  expect(screen.getByRole("dialog", { name: "Link to Opportunity" })).toBeInTheDocument();
  fireEvent.change(screen.getByRole("combobox", { name: "Open opportunity" }), { target: { value: "51" } });
  fireEvent.click(screen.getByRole("button", { name: "Save selected gifts" }));
  await screen.findByText("Saved; NXT manual review required.");
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock.mock.calls[1][0]).toBe("/api/reports/gift-opportunities");
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ constituentId: "200", opportunityId: "51", giftId: "999" });
});
it("does not offer edits or call NXT in a read-only workspace", () => {
  const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
  render(view(false));
  expect(screen.queryByText("Log Stewardship Action")).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
});
it("reports failed checks instead of implying no opportunities and supports retry", async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ error: "429" }, { status: 502 }))
    .mockResolvedValueOnce(Response.json({ byConstituentId: { "100": [], "200": [] } }));
  vi.stubGlobal("fetch", fetchMock); render(view());
  fireEvent.click(await screen.findByRole("button", { name: "Retry opportunity check" }));
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
