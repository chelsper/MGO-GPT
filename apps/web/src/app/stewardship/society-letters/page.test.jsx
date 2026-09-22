import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import Page from "./page";
import { LETTER_COLUMNS } from "@/utils/societyLetters";
const household = {
  householdId: "10",
  name: "Sample Household",
  societyName: "President's Society",
  societyKey: "presidents_society",
  status: "ready",
  reason: "First letter for this period",
  issues: { post: null, email: null },
  address: "10 Test Street",
  email: "sample@example.org",
};
const base = {
  revision: 1,
  definitions: [{ key: "presidents_society", name: "President's Society" }],
  emailEnabled: false,
  settings: {
    queryId: "123",
    periodBasis: "calendar_year",
    fiscalYearStartMonth: 7,
    societyKeys: ["presidents_society"],
    columns: LETTER_COLUMNS,
  },
  period: { start: "2026-01-01", end: "2026-12-31" },
  templates: [],
  rows: [household],
  history: [],
  sourceIssue: null,
  job: null,
  refreshedAt: "2026-09-22T14:00:00Z",
};
let fetchMock;
beforeEach(() => {
  fetchMock = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async () => Response.json(base));
});
afterEach(() => vi.restoreAllMocks());
describe("society letter workspace", () => {
  it("loads saved data only and returns to Stewardship", async () => {
    render(<Page />);
    await screen.findByText("Sample Household");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].method).toBeUndefined();
    expect(
      screen.getByRole("link", { name: "Back to Stewardship" }),
    ).toHaveAttribute("href", "/stewardship");
  });
  it("offers explicit source setup without pretending the empty query is a complete list", async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        ...base,
        settings: null,
        rows: [],
        period: null,
        refreshedAt: null,
        sourceIssue:
          "Configure a household membership query before preparing letters.",
      }),
    );
    render(<Page />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Set up household source" }),
    );
    expect(screen.getByLabelText("NXT saved query ID")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Save source settings" }),
    ).toBeDisabled();
  });
  it("does not send or prepare just by selecting all eligible rows", async () => {
    render(<Page />);
    await screen.findByText("Sample Household");
    fireEvent.click(
      screen.getByRole("button", { name: /Select ready households/ }),
    );
    expect(screen.getByLabelText("Select Sample Household")).toBeChecked();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockResolvedValueOnce(
      Response.json({
        preview: {
          channel: "post",
          token: "preview",
          rows: [{ ...household, templateFilename: "letter.docx" }],
        },
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Review selected letters" }),
    );
    await screen.findByRole("region", { name: "Review letter batch" });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).action).toBe("preview");
    expect(
      screen.getByRole("button", {
        name: "Confirm recipients and prepare batch",
      }),
    ).toBeVisible();
  });
  it("shows the environment email gate and prevents selecting recipients for email", async () => {
    render(<Page />);
    await screen.findByText("Sample Household");
    fireEvent.change(screen.getByLabelText("Delivery method"), {
      target: { value: "email" },
    });
    expect(
      screen.getByText(/Email delivery is off for this environment/),
    ).toBeVisible();
    expect(screen.getByLabelText("Select Sample Household")).toBeDisabled();
  });
  it("retains saved records and stops after an API failure rather than automatically retrying", async () => {
    render(<Page />);
    await screen.findByText("Sample Household");
    fetchMock.mockResolvedValueOnce(
      Response.json(
        { error: "This workspace changed. Reload." },
        { status: 409 },
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Refresh membership" }));
    await screen.findByRole("alert");
    expect(screen.getByText("Sample Household")).toBeVisible();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});
