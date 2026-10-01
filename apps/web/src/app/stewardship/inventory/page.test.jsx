import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { JU_GIFT_STARTERS } from "@/utils/stewardshipInventory";
import { getBreadcrumbs } from "@/utils/appNavigation";
import { getReturnDestination } from "@/utils/workflowNavigation";
const session = vi.hoisted(() => ({ user: { id: "auth-2" }, loading: false }));
vi.mock("@/utils/useUser", () => ({
  default: () => ({ data: session.user, loading: session.loading }),
}));
import Page from "./page";
const blanket = {
  id: "1",
  name: "JU Blanket",
  name_key: "ju blanket",
  source_key: "ju-action-field:ju-blanket",
  source_label: "JU Blanket",
  description: "Soft green blanket",
  location: "Cabinet A",
  availability: "unknown",
  version: 1,
  archived_at: null,
};
const archived = {
  ...blanket,
  id: "2",
  name: "Old hat",
  name_key: "old hat",
  source_key: "manual:hat",
  availability: "available",
  archived_at: "2026-10-01T12:00:00Z",
  archive_reason: "Discontinued",
};
const reply = (items) => Response.json({ viewerKey: "auth-2", items });
beforeEach(() => {
  session.user = { id: "auth-2" };
  session.loading = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => reply([blanket, archived])),
  );
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
afterEach(() => vi.unstubAllGlobals());
it("loads once, shows active items, filters locally and returns one level to stewardship", async () => {
  render(<Page />);
  await screen.findByText("JU Blanket");
  expect(screen.queryByText("Old hat")).toBeNull();
  expect(
    screen.getByRole("link", { name: "Back to Stewardship" }),
  ).toHaveAttribute("href", "/stewardship");
  expect(getBreadcrumbs("/stewardship/inventory").at(-1).label).toBe(
    "Gift Inventory",
  );
  expect(getReturnDestination("/stewardship/inventory").label).toBe(
    "Back to Gift Inventory",
  );
  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "missing" },
  });
  expect(screen.getByText("No matching items")).toBeVisible();
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });
  fireEvent.change(screen.getByRole("combobox", { name: "Availability" }), {
    target: { value: "available" },
  });
  expect(screen.getByText("No matching items")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Archived (1)" }));
  expect(screen.getByText("Old hat")).toBeVisible();
  fireEvent.focus(window);
  expect(fetch).toHaveBeenCalledOnce();
});
it("archives with a reason, moves the card, and preserves a versioned operation", async () => {
  render(<Page />);
  await screen.findByText("JU Blanket");
  fireEvent.click(screen.getByRole("button", { name: "Archive JU Blanket" }));
  const dialog = screen.getByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Reason (optional)"), {
    target: { value: "No longer available" },
  });
  fetch.mockResolvedValueOnce(
    reply([
      {
        ...blanket,
        version: 2,
        archived_at: "2026-10-01T12:00:00Z",
        archive_reason: "No longer available",
      },
    ]),
  );
  fireEvent.click(within(dialog).getByRole("button", { name: "Archive item" }));
  await screen.findByText("Item moved to Archived. History is preserved.");
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({
    operation: "archive",
    viewerKey: "auth-2",
    id: "1",
    version: 1,
    reason: "No longer available",
  });
  expect(screen.queryByText("JU Blanket")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Archived (2)" }));
  expect(screen.getByText("JU Blanket")).toBeVisible();
});
it("restores with confirmation and does not preserve an old in-stock assertion", async () => {
  render(<Page />);
  await screen.findByText("JU Blanket");
  fireEvent.click(screen.getByRole("button", { name: "Archived (1)" }));
  fireEvent.click(screen.getByRole("button", { name: "Restore Old hat" }));
  expect(
    screen.getByText(/Availability will reset to Not checked/),
  ).toBeVisible();
  fetch.mockResolvedValueOnce(
    reply([
      { ...archived, version: 2, archived_at: null, availability: "unknown" },
    ]),
  );
  fireEvent.click(screen.getByRole("button", { name: "Restore item" }));
  await screen.findByText("Item restored. Check its availability before use.");
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({
    operation: "restore",
    viewerKey: "auth-2",
    id: "2",
    version: 1,
  });
});
it("imports only selected missing starter keys and never imports on page open", async () => {
  fetch.mockResolvedValueOnce(reply([]));
  render(<Page />);
  await screen.findByText("Build your gift catalog");
  expect(fetch).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "Review starter items" }));
  expect(screen.getAllByRole("checkbox")).toHaveLength(26);
  fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
  expect(
    screen.getByRole("button", { name: "Add 0 selected items" }),
  ).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox", { name: "JU Blanket" }));
  fetch.mockResolvedValueOnce(
    Response.json({ viewerKey: "auth-2", items: [blanket], added: 1 }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Add 1 selected items" }));
  await screen.findByText("1 item added. Availability starts as Not checked.");
  expect(JSON.parse(fetch.mock.calls[1][1].body).keys).toEqual([
    JU_GIFT_STARTERS.find((item) => item.name === "JU Blanket").key,
  ]);
  fireEvent.click(screen.getByRole("button", { name: "Review starter items" }));
  expect(screen.queryByRole("checkbox", { name: "JU Blanket" })).toBeNull();
});
it("keeps draft and prevents repeat saves after a conflict until catalog is reloaded", async () => {
  render(<Page />);
  await screen.findByText("JU Blanket");
  fireEvent.click(screen.getByRole("button", { name: "Edit JU Blanket" }));
  fireEvent.change(screen.getByLabelText("Storage location (optional)"), {
    target: { value: "New cupboard" },
  });
  fetch.mockResolvedValueOnce(
    Response.json(
      { error: "Another person changed this item. Reload inventory." },
      { status: 409 },
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await screen.findByRole("alert");
  expect(screen.getByLabelText("Storage location (optional)")).toHaveValue(
    "New cupboard",
  );
  expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Close and reload" }));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("protects edits on close and reads history only on demand", async () => {
  render(<Page />);
  await screen.findByText("JU Blanket");
  fireEvent.click(screen.getByRole("button", { name: "Edit JU Blanket" }));
  fireEvent.change(screen.getByLabelText("Item name"), {
    target: { value: "New name" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(screen.getByText("Discard your unsaved changes?")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
  expect(screen.getByLabelText("Item name")).toHaveValue("New name");
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
  fetch.mockResolvedValueOnce(
    Response.json({
      viewerKey: "auth-2",
      id: "1",
      events: [
        {
          operation: "import",
          actor_name: "Staff member",
          created_at: "2026-10-01T12:00:00Z",
          version: 1,
          snapshot: blanket,
        },
      ],
    }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "History for JU Blanket" }),
  );
  await screen.findByText("Imported by Staff member");
  expect(fetch.mock.calls[1][0]).toBe("/api/stewardship/inventory?id=1");
});
it.each([401, 403, 500])(
  "hides catalog and writes on a failed read (%s)",
  async (status) => {
    fetch.mockResolvedValueOnce(
      Response.json({ error: "Cannot load inventory." }, { status }),
    );
    render(<Page />);
    await screen.findByRole("alert");
    expect(screen.queryByRole("button", { name: "Add item" })).toBeNull();
    expect(screen.queryByText("JU Blanket")).toBeNull();
  },
);
it("rejects another viewer's data and clears inventory on sign-out", async () => {
  fetch.mockResolvedValueOnce(
    Response.json({ viewerKey: "other", items: [blanket] }),
  );
  const page = render(<Page />);
  await screen.findByRole("alert");
  expect(screen.queryByText("JU Blanket")).toBeNull();
  session.user = null;
  page.rerender(<Page />);
  expect(
    screen.getByRole("link", { name: "Sign in to view gift inventory" }),
  ).toBeVisible();
});
