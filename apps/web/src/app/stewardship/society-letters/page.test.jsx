import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import Page from "./page";
import { LETTER_COLUMNS } from "@/utils/societyLetters";
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
describe("society letter workspace", () => {
  it("guides a grouped source to constituent fields without changing saved settings or running a query", async () => {
    render(<Page />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Source & period" }),
    );
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
    await screen.findByRole("button", { name: "Ready for letters" });
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
    fireEvent.click(screen.getByRole("button", { name: "Ready for letters" }));
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
    fireEvent.click(
      await screen.findByRole("button", { name: "Source & period" }),
    );
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
    fireEvent.click(
      await screen.findByRole("button", { name: "Letter templates" }),
    );
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
    fireEvent.click(
      await screen.findByRole("button", { name: "Letter templates" }),
    );
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
    fireEvent.click(
      await screen.findByRole("button", { name: "Letter templates" }),
    );
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
    fireEvent.click(
      await screen.findByRole("button", { name: "Source & period" }),
    );
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
    fireEvent.click(
      await screen.findByRole("button", { name: "Source & period" }),
    );
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
      screen.getByRole("button", { name: "Ready for letters" }),
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
    fireEvent.click(
      await screen.findByRole("button", { name: "Letter templates" }),
    );
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
    fireEvent.click(
      await screen.findByRole("button", { name: "Source & period" }),
    );
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
              },
            ],
          },
        ],
      }),
    );
    render(<Page />);
    expect(await screen.findByText("Member system IDs: 10, 11")).toBeVisible();
    expect(screen.getByLabelText("Select Sample Household")).toBeDisabled();
    expect(screen.getByText(/Spouse outside query: 11/)).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Ready for letters" }),
    ).toBeVisible();
    fireEvent.click(screen.getByText("Review address and salutation options"));
    expect(screen.getByText("Alex Sample")).toBeVisible();
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
