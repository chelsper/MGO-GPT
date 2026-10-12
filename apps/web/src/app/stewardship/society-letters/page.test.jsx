import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  act as reactAct,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import Page from "./page";
import { LETTER_COLUMNS, LETTER_TAGS } from "@/utils/societyLetters";
import { societyQuerySettings } from "../../../../test/societyQueryFixture";
import { sourceForSociety } from "./SocietyQueryEditors";
import { unsubmittedLetter } from "../../../../test/societyLetterRecoveryFixture";
import { completedLetter } from "../../../../test/societyLetterDispatchFixture";
import { csvWorkspace } from "../../../../test/societyLetterCsvFixture";
import { completedCsvFixture } from "../../../../test/societyLetterCsvTrackingFixture";
import { triageRow } from "../../../../test/societyLetterTriageFixture";
import { straightforwardRecipient } from "@/utils/societyLetterReviewTriage";
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
  window.history.replaceState({}, "", "/stewardship/society-letters");
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
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
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
    documentReadiness: {
      status: saved ? "ready" : "blocked",
      blockers: saved
        ? []
        : [
            {
              code: "recipient_review_required",
              action: "recipient",
              label: "Review recipient",
              message: "Review and save this recipient's choices.",
            },
          ],
    },
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
  it("reviews exceptions only, including a shared address hidden by the society filter, without saving or checking NXT", async () => {
    const clean = triageRow("10"),
      organization = triageRow("20"),
      shared = triageRow("30"),
      peer = triageRow("40");
    organization.recipientCandidates[0].organizationContacts = {
      keyIndicator: "organization",
      contacts: [],
    };
    peer.societyKey = "order_of_the_dolphin";
    peer.societyName = "Order of the Dolphin";
    peer.recipientCandidates[0] = {
      ...shared.recipientCandidates[0],
      constituentId: "40",
    };
    fetchMock.mockResolvedValue(
      Response.json({
        ...base,
        settings: societyQuerySettings(),
        rows: [clean, organization, shared, peer],
        definitions: [
          ...base.definitions,
          { key: "order_of_the_dolphin", name: "Order of the Dolphin" },
        ],
      }),
    );
    render(<Page />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Questionable only 3" }),
    );
    expect(
      screen.queryByLabelText(`Select ${clean.name}`),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText(`Select ${organization.name}`)).toBeVisible();
    expect(
      screen.getByText(
        /No Main contact or Society letter contact was returned/,
      ),
    ).toBeVisible();
    fireEvent.change(screen.getByLabelText("Society letter"), {
      target: { value: "presidents_society" },
    });
    expect(
      screen.getByRole("button", { name: "Questionable only 2" }),
    ).toBeVisible();
    fireEvent.change(screen.getByLabelText("Focus on an issue"), {
      target: { value: "shared_address" },
    });
    expect(
      screen.getByText("Showing 1 of 3 matching recipients"),
    ).toBeVisible();
    const details = screen
      .getByText("See matching recipients")
      .closest("details");
    details.open = true;
    fireEvent(details, new Event("toggle"));
    fireEvent.click(await screen.findByRole("button", { name: peer.name }));
    expect(screen.getByLabelText("Mailing address")).toHaveValue(
      peer.recipientCandidates[0].address,
    );
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("confirms only selected straightforward suggestions with one explicit save, preserving questionable and reviewed records", async () => {
    const rows = [
      triageRow("10"),
      triageRow("20"),
      triageRow("30"),
      triageRow("40"),
    ];
    rows[2].recipientCandidates[0].addressParts.zip = "";
    rows[3].recipientReview.status = "saved";
    let payload = { ...base, settings: societyQuerySettings(), rows };
    fetchMock.mockImplementation(async (_url, options) => {
      const body = options?.body && JSON.parse(options.body);
      if (body) {
        expect(body.action).toBe("confirm_recipient_suggestions");
        payload = {
          ...payload,
          revision: 2,
          rows: rows.map((row) =>
            body.recipients.some((item) => item.householdId === row.householdId)
              ? {
                  ...row,
                  ...straightforwardRecipient(row),
                  recipientReview: {
                    ...row.recipientReview,
                    status: "saved",
                    values: straightforwardRecipient(row),
                  },
                  documentReadiness: { status: "ready", blockers: [] },
                }
              : row,
          ),
        };
      }
      return Response.json(payload);
    });
    render(<Page />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Confirm straightforward recipients",
      }),
    );
    const dialog = within(
      screen.getByRole("dialog", {
        name: "Confirm straightforward recipients",
      }),
    );
    expect(
      dialog.getByRole("table", { name: "Suggested recipient wording" }),
    ).toBeVisible();
    expect(dialog.getAllByText("Al Example")).toHaveLength(2);
    expect(
      dialog.queryByLabelText(`Confirm ${rows[2].name}`),
    ).not.toBeInTheDocument();
    expect(
      dialog.queryByLabelText(`Confirm ${rows[3].name}`),
    ).not.toBeInTheDocument();
    expect(
      dialog.getByRole("button", { name: "Save 2 recipient reviews" }),
    ).toBeDisabled();
    fireEvent.click(dialog.getByLabelText(`Confirm ${rows[1].name}`));
    fireEvent.click(
      dialog.getByLabelText(/I accept the suggested names and addresses/),
    );
    expect(fetchMock).toHaveBeenCalledOnce();
    fireEvent.click(
      dialog.getByRole("button", { name: "Save 1 recipient review" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      action: "confirm_recipient_suggestions",
      confirm: true,
      revision: 1,
      suggestionsRevision: 1,
      recipients: [{ householdId: "10", reviewToken: "token-10" }],
    });
    expect(
      screen.getByText(/1 recipient review saved. No letters were created/),
    ).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it.each(["stale", "download_failed", "lost_save_response"])(
    "keeps tracked CSV recovery actionable after %s without a second export",
    async (mode) => {
      const csv = csvWorkspace(1);
      let payload = {
        ...base,
        ...csv,
        settings: {
          ...societyQuerySettings(),
          societyKeys: csv.settings.societyKeys,
        },
        rows: csv.rows.map((row) => ({
          ...row,
          issues: { post: null, email: null },
        })),
        csvRuns: [],
      };
      const run = {
        id: "33333333-3333-4333-8333-333333333333",
        sha256: "a".repeat(64),
        societyKey: "ood",
        societyName: "Order of the Dolphin",
        periodKey: csv.period.key,
        letterDate: csv.today,
        count: 1,
        createdAt: "2026-10-12T12:00:00Z",
        entries: csv.rows.map(({ householdId, name }) => ({
          householdId,
          name,
        })),
      };
      const posts = [],
        downloads = [];
      vi.stubGlobal(
        "URL",
        Object.assign(URL, {
          createObjectURL: vi.fn(() => "blob:csv"),
          revokeObjectURL: vi.fn(),
        }),
      );
      vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
        () => {},
      );
      fetchMock.mockImplementation(async (url, options) => {
        if (options?.method === "POST") {
          const body = JSON.parse(options.body);
          posts.push(body.action);
          expect(body.action).toBe("create_csv_run");
          if (mode === "stale")
            return Response.json(
              {
                error:
                  "The eligible recipients changed. Reload Society Letters and review the export count before downloading.",
              },
              { status: 409 },
            );
          payload = {
            ...payload,
            revision: payload.revision + 1,
            csvRuns: [run],
          };
          if (mode === "lost_save_response")
            throw new Error("Connection lost while saving the export");
          return Response.json({ ...payload, csvRunId: run.id });
        }
        if (String(url).includes("csvRun=")) {
          if (!String(url).includes("format=csv")) return Response.json(run);
          downloads.push(url);
          if (mode === "download_failed" && downloads.length === 1)
            return Response.json(
              { error: "Temporary download error" },
              { status: 503 },
            );
          return new Response("fictional,csv", {
            headers: {
              "Content-Disposition":
                'attachment; filename="ood-2026-10-12-mail-merge.csv"',
            },
          });
        }
        return Response.json(payload);
      });
      render(<Page />);
      fireEvent.change(await screen.findByLabelText("Society for CSV"), {
        target: { value: "ood" },
      });
      fireEvent.click(
        screen.getByRole("button", { name: "Save tracked CSV & download" }),
      );
      const exportPanel = within(
        screen.getByRole("region", { name: "Word mail merge export" }),
      );
      const warning = await exportPanel.findByRole("alert");
      if (mode === "stale") {
        expect(warning).toHaveTextContent("eligible recipients changed");
        expect(
          screen.queryByLabelText("Tracked export"),
        ).not.toBeInTheDocument();
        expect(downloads).toEqual([]);
      } else {
        if (mode === "download_failed")
          expect(warning).toHaveTextContent(
            "was saved, but the download did not finish",
          );
        else {
          fireEvent.click(
            screen.getByRole("button", { name: "Reload saved results" }),
          );
          await screen.findByLabelText("Tracked export");
        }
        fireEvent.change(screen.getByLabelText("Tracked export"), {
          target: { value: run.id },
        });
        fireEvent.click(
          await screen.findByRole("button", {
            name: "Download original CSV again",
          }),
        );
        await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
      }
      expect(posts).toEqual(["create_csv_run"]);
    },
  );
  it("connects a tracked export to explicit creation, household appeal processing, and separate selected dispatch", async () => {
    const csv = csvWorkspace(2);
    let payload = {
      ...base,
      ...csv,
      settings: {
        ...societyQuerySettings(),
        societyKeys: csv.settings.societyKeys,
      },
      rows: csv.rows.map((row) => ({
        ...row,
        issues: { post: null, email: null },
      })),
      csvRuns: [],
    };
    const run = {
      id: "33333333-3333-4333-8333-333333333333",
      sha256: "a".repeat(64),
      societyName: "Order of the Dolphin",
      societyKey: "ood",
      periodKey: csv.period.key,
      letterDate: csv.today,
      count: 2,
      createdAt: "2026-10-12T12:00:00Z",
      entries: csv.rows.map(({ householdId, name }) => ({ householdId, name })),
    };
    const created = completedCsvFixture({
      name: "Example 0",
      householdId: "1000",
      members: ["1000"],
      societyKey: "ood",
      societyName: "Order of the Dolphin",
      period: csv.period,
      preparedAt: "2026-10-12T12:00:00Z",
      letterDate: csv.today,
    });
    created.letterAppeals.members = [{ id: "1000", status: "verified" }];
    const actions = [];
    vi.stubGlobal(
      "URL",
      Object.assign(URL, {
        createObjectURL: vi.fn(() => "blob:csv"),
        revokeObjectURL: vi.fn(),
      }),
    );
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    fetchMock.mockImplementation(async (url, options) => {
      if (options?.method === "POST") {
        const body = JSON.parse(options.body);
        actions.push(body.action);
        expect(body.revision).toBe(payload.revision);
        payload = { ...payload, revision: payload.revision + 1 };
        if (body.action === "create_csv_run") {
          payload.csvRuns = [run];
          return Response.json({ ...payload, csvRunId: run.id });
        }
        if (body.action === "confirm_csv_letters") {
          expect(body).toMatchObject({
            confirm: true,
            runId: run.id,
            householdIds: ["1000"],
          });
          payload.history = [
            {
              ...created,
              letterAppeals: {
                ...created.letterAppeals,
                status: "pending",
                members: [{ id: "1000", status: "pending" }],
              },
            },
          ];
          return Response.json({ ...payload, csvDeliveryIds: [created.id] });
        }
        if (body.action === "finish_selected_letter_appeals") {
          expect(body).toMatchObject({
            confirm: true,
            deliveryId: created.id,
            deliveryIds: [created.id],
          });
          payload.history = [created];
          return Response.json({
            ...payload,
            bulkAppealUpdate: {
              deliveryId: created.id,
              status: "complete",
              stop: false,
            },
          });
        }
        if (body.action === "mail_selected_csv_letters") {
          expect(body).toMatchObject({
            confirm: true,
            batchId: created.batchId,
            deliveryIds: [created.id],
          });
          payload.history = [{ ...created, status: "mailed" }];
          return Response.json(payload);
        }
        throw new Error(`Unexpected mutation: ${body.action}`);
      }
      if (String(url).includes("csvRun=")) {
        if (String(url).includes("format=csv"))
          return new Response("fictional,csv", {
            headers: {
              "Content-Disposition":
                'attachment; filename="ood-2026-10-12-mail-merge.csv"',
            },
          });
        return Response.json(run);
      }
      return Response.json(payload);
    });
    render(<Page />);
    fireEvent.change(await screen.findByLabelText("Society for CSV"), {
      target: { value: "ood" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save tracked CSV & download" }),
    );
    await screen.findByText(/Tracked CSV saved for 2 households/);
    expect(actions).toEqual(["create_csv_run"]);
    fireEvent.change(screen.getByLabelText("Tracked export"), {
      target: { value: run.id },
    });
    await screen.findByRole("button", { name: "Select eligible on this page" });
    const manager = within(
      screen.getByRole("region", { name: "Saved CSV exports" }),
    );
    fireEvent.click(manager.getByRole("checkbox", { name: /Example 0/ }));
    fireEvent.click(
      manager.getByRole("checkbox", { name: /I created and checked/ }),
    );
    fireEvent.click(
      manager.getByRole("button", {
        name: "Confirm letters created & apply appeals",
      }),
    );
    await manager.findByText(/1 letter has confirmed appeals/);
    expect(actions).toEqual([
      "create_csv_run",
      "confirm_csv_letters",
      "finish_selected_letter_appeals",
    ]);
    fireEvent.click(
      screen.getByRole("button", { name: "Letter history", exact: true }),
    );
    const completed = within(
      await screen.findByRole("region", { name: "Completed letters" }),
    );
    expect(
      completed.getByRole("button", { name: "Mark selected letters mailed" }),
    ).toBeDisabled();
    fireEvent.click(completed.getByRole("checkbox", { name: /Example 0/ }));
    fireEvent.click(
      completed.getByRole("button", { name: "Mark selected letters mailed" }),
    );
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm" }));
    await screen.findByText(/1 selected letter is recorded as mailed/);
    expect(actions).toEqual([
      "create_csv_run",
      "confirm_csv_letters",
      "finish_selected_letter_appeals",
      "mail_selected_csv_letters",
    ]);
  });
  it("downloads every eligible reviewed household as CSV independently of table filters and selections", async () => {
    const csv = csvWorkspace(60);
    const payload = {
      ...base,
      ...csv,
      settings: {
        ...societyQuerySettings(),
        societyKeys: csv.settings.societyKeys,
      },
      rows: csv.rows.map((row) => ({
        ...row,
        issues: { post: null, email: null },
      })),
    };
    vi.stubGlobal(
      "URL",
      Object.assign(URL, {
        createObjectURL: vi.fn(() => "blob:csv"),
        revokeObjectURL: vi.fn(),
      }),
    );
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    fetchMock.mockImplementation(async (url, options) => {
      if (options?.method === "POST") {
        expect(JSON.parse(options.body)).toMatchObject({
          action: "export_merge_csv",
          revision: 7,
          householdIds: csv.rows.map((row) => row.householdId),
        });
        return new Response("synthetic CSV", {
          headers: {
            "Content-Disposition":
              'attachment; filename="ood-2026-10-12-mail-merge.csv"',
          },
        });
      }
      return Response.json(payload);
    });
    render(<Page />);
    fireEvent.change(
      await screen.findByRole("searchbox", { name: "Find a household" }),
      { target: { value: "no matching rows" } },
    );
    fireEvent.change(screen.getByLabelText("Society for CSV"), {
      target: { value: "ood" },
    });
    expect(
      screen.getByText("60 households ready for CSV; 0 not included."),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Download reviewed households (.csv)",
      }),
    );
    await waitFor(() => expect(anchorClick).toHaveBeenCalledOnce());
    expect(anchorClick.mock.instances[0].download).toBe(
      "ood-2026-10-12-mail-merge.csv",
    );
    expect(
      fetchMock.mock.calls.filter(([, options]) => options?.method === "POST"),
    ).toHaveLength(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Select ready households (up to 10)",
      }),
    ).toBeDisabled();
  });
  const cityBlocker = {
    code: "missing_merge_field",
    action: "recipient",
    field: "city",
    focus: "city",
    label: "Edit address",
    message: "Add city for {city} in recipient review.",
    householdId: "11",
  };
  const blockedRow = () => ({
    ...reviewRow("11", true),
    documentReadiness: { status: "blocked", blockers: [cityBlocker] },
  });
  it("selects only document-ready recipients and explains which reviewed recipients remain", async () => {
    fetchMock.mockImplementation(async () =>
      Response.json({
        ...base,
        settings: societyQuerySettings(),
        rows: [reviewRow("10", true), blockedRow()],
      }),
    );
    render(<Page />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Select ready households (up to 10)",
      }),
    );
    expect(
      screen.getByRole("checkbox", { name: "Select Household 10" }),
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Select Household 11" }),
    ).not.toBeChecked();
    expect(
      screen.getByText(/1 ready households selected. 1 reviewed recipients/),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Needs attention 1" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Prepare letters" }),
    ).toBeEnabled();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("keeps a manually selected blocked recipient and opens the exact missing address field", async () => {
    let state = {
      ...base,
      settings: societyQuerySettings(),
      rows: [reviewRow("10", true), blockedRow()],
    };
    fetchMock.mockImplementation(async (_, options) => {
      const body = options?.body && JSON.parse(options.body);
      if (body?.action === "save_recipient")
        state = {
          ...state,
          revision: 2,
          rows: [reviewRow("10", true), reviewRow("11", true)],
        };
      return Response.json(state);
    });
    render(<Page />);
    fireEvent.click(
      await screen.findByRole("checkbox", { name: "Select Household 10" }),
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Select Household 11" }),
    );
    expect(
      screen.getByRole("button", { name: "Prepare letters" }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: "Edit address for Household 11" }),
    );
    const dialog = within(screen.getByRole("dialog"));
    const city = dialog.getByLabelText("City");
    expect(city).toHaveFocus();
    expect(city.closest("details")).toHaveAttribute("open");
    fireEvent.change(city, { target: { value: "Example City" } });
    fireEvent.click(
      dialog.getByRole("checkbox", { name: /I reviewed the recipient/ }),
    );
    fireEvent.click(
      dialog.getByRole("button", { name: "Save recipient choices" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole("checkbox", { name: "Select Household 10" }),
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Select Household 11" }),
    ).toBeChecked();
    expect(
      screen.getByRole("button", { name: "Prepare letters" }),
    ).toBeEnabled();
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).action).toBe(
      "save_recipient",
    );
  });
  it("refreshes stale membership through the relevant fix without dropping selected saved reviews", async () => {
    let state = {
      ...base,
      settings: societyQuerySettings(),
      rows: [reviewRow("10", true)],
      readiness: {
        issue: "Membership is stale",
        blocker: {
          action: "refresh",
          label: "Refresh membership and keep my reviews",
        },
      },
    };
    fetchMock.mockImplementation(async (_, options) => {
      const body = options?.body && JSON.parse(options.body);
      if (body?.action === "refresh")
        state = { ...state, revision: 2, readiness: { issue: null } };
      return Response.json(state);
    });
    render(<Page />);
    fireEvent.click(
      await screen.findByRole("checkbox", { name: "Select Household 10" }),
    );
    expect(
      screen.getByRole("button", { name: "Prepare letters" }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Refresh membership and keep my reviews",
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Prepare letters" }),
      ).toBeEnabled(),
    );
    expect(
      screen.getByRole("checkbox", { name: "Select Household 10" }),
    ).toBeChecked();
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      action: "refresh",
      revision: 1,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("offers a direct fix when the server detects a missing field after the page was loaded", async () => {
    fetchMock.mockImplementation(async (_, options) =>
      options?.method === "POST"
        ? Response.json(
            { error: cityBlocker.message, blockers: [cityBlocker] },
            { status: 400 },
          )
        : Response.json({
            ...base,
            settings: societyQuerySettings(),
            rows: [reviewRow("11", true)],
          }),
    );
    render(<Page />);
    fireEvent.click(
      await screen.findByRole("checkbox", { name: "Select Household 11" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Prepare letters" }));
    const alert = await screen.findByRole("alert");
    fireEvent.click(
      within(alert).getByRole("button", {
        name: "Edit address for Household 11",
      }),
    );
    expect(
      within(screen.getByRole("dialog")).getByLabelText("City"),
    ).toHaveFocus();
    expect(
      screen.getByRole("checkbox", { name: "Select Household 11" }),
    ).toBeChecked();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it.each([false, true])(
    "returns an unsubmitted approved letter with saved review and no extra writes (open editor: %s)",
    async (openEditor) => {
      window.history.replaceState(
        {},
        "",
        "/stewardship/society-letters?view=history",
      );
      const item = unsubmittedLetter();
      item.letterAppeals.status = "needs_review";
      item.letterAppeals.message = "The saved mailing address needs review.";
      item.letterAppeals.recoveryAction = "recipient";
      const row = reviewRow("10", true);
      const workspace = {
        ...base,
        settings: societyQuerySettings(),
        history: [item],
        rows: [
          {
            ...row,
            status: "held",
            recipientReview: { ...row.recipientReview, editable: false },
          },
        ],
      };
      fetchMock.mockImplementation(async (_url, opts) => {
        if (opts?.method === "POST") {
          const body = JSON.parse(opts.body);
          expect(body).toMatchObject({
            action: "return_letter_to_review",
            deliveryId: item.id,
            revision: 1,
            confirm: true,
          });
          item.status = "cancelled";
          item.returnToReview = { at: "2026-10-09T12:00:00Z", by: 1 };
          workspace.rows = [row];
          workspace.revision++;
        }
        return Response.json(workspace);
      });
      render(<Page />);
      fireEvent.click(
        await screen.findByRole("button", {
          name: openEditor
            ? `Fix recipient details for ${item.name}`
            : "Return to review",
        }),
      );
      expect(
        fetchMock.mock.calls.filter(([, opts]) => opts?.method === "POST"),
      ).toHaveLength(0);
      fireEvent.click(
        screen.getByRole("button", { name: "Confirm", exact: true }),
      );
      await screen.findByText(
        /Letter returned to review. Saved wording was kept/,
      );
      expect(window.location.search).toBe("");
      expect(
        screen.getByRole("checkbox", { name: "Select Household 10" }),
      ).toBeChecked();
      expect(screen.getByText(/1 selected/)).toBeVisible();
      expect(
        fetchMock.mock.calls.filter(([, opts]) => opts?.method === "POST"),
      ).toHaveLength(1);
      expect(workspace.rows[0].recipientReview.values).toEqual(
        row.recipientReview.values,
      );
      if (openEditor) {
        expect(screen.getByRole("dialog")).toBeVisible();
        expect(screen.getByLabelText("Addressee")).toHaveValue(
          row.recipientReview.values.addressee,
        );
      } else expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    },
  );
  function savedBatch(status = "pending") {
    const row = reviewRow("10", true);
    return {
      ...base,
      settings: societyQuerySettings(),
      rows: [row],
      history: [
        {
          ...row,
          id: "letter",
          batchId: "saved-batch",
          channel: "post",
          status: "prepared",
          preparedAt: "2026-10-08T12:00:00Z",
          period: base.period,
          coveredKeys: ["presidents_society"],
          postalDocument: { id: "saved-pdf", format: "pdf" },
          postalApproval: { index: 0 },
          letterAppeals: {
            status,
            checkedAt: new Date().toISOString(),
            appeal: { id: "100", description: "Example appeal" },
            members: [
              {
                id: "10",
                status:
                  status === "complete"
                    ? "verified"
                    : status === "needs_review"
                      ? "uncertain"
                      : "pending",
              },
            ],
          },
        },
      ],
    };
  }
  it("downloads and marks only completed letters mailed from a blocked batch, with one explicit confirmation", async () => {
    const ready = completedLetter({ name: "Ready Example" });
    const blocked = {
      ...unsubmittedLetter(),
      id: "blocked",
      name: "Blocked Example",
    };
    const payload = { ...base, history: [ready, blocked] };
    vi.stubGlobal(
      "URL",
      Object.assign(URL, {
        createObjectURL: vi.fn(() => "blob:selected"),
        revokeObjectURL: vi.fn(),
      }),
    );
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    fetchMock.mockImplementation(async (requestUrl, options) => {
      const params = new URL(requestUrl, "https://example.org").searchParams;
      if (params.has("download")) {
        expect(params.getAll("selectedDeliveryId")).toEqual([ready.id]);
        expect(params.get("format")).toBe("combined-pdf");
        return new Response("fake selected PDF");
      }
      if (options?.method === "POST") {
        const body = JSON.parse(options.body);
        expect(body.action).toBe("mail_selected_letters");
        expect(body.confirm).toBe(true);
        expect(body.deliveryIds).toEqual([ready.id]);
        expect(body.revision).toBe(1);
        ready.status = "mailed";
        payload.revision++;
      }
      return Response.json(payload);
    });
    window.history.replaceState(
      {},
      "",
      "/stewardship/society-letters?view=history",
    );
    render(<Page />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Download President's Society print-ready PDF",
      }),
    );
    await waitFor(() => expect(anchorClick).toHaveBeenCalledOnce());
    expect(ready.status).toBe("prepared");
    fireEvent.click(
      screen.getByRole("button", { name: "Mark selected letters mailed" }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "Mark 1 selected letter mailed?",
    });
    expect(
      within(dialog).getByText("Ready Example / President's Society"),
    ).toBeVisible();
    expect(
      within(dialog).queryByText(/Blocked Example/),
    ).not.toBeInTheDocument();
    expect(
      fetchMock.mock.calls.filter(([, options]) => options?.method === "POST"),
    ).toHaveLength(0);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Confirm", exact: true }),
    );
    await waitFor(() => expect(ready.status).toBe("mailed"));
    expect(
      await screen.findByText(/1 selected letter is recorded as mailed/),
    ).toBeVisible();
    expect(blocked.status).toBe("prepared");
    expect(blocked.letterAppeals.status).toBe("pending");
    expect(
      fetchMock.mock.calls.filter(([, options]) => options?.method === "POST"),
    ).toHaveLength(1);
  });
  it("finishes selected saved letters with current revisions and unlocks PDFs without another approval", async () => {
    const payload = savedBatch();
    payload.history.push({
      ...structuredClone(payload.history[0]),
      id: "second",
      batchId: "second-batch",
      name: "Second Sample",
    });
    const documents = payload.history.map((item) =>
      structuredClone(item.postalDocument),
    );
    fetchMock.mockImplementation(async (_url, options) => {
      if (options?.method !== "POST") return Response.json(payload);
      const body = JSON.parse(options.body);
      expect(body.action).toBe("finish_selected_letter_appeals");
      expect(body.revision).toBe(payload.revision);
      const item = payload.history.find(
        (entry) => entry.id === body.deliveryId,
      );
      item.letterAppeals.status = "complete";
      item.letterAppeals.members[0].status = "verified";
      payload.revision++;
      return Response.json({
        ...payload,
        bulkAppealUpdate: {
          deliveryId: item.id,
          status: "complete",
          stop: false,
        },
      });
    });
    window.history.replaceState(
      {},
      "",
      "/stewardship/society-letters?view=history",
    );
    render(<Page />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Select up to 50 unfinished letters",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Finish updates for selected letters",
      }),
    );
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("dialog", { name: "Finish NXT updates for 2 letters?" }),
    ).toBeVisible();
    expect(screen.getByLabelText("Find in letter history")).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm and finish NXT updates" }),
    );
    await screen.findByText(/2 letters are ready to download/);
    expect(
      fetchMock.mock.calls
        .filter(([, opts]) => opts?.method === "POST")
        .map(([, opts]) => JSON.parse(opts.body).revision),
    ).toEqual([1, 2]);
    expect(payload.history.map((item) => item.postalDocument)).toEqual(
      documents,
    );
    await waitFor(() => {
      for (const download of screen.getAllByRole("button", {
        name: "Download President's Society print-ready PDF",
      }))
        expect(download).toBeEnabled();
      expect(screen.getByLabelText("Find in letter history")).toBeEnabled();
    });
  });
  it("releases repair and navigation controls when the bulk confirmation is cancelled", async () => {
    const item = unsubmittedLetter();
    item.letterAppeals.status = "needs_review";
    item.letterAppeals.message = "The saved mailing address needs review.";
    item.letterAppeals.recoveryAction = "recipient";
    fetchMock.mockResolvedValue(Response.json({ ...base, history: [item] }));
    window.history.replaceState(
      {},
      "",
      "/stewardship/society-letters?view=history",
    );
    render(<Page />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Select up to 50 unfinished letters",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Finish updates for selected letters",
      }),
    );
    expect(
      screen.getByRole("dialog", { name: "Finish NXT updates for 1 letter?" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: `Fix recipient details for ${item.name}`,
      }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Back to selection" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", {
          name: `Fix recipient details for ${item.name}`,
        }),
      ).toBeEnabled(),
    );
    expect(
      screen.getByRole("button", { name: "Return to review" }),
    ).toBeEnabled();
    expect(screen.getByLabelText("Find in letter history")).toBeEnabled();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("restores saved progress without writes and keeps completed downloads in the same workspace", async () => {
    const pending = savedBatch();
    const complete = { ...savedBatch("complete"), revision: 2 };
    fetchMock.mockImplementation(async (_url, options) =>
      Response.json(options?.method === "POST" ? complete : pending),
    );
    render(<Page />);
    expect(
      await screen.findByRole("region", { name: "Current letter batch" }),
    ).toBeVisible();
    expect(
      screen.getByText("Create & update NXT").closest("li"),
    ).toHaveAttribute("aria-current", "step");
    expect(
      screen.getByRole("button", { name: "Download PDF letters (.zip)" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Mark batch mailed" }),
    ).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledOnce();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Continue saved letters",
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Download PDF letters (.zip)" }),
      ).toBeEnabled(),
    );
    expect(screen.getByText("Download letters").closest("li")).toHaveAttribute(
      "aria-current",
      "step",
    );
    expect(window.location.search).toBe("");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      action: "continue_postal_batch",
      batchId: "saved-batch",
      confirm: true,
      revision: 1,
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Letter history", exact: true }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Letter workspace", exact: true }),
    );
    expect(
      screen.getByRole("region", { name: "Current letter batch" }),
    ).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("keeps uncertain appeals locked rather than treating a saved approval as confirmed", async () => {
    fetchMock.mockImplementation(async () =>
      Response.json(savedBatch("needs_review")),
    );
    render(<Page />);
    expect(
      await screen.findByRole("region", { name: "Current letter batch" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Download PDF letters (.zip)" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", {
        name: "Continue saved letters",
      }),
    ).toBeDisabled();
    expect(screen.getByText(/Appeal confirmation is pending/)).toBeVisible();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("downloads a combined PDF with the correct filename without a mutation or status change", async () => {
    vi.stubGlobal(
      "URL",
      Object.assign(class extends URL {}, {
        createObjectURL: vi.fn(() => "blob:fictional-pdf"),
        revokeObjectURL: vi.fn(),
      }),
    );
    fetchMock.mockImplementation(async (url) =>
      String(url).includes("format=combined-pdf")
        ? new Response("saved PDF pages", {
            headers: {
              "content-type": "application/pdf",
              "content-disposition":
                'attachment; filename="society-letters-presidents-society-selected-print-ready.pdf"',
            },
          })
        : Response.json(savedBatch("complete")),
    );
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function () {
        expect(this.download).toBe(
          "society-letters-presidents-society-selected-print-ready.pdf",
        );
      });
    render(<Page />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Letter history",
        exact: true,
      }),
    );
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Download President's Society print-ready PDF",
      }),
    );
    await waitFor(() => expect(click).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]).toEqual([
      "/api/stewardship/society-letters?download=saved-batch&selectedDeliveryId=letter&format=combined-pdf",
      { cache: "no-store" },
    ]);
    expect(
      screen.getByRole("button", { name: "Mark batch mailed" }),
    ).toBeEnabled();
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledOnce(), {
      timeout: 1500,
    });
  });
  it("leaves a failed approved batch available without replaying it or reopening recipient review", async () => {
    fetchMock.mockImplementation(async (_url, options) =>
      options?.method === "POST"
        ? Response.json(
            { error: "NXT is temporarily unavailable." },
            { status: 503 },
          )
        : Response.json(savedBatch()),
    );
    render(<Page />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Continue saved letters",
      }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "NXT is temporarily unavailable.",
    );
    expect(
      screen.getByRole("region", { name: "Current letter batch" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: "Continue saved letters",
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Download PDF letters (.zip)" }),
    ).toBeDisabled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("keeps draft preparation read-only toward NXT until explicit document approval", async () => {
    const initial = {
      ...base,
      settings: societyQuerySettings(),
      rows: [reviewRow("10", true)],
    };
    let state = initial;
    fetchMock.mockImplementation(async (_url, options) => {
      const body = options?.body ? JSON.parse(options.body) : null;
      if (body?.action === "start_postal_draft")
        state = {
          ...state,
          revision: 2,
          postalDraft: {
            id: "draft",
            format: "docx",
            entries: [
              {
                householdId: "10",
                row: { ...state.rows[0], letterDate: "2026-10-08" },
                appeal: { id: "100", description: "Example appeal" },
              },
            ],
          },
        };
      if (body?.action === "prepare_postal_document")
        state = {
          ...state,
          revision: 3,
          postalDraft: {
            ...state.postalDraft,
            entries: state.postalDraft.entries.map((entry) => ({
              ...entry,
              document: { id: "document", sha256: "hash" },
            })),
          },
        };
      return Response.json(state);
    });
    render(<Page />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Select ready households (up to 10)",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Prepare letters" }));
    await screen.findByRole("region", { name: "Approve saved letter batch" });
    expect(
      screen.getByRole("button", { name: "Approve letters and continue" }),
    ).toBeDisabled();
    await screen.findByText(/1 of 1 documents prepared/);
    expect(
      screen.getByRole("button", { name: "Approve letters and continue" }),
    ).toBeDisabled();
    expect(window.location.search).toBe("");
    expect(
      fetchMock.mock.calls
        .filter(([, options]) => options?.body)
        .map(([, options]) => JSON.parse(options.body).action),
    ).toEqual(["start_postal_draft", "prepare_postal_document"]);
  });
  it("automatically checks uncertain NXT receipts without clearing household selections or saved approvals", async () => {
    vi.useFakeTimers();
    const data = {
      ...base,
      settings: societyQuerySettings(),
      rows: [reviewRow("10", true)],
      history: [
        {
          id: "letter",
          batchId: "batch",
          status: "prepared",
          channel: "post",
          period: base.period,
          name: "Fictional household",
          approvedAt: "2026-10-07T12:00:00Z",
          letterAppeals: {
            status: "needs_review",
            checkedAt: new Date().toISOString(),
            appeal: { id: "100", description: "Example sent appeal" },
            members: [
              {
                id: "20",
                status: "uncertain",
                attemptedAt: new Date().toISOString(),
              },
            ],
          },
        },
      ],
    };
    const confirmed = structuredClone(data);
    confirmed.revision = 2;
    confirmed.history[0].letterAppeals.status = "complete";
    confirmed.history[0].letterAppeals.members[0].status = "verified";
    fetchMock.mockImplementation(async (_url, options) =>
      Response.json(options?.method === "POST" ? confirmed : data),
    );
    await reactAct(async () => {
      render(<Page />);
    });
    const checkbox = screen.getByRole("checkbox", {
      name: "Select Household 10",
    });
    fireEvent.click(checkbox);
    await reactAct(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    const posts = fetchMock.mock.calls.filter(
      ([, options]) => options?.method === "POST",
    );
    expect(posts.map(([, options]) => JSON.parse(options.body))).toEqual([
      {
        action: "verify_letter_appeals",
        deliveryId: "letter",
        automatic: true,
        revision: 1,
      },
    ]);
    expect(checkbox).toBeChecked();
    expect(
      screen.getByRole("button", { name: "Prepare letters" }),
    ).toBeEnabled();
    await reactAct(async () => {
      await vi.advanceTimersByTimeAsync(600000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(confirmed.history[0].approvedAt).toBe(data.history[0].approvedAt);
  });
  it("offers document approval directly from All recipients without a scroll-only continue step", async () => {
    fetchMock.mockImplementation(async () =>
      Response.json({
        ...base,
        settings: societyQuerySettings(),
        rows: [reviewRow("10", true), reviewRow("20")],
      }),
    );
    render(<Page />);
    const selected = await screen.findByRole("checkbox", {
      name: "Select Household 10",
    });
    fireEvent.click(selected);
    expect(
      screen.getByText(/1 recipient in this view is already reviewed/),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Continue to document approval" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Approve documents").closest("li")).toHaveAttribute(
      "aria-current",
      "step",
    );
    expect(selected).toBeChecked();
    expect(
      screen.getByRole("button", { name: "All recipients 2" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: "Prepare letters" }),
    ).toBeEnabled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("guides postal selection using only reviewed households in the current filters", async () => {
    fetchMock.mockImplementation(async () =>
      Response.json({
        ...base,
        settings: societyQuerySettings(),
        rows: [reviewRow("10", true), reviewRow("20", true), reviewRow("30")],
      }),
    );
    render(<Page />);
    expect(
      await screen.findByText(/2 recipients in this view are already reviewed/),
    ).toBeVisible();
    const select = () =>
      screen.getByRole("button", {
        name: "Select ready households (up to 10)",
      });
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Find a household" }),
      { target: { value: "Household 30" } },
    );
    expect(select()).toBeDisabled();
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Find a household" }),
      { target: { value: "Household 10" } },
    );
    fireEvent.click(select());
    expect(
      screen.getByRole("checkbox", { name: "Select Household 10" }),
    ).toBeChecked();
    expect(
      screen.getByRole("button", { name: "Prepare letters" }),
    ).toBeEnabled();
    fireEvent.change(screen.getByLabelText("Delivery method"), {
      target: { value: "email" },
    });
    expect(
      screen.queryByRole("region", { name: "Letter workflow" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Prepare letters" }),
    ).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("keeps saved approval above recipient filters without requiring a continue click", async () => {
    fetchMock.mockImplementation(async () =>
      Response.json({
        ...base,
        settings: societyQuerySettings(),
        rows: [reviewRow("10", true)],
        postalDraft: { id: "draft", format: "docx", entries: [] },
      }),
    );
    render(<Page />);
    const approval = await screen.findByRole("region", {
      name: "Approve saved letter batch",
    });
    expect(approval).toBeVisible();
    expect(approval).toHaveFocus();
    fireEvent.click(
      screen.getByRole("button", { name: "Show recipient list" }),
    );
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Find a household" }),
      { target: { value: "No match" } },
    );
    expect(approval).toBeVisible();
    expect(
      screen.queryByRole("button", {
        name: "Continue saved document approval",
      }),
    ).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("does not offer final-document approval for preview-only constituent sources", async () => {
    fetchMock.mockImplementation(async () =>
      Response.json({
        ...base,
        settings: { ...base.settings, sourceMode: "constituents" },
        rows: [reviewRow("10", true)],
      }),
    );
    render(<Page />);
    await screen.findByRole("button", { name: "Reviewed 1" });
    expect(
      screen.queryByRole("button", { name: "Continue to document approval" }),
    ).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("takes reviewed recipients to document approval without saving their review again", async () => {
    const row = {
      ...reviewRow("10", true),
      readiness: { post: { status: "ready_for_preview" } },
    };
    fetchMock.mockImplementation(async () =>
      Response.json({ ...base, settings: societyQuerySettings(), rows: [row] }),
    );
    render(<Page />);
    fireEvent.click(await screen.findByRole("button", { name: "Reviewed 1" }));
    expect(screen.getByText(/Recipient review complete/)).toBeVisible();
    expect(screen.getByText("Approve documents").closest("li")).toHaveAttribute(
      "aria-current",
      "step",
    );
    expect(
      screen.getByText(/Recipient choices are saved. Select ready households/),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Review recipients in bulk" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Edit reviewed recipients" }),
    ).toBeVisible();
    expect(screen.getByText("Ready to create")).toBeVisible();
    expect(
      screen.getByRole("region", { name: "Letter workflow" }),
    ).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledOnce();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Select ready households (up to 10)",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Prepare letters" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      action: "start_postal_draft",
      householdIds: ["10"],
      channel: "post",
      format: "docx",
      revision: 1,
    });
  });
  it.each(["unchecked", "needs_review", "already_acknowledged"])(
    "does not require a separate delivery check for a reviewed recipient with a cached %s result",
    async (status) => {
      const row = {
        ...reviewRow("10", true),
        readiness: {
          post: { status, reasons: ["Current NXT check required."] },
        },
      };
      fetchMock.mockImplementation(async () =>
        Response.json({
          ...base,
          settings: societyQuerySettings(),
          rows: [row],
          readiness: { issue: null, job: null },
        }),
      );
      render(<Page />);
      fireEvent.click(
        await screen.findByRole("button", { name: "Reviewed 1" }),
      );
      fireEvent.click(
        screen.getByRole("checkbox", { name: "Select Household 10" }),
      );
      expect(
        screen.getByText(
          /You do not need to save them again unless you want to make changes/,
        ),
      ).toBeVisible();
      expect(screen.getByText("Recipient choices saved")).toBeVisible();
      expect(screen.getByText("Ready to create")).toBeVisible();
      expect(
        screen.getByRole("button", { name: "Prepare letters" }),
      ).toBeEnabled();
      expect(
        screen.getByRole("button", { name: "Edit selected recipients" }),
      ).toBeEnabled();
      expect(
        screen.queryByRole("button", { name: "View delivery checks" }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByText("NXT is checked automatically before appeal updates."),
      ).toBeVisible();
      if (status !== "unchecked") {
        fireEvent.click(
          screen.getByRole("button", { name: "Show details for Household 10" }),
        );
        expect(screen.getByText("Current NXT check required.")).toBeVisible();
      }
      expect(fetchMock).toHaveBeenCalledOnce();
    },
  );
  it("restores an existing saved approval batch without repeating recipient review", async () => {
    fetchMock.mockImplementation(async () =>
      Response.json({
        ...base,
        settings: societyQuerySettings(),
        rows: [reviewRow("10", true)],
        postalDraft: { id: "draft", format: "docx", entries: [] },
      }),
    );
    render(<Page />);
    expect(
      await screen.findByRole("region", { name: "Approve saved letter batch" }),
    ).toHaveFocus();
    expect(
      screen.getByText(/Your saved recipient review is kept/),
    ).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("hands one batch approval directly to processing, without reopening documents or a second confirmation", async () => {
    const row = reviewRow("10", true);
    const workspace = {
      ...base,
      settings: societyQuerySettings(),
      rows: [row],
      postalDraft: {
        id: "draft",
        format: "docx",
        entries: [
          {
            householdId: "10",
            row: { ...row, letterDate: "2026-10-07" },
            appeal: { id: "100", description: "Example appeal" },
            document: { id: "document", sha256: "hash" },
          },
        ],
      },
    };
    const item = {
      ...row,
      id: "letter",
      batchId: "draft",
      status: "prepared",
      channel: "post",
      coveredKeys: ["presidents_society"],
      period: base.period,
      postalApproval: { index: 0 },
      letterAppeals: {
        status: "pending",
        appeal: { id: "100", description: "Example appeal" },
        members: [{ id: "10", status: "pending" }],
      },
    };
    const approved = {
      ...workspace,
      postalDraft: null,
      history: [item],
      revision: 2,
      batchId: "draft",
    };
    fetchMock.mockImplementation(async (_url, options) => {
      const body = options?.body ? JSON.parse(options.body) : null;
      if (body?.action === "approve_postal_draft")
        return Response.json(approved);
      if (body?.action === "continue_postal_batch")
        return Response.json({
          ...approved,
          revision: 3,
          history: [
            {
              ...item,
              letterAppeals: {
                ...item.letterAppeals,
                status: "complete",
                members: [{ id: "10", status: "verified" }],
              },
            },
          ],
        });
      return Response.json(workspace);
    });
    render(<Page />);
    fireEvent.click(
      await screen.findByRole("checkbox", {
        name: /I approve these documents/,
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Approve letters and continue" }),
    );
    await waitFor(() =>
      expect(
        screen.getByText("1 of 1 letters created with appeals confirmed"),
      ).toBeVisible(),
    );
    expect(window.location.search).toBe("");
    expect(
      screen.getByRole("button", { name: "Letter workspace", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("region", { name: "Current letter batch" }),
    ).toHaveFocus();
    expect(screen.getByText("Download letters").closest("li")).toHaveAttribute(
      "aria-current",
      "step",
    );
    expect(
      screen.getByRole("button", { name: "Download Word letters (.zip)" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Mark batch mailed" }),
    ).toBeEnabled();
    fireEvent.click(
      screen.getByRole("button", { name: "Start another batch" }),
    );
    expect(
      screen.getByRole("checkbox", { name: "Select Household 10" }),
    ).toBeVisible();
    fireEvent.change(screen.getByLabelText("Open a saved batch"), {
      target: { value: "draft" },
    });
    expect(
      screen.getByRole("button", { name: "Download Word letters (.zip)" }),
    ).toBeEnabled();
    const actions = fetchMock.mock.calls
      .filter(([, options]) => options?.body)
      .map(([, options]) => JSON.parse(options.body));
    expect(actions.map((body) => body.action)).toEqual([
      "approve_postal_draft",
      "continue_postal_batch",
    ]);
    expect(actions[0]).toMatchObject({
      approvePreparedDocuments: true,
      confirm: true,
      revision: 1,
    });
    expect(actions[1]).toMatchObject({
      batchId: "draft",
      confirm: true,
      revision: 2,
    });
  });
  it("confirms a global date update while keeping reviewed status, selection, and the current list", async () => {
    const workspace = {
      ...base,
      today: "2026-10-01",
      settings: societyQuerySettings(),
      rows: [reviewRow("10", true)],
    };
    fetchMock.mockImplementation(async (_url, options) =>
      Response.json(
        options?.method === "POST"
          ? { ...workspace, revision: 2, today: "2026-10-02" }
          : workspace,
      ),
    );
    render(<Page />);
    fireEvent.click(
      await screen.findByRole("checkbox", { name: "Select Household 10" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Use today's date for all letters" }),
    );
    expect(fetchMock).toHaveBeenCalledOnce();
    const confirm = within(screen.getByRole("dialog"));
    expect(
      confirm.getByText(/Saved recipient reviews are kept for 15 days/),
    ).toBeVisible();
    fireEvent.click(
      confirm.getByRole("button", { name: "Confirm", exact: true }),
    );
    await screen.findByText(/Uncreated letters use 2026-10-02/);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({
      action: "update_letter_dates",
      draftId: null,
      confirm: true,
      revision: 1,
    });
    expect(
      screen.getByRole("checkbox", { name: "Select Household 10" }),
    ).toBeChecked();
    expect(screen.getByText("Recipient choices saved")).toBeVisible();
    expect(
      screen.getByRole("region", { name: "Letter date" }),
    ).toHaveTextContent("2026-10-02");
    expect(window.location.search).not.toMatch(/excluded|history/);
  });
  it("lets unchecked recipients be selected for review without authorizing delivery or writing NXT", async () => {
    fetchMock.mockImplementation(async () =>
      Response.json({
        ...base,
        settings: societyQuerySettings(),
        rows: [reviewRow("10"), reviewRow("20")],
      }),
    );
    render(<Page />);
    const checkbox = await screen.findByRole("checkbox", {
      name: "Select Household 20",
    });
    expect(checkbox).toBeEnabled();
    expect(checkbox).toHaveAccessibleDescription(
      /Checkboxes choose recipients for review/,
    );
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();
    expect(screen.getByText("1 selected")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Prepare letters" }),
    ).toBeDisabled();
    expect(
      screen.getByText(/Some selected recipients need attention/),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Review selected recipients" }),
    );
    const queue = within(screen.getByRole("dialog"));
    expect(queue.getByLabelText("Go to recipient")).toHaveDisplayValue(
      "1. Household 20",
    );
    expect(
      within(queue.getByLabelText("Go to recipient")).getAllByRole("option"),
    ).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("limits bulk review to 50 while keeping document approval limited to 10", async () => {
    const rows = Array.from({ length: 51 }, (_, index) => ({
      ...reviewRow(String(index + 10), true),
      readiness: { post: { status: "ready_for_preview" } },
    }));
    fetchMock.mockImplementation(async () =>
      Response.json({ ...base, settings: societyQuerySettings(), rows }),
    );
    render(<Page />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Select for review (up to 50)",
      }),
    );
    expect(screen.getByText("50 selected")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Prepare letters" }),
    ).toBeDisabled();
    expect(
      screen.getByText(/Document approval is limited to 10 households/),
    ).toBeVisible();
    const remaining = screen.getByRole("checkbox", {
      name: "Select Household 60",
    });
    expect(remaining).toBeDisabled();
    expect(remaining).toHaveAccessibleDescription(/Review up to 50 recipients/);
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Select Household 10" }),
    );
    expect(remaining).toBeEnabled();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Select ready households (up to 10)",
      }),
    );
    expect(screen.getByText("10 selected")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Prepare letters" }),
    ).toBeEnabled();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("does not silently omit an unready person from a mixed selection", async () => {
    fetchMock.mockImplementation(async () =>
      Response.json({
        ...base,
        settings: societyQuerySettings(),
        rows: [
          reviewRow("10"),
          {
            ...reviewRow("20", true),
            readiness: { post: { status: "ready_for_preview" } },
          },
        ],
      }),
    );
    render(<Page />);
    fireEvent.click(
      await screen.findByRole("checkbox", { name: "Select Household 10" }),
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Select Household 20" }),
    );
    const approve = screen.getByRole("button", {
      name: "Prepare letters",
    });
    expect(approve).toBeDisabled();
    fireEvent.click(approve);
    expect(fetchMock).toHaveBeenCalledOnce();
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Select Household 10" }),
    );
    expect(approve).toBeEnabled();
    fireEvent.click(approve);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({
      action: "start_postal_draft",
      householdIds: ["20"],
    });
  });
  it.each([["needs_review"], ["unchecked"], ["already_acknowledged"]])(
    "allows document approval without treating a cached %s result as authorization to send",
    async (status) => {
      fetchMock.mockImplementation(async () =>
        Response.json({
          ...base,
          settings: societyQuerySettings(),
          rows: [
            {
              ...reviewRow("10", true),
              readiness: { post: { status } },
            },
          ],
        }),
      );
      render(<Page />);
      fireEvent.click(
        await screen.findByRole("checkbox", { name: "Select Household 10" }),
      );
      expect(
        screen.getByRole("button", { name: "Review selected recipients" }),
      ).toBeEnabled();
      expect(
        screen.getByRole("button", { name: "Prepare letters" }),
      ).toBeEnabled();
      expect(fetchMock).toHaveBeenCalledOnce();
    },
  );
  it.each([
    {
      readiness: { issue: "Refresh membership before checking readiness." },
      message: /Refresh membership before checking readiness\./,
    },
    {
      job: { status: "running", id: "query" },
      message: /Finish the membership refresh before preparing letters/,
    },
    {
      postalDraft: { id: "draft", status: "draft", entries: [] },
      message: /Finish or cancel the current document approval batch/,
    },
  ])(
    "keeps review selections independent of workspace delivery blockers: %j",
    async ({ message, ...state }) => {
      fetchMock.mockImplementation(async () =>
        Response.json({
          ...base,
          settings: societyQuerySettings(),
          ...state,
          rows: [
            {
              ...reviewRow("10", true),
              readiness: { post: { status: "ready_for_preview" } },
            },
          ],
        }),
      );
      render(<Page />);
      if (state.postalDraft)
        fireEvent.click(
          await screen.findByRole("button", { name: "Show recipient list" }),
        );

      fireEvent.click(
        await screen.findByRole("checkbox", { name: "Select Household 10" }),
      );
      expect(
        screen.getByRole("checkbox", { name: "Select Household 10" }),
      ).toBeChecked();
      expect(
        screen.getByRole("button", { name: "Prepare letters" }),
      ).toBeDisabled();
      expect(screen.getAllByText(message).length).toBeGreaterThan(0);
      expect(fetchMock).toHaveBeenCalledOnce();
    },
  );
  it("supports review selection for preview-only and email-disabled queries without offering delivery", async () => {
    fetchMock.mockImplementation(async () =>
      Response.json({
        ...base,
        settings: { ...base.settings, sourceMode: "constituents" },
        rows: [reviewRow("10")],
      }),
    );
    render(<Page />);
    await screen.findByRole("checkbox", { name: "Select Household 10" });
    fireEvent.change(screen.getByLabelText("Delivery method"), {
      target: { value: "email" },
    });
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Select Household 10" }),
    );
    expect(
      screen.getByRole("button", { name: "Review selected recipients" }),
    ).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "Prepare letters" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Some selected recipients still need their names/),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Review selected letters" }),
    ).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("explains a genuinely locked recipient checkbox", async () => {
    const row = reviewRow("10");
    row.recipientReview.editable = false;
    fetchMock.mockImplementation(async () =>
      Response.json({ ...base, settings: societyQuerySettings(), rows: [row] }),
    );
    render(<Page />);
    const checkbox = await screen.findByRole("checkbox", {
      name: "Select Household 10",
    });
    expect(checkbox).toBeDisabled();
    expect(checkbox).toHaveAccessibleDescription(
      /Recipient review is unavailable/,
    );
  });
  it("explains an empty ready selection instead of allowing a no-op click", async () => {
    fetchMock.mockImplementation(async () =>
      Response.json({
        ...base,
        settings: societyQuerySettings(),
        rows: [reviewRow("10")],
      }),
    );
    render(<Page />);
    expect(
      await screen.findByRole("button", {
        name: "Select ready households (up to 10)",
      }),
    ).toBeDisabled();
    expect(
      screen.getByText(/Save recipient choices before preparing documents/),
    ).toBeVisible();
    expect(
      screen.getByRole("option", { name: /PDF.*private converter/ }),
    ).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it.each([
    ["docx", 3, 10],
    ["pdf", 3, 3],
    ["pdf", 10, 10],
  ])(
    "selects the %s batch limit with PDF cap %i and starts a draft, not delivery",
    async (format, pdfLimit, limit) => {
      const rows = Array.from({ length: 12 }, (_, index) =>
        reviewRow(String(10 + index), true),
      );
      const payload = {
        ...base,
        settings: societyQuerySettings(),
        rows: [reviewRow("99"), ...rows],
        postalPdf: { enabled: true, maxBatchSize: pdfLimit },
      };
      fetchMock.mockImplementation(async () => Response.json(payload));
      render(<Page />);
      await screen.findByRole("button", {
        name: "Select ready households (up to 10)",
      });
      if (format === "pdf")
        fireEvent.change(screen.getByLabelText("Final letter format"), {
          target: { value: "pdf" },
        });
      fireEvent.click(
        await screen.findByRole("button", {
          name: `Select ready households (up to ${limit})`,
        }),
      );
      expect(screen.getByText(`${limit} selected`)).toBeVisible();
      expect(fetchMock).toHaveBeenCalledOnce();
      fireEvent.click(screen.getByRole("button", { name: "Prepare letters" }));
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
      expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
        action: "start_postal_draft",
        householdIds: rows.slice(0, limit).map((r) => r.householdId),
        channel: "post",
        format,
        revision: 1,
      });
    },
  );
  it("prepares ten PDFs sequentially using the latest saved revision for each request", async () => {
    const householdIds = Array.from({ length: 10 }, (_, i) => String(10 + i));
    const payload = {
      ...base,
      settings: societyQuerySettings(),
      postalDraft: {
        id: "draft",
        format: "pdf",
        status: "draft",
        entries: householdIds.map((id) => ({
          householdId: id,
          row: { name: `Example ${id}`, members: [id] },
          appeal: { id: "100", description: "Example appeal" },
        })),
      },
    };
    fetchMock.mockImplementation(async (_url, options) => {
      if (options?.method === "POST") {
        const body = JSON.parse(options.body);
        expect(body.action).toBe("prepare_postal_document");
        expect(body.revision).toBe(payload.revision);
        payload.postalDraft.entries.find(
          (e) => e.householdId === body.householdId,
        ).document = { sha256: body.householdId };
        payload.revision++;
      }
      return Response.json(payload);
    });
    render(<Page />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Prepare documents",
        exact: true,
      }),
    );
    await screen.findByText(/10 of 10 documents prepared/);
    expect(
      fetchMock.mock.calls
        .filter(([, options]) => options?.method === "POST")
        .map(([, options]) => JSON.parse(options.body).revision),
    ).toEqual(Array.from({ length: 10 }, (_, i) => i + 1));
    expect(
      fetchMock.mock.calls
        .filter(([, options]) => options?.method === "POST")
        .map(([, options]) => JSON.parse(options.body).householdId),
    ).toEqual(householdIds);
  });
  it("goes back one workspace screen with filters and unsaved source settings intact", async () => {
    render(<Page />);
    const find = await screen.findByLabelText("Find a household");
    fireEvent.change(find, { target: { value: "Sample" } });
    fireEvent.click(await setupTab("Source & period"));
    const query = screen.getByLabelText("NXT saved query ID");
    fireEvent.change(query, { target: { value: "456" } });
    fireEvent.click(
      screen.getByRole("button", { name: "Letter templates", exact: true }),
    );
    fireEvent.click(
      screen.getByRole("link", { name: "Back to Source & period" }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText("NXT saved query ID")).toHaveValue("456"),
    );
    fireEvent.click(
      screen.getByRole("link", { name: "Back to Setup checklist" }),
    );
    await screen.findByRole("link", { name: "Back to Holding list" });
    fireEvent.click(screen.getByRole("link", { name: "Back to Holding list" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Find a household")).toHaveValue("Sample"),
    );
    expect(
      screen.getByRole("link", { name: "Back to Stewardship" }),
    ).toHaveAttribute("href", "/stewardship");
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("links society definitions back to the current source screen and protects unsaved settings", async () => {
    render(<Page />);
    fireEvent.click(await setupTab("Source & period"));
    const link = screen.getByRole("link", {
      name: "Review society definitions",
    });
    const url = new URL(link.href);
    expect(url.pathname).toBe("/organization-configurations");
    expect(url.hash).toBe("#giving-societies");
    expect(url.searchParams.get("returnTo")).toBe(
      "/stewardship/society-letters?view=settings",
    );
    fireEvent.change(screen.getByLabelText("NXT saved query ID"), {
      target: { value: "456" },
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    expect(fireEvent.click(link)).toBe(false);
    expect(confirm).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
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
  it("filters saved history from an overview link and searches without requests or partial batches", async () => {
    const item = (id, status, batchId = id, extras = {}) => ({
      ...household,
      id,
      householdId: id,
      name: `Recipient ${id}`,
      members: [id],
      batchId,
      channel: "post",
      status,
      preparedAt: "2026-09-28T12:00:00Z",
      period: base.period,
      coveredKeys: ["presidents_society"],
      ...extras,
    });
    const payload = {
      ...base,
      history: [
        item("11", "prepared", "mixed"),
        item("12", "prepared", "mixed", {
          letterAppeals: {
            status: "pending",
            appeal: { id: "100", description: "Example letter appeal" },
            members: [{ id: "12", status: "pending" }],
          },
        }),
        item("21", "mailed"),
        item("31", "pending_email", "31", { channel: "email" }),
        item("41", "cancelled"),
      ],
    };
    fetchMock.mockImplementation(async () => Response.json(payload));
    window.history.replaceState(
      {},
      "",
      "/stewardship/society-letters?view=history&history=ready_to_mail",
    );
    render(<Page />);
    expect(
      await screen.findByRole("button", { name: "Ready to mail (1)" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(
      within(screen.getByRole("article")).getByText("Recipient 12"),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Mark batch mailed" }),
    ).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Find in letter history"), {
      target: { value: "11" },
    });
    expect(
      within(screen.getByRole("article")).getByText("Recipient 12"),
    ).toBeVisible();
    expect(
      screen.getByText(/Batch actions still apply to the full batch/),
    ).toBeVisible();
    fireEvent.change(screen.getByLabelText("Find in letter history"), {
      target: { value: "not found" },
    });
    expect(screen.getByText(/No saved batches match this view/)).toBeVisible();
    expect(window.location.href).not.toContain("not");
    fireEvent.click(screen.getByRole("button", { name: "Show all batches" }));
    expect(screen.getAllByRole("article")).toHaveLength(4);
    expect(screen.getByLabelText("Find in letter history")).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "In progress (2)" }));
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(window.location.search).toBe("?view=history&history=in_progress");
    fireEvent.click(
      screen.getByRole("button", { name: "Mailed / emailed (1)" }),
    );
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getByText("Recipient 21")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(localStorage.length).toBe(0);
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
    view.unmount();
    const next = render(<Page />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Resume review" }),
    );
    expect(screen.getByText(/Recipient 2 of 2/)).toBeVisible();
    expect(screen.getByLabelText("Recipient record")).toHaveValue(
      "Recipient 20 (ID 20)",
    );
    expect(
      screen.getByRole("checkbox", { name: /I reviewed/ }),
    ).not.toBeChecked();
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
      screen.getByRole("button", { name: "Edit reviewed recipients" }),
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
    const setupSummary = screen.getByText("Setup and checks", {
      selector: "summary",
    });
    if (!setupSummary.closest("details").open) fireEvent.click(setupSummary);
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
  it("keeps appeal setup accessible while hiding optional preflight controls by default", async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        ...base,
        settings: societyQuerySettings(),
        readiness: {
          policy: null,
          issue: "Save letter appeal settings",
          blocker: { action: "appeals", label: "Configure appeals" },
          job: null,
        },
      }),
    );
    render(<Page />);
    const approval = within(
      await screen.findByRole("region", {
        name: "From review to final letters",
      }),
    );
    expect(
      screen.queryByRole("heading", { name: "Optional NXT preflight" }),
    ).not.toBeVisible();
    expect(
      screen
        .getByText("Optional NXT preflight", { selector: "summary" })
        .closest("details"),
    ).not.toHaveAttribute("open");
    expect(
      screen.queryByText("Letter appeal settings for this period"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("NXT exclusion appeal settings"),
    ).not.toBeInTheDocument();
    fireEvent.click(
      approval.getByRole("button", { name: "Configure appeals" }),
    );
    expect(
      screen.getByText("Letter appeal settings for this period"),
    ).toBeVisible();
    expect(screen.getByText("NXT exclusion appeal settings")).toBeVisible();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("allows approval with an unfinished optional preflight without resuming it automatically", async () => {
    fetchMock.mockImplementation(async () =>
      Response.json({
        ...base,
        settings: societyQuerySettings(),
        rows: [reviewRow("10", true)],
        readiness: {
          issue: null,
          job: {
            id: "check",
            status: "paused",
            channel: "post",
            checked: 0,
            total: 1,
          },
        },
      }),
    );
    render(<Page />);
    fireEvent.click(
      await screen.findByRole("checkbox", { name: "Select Household 10" }),
    );
    expect(
      screen.getByRole("button", { name: "Prepare letters" }),
    ).toBeEnabled();
    const details = screen
      .getByText("Optional NXT preflight (unfinished check)", {
        selector: "summary",
      })
      .closest("details");
    expect(details).not.toHaveAttribute("open");
    fireEvent.click(
      within(details).getByText("Optional NXT preflight (unfinished check)"),
    );
    // jsdom does not perform the native summary toggle.
    details.open = true;
    expect(screen.getByRole("button", { name: "Stop check" })).toBeEnabled();
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
  it("excludes from individual review only after NXT confirmation, keeps edits on failure, and returns to the holding list", async () => {
    let workspace = {
      ...base,
      settings: societyQuerySettings(),
      today: "2026-10-01",
      exclusions: [],
      rows: [{ ...reviewRow("10"), members: ["10", "11"] }],
      exclusionAppeals: {
        current: true,
        policy: {
          appeals: {
            presidents_society: {
              lookupId: "CY26PRES-EX",
              description: "President's Society exclusion",
            },
          },
        },
      },
    };
    let fail = true;
    const posts = [];
    fetchMock.mockImplementation(async (_url, options) => {
      if (options?.method === "POST") {
        const body = JSON.parse(options.body);
        posts.push(body);
        if (fail)
          return Response.json(
            { error: "Membership needs a current refresh." },
            { status: 409 },
          );
        workspace = {
          ...workspace,
          revision: workspace.revision + 1,
          rows: workspace.rows.map((row) => ({
            ...row,
            status: "excluded",
            recipientReview: { ...row.recipientReview, editable: false },
          })),
          exclusions: [
            {
              id: "e10",
              name: "Household 10",
              members: ["10", "11"],
              period: base.period,
              reason: body.reason,
            },
          ],
        };
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
      target: { value: "Keep my draft" },
    });
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Exclude for this period",
      }),
    );
    const dialog = within(screen.getByRole("dialog"));
    expect(
      dialog.getByText(/Applied to member system IDs: 10, 11/),
    ).toBeVisible();
    expect(
      dialog.getByRole("button", { name: "Exclude and record in NXT" }),
    ).toBeDisabled();
    expect(posts).toHaveLength(0);
    fireEvent.change(dialog.getByLabelText("Reason (NXT comments)"), {
      target: { value: "Staff requested no letter" },
    });
    fireEvent.click(
      dialog.getByRole("checkbox", { name: /Apply this exclusion appeal/ }),
    );
    fireEvent.click(
      dialog.getByRole("button", { name: "Exclude and record in NXT" }),
    );
    await dialog.findByText("Membership needs a current refresh.");
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({
      action: "exclude_recipient",
      householdId: "10",
      reason: "Staff requested no letter",
      exclusionDate: "2026-10-01",
      confirmNxt: true,
      revision: 1,
    });
    expect(dialog.getByLabelText("Reason (NXT comments)")).toHaveValue(
      "Staff requested no letter",
    );
    fireEvent.click(
      dialog.getByRole("button", { name: "Back to recipient review" }),
    );
    expect(screen.getByLabelText("Salutation")).toHaveValue("Keep my draft");
    fail = false;
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Exclude for this period",
      }),
    );
    fireEvent.change(screen.getByLabelText("Reason (NXT comments)"), {
      target: { value: "Staff requested no letter" },
    });
    fireEvent.click(
      screen.getByRole("checkbox", { name: /Apply this exclusion appeal/ }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Exclude and record in NXT" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Your letter holding list")).toBeVisible();
    expect(
      screen.getByText(
        /Household 10 excluded for this period. No letter was sent/,
      ),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Resume review" }),
    ).not.toBeInTheDocument();
    expect(posts.map((body) => body.action)).toEqual([
      "exclude_recipient",
      "exclude_recipient",
    ]);
  });
  it("continues bulk review after exclusions, skips excluded recipients, and distinguishes exclusions from saved choices", async () => {
    let workspace = {
      ...base,
      settings: societyQuerySettings(),
      exclusions: [],
      rows: [reviewRow("10"), reviewRow("20"), reviewRow("30")],
    };
    const posts = [];
    fetchMock.mockImplementation(async (_url, options) => {
      if (options?.method === "POST") {
        const body = JSON.parse(options.body);
        expect(body.revision).toBe(workspace.revision);
        posts.push(body);
        const excluding = body.action === "exclude_recipient";
        workspace = {
          ...workspace,
          revision: workspace.revision + 1,
          rows: workspace.rows.map((row) =>
            row.householdId !== body.householdId
              ? row
              : {
                  ...row,
                  status: excluding ? "excluded" : "ready",
                  recipientReview: {
                    ...row.recipientReview,
                    editable: !excluding,
                    status: excluding ? "unreviewed" : "saved",
                    values: excluding ? null : body,
                  },
                },
          ),
          exclusions: excluding
            ? [
                ...workspace.exclusions,
                {
                  id: `e${body.householdId}`,
                  name: `Household ${body.householdId}`,
                  members: [body.householdId],
                  period: base.period,
                  reason: body.reason,
                },
              ]
            : workspace.exclusions,
        };
      }
      return Response.json(workspace);
    });
    render(<Page />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Review recipients in bulk" }),
    );
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Exclude for this period",
      }),
    );
    fireEvent.change(screen.getByLabelText("Reason (optional)"), {
      target: { value: "Not this period" },
    });
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Exclude for this period",
      }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText("Go to recipient")).toHaveDisplayValue(
        "1. Household 20",
      ),
    );
    expect(screen.getByText(/0 saved this session · 1 excluded/)).toBeVisible();
    expect(
      within(screen.getByRole("dialog")).getByText(
        /Household 10 excluded for this period/,
      ),
    ).toBeVisible();
    expect(
      within(screen.getByLabelText("Go to recipient")).queryByRole("option", {
        name: /Household 10/,
      }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    fireEvent.click(
      screen.getByRole("checkbox", { name: /I reviewed the recipient/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save & next" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Go to recipient")).toHaveDisplayValue(
        "2. Household 30",
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(screen.getByLabelText("Go to recipient")).toHaveDisplayValue(
      "1. Household 20",
    );
    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Exclude for this period",
      }),
    );
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Exclude for this period",
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(
      screen.getByText(
        /1 of 3 recipients saved in this review session. 2 excluded/,
      ),
    ).toBeVisible();
    expect(posts.map((body) => [body.action, body.householdId])).toEqual([
      ["exclude_recipient", "10"],
      ["save_recipient", "20"],
      ["exclude_recipient", "30"],
    ]);
    expect(
      screen.queryByRole("button", { name: "Resume review" }),
    ).not.toBeInTheDocument();
  });
  it("surfaces incomplete NXT exclusion updates while continuing to the next recipient", async () => {
    let workspace = {
      ...base,
      settings: societyQuerySettings(),
      rows: [reviewRow("10"), reviewRow("20")],
      exclusions: [],
    };
    fetchMock.mockImplementation(async (_url, options) => {
      if (options?.method === "POST") {
        workspace = {
          ...workspace,
          revision: 2,
          rows: [
            { ...workspace.rows[0], status: "excluded" },
            workspace.rows[1],
          ],
          exclusions: [
            {
              id: "e1",
              name: "Household 10",
              members: ["10"],
              period: base.period,
              nxt: { status: "uncertain" },
            },
          ],
        };
      }
      return Response.json(workspace);
    });
    render(<Page />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Review recipients in bulk" }),
    );
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Exclude for this period",
      }),
    );
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Exclude for this period",
      }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText("Go to recipient")).toHaveDisplayValue(
        "1. Household 20",
      ),
    );
    expect(
      within(screen.getByRole("dialog")).getByText(
        /NXT updates need attention; check Excluded for details/,
      ),
    ).toBeVisible();
    expect(
      fetchMock.mock.calls.filter(([, options]) => options?.method === "POST"),
    ).toHaveLength(1);
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
    expect(screen.getByLabelText("Recipient record")).toHaveValue(
      "Recipient 10 (ID 10)",
    );
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
    expect(screen.getByLabelText("Recipient record")).toHaveValue(
      "Recipient 20 (ID 20)",
    );
    fireEvent.change(screen.getByLabelText("Go to recipient"), {
      target: { value: "0" },
    });
    expect(screen.getByLabelText("Salutation")).toHaveValue("Edited greeting");
    fireEvent.change(screen.getByLabelText("Go to recipient"), {
      target: { value: "2" },
    });
    expect(screen.getByLabelText("Recipient record")).toHaveValue(
      "Recipient 30 (ID 30)",
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: /I reviewed the recipient/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save & finish" }));
    await screen.findByText(/2 of 3 recipients saved in this review session/);
    expect(saves.map((body) => body.householdId)).toEqual(["10", "30"]);
    expect(saves.map((body) => body.revision)).toEqual([1, 2]);
    expect(screen.getByLabelText("Select Household 10")).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "Review selected letters" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Review recipients in bulk" }),
    );
    expect(screen.getByText(/Recipient 1 of 1/)).toBeVisible();
    expect(screen.getByLabelText("Recipient record")).toHaveValue(
      "Recipient 20 (ID 20)",
    );
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
      screen.getByRole("button", { name: "Edit reviewed recipients" }),
    );
    expect(screen.getByText(/Recipient 1 of 50/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Close review" }));
    fireEvent.change(screen.getByLabelText("Find a household"), {
      target: { value: "Household 151" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Edit reviewed recipients" }),
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
    expect(dialog.getByLabelText("Recipient record")).toHaveValue(
      "Alex Sample (ID 10)",
    );
    fireEvent.click(dialog.getByRole("checkbox"));
    fireEvent.click(
      dialog.getByRole("button", { name: "Save recipient choices" }),
    );
    await screen.findByText("Recipient choices saved");
    expect(screen.getByLabelText("Select Sample Household")).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "Review selected letters" }),
    ).not.toBeInTheDocument();
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
  it("stays in the filtered holding list after excluding and preserves other selections", async () => {
    let workspace = {
      ...base,
      settings: societyQuerySettings(),
      exclusions: [],
      rows: [
        reviewRow("10"),
        reviewRow("20"),
        { ...reviewRow("30"), name: "Different recipient" },
      ],
    };
    const posts = [];
    fetchMock.mockImplementation(async (_url, options) => {
      if (options?.method === "POST") {
        const body = JSON.parse(options.body);
        posts.push(body);
        workspace = {
          ...workspace,
          revision: workspace.revision + 1,
          rows: workspace.rows.map((row) =>
            row.householdId === body.householdId
              ? { ...row, status: "excluded" }
              : row,
          ),
          exclusions: [
            {
              id: "e10",
              name: "Household 10",
              members: ["10"],
              period: base.period,
              reason: body.reason,
            },
          ],
        };
      }
      return Response.json(workspace);
    });
    render(<Page />);
    await screen.findByRole("button", { name: "Letter workspace" });
    fireEvent.change(screen.getByLabelText("Find a household"), {
      target: { value: "Household" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Needs review 2" }));
    fireEvent.click(screen.getByLabelText("Select Household 10"));
    fireEvent.click(screen.getByLabelText("Select Household 20"));
    const location = window.location.href;
    fireEvent.click(
      screen.getByRole("button", {
        name: "Exclude Household 10 for this period",
      }),
    );
    fireEvent.change(screen.getByLabelText("Reason (optional)"), {
      target: { value: "Not this year" },
    });
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Exclude for this period",
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(window.location.href).toBe(location);
    expect(screen.getByText("Your letter holding list")).toBeVisible();
    expect(screen.getByLabelText("Find a household")).toHaveValue("Household");
    expect(
      screen.getByRole("button", { name: "Needs review 1" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Select Household 20")).toBeChecked();
    expect(
      screen.queryByLabelText("Select Household 10"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Select Different recipient"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Excluded recipients" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/Household 10 excluded for this period/),
    ).toBeVisible();
    expect(posts).toEqual([
      expect.objectContaining({
        action: "exclude_recipient",
        householdId: "10",
        reason: "Not this year",
      }),
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Excluded (1)" }));
    expect(
      screen.getByRole("region", { name: "Excluded recipients" }),
    ).toBeVisible();
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
    fireEvent.change(screen.getByLabelText("President's Society letter font"), {
      target: { value: "carlito" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save template and field settings" }),
    );
    await screen.findByText(/Template and merge-field settings saved/);
    expect(template.mergeSettings).toEqual({
      fields: ["salutation", "society_name", "first_name"],
      dateFormat: "long_us",
      fontReplacement: "carlito",
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
      screen.getByLabelText("President's Society letter font"),
    ).toHaveValue("carlito");
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
