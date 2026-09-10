import { act } from "react";
import { createRoot } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ProspectPoolPage from "./page";

const { session, profile } = vi.hoisted(() => ({
  session: { email: "reviewer@example.org" },
  profile: { id: 7, name: "Reviewer", email: "reviewer@example.org", role: "reviewer" },
}));
vi.mock("@/utils/useUser", () => ({ default: () => ({ data: session, loading: false }) }));
vi.mock("@/utils/useWorkspaceView", () => ({ default: () => ({ isReviewerView: true }) }));
vi.mock("@tanstack/react-query", () => ({ useMutation: () => ({ isPending: false }) }));
const match = { name: "Pat A. Prospect", lookupId: "LOOKUP1", blackbaudConstituentId: "123" };
let root, container, writes, entries, searchFails;
const response = (data) => ({ ok: true, json: async () => data });
const button = (name) => Array.from(container.querySelectorAll("button")).find((item) => item.textContent === name);
const click = async (name) => { expect(button(name)).toBeDefined(); await act(async () => button(name).click()); };
const change = async (selector, value, checked) => {
  await act(async () => Simulate.change(container.querySelector(selector), { target: { value, checked } }));
};
const tick = async () => act(async () => vi.advanceTimersByTimeAsync(300));
const openComposer = async () => {
  await act(async () => root.render(<ProspectPoolPage />));
  await click("Open composer");
};

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  writes = [];
  entries = [];
  searchFails = false;
  vi.stubGlobal("fetch", vi.fn(async (url, options) => {
    if (url === "/api/users/profile") return response({ user: profile });
    if (url === "/api/users/mgos") return response([{ id: 55, name: "Other MGO" }, { id: 44, name: "Gretchen Picotte" }]);
    if (url.startsWith("/api/prospect-pool?")) return response(entries);
    if (url.startsWith("/api/blackbaud/constituents/search")) {
      if (searchFails) return { ok: false, json: async () => ({ error: "Search unavailable" }) };
      return response({ results: decodeURIComponent(url.split("q=")[1]) === "Pat" ? [match] : [] });
    }
    if (url === "/api/prospect-pool" && options?.method === "POST") {
      const body = JSON.parse(options.body);
      writes.push(body);
      return response({ id: 1, prospect_name: body.prospectName, assigned_user_id: Number(body.assignedUserId), blackbaud_constituent_id: body.blackbaudConstituentId, nxt_status_sync_state: body.blackbaudConstituentId ? "success" : "manual_required" });
    }
    if (url === "/api/prospect-pool/149/link-constituent" && options?.method === "POST") {
      writes.push(JSON.parse(options.body));
      return response({ ...entries[0], blackbaud_constituent_id: "123", linked_blackbaud_constituent_id: "123", nxt_status_sync_state: "pending" });
    }
    if (url.startsWith("/api/blackbaud/")) return response({ mapped: { constituent: { name: match.name } } });
    throw new Error(`Unexpected test request ${url}`);
  }));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("preserves a selected identity through a canonical-name search reload and MGO change", async () => {
  await openComposer();
  await change('[name="prospectName"]', "Pat");
  await tick();
  await click("Use match");
  await tick(); // The canonical name search returns no results, unlike the first search.
  await change('[name="assignedUserId"]', "44");
  expect(container.textContent).toContain("LOOKUP1");
  expect(button("Add to prospect pool").disabled).toBe(false);
  await click("Add to prospect pool");
  expect(writes).toEqual([expect.objectContaining({ assignedUserId: "44", blackbaudConstituentId: "123", allowUnlinked: false })]);
});

it("clears a match when the reviewer edits the name and blocks accidental app-only creation", async () => {
  await openComposer();
  await change('[name="prospectName"]', "Pat");
  await tick();
  await click("Use match");
  await change('[name="prospectName"]', "Someone else");
  expect(button("Add to prospect pool").disabled).toBe(true);
  await act(async () => Simulate.submit(container.querySelector("form")));
  expect(writes).toEqual([]);
  expect(container.textContent).toContain("Select an NXT match");
});

it("allows an explicit app-only choice and explains the missing NXT link", async () => {
  await openComposer();
  await change('[name="prospectName"]', "New lead");
  await change('[name="allowUnlinked"]', undefined, true);
  await click("Add to prospect pool");
  expect(writes).toEqual([expect.objectContaining({ blackbaudConstituentId: null, allowUnlinked: true })]);
  expect(container.textContent).toContain("link an NXT record before syncing MGOGPT");
});

it("shows search failures instead of silently treating them as no match", async () => {
  searchFails = true;
  await openComposer();
  await change('[name="prospectName"]', "Pat");
  await tick();
  expect(container.textContent).toContain("NXT search could not finish");
  expect(button("Add to prospect pool").disabled).toBe(true);
});

it("offers linkage rather than a manual NXT edit on an existing unlinked assignment", async () => {
  entries = [{ id: 149, prospect_name: "Pat", assigned_user_id: 44, assigned_user_name: "Gretchen Picotte", nxt_status_sync_state: "manual_required" }];
  await act(async () => root.render(<ProspectPoolPage />));
  expect(container.textContent).toContain("NXT record not linked");
  expect(button("Link NXT record")).toBeDefined();
  expect(button("Retry MGOGPT sync")).toBeUndefined();
  expect(container.textContent).not.toContain("Manual MGOGPT update");
});

it("requires a confirmed match to repair a link and leaves custom-field sync as a separate action", async () => {
  entries = [{ id: 149, prospect_name: "Pat", assigned_user_id: 44, assigned_user_name: "Gretchen Picotte", nxt_status_sync_state: "manual_required" }];
  await act(async () => root.render(<ProspectPoolPage />));
  const initialSearches = fetch.mock.calls.filter(([url]) => url.includes("/search?")).length;
  expect(initialSearches).toBe(0);
  await click("Link NXT record");
  await tick();
  expect(button("Confirm NXT link").disabled).toBe(true);
  expect(container.querySelector('a[href="https://renxt.blackbaud.com/constituents/123"]')).not.toBeNull();
  await click("Use this match");
  expect(writes).toEqual([]);
  await click("Confirm NXT link");
  expect(writes).toEqual([{ blackbaudConstituentId: "123", confirmLink: true }]);
  expect(button("Retry MGOGPT sync")).toBeDefined();
  expect(button("Link NXT record")).toBeUndefined();
  expect(container.textContent).toContain("Gretchen Picotte");
  expect(fetch.mock.calls.some(([url]) => url.endsWith("/nxt-status-sync"))).toBe(false);
});
