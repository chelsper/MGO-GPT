import { act } from "react";
import { createRoot } from "react-dom/client";
import { fireEvent } from "@testing-library/dom";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AppShell from "./AppShell";

const state = vi.hoisted(() => ({
  worklist: {
    queueCounts: {
      submissions: 2,
      dataRequests: 3,
      listRequests: 0,
      constituencyImports: 4,
      familyImports: 0,
      prospectPool: 1,
      discussions: 2,
      workQueue: 9,
    },
    summary: { openDiscussionItems: 2 },
  },
}));

vi.mock("@/utils/useUser", () => ({
  default: () => ({ data: { name: "Chelsea Santoro", email: "csantor@ju.edu" }, loading: false }),
}));
vi.mock("@/utils/useWorkspaceView", () => ({
  default: () => ({
    isAdmin: true,
    adminViewMode: "reviewer",
    effectiveRole: "reviewer",
    isMgoView: false,
    isReviewerView: true,
    setViewMode: vi.fn(),
  }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ setQueryData: vi.fn() }),
  useQuery: (options) => {
    if (options.queryKey[0] === "app-shell-profile") {
      return { data: { user: { id: 7, name: "Chelsea Santoro", email: "csantor@ju.edu", role: "admin" } } };
    }
    if (options.queryKey[0] === "app-shell-worklist") return { data: state.worklist, isError: false };
    if (options.queryKey[0] === "workspace-mgo-users") return { data: [] };
    if (options.queryKey[0] === "acting-workspace-status") return { data: { actingUser: null } };
    return {};
  },
}));

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

let container;
let root;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

async function renderShell() {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={["/submissions"]}>
        <AppShell>
          <main>Queue content</main>
          <LocationProbe />
        </AppShell>
      </MemoryRouter>,
    );
  });
}

describe("AppShell", () => {
  it("provides persistent breadcrumbs, role-aware navigation, and queue badges", async () => {
    await renderShell();

    expect(container.querySelector('[aria-label="Breadcrumb"]')).toHaveTextContent("HomeWork Queue");
    await act(async () => {
      fireEvent.click(container.querySelector('[aria-label="Open navigation menu"]'));
    });

    const currentLink = container.querySelector('a[href="/submissions"][aria-current="page"]');
    expect(currentLink).toHaveTextContent("Work Queue");
    expect(container.querySelector('a[href="/report-configurations"]')).toHaveTextContent(
      "Report Access & Configurations",
    );
    expect(container.querySelector('a[href="/constituency-import"]')).toHaveTextContent("4");
  });

  it("shows actionable notifications and routes global searches to constituent lookup", async () => {
    await renderShell();

    await act(async () => {
      fireEvent.click(container.querySelector('button[aria-label="12 items need attention"]'));
    });
    expect(container.querySelector('[aria-label="Notifications"]')).toHaveTextContent(
      "Submissions need review",
    );

    const searchInput = container.querySelector('input[aria-label="Search constituents"]');
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: "Smith" } });
      fireEvent.submit(searchInput.closest("form"));
    });

    expect(container.querySelector('[data-testid="location"]')).toHaveTextContent(
      "/constituent-lookup?q=Smith",
    );
  });
});
