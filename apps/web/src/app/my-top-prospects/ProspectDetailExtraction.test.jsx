import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProspectDetailModal } from "./page";
import { getStandingsPeriods } from "@/utils/standingsPeriods";

let client;
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify({ error: "Test save failed" }), {
          status: 503,
        }),
    ),
  );
});
afterEach(() => {
  cleanup();
  client?.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderDetail({
  funded = false,
  linkedAction = false,
  readOnly = false,
} = {}) {
  const now = new Date().toISOString();
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  client.setQueryData(["prospect", 1], {
    prospect: {
      id: 1,
      prospect_name: "Synthetic Prospect",
      status: "Active",
      blackbaud_constituent_id: "100",
    },
    opportunities: [
      {
        id: 2,
        title: "Synthetic campaign",
        current_stage: funded ? "Funded" : "Cultivation",
        estimated_amount: 25000,
        expected_date: "2020-06-30",
        updated_at: now,
        blackbaud_opportunity_id: "NXT-2",
        ...(funded
          ? {
              close_date: getStandingsPeriods().asOf,
              closed_amount: 1000,
              linked_gifts: [
                {
                  id: 91,
                  blackbaud_gift_id: "GIFT-1",
                  gift_amount: 1000,
                  gift_date: "2026-09-01",
                },
              ],
            }
          : {}),
      },
    ],
    updates: [
      {
        id: 3,
        update_title: "Synthetic call",
        update_notes: "Original call notes",
        update_date: "2026-09-01",
        ...(linkedAction ? { blackbaud_action_id: "ACTION-3" } : {}),
      },
    ],
  });
  client.setQueryData(["blackbaud-summary", "100"], { mapped: {} });
  client.setQueryData(["mgo-users-for-discussion"], []);
  client.setQueryData(["prospect-recent-activity", 1], {
    linked: true,
    action: { data: null, fetchedAt: now },
    gift: { data: null, fetchedAt: now },
  });
  return render(
    <QueryClientProvider client={client}>
      <ProspectDetailModal
        prospectId={1}
        readOnly={readOnly}
        onClose={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

it("uses the unchanged opportunity editor and retains a failed draft", async () => {
  renderDetail();
  fireEvent.click(screen.getByRole("button", { name: "Edit Opportunity" }));
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.change(screen.getByDisplayValue("Synthetic campaign"), {
    target: { value: "Revised campaign" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save Opportunity" }));
  await screen.findByText("Test save failed");
  expect(screen.getByDisplayValue("Revised campaign")).toBeInTheDocument();
  expect(fetch).toHaveBeenCalledOnce();
  const [url, options] = fetch.mock.calls[0];
  expect(url).toBe("/api/prospects/opportunities/2");
  expect(options.method).toBe("PUT");
  expect(JSON.parse(options.body)).toMatchObject({
    title: "Revised campaign",
    currentStage: "Cultivation",
    estimatedAmount: 25000,
    expectedDate: "2020-06-30",
  });
});

it("keeps gift unlink confirmation in the parent and targets the original link", async () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  renderDetail({ funded: true });
  fireEvent.click(screen.getByRole("button", { name: "Unlink gift" }));
  expect(confirm).toHaveBeenCalledWith(
    "Unlink this gift from the opportunity in JUMGOGPT? This will not delete the gift record in NXT.",
  );
  expect(fetch).not.toHaveBeenCalled();
  confirm.mockReturnValue(true);
  fireEvent.click(screen.getByRole("button", { name: "Unlink gift" }));
  await screen.findByText("Test save failed");
  expect(fetch).toHaveBeenCalledOnce();
  const [url, options] = fetch.mock.calls[0];
  expect(url).toBe("/api/prospects/opportunities/2/gift-links");
  expect(options.method).toBe("DELETE");
  expect(JSON.parse(options.body)).toEqual({
    giftLinkId: 91,
    blackbaudGiftId: "GIFT-1",
  });
  expect(screen.getByText("Linked gifts in JUMGOGPT")).toBeInTheDocument();
});

it("requires rollover confirmation and retains the existing cache invalidations", async () => {
  renderDetail();
  const invalidate = vi.spyOn(client, "invalidateQueries").mockResolvedValue();
  fetch.mockResolvedValueOnce(
    new Response(JSON.stringify({ ok: true }), { status: 200 }),
  );
  fireEvent.click(screen.getByRole("button", { name: /Update to FY/ }));
  expect(
    screen.getByRole("group", { name: "Confirm fiscal-year update" }),
  ).toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "Confirm update in app and NXT" }),
  );
  await screen.findByText(
    "Expected date updated and verified in JUMGOGPT and NXT.",
  );
  const [url, options] = fetch.mock.calls[0];
  expect(url).toBe("/api/prospects/opportunities/2/rollover");
  expect(options.method).toBe("POST");
  expect(JSON.parse(options.body)).toEqual({
    confirmed: true,
    expectedDate: "2020-06-30",
    fiscalYear: getStandingsPeriods().fiscalYear.label,
  });
  expect(invalidate.mock.calls.map(([args]) => args.queryKey)).toEqual([
    ["prospect", 1],
    ["prospects"],
    ["blackbaud-summary", "100"],
  ]);
});

it.each([
  { linkedAction: false, button: "Delete activity", suffix: "" },
  {
    linkedAction: true,
    button: "Remove from app only",
    suffix: "?localOnly=1",
  },
  { linkedAction: true, button: "Delete from NXT and app", suffix: "" },
])(
  "preserves explicit activity confirmation: $button",
  async ({ linkedAction, button, suffix }) => {
    renderDetail({ linkedAction });
    fireEvent.click(screen.getByText("Activity log (1)"));
    fireEvent.click(
      screen.getByRole("button", { name: "Delete", exact: true }),
    );
    expect(fetch).not.toHaveBeenCalled();
    if (linkedAction)
      expect(
        screen.getByText(/Caution: this will delete this activity/),
      ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: button, exact: true }));
    await screen.findByText("Test save failed");
    expect(fetch).toHaveBeenCalledWith(`/api/prospects/1/updates/3${suffix}`, {
      method: "DELETE",
    });
    expect(fetch).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("button", { name: button, exact: true }),
    ).toBeInTheDocument();
  },
);

it("retains the parent activity editor, update payload, and failed notes", async () => {
  renderDetail();
  fireEvent.click(screen.getByText("Activity log (1)"));
  fireEvent.click(screen.getByRole("button", { name: "Edit", exact: true }));
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.change(screen.getByDisplayValue("Original call notes"), {
    target: { value: "Revised call notes" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save update" }));
  await screen.findByText("Test save failed");
  expect(screen.getByDisplayValue("Revised call notes")).toBeInTheDocument();
  const [url, options] = fetch.mock.calls[0];
  expect(url).toBe("/api/prospects/1/updates/3");
  expect(options.method).toBe("PUT");
  expect(JSON.parse(options.body)).toEqual({
    updateDate: "2026-09-01",
    updateNotes: "Revised call notes",
  });
});

it("keeps actual read-only details inspectable without requests or write controls", async () => {
  renderDetail({ readOnly: true, funded: true, linkedAction: true });
  fireEvent.click(screen.getByText("Activity log (1)"));
  fireEvent.click(screen.getByRole("button", { name: "See details" }));
  expect(
    screen.getByRole("button", { name: "Hide details" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", {
      name: /^(Edit|Edit Opportunity|Delete|Unlink gift|Link recent gift)$/,
    }),
  ).not.toBeInTheDocument();
  await waitFor(() => expect(fetch).not.toHaveBeenCalled());
});
