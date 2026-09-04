import { act } from "react";
import { createRoot } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProspectPoolPage from "./page";

const { session, profile } = vi.hoisted(() => ({
  session: { email: "mgo@example.org" },
  profile: { id: 44, name: "Test MGO", email: "mgo@example.org", role: "mgo" },
}));
vi.mock("@/utils/useUser", () => ({
  default: () => ({ data: session, loading: false }),
}));
vi.mock("@/utils/useWorkspaceView", () => ({
  default: () => ({ isReviewerView: false }),
}));
vi.mock("@tanstack/react-query", () => ({
  useMutation: () => ({ isPending: false }),
}));

let entries, assignmentFails, outcomeFails, writes, container, root;
const response = (data) => ({ ok: true, json: async () => data });
const button = (name) =>
  Array.from(container.querySelectorAll("button")).find(
    (item) => item.textContent === name,
  );
const click = async (name) => {
  expect(button(name)).toBeDefined();
  await act(async () => button(name).click());
};
const change = async (selector, value, checked) => {
  const input = container.querySelector(selector);
  await act(async () => Simulate.change(input, { target: { value, checked } }));
};
const renderPage = async () => {
  await act(async () => root.render(<ProspectPoolPage />));
};
const outcome = () =>
  change('select[name="mgogptDispositionValue-1"]', "Qualified - Major Gifts");

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  entries = [
    {
      id: 1,
      prospect_name: "Alex Prospect",
      assigned_user_id: 44,
      assigned_user_name: "Test MGO",
      assigned_at: "2026-08-20T12:00:00Z",
      blackbaud_constituent_id: "555",
      note: "Interested in scholarship support",
    },
    {
      id: 2,
      prospect_name: "Casey Archived",
      assigned_user_id: 44,
      assigned_user_name: "Test MGO",
      solicitor_assignment_sync_state: "success",
      solicitor_assignment_synced_at: "2026-08-21T12:00:00Z",
      mgogpt_disposition_value: "Qualified - Major Gifts",
      mgogpt_disposition_sync_state: "success",
    },
  ];
  writes = [];
  assignmentFails = false;
  outcomeFails = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, options) => {
      if (url === "/api/users/profile") return response({ user: profile });
      if (url.startsWith("/api/prospect-pool?")) return response(entries);
      if (url.startsWith("/api/blackbaud/"))
        return response({
          mapped: {
            constituent: { name: "Alex Prospect", email: "", phone: "" },
          },
        });
      if (url === "/api/prospect-pool/1" && options?.method === "PATCH") {
        const body = JSON.parse(options.body);
        writes.push(body);
        entries = entries.map((entry) =>
          entry.id !== 1
            ? entry
            : {
                ...entry,
                ...(body.requestAction === "request_help"
                  ? { needs_contact_info: true, data_request_id: 55 }
                  : {
                      mgogpt_disposition_value: body.mgogptDispositionValue,
                      mgogpt_disposition_sync_state: outcomeFails
                        ? "failed"
                        : "success",
                    }),
                ...(body.requestAction === "assign"
                  ? {
                      solicitor_requested: true,
                      solicitor_assignment_sync_state: assignmentFails
                        ? "failed"
                        : "success",
                      solicitor_assignment_synced_at: assignmentFails
                        ? null
                        : "2026-09-03T12:00:00Z",
                    }
                  : {}),
              },
        );
        return response(entries[0]);
      }
      throw new Error(`Unexpected test request: ${url}`);
    }),
  );
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

async function openProspect() {
  await renderPage();
  await click("Review prospect");
}

describe("My Prospect Pool", () => {
  it("shows compact searchable cards and a read-only archive without fetching archived summaries", async () => {
    await renderPage();
    expect(button("Active (1)")).toBeDefined();
    expect(button("Send help request")).toBeUndefined();
    expect(
      fetch.mock.calls.some(([url]) => url.startsWith("/api/blackbaud/")),
    ).toBe(false);
    await change('input[type="search"]', "missing");
    expect(container.textContent).toContain("No entries match your search");
    await change('input[type="search"]', "");
    await click("Archive (1)");
    expect(container.textContent).toContain("Casey Archived");
    expect(container.textContent).not.toContain("Alex Prospect");
    expect(button("Assign to My Portfolio")).toBeUndefined();
    expect(
      container.querySelector(
        'article a[href="/my-top-prospects?tab=portfolio"]',
      ),
    ).toHaveTextContent("View in Portfolio");
    expect(writes).toEqual([]);
  });

  it("assigns only explicitly, moves the entry to Archive, and retains it after reload", async () => {
    await openProspect();
    expect(button("Assign to My Portfolio")).toBeDisabled();
    await outcome();
    await click("Assign to My Portfolio");
    expect(button("Active (0)")).toBeDefined();
    expect(writes[0]).toMatchObject({
      requestAction: "assign",
      solicitorRequested: true,
    });
    expect(writes[0]).not.toHaveProperty("needsContactInfo");
    expect(container.querySelector("article")).toBeNull();
    act(() => root.unmount());
    root = createRoot(container);
    await renderPage();
    await click("Archive (2)");
    expect(container.textContent).toContain("Alex Prospect");
    expect(writes).toHaveLength(1);
  });

  it("retains failed assignments in the active pool", async () => {
    assignmentFails = true;
    await openProspect();
    await outcome();
    await click("Assign to My Portfolio");
    expect(container.textContent).toContain("Assignment is not confirmed");
    expect(button("Active (1)")).toBeDefined();
    expect(button("Archive (1)")).toBeDefined();
  });

  it("sends help separately and keeps the unsaved outcome draft", async () => {
    await openProspect();
    await outcome();
    await change('input[name="needsContactInfo-1"]', undefined, true);
    expect(button("Assign to My Portfolio")).toBeDisabled();
    await click("Send help request");
    expect(writes[0]).toEqual({
      requestAction: "request_help",
      needsContactInfo: true,
      contactInfoRequestNote: "",
    });
    expect(
      container.querySelector('select[name="mgogptDispositionValue-1"]'),
    ).toHaveValue("Qualified - Major Gifts");
    expect(button("Active (1)")).toBeDefined();
    expect(button("Send help request")).toBeDisabled();
  });

  it("keeps outcome-only saves active and flags failed outcome syncs in Archive", async () => {
    await openProspect();
    await outcome();
    await click("Save outcome only");
    expect(writes[0]).not.toHaveProperty("solicitorRequested");
    expect(button("Active (1)")).toBeDefined();
    outcomeFails = true;
    await click("Assign to My Portfolio");
    await click("Archive (2)");
    expect(container.textContent).toContain(
      "outcome still needs NXT follow-up",
    );
  });
});
