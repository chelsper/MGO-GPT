import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import Page from "./page";
import { LETTER_COLUMNS, LETTER_TAGS } from "@/utils/societyLetters";
import { societyQuerySettings } from "../../../../test/societyQueryFixture";
import { sourceForSociety } from "./SocietyQueryEditors";
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
  reviewerId: "1",
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
  sessionStorage.clear();
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value() {
        this.setAttribute("open", "");
      },
    },
    close: {
      configurable: true,
      value() {
        this.removeAttribute("open");
      },
    },
  });
  fetchMock = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async () => Response.json(base));
});
afterEach(() => vi.restoreAllMocks());
function reviewRow(id, saved = false) {
  const values = {
    recipientConstituentId: id,
    addressConstituentId: id,
    addressee: `Recipient ${id}`,
    salutation: `Person ${id}`,
    address: "10 Test Street",
    email: "",
  };
  return {
    ...household,
    householdId: id,
    name: `Household ${id}`,
    members: [id],
    issues: { post: "Preview only", email: "Preview only" },
    recipientCandidates: [{ constituentId: id, ...values }],
    recipientReview: {
      editable: true,
      token: `token-${id}`,
      status: saved ? "saved" : "unreviewed",
      values: saved ? values : null,
    },
  };
}
async function setupTab(name) {
  fireEvent.click(
    await screen.findByRole("button", { name: "Setup", exact: true }),
  );
  return screen.findByRole("button", { name, exact: true });
}
describe("society letter workspace", () => {
  it("shows saved batch counts in history without starting NXT or delivery requests", async () => {
    fetchMock.mockImplementation(async () =>
      Response.json({
        ...base,
        history: [
          {
            ...household,
            members: ["10", "11"],
            id: "letter",
            batchId: "batch",
            channel: "post",
            status: "prepared",
            preparedAt: "2026-09-27T12:00:00Z",
            period: base.period,
            coveredKeys: ["presidents_society"],
          },
        ],
      }),
    );
    render(<Page />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Letter history",
        exact: true,
      }),
    );
    const summary = screen.getByRole("region", { name: "Batch summary" });
    expect(
      within(summary).getByText("Joint recipients").nextElementSibling,
    ).toHaveTextContent("1");
    expect(
      within(summary).getByText("Prepared, not mailed").nextElementSibling,
    ).toHaveTextContent("1");
    expect(
      within(summary).getByText("Mailed").nextElementSibling,
    ).toHaveTextContent("0");
    fireEvent.click(within(summary).getByText("Selection and appeal details"));
    expect(within(summary).getByText(/were not recorded/)).toBeVisible();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("resumes an in-memory draft outside the filters without storing wording or fetching NXT", async () => {
    fetchMock.mockImplementation(async () =>
      Response.json({ ...base, rows: [reviewRow("10"), reviewRow("20")] }),
    );
    render(<Page />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Review recipients in bulk" }),
    );
    fireEvent.change(screen.getByLabelText("Go to recipient"), {
      target: { value: "1" },
    });
    fireEvent.change(screen.getByLabelText("Recipient record"), {
      target: { value: "20" },
    });
    fireEvent.change(screen.getByLabelText("Salutation"), {
      target: { value: "Private draft greeting" },
    });
    fireEvent.click(
      screen.getByRole("checkbox", { name: /I reviewed the recipient/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Close review" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Keep draft and continue" }),
    );
    fireEvent.change(screen.getByLabelText("Find a household"), {
      target: { value: "No matches" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Resume review" }));
    expect(screen.getByText(/Recipient 2 of 2/)).toBeVisible();
    expect(screen.getByLabelText("Salutation")).toHaveValue(
      "Private draft greeting",
    );
    expect(
      screen.getByRole("checkbox", { name: /I reviewed the recipient/ }),
    ).not.toBeChecked();
    const checkpoint = sessionStorage.getItem(
      "society-letter-review:v1:1:2026-01-01:2026-12-31",
    );
    expect(JSON.parse(checkpoint)).toEqual({
      ids: ["10", "20"],
      currentId: "20",
      channel: "post",
      at: expect.any(Number),
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("restores only position after remount, and ignores recipients no longer editable", async () => {
    let rows = [reviewRow("10"), reviewRow("20")];
    fetchMock.mockImplementation(async () => Response.json({ ...base, rows }));
    const view = render(<Page />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Review recipients in bulk" }),
    );
    fireEvent.change(screen.getByLabelText("Go to recipient"), {
      target: { value: "1" },
    });
    fireEvent.change(screen.getByLabelText("Recipient record"), {
      target: { value: "20" },
    });
    view.unmount();
    const next = render(<Page />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Resume review" }),
    );
    expect(screen.getByText(/Recipient 2 of 2/)).toBeVisible();
    expect(screen.getByLabelText("Recipient record")).toHaveValue("");
    next.unmount();
    rows = [];
    render(<Page />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Resume review" }),
    );
    expect(
      screen.getByText(/previous review no longer has editable recipients/),
    ).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(sessionStorage.length).toBe(0);
    expect(fetchMock.mock.calls.every(([, options]) => !options?.method)).toBe(
      true,
    );
  });
  it("reloads a conflicted workspace read-only and saves only after explicit comparison using the latest revision", async () => {
    let workspace = { ...base, rows: [reviewRow("10", true)] };
    let reject = true;
    const requests = [];
    fetchMock.mockImplementation(async (_url, options) => {
      if (options?.method === "POST") {
        const body = JSON.parse(options.body);
        requests.push(body);
        if (reject) {
          reject = false;
          workspace = {
            ...workspace,
            revision: 2,
            rows: [reviewRow("10", true)],
          };
          workspace.rows[0].recipientReview.values.salutation =
            "Another reviewer greeting";
          workspace.rows[0].recipientReview.savedAt = "2026-09-25T15:00:00Z";
          return Response.json({ error: "Workspace changed" }, { status: 409 });
        }
        workspace = { ...workspace, revision: 3 };
      }
      return Response.json(workspace);
    });
    render(<Page />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Review letter recipient for Household 10",
      }),
    );
    fireEvent.change(screen.getByLabelText("Salutation"), {
      target: { value: "My draft greeting" },
    });
    fireEvent.click(
      screen.getByRole("checkbox", { name: /I reviewed the recipient/ }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Save recipient choices" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Load saved choices to compare" }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Keep draft and continue" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Resume review" }));
    expect(
      screen.getByRole("button", { name: "Save & finish" }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: "Load saved choices to compare" }),
    );
    expect(await screen.findByText("Another reviewer greeting")).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Keep my draft for review" }),
    );
    expect(requests).toHaveLength(1);
    fireEvent.click(
      screen.getByRole("checkbox", { name: /I reviewed the recipient/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save & finish" }));
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests.map((request) => request.action)).toEqual([
      "save_recipient",
      "save_recipient",
    ]);
    expect(requests.map((request) => request.revision)).toEqual([1, 2]);
    expect(requests[1].salutation).toBe("My draft greeting");
    expect(requests[1].reviewToken).toBe("token-10");
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });
  it("does not expose an edit shortcut for an unavailable recipient", async () => {
    const row = reviewRow("10", true);
    row.recipientReview.values.address = "";
    row.recipientReview.editable = false;
    fetchMock.mockResolvedValue(Response.json({ ...base, rows: [row] }));
    render(<Page />);
    await screen.findByText("Mailing address missing");
    expect(
      screen.queryByRole("button", {
        name: "Add mailing address for Household 10",
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Review letter recipient for Household 10",
      }),
    ).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("passes the chosen delivery method into bulk review guidance", async () => {
    fetchMock.mockResolvedValue(
      Response.json({ ...base, rows: [reviewRow("10")] }),
    );
    render(<Page />);
    fireEvent.change(await screen.findByLabelText("Delivery method"), {
      target: { value: "email" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Review recipients in bulk" }),
    );
    fireEvent.change(screen.getByLabelText("Recipient record"), {
      target: { value: "10" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Choose email" }));
    expect(screen.getByLabelText("Email for this letter")).toHaveFocus();
    expect(
      screen.getByText(/No email was returned for this recipient/),
    ).toBeVisible();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("opens the exact missing field from the workspace without saving or fetching", async () => {
    const row = reviewRow("10", true);
    row.recipientReview.values.address = "";
    fetchMock.mockResolvedValue(Response.json({ ...base, rows: [row] }));
    render(<Page />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Add mailing address for Household 10",
      }),
    );
    expect(screen.getByLabelText("Mailing address")).toHaveFocus();
    expect(screen.getByLabelText("Mailing address")).toHaveValue("");
    expect(
      screen.getByRole("checkbox", { name: /I reviewed/ }),
    ).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(
      screen.getByRole("button", {
        name: "Review letter recipient for Household 10",
      }),
    );
    expect(screen.getByLabelText("Mailing address")).not.toHaveFocus();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("keeps safety reasons visible and navigates to readiness without starting a check", async () => {
    const row = reviewRow("10", true);
    row.readiness = {
      post: {
        status: "needs_review",
        reasons: ["Mail restriction requires staff review."],
      },
    };
    fetchMock.mockResolvedValue(
      Response.json({
        ...base,
        rows: [row],
        readiness: {
          issue: "Save appeal settings before checking.",
          job: null,
        },
      }),
    );
    render(<Page />);
    fireEvent.click(
      await screen.findByRole("button", { name: "View delivery checks" }),
    );
    expect(
      screen.getByRole("heading", { name: "Check letter readiness" }),
    ).toHaveFocus();
    expect(
      screen.getByText("Mail restriction requires staff review."),
    ).toBeVisible();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("filters review and attention from saved data without treating reviewed recipients as deliverable", async () => {
    const changed = reviewRow("30");
    changed.recipientReview.status = "needs_review";
    const missingAddress = reviewRow("40", true);
    missingAddress.recipientReview.values.address = "";
    const staleCheck = reviewRow("50", true);
    staleCheck.readiness = {
      post: {
        status: "needs_review",
        reasons: ["Check expired. Check readiness again."],
      },
    };
    fetchMock.mockResolvedValue(
      Response.json({
        ...base,
        rows: [
          reviewRow("10"),
          reviewRow("20", true),
          changed,
          missingAddress,
          staleCheck,
          { ...reviewRow("60"), status: "covered" },
          { ...reviewRow("70"), status: "excluded" },
        ],
      }),
    );
    render(<Page />);
    await screen.findByRole("button", { name: "Letter workspace" });
    expect(
      screen.queryByRole("button", { name: "Ready for letters" }),
    ).not.toBeInTheDocument();
    const filters = within(
      screen.getByRole("group", { name: "Recipient review filters" }),
    );
    expect(
      filters.getByRole("button", { name: "All recipients 5" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      filters.getByRole("button", { name: "Needs review 2" }),
    ).toBeVisible();
    expect(filters.getByRole("button", { name: "Reviewed 3" })).toBeVisible();
    fireEvent.click(filters.getByRole("button", { name: "Needs attention 3" }));
    expect(
      screen.queryByLabelText("Select Household 10"),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Select Household 30")).toBeDisabled();
    expect(screen.getByLabelText("Select Household 40")).toBeDisabled();
    expect(
      screen.getByText("Check expired. Check readiness again."),
    ).toBeVisible();
    fireEvent.change(screen.getByLabelText("Focus on an issue"), {
      target: { value: "address" },
    });
    expect(
      screen.getByText("Showing 1 of 5 matching recipients"),
    ).toBeVisible();
    expect(
      screen.queryByLabelText("Select Household 50"),
    ).not.toBeInTheDocument();
    fireEvent.click(filters.getByRole("button", { name: "Reviewed 3" }));
    expect(screen.getByLabelText("Focus on an issue")).toHaveValue("all");
    expect(screen.getByLabelText("Select Household 20")).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: "Review recipients in bulk" }),
    );
    expect(screen.getByText(/Recipient 1 of 3/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Close review" }));
    fireEvent.change(screen.getByLabelText("Find a household"), {
      target: { value: "Household 10" },
    });
    expect(
      filters.getByRole("button", { name: "All recipients 1" }),
    ).toBeVisible();
    expect(filters.getByRole("button", { name: "Reviewed 0" })).toBeVisible();
    expect(screen.getByText(/No recipients match these filters/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(
      screen.getByText("Showing 5 of 5 matching recipients"),
    ).toBeVisible();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("resets hidden selections and channel-specific issue filters without any NXT requests", async () => {
    const eligible = {
      ...reviewRow("10", true),
      issues: { post: null, email: null },
    };
    fetchMock.mockResolvedValue(
      Response.json({ ...base, rows: [eligible, reviewRow("20")] }),
    );
    render(<Page />);
    fireEvent.click(await screen.findByLabelText("Select Household 10"));
    expect(
      screen.getByRole("button", { name: "Review selected letters" }),
    ).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Needs review 1" }));
    expect(
      screen.getByRole("button", { name: "Review selected letters" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "All recipients 2" }));
    expect(screen.getByLabelText("Select Household 10")).not.toBeChecked();
    fireEvent.click(screen.getByLabelText("Select Household 10"));
    fireEvent.change(screen.getByLabelText("Focus on an issue"), {
      target: { value: "address" },
    });
    expect(
      screen.getByRole("button", { name: "Review selected letters" }),
    ).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Delivery method"), {
      target: { value: "email" },
    });
    expect(screen.getByLabelText("Focus on an issue")).toHaveValue("all");
    expect(
      screen.queryByRole("option", { name: /Mailing address missing/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /Email missing or not selected/ }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Select Household 10")).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("scopes review counts by society and keeps legacy rows available only in All unless they have a known issue", async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        ...base,
        definitions: [
          ...base.definitions,
          { key: "ood", name: "Order of the Dolphin" },
        ],
        rows: [
          reviewRow("10"),
          {
            ...reviewRow("20", true),
            societyKey: "ood",
            societyName: "Order of the Dolphin",
          },
          { ...household, householdId: "90" },
        ],
      }),
    );
    render(<Page />);
    await screen.findByRole("button", { name: "All recipients 3" });
    fireEvent.change(screen.getByLabelText("Society letter"), {
      target: { value: "ood" },
    });
    expect(
      screen.getByRole("button", { name: "All recipients 1" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Reviewed 1" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Needs review 0" }),
    ).toBeVisible();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("separates setup from daily review and directs mapping work without making requests", async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        ...base,
        setup: { key: "one", sourceConfigured: true, membershipCurrent: false },
      }),
    );
    render(<Page />);
    await screen.findByRole("button", { name: "Open setup checklist" });
    expect(
      screen.queryByRole("button", { name: "Source & period" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Letter templates" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("NXT exclusion appeal settings"),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Open setup checklist" }),
    );
    expect(
      screen.getByRole("heading", { name: "Your letter setup checklist" }),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Review field mappings" }),
    );
    expect(
      screen.getByText("Map returned query columns").closest("details"),
    ).toHaveAttribute("open");
    expect(
      screen.getByRole("button", {
        name: "Load membership from saved queries",
      }),
    ).toBeEnabled();
    expect(fetchMock).toHaveBeenCalledOnce();
    fireEvent.change(
      screen.getByRole("textbox", { name: "NXT saved query ID" }),
      { target: { value: "456" } },
    );
    expect(
      screen.getByRole("button", {
        name: "Load membership from saved queries",
      }),
    ).toBeDisabled();
    expect(
      screen.getByText("Save your source changes before loading membership."),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Appeal settings", exact: true }),
    );
    expect(
      screen.getByRole("heading", { name: "NXT appeal settings" }),
    ).toBeVisible();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("moves multiple-society appeal forms into setup while retaining daily readiness controls", async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        ...base,
        settings: societyQuerySettings(),
        readiness: {
          policy: null,
          issue: "Save letter appeal settings",
          job: null,
        },
      }),
    );
    render(<Page />);
    await screen.findByRole("heading", { name: "Check letter readiness" });
    expect(
      screen.queryByText("Letter appeal settings for this period"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("NXT exclusion appeal settings"),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Open appeal settings" }),
    );
    expect(
      screen.getByText("Letter appeal settings for this period"),
    ).toBeVisible();
    expect(screen.getByText("NXT exclusion appeal settings")).toBeVisible();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("reads saved Word fields and saves per-placeholder mappings without uploading a replacement", async () => {
    let template = {
      societyKey: "ood",
      societyName: "Order of the Dolphin",
      filename: "OOD.docx",
      version: "v1",
      subject: "Society letter",
      emailBody: "Hello",
      mergeSettings: { fields: LETTER_TAGS, dateFormat: "iso" },
    };
    const fields = {
      fields: [
        { name: "First_Name", suggestedField: "first_name" },
        { name: "Address_Line_1", suggestedField: "address_line_1" },
      ],
      hasAddressBlock: true,
      hasDateLabel: true,
    };
    const requests = [];
    fetchMock.mockImplementation(async (_url, options) => {
      if (options?.method === "POST") {
        const body = JSON.parse(options.body);
        requests.push(body);
        if (body.action === "inspect_template") return Response.json(fields);
        expect(body.action).toBe("template");
        expect(body.existingVersion).toBe("v1");
        expect(body.template).not.toHaveProperty("content");
        template = {
          ...template,
          ...body.template,
          wordFields: fields,
          version: "v2",
        };
      }
      return Response.json({ ...base, templates: [template] });
    });
    const view = render(<Page />);
    fireEvent.click(await setupTab("Letter templates"));
    fireEvent.click(
      screen.getByRole("button", { name: "Read fields from Word letter" }),
    );
    const mapping = await screen.findByLabelText(
      "Order of the Dolphin fill First_Name with",
    );
    expect(mapping).toHaveValue("first_name");
    fireEvent.change(mapping, { target: { value: "first_names" } });
    expect(
      screen.queryByLabelText("Order of the Dolphin fill Address_Line_1 with"),
    ).not.toBeInTheDocument();
    fireEvent.change(
      screen.getByLabelText("Order of the Dolphin address layout"),
      { target: { value: "components" } },
    );
    expect(
      screen.getByLabelText("Order of the Dolphin fill Address_Line_1 with"),
    ).toHaveValue("address_line_1");
    fireEvent.change(
      screen.getByLabelText("Order of the Dolphin address layout"),
      { target: { value: "block" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Save template and field settings" }),
    );
    await waitFor(() => expect(template.version).toBe("v2"));
    expect(template.mergeSettings.wordBindings.First_Name).toBe("first_names");
    expect(template.mergeSettings.mergeDateLabel).toBe(true);
    expect(requests.map((item) => item.action)).toEqual([
      "inspect_template",
      "template",
    ]);
    view.unmount();
    render(<Page />);
    fireEvent.click(await setupTab("Letter templates"));
    expect(
      screen.getByLabelText("Order of the Dolphin fill First_Name with"),
    ).toHaveValue("first_names");
  });
  it("reviews a filtered queue, saves individually with current revisions, and leaves skipped households unchanged", async () => {
    let workspace = {
      ...base,
      settings: { ...base.settings, sourceMode: "constituents" },
      rows: [
        reviewRow("10"),
        reviewRow("20"),
        reviewRow("30"),
        reviewRow("40", true),
      ],
    };
    let reject = true;
    const saves = [];
    fetchMock.mockImplementation(async (_url, options) => {
      if (options?.method === "POST") {
        const body = JSON.parse(options.body);
        expect(body.action).toBe("save_recipient");
        expect(body.revision).toBe(workspace.revision);
        if (reject) {
          reject = false;
          return Response.json(
            { error: "Workspace changed; edits were not saved." },
            { status: 409 },
          );
        }
        saves.push(body);
        workspace = {
          ...workspace,
          revision: workspace.revision + 1,
          rows: workspace.rows.map((row) =>
            row.householdId === body.householdId
              ? {
                  ...row,
                  recipientReview: {
                    ...row.recipientReview,
                    status: "saved",
                    values: body,
                  },
                }
              : row,
          ),
        };
      }
      return Response.json(workspace);
    });
    render(<Page />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Review recipients in bulk" }),
    );
    expect(screen.getByText(/Recipient 1 of 3/)).toBeVisible();
    fireEvent.change(screen.getByLabelText("Recipient record"), {
      target: { value: "10" },
    });
    fireEvent.change(screen.getByLabelText("Salutation"), {
      target: { value: "Edited greeting" },
    });
    fireEvent.click(
      screen.getByRole("checkbox", { name: /I reviewed the recipient/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save & next" }));
    expect(
      await within(screen.getByRole("dialog")).findByText(
        "Workspace changed; edits were not saved.",
      ),
    ).toBeVisible();
    expect(screen.getByLabelText("Salutation")).toHaveValue("Edited greeting");
    expect(screen.getByText(/Recipient 1 of 3/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Save & next" })).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: "Load saved choices to compare" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Keep my draft for review" }),
    );
    expect(
      screen.getByRole("checkbox", { name: /I reviewed the recipient/ }),
    ).not.toBeChecked();
    fireEvent.click(
      screen.getByRole("checkbox", { name: /I reviewed the recipient/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save & next" }));
    await screen.findByText(/Recipient 2 of 3/);
    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    await screen.findByText(/Recipient 3 of 3/);
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(screen.getByLabelText("Recipient record")).toHaveValue("");
    fireEvent.change(screen.getByLabelText("Go to recipient"), {
      target: { value: "0" },
    });
    expect(screen.getByLabelText("Salutation")).toHaveValue("Edited greeting");
    fireEvent.change(screen.getByLabelText("Go to recipient"), {
      target: { value: "2" },
    });
    fireEvent.change(screen.getByLabelText("Recipient record"), {
      target: { value: "30" },
    });
    fireEvent.click(
      screen.getByRole("checkbox", { name: /I reviewed the recipient/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save & finish" }));
    await screen.findByText(/2 of 3 recipients saved in this review session/);
    expect(saves.map((body) => body.householdId)).toEqual(["10", "30"]);
    expect(saves.map((body) => body.revision)).toEqual([1, 2]);
    expect(screen.getByLabelText("Select Household 10")).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Review selected letters" }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: "Review recipients in bulk" }),
    );
    expect(screen.getByText(/Recipient 1 of 1/)).toBeVisible();
    expect(screen.getByLabelText("Recipient record")).toHaveValue("");
  });
  it("caps review at 50, supports already-reviewed recipients, and respects search", async () => {
    const rows = Array.from({ length: 52 }, (_, i) =>
      reviewRow(String(i + 100), true),
    );
    fetchMock.mockImplementation(async () => Response.json({ ...base, rows }));
    render(<Page />);
    expect(
      await screen.findByRole("button", { name: "Review recipients in bulk" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Reviewed 52" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Review recipients in bulk" }),
    );
    expect(screen.getByText(/Recipient 1 of 50/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Close review" }));
    fireEvent.change(screen.getByLabelText("Find a household"), {
      target: { value: "Household 151" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Review recipients in bulk" }),
    );
    expect(screen.getByText(/Recipient 1 of 1/)).toBeVisible();
    expect(screen.getByLabelText("Addressee")).toHaveValue("Recipient 151");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("saves and reloads recipient choices without enabling or requesting letter preparation", async () => {
    let values = null;
    fetchMock.mockImplementation(async (_url, options) => {
      const body = options?.body && JSON.parse(options.body);
      if (body) {
        expect(body).toMatchObject({
          action: "save_recipient",
          revision: 1,
          householdId: "10",
          reviewToken: "review-token",
          confirm: true,
        });
        values = { ...body };
      }
      return Response.json({
        ...base,
        settings: { ...base.settings, sourceMode: "constituents" },
        rows: [
          {
            ...household,
            ...values,
            members: ["10"],
            memberNames: [
              { constituentId: "10", name: "Alex Sample", firstName: "Alex" },
            ],
            issues: { post: "Preview only", email: "Preview only" },
            recipientCandidates: [
              {
                constituentId: "10",
                addressee: "Alex Sample",
                salutation: "Alex",
                address: "10 Test Street",
                email: "alex@example.org",
              },
            ],
            recipientReview: {
              status: values ? "saved" : "unreviewed",
              values,
              editable: true,
              token: "review-token",
            },
          },
        ],
      });
    });
    const first = render(<Page />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Review letter recipient for Sample Household",
      }),
    );
    const dialog = within(screen.getByRole("dialog"));
    fireEvent.change(dialog.getByLabelText("Recipient record"), {
      target: { value: "10" },
    });
    fireEvent.click(dialog.getByRole("checkbox"));
    fireEvent.click(
      dialog.getByRole("button", { name: "Save recipient choices" }),
    );
    await screen.findByText("Recipient choices saved");
    expect(screen.getByLabelText("Select Sample Household")).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Review selected letters" }),
    ).toBeDisabled();
    first.unmount();
    render(<Page />);
    await screen.findByText("Recipient choices saved");
    fireEvent.click(
      screen.getByRole("button", {
        name: "Review letter recipient for Sample Household",
      }),
    );
    expect(screen.getByLabelText("Salutation")).toHaveValue("Alex");
    expect(
      fetchMock.mock.calls.filter(([, options]) => options?.method === "POST"),
    ).toHaveLength(1);
  });
  it("guides a grouped source to constituent fields without changing saved settings or running a query", async () => {
    render(<Page />);
    fireEvent.click(await setupTab("Source & period"));
    fireEvent.click(
      screen.getByRole("button", { name: "Use constituent and spouse fields" }),
    );
    expect(screen.getByLabelText("Query format")).toHaveValue("constituents");
    expect(screen.getByLabelText("NXT saved query ID")).toHaveValue("123");
    expect(screen.queryByLabelText("Member IDs")).not.toBeInTheDocument();
    expect(
      screen.getByLabelText("Constituent system record ID"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Save source settings" }),
    ).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("keeps preview recipients in a persistent holding area with reversible exclusions", async () => {
    let excluded = false;
    const exclusion = {
      id: "e1",
      name: household.name,
      members: ["10"],
      period: base.period,
      reason: "Not this year",
    };
    fetchMock.mockImplementation(async (_url, options) => {
      const payload = options?.body && JSON.parse(options.body);
      if (payload?.action === "exclude_recipient") {
        expect(payload).toMatchObject({
          householdId: "10",
          revision: 1,
          reason: "Not this year",
        });
        excluded = true;
      }
      if (payload?.action === "restore_recipient") excluded = false;
      return Response.json({
        ...base,
        settings: { ...base.settings, sourceMode: "constituents" },
        rows: [
          {
            ...household,
            status: excluded ? "excluded" : "ready",
            issues: { post: "Preview only", email: "Preview only" },
          },
        ],
        exclusions: excluded ? [exclusion] : [],
      });
    });
    const first = render(<Page />);
    await screen.findByRole("button", { name: "Letter workspace" });
    expect(screen.getByText("Your letter holding list")).toBeVisible();
    expect(screen.getByLabelText(`Select ${household.name}`)).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", {
        name: `Exclude ${household.name} for this period`,
      }),
    );
    const dialog = within(screen.getByRole("dialog"));
    fireEvent.change(dialog.getByLabelText("Reason (optional)"), {
      target: { value: "Not this year" },
    });
    fireEvent.click(
      dialog.getByRole("button", { name: "Exclude for this period" }),
    );
    await screen.findByRole("button", { name: "Excluded (1)" });
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    first.unmount();
    render(<Page />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Excluded (1)" }),
    );
    expect(screen.getByText("Not this year")).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: `Restore ${household.name}` }),
    );
    await screen.findByRole("button", { name: "Excluded (0)" });
    fireEvent.click(screen.getByRole("button", { name: "Letter workspace" }));
    expect(screen.getByLabelText(`Select ${household.name}`)).toBeDisabled();
    expect(
      fetchMock.mock.calls
        .filter(([, opts]) => opts?.method === "POST")
        .map(([, opts]) => JSON.parse(opts.body).action),
    ).toEqual(["exclude_recipient", "restore_recipient"]);
  });
  it("converts loaded NXT fields in place and saves separate preferred address mappings without household output columns", async () => {
    const suggestedColumns = {
      constituentId: "Main System Record ID",
      spouseId: "Spouse System Record ID",
      firstName: "First Name",
      lastName: "Last Name",
      spouseFirstName: "Spouse First Name",
      spouseLastName: "Spouse Last Name",
      addressee: "Primary Addressee",
      salutation: "Primary Salutation",
      address1: "Preferred Street Line 1",
      address2: "Preferred Street Line 2",
      city: "Preferred City",
      state: "Preferred State",
      postalCode: "Preferred ZIP",
    };
    fetchMock.mockImplementation(async (_url, options) => {
      const body = options?.body && JSON.parse(options.body);
      if (body?.action === "inspect_query") {
        return Response.json({
          queryId: "123",
          fields: [...Object.values(suggestedColumns), "Joint Addressee"],
          suggestedColumns,
        });
      }
      return Response.json(base);
    });
    render(<Page />);
    fireEvent.click(await setupTab("Source & period"));
    fireEvent.click(screen.getByText("Map returned query columns"));
    fireEvent.change(screen.getByLabelText("Addressee"), {
      target: { value: "Joint Addressee" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Load query fields" }));
    await screen.findByRole("status");
    fireEvent.click(
      screen.getByRole("button", {
        name: "Map people and separate address fields",
      }),
    );
    expect(screen.getByLabelText("Query format")).toHaveValue("constituents");
    expect(screen.getByLabelText("NXT saved query ID")).toHaveValue("123");
    expect(screen.getByLabelText("Letter period")).toHaveValue("calendar_year");
    expect(screen.queryByLabelText("Household ID")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Member IDs")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Household Name")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Mailing Address")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Addressee" })).toHaveValue(
      "Joint Addressee",
    );
    expect(
      screen.getByRole("combobox", { name: "Preferred street line 1" }),
    ).toHaveValue("Preferred Street Line 1");
    expect(
      screen.getByLabelText("Preferred street line 2 (optional)"),
    ).toHaveValue("Preferred Street Line 2");
    expect(screen.getByLabelText("ZIP / postal code (optional)")).toHaveValue(
      "Preferred ZIP",
    );
    expect(screen.getByLabelText("Email (optional)")).toHaveValue("");
    expect(
      screen.getByLabelText("Constituent first name (optional)"),
    ).toHaveValue("First Name");
    expect(
      screen.getByLabelText("Constituent last name (optional)"),
    ).toHaveValue("Last Name");
    expect(screen.getByLabelText("Spouse first name (optional)")).toHaveValue(
      "Spouse First Name",
    );
    expect(screen.getByLabelText("Spouse last name (optional)")).toHaveValue(
      "Spouse Last Name",
    );
    expect(
      screen.getByLabelText("Spouse first name (optional)"),
    ).not.toBeRequired();
    expect(screen.getByText("Calculated in the app")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Save source settings" }),
    ).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fireEvent.change(screen.getByLabelText("Society qualified by this query"), {
      target: { value: "presidents_society" },
    });
    fireEvent.change(screen.getByLabelText("Query qualification start"), {
      target: { value: "2026-01-01" },
    });
    fireEvent.change(screen.getByLabelText("Query qualification end"), {
      target: { value: "2026-12-31" },
    });
    fireEvent.click(
      screen.getByLabelText(/I verified this query's giving qualification/),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Save source settings" }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const saved = JSON.parse(fetchMock.mock.calls[2][1].body);
    expect(saved).toMatchObject({
      action: "settings",
      settings: {
        sourceMode: "constituents",
        queryId: "123",
        columns: {
          ...suggestedColumns,
          addressee: "Joint Addressee",
          country: "",
          email: "",
        },
      },
    });
    expect(saved.settings.columns).not.toHaveProperty("householdId");
    expect(saved.settings.columns).not.toHaveProperty("name");
  });
  it("persists selected merge fields without a replacement upload and restores them on a later visit", async () => {
    let template = {
      societyKey: "presidents_society",
      societyName: "President's Society",
      filename: "saved.docx",
      version: "v1",
      subject: "Your {society_name} letter",
      emailBody: "Dear {salutation}",
      mergeSettings: {
        fields: ["salutation", "society_name", "letter_date"],
        dateFormat: "iso",
      },
    };
    fetchMock.mockImplementation(async (_url, options) => {
      if (options?.method === "POST") {
        const payload = JSON.parse(options.body);
        expect(payload.existingVersion).toBe("v1");
        expect(payload.template.content).toBeUndefined();
        expect(payload.template.filename).toBeUndefined();
        template = { ...template, ...payload.template, version: "v2" };
      }
      return Response.json({ ...base, templates: [template] });
    });
    const first = render(<Page />);
    fireEvent.click(await setupTab("Letter templates"));
    expect(
      screen.getByRole("button", { name: "Preview saved letter" }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Download Word file" }),
    ).toHaveAttribute(
      "href",
      "/api/stewardship/society-letters?templateVersion=v1",
    );
    expect(
      screen.queryByLabelText("President's Society Word template"),
    ).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Replace Word file" }));
    const upload = screen.getByLabelText("President's Society Word template");
    expect(upload).toBeVisible();
    fireEvent.change(upload, {
      target: { files: [new File(["replacement"], "replacement.docx")] },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Keep saved Word file" }),
    );
    expect(
      screen.queryByLabelText("President's Society Word template"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByLabelText("President's Society use Salutation"),
    ).toBeChecked();
    expect(
      screen.getByLabelText("President's Society use Addressee"),
    ).not.toBeChecked();
    fireEvent.click(
      screen.getByLabelText("President's Society use Letter date"),
    );
    fireEvent.click(
      screen.getByLabelText("President's Society use Recipient first name"),
    );
    fireEvent.change(
      screen.getByLabelText("President's Society merge date appearance"),
      { target: { value: "long_us" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Save template and field settings" }),
    );
    await screen.findByText(/Template and merge-field settings saved/);
    expect(template.mergeSettings).toEqual({
      fields: ["salutation", "society_name", "first_name"],
      dateFormat: "long_us",
    });
    first.unmount();
    render(<Page />);
    fireEvent.click(await setupTab("Letter templates"));
    expect(
      screen.getByLabelText("President's Society use Letter date"),
    ).not.toBeChecked();
    expect(
      screen.getByLabelText("President's Society use Recipient first name"),
    ).toBeChecked();
    expect(
      screen.getByLabelText("President's Society merge date appearance"),
    ).toHaveValue("long_us");
    expect(
      fetchMock.mock.calls.filter(([, options]) => options?.method === "POST"),
    ).toHaveLength(1);
  });
  it("keeps societies' field choices independent and inserts only selected tags into email text", async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        ...base,
        templates: [
          {
            societyKey: "presidents_society",
            societyName: "President's Society",
            version: "v1",
            filename: "high.docx",
            mergeSettings: { fields: ["salutation"], dateFormat: "iso" },
          },
          {
            societyKey: "order_of_the_dolphin",
            societyName: "Order of the Dolphin",
            version: "v2",
            filename: "low.docx",
            mergeSettings: { fields: ["addressee"], dateFormat: "iso" },
          },
        ],
      }),
    );
    render(<Page />);
    fireEvent.click(await setupTab("Letter templates"));
    const high = within(
      screen.getByRole("form", { name: "President's Society letter template" }),
    );
    const low = within(
      screen.getByRole("form", {
        name: "Order of the Dolphin letter template",
      }),
    );
    fireEvent.click(
      screen.getByLabelText("President's Society use Mailing address"),
    );
    expect(
      screen.getByLabelText("Order of the Dolphin use Mailing address"),
    ).not.toBeChecked();
    expect(low.getByRole("combobox", { name: /field to insert/ })).toHaveValue(
      "addressee",
    );
    const subject = high.getByLabelText("Email subject");
    fireEvent.click(
      high.getByLabelText("President's Society use Recipient first name"),
    );
    expect(
      low.getByLabelText("Order of the Dolphin use Recipient first name"),
    ).not.toBeChecked();
    fireEvent.change(high.getByRole("combobox", { name: /field to insert/ }), {
      target: { value: "first_name" },
    });
    fireEvent.change(subject, { target: { value: "Dear " } });
    subject.setSelectionRange(5, 5);
    fireEvent.click(
      high.getByRole("button", { name: "Insert into email subject" }),
    );
    expect(subject).toHaveValue("Dear {first_name}");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("provides independent query and template slots for each annual society", async () => {
    const settings = societyQuerySettings();
    const definitions = [
      {
        key: "presidents_society",
        name: "President's Society",
        displayOrder: 1,
      },
      {
        key: "order_of_the_dolphin",
        name: "Order of the Dolphin",
        displayOrder: 2,
      },
    ];
    fetchMock.mockResolvedValue(
      Response.json({
        ...base,
        settings,
        definitions,
        templates: [
          {
            societyKey: "order_of_the_dolphin",
            societyName: "Order of the Dolphin",
            filename: "OOD.docx",
          },
        ],
      }),
    );
    render(<Page />);
    fireEvent.click(await setupTab("Source & period"));
    expect(screen.getByLabelText("President's Society query ID")).toHaveValue(
      "100",
    );
    expect(screen.getByLabelText("Order of the Dolphin query ID")).toHaveValue(
      "101",
    );
    expect(screen.getByText("Letter template: OOD.docx")).toBeVisible();
    fireEvent.change(screen.getByLabelText("Order of the Dolphin query ID"), {
      target: { value: "31043" },
    });
    expect(screen.getByLabelText("President's Society query ID")).toHaveValue(
      "100",
    );
    fireEvent.click(
      screen.getByLabelText(/I verified this query's giving qualification/),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Save source settings" }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const payload = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(payload.action).toBe("settings");
    expect(payload.settings.societySources.map((s) => s.queryId)).toEqual([
      "100",
      "31043",
    ]);
    expect(payload.settings.confirmSource).toBe(true);
  });
  it("preserves the configured single constituent query when switching to multiple queries", () => {
    const source = societyQuerySettings().societySources[1];
    const single = {
      ...source,
      sourceMode: "constituents",
      querySocietyKey: source.societyKey,
    };
    expect(sourceForSociety(single, source.societyKey)).toEqual(source);
    expect(sourceForSociety(single, "presidents_society").queryId).toBe("");
  });
  it("adds and removes society query cards without a query refresh", async () => {
    const settings = societyQuerySettings();
    fetchMock.mockResolvedValue(
      Response.json({
        ...base,
        settings,
        definitions: [
          { key: "presidents_society", name: "President's Society" },
          { key: "order_of_the_dolphin", name: "Order of the Dolphin" },
          { key: "new_society", name: "New Annual Society" },
        ],
      }),
    );
    render(<Page />);
    fireEvent.click(await setupTab("Source & period"));
    fireEvent.click(
      screen.getByRole("checkbox", { name: "New Annual Society" }),
    );
    expect(screen.getByLabelText("New Annual Society query ID")).toHaveValue(
      "",
    );
    expect(
      screen.getByLabelText("New Annual Society query qualification start"),
    ).toHaveValue("");
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Order of the Dolphin" }),
    );
    expect(
      screen.queryByLabelText("Order of the Dolphin query ID"),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("President's Society query ID")).toHaveValue(
      "100",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("filters combined household previews by their highest letter without external reads", async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        ...base,
        settings: societyQuerySettings(),
        definitions: [
          ...base.definitions,
          { key: "order_of_the_dolphin", name: "Order of the Dolphin" },
        ],
        rows: [
          {
            ...household,
            issues: { post: "Preview only", email: "Preview only" },
          },
          {
            ...household,
            householdId: "20",
            name: "Another Household",
            societyKey: "order_of_the_dolphin",
            societyName: "Order of the Dolphin",
            issues: { post: "Preview only", email: "Preview only" },
          },
        ],
      }),
    );
    render(<Page />);
    await screen.findByText("Sample Household");
    fireEvent.change(screen.getByLabelText("Society letter"), {
      target: { value: "order_of_the_dolphin" },
    });
    expect(screen.getByText("Another Household")).toBeVisible();
    expect(screen.queryByText("Sample Household")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Letter workspace" }),
    ).toBeVisible();
    expect(screen.getByLabelText("Select Another Household")).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("offers templates before source setup without loading queries", async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        ...base,
        settings: null,
        rows: [],
        templates: [
          {
            societyKey: "presidents_society",
            societyName: "President's Society",
          },
          {
            societyKey: "order_of_the_dolphin",
            societyName: "Order of the Dolphin",
          },
        ],
      }),
    );
    render(<Page />);
    fireEvent.click(await setupTab("Letter templates"));
    expect(
      screen.getByLabelText("President's Society Word template"),
    ).toBeVisible();
    expect(
      screen.getByLabelText("Order of the Dolphin Word template"),
    ).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("offers constituent/spouse mapping without requiring householded query output", async () => {
    render(<Page />);
    fireEvent.click(await setupTab("Source & period"));
    fireEvent.change(screen.getByLabelText("Query format"), {
      target: { value: "constituents" },
    });
    expect(screen.getByLabelText("Constituent system record ID")).toHaveValue(
      "System Record ID",
    );
    expect(screen.getByLabelText("Spouse system record ID")).toHaveValue(
      "Spouse System Record ID",
    );
    expect(screen.getByLabelText("Query qualification start")).toBeRequired();
    expect(
      screen.getByText(/This option previews households only/),
    ).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("shows both members and recipient candidates while disabling preview-only household selection", async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        ...base,
        settings: { ...base.settings, sourceMode: "constituents" },
        sourceIssue: "Household preview only.",
        rows: [
          {
            ...household,
            members: ["10", "11"],
            membersOutsideQuery: ["11"],
            issues: { post: "Preview only", email: "Preview only" },
            recipientCandidates: [
              {
                constituentId: "10",
                addressee: "Alex Sample",
                salutation: "Alex",
                address: "10 Test St",
                email: "",
                emailCandidates: ["alex@example.org", "alex2@example.org"],
              },
            ],
          },
        ],
      }),
    );
    render(<Page />);
    const expand = await screen.findByRole("button", {
      name: "Show details for Sample Household",
    });
    expect(
      screen.queryByText("Member system IDs: 10, 11"),
    ).not.toBeInTheDocument();
    expect(expand).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(expand);
    expect(screen.getByText("Member system IDs: 10, 11")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Hide details for Sample Household" }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText("Select Sample Household")).toBeDisabled();
    expect(screen.getByText(/Spouse outside query: 11/)).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Letter workspace" }),
    ).toBeVisible();
    fireEvent.click(screen.getByText("Review address and salutation options"));
    expect(screen.getByText("Alex Sample")).toBeVisible();
    expect(screen.getByText("alex@example.org")).toBeVisible();
    expect(screen.getByText("alex2@example.org")).toBeVisible();
    expect(
      screen.getByText(/No email was selected automatically/),
    ).toBeVisible();
    expect(screen.getByLabelText("Select Sample Household")).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
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
      await screen.findByRole("button", { name: "Set up membership source" }),
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
      screen.getByRole("button", { name: /Select eligible households/ }),
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
