import { act } from "react";
import { createRoot } from "react-dom/client";
import { fireEvent } from "@testing-library/dom";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AppShell from "./AppShell";
import { normalizeDashboardAssistant } from "@/utils/dashboardAssistantSettings";
import { useDashboardAssistantSettings, useWorkspaceLabels } from "./WorkspaceTerminology";

const state = vi.hoisted(() => ({
  session: null,
  organization: null,
  profileRole: "admin",
  reviewer: true,
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
  default: () => state.session,
}));
vi.mock("@/utils/useWorkspaceView", () => ({
  default: () => ({
    isAdmin: state.profileRole.includes("admin"),
    adminViewMode: state.reviewer ? "reviewer" : "mgo",
    effectiveRole: state.reviewer ? "reviewer" : "mgo",
    isMgoView: !state.reviewer,
    isReviewerView: state.reviewer,
    setViewMode: vi.fn(),
  }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ setQueryData: vi.fn() }),
  useQuery: (options) => {
    if (options.queryKey[0] === "app-shell-profile") {
      return { data: { user: { id: 7, name: "Chelsea Santoro", email: "csantor@ju.edu", role: state.profileRole } } };
    }
    if (options.queryKey[0] === "organization-settings") return { data: state.organization ? { settings: state.organization } : undefined };
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

function PageLabelProbe() {
  return <output data-testid="page-label">{useWorkspaceLabels().mgo}</output>;
}

function HelperSettingsProbe() {
  return <output data-testid="helper-settings">{JSON.stringify(useDashboardAssistantSettings())}</output>;
}

let container;
let root;

beforeEach(() => {
  state.session = { data: { name: 'Example Staff', email: 'staff@example.edu' }, loading: false, error: null, refetch: vi.fn() };
  state.organization = null;
  state.profileRole = "admin";
  state.reviewer = true;
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

async function renderShell(pathname = "/submissions") {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[pathname]}>
        <AppShell>
          <main>Queue content</main>
          <LocationProbe />
          <PageLabelProbe />
          <HelperSettingsProbe />
        </AppShell>
      </MemoryRouter>,
    );
  });
}

describe("AppShell", () => {
  it('does not mount a protected workflow while checking its session', async () => {
    state.session = { data: null, loading: true };
    await renderShell('/my-top-prospects');
    expect(container.textContent).toContain('Checking your sign-in...');
    expect(container.textContent).not.toContain('Queue content');
    expect(container.querySelector('header')).toBeNull();
  });

  it('replaces an expired session with sign-in instead of an endless page spinner', async () => {
    state.session.data = null;
    await renderShell('/my-top-prospects?category=active#portfolio');
    expect(container.textContent).toContain('Sign in to continue');
    expect(container.textContent).not.toContain('Queue content');
    expect(container.querySelector('a')).toHaveAttribute('href', '/account/signin?returnTo=%2Fmy-top-prospects%3Fcategory%3Dactive%23portfolio');
  });

  it('offers retry when the initial session check fails', async () => {
    state.session.data = null;
    state.session.error = 'unavailable';
    await renderShell('/constituency-import');
    expect(container.textContent).toContain('Could not check your sign-in');
    await act(async () => fireEvent.click(container.querySelector('button')));
    expect(state.session.refetch).toHaveBeenCalledWith({ showLoading: true });
    expect(container.textContent).not.toContain('Queue content');
  });

  it.each(['/account/signin', '/account/logout', '/forgot-password', '/reset-password'])('leaves the public recovery page accessible: %s', async path => {
    state.session = { data: null, loading: true, error: 'unavailable' };
    await renderShell(path);
    expect(container.textContent).toContain('Queue content');
    expect(container.textContent).not.toContain('Checking your sign-in');
  });

  it('keeps an authenticated workflow mounted after a transient background check failure', async () => {
    await renderShell('/constituency-import');
    const form = container.querySelector('main');
    state.session.error = 'unavailable';
    await renderShell('/constituency-import');
    expect(container.querySelector('main')).toBe(form);
    expect(container.textContent).toContain('Queue content');
  });

  it("withholds the helper until settings load and reuses the configured organization choices", async () => {
    await renderShell();
    expect(JSON.parse(container.querySelector('[data-testid="helper-settings"]').textContent).enabled).toBe(false);
    state.organization = { dashboardAssistant: { enabled: true, name: "Guide", avatar: "compass" } };
    await renderShell();
    expect(JSON.parse(container.querySelector('[data-testid="helper-settings"]').textContent)).toEqual(normalizeDashboardAssistant(state.organization.dashboardAssistant));
    state.organization.dashboardAssistant.enabled = false;
    await renderShell();
    expect(JSON.parse(container.querySelector('[data-testid="helper-settings"]').textContent).enabled).toBe(false);
  });
  it.each(["admin", "advancement_services", "mgo,admin", "mgo", "executive"])("does not advertise deferred Family Import to %s", async role => {
    state.profileRole = role;
    state.reviewer = ["admin", "advancement_services", "mgo,admin"].includes(role);
    await renderShell("/");
    await act(async () => { fireEvent.click(container.querySelector('[aria-label="Open navigation menu"]')); });
    const nav = container.querySelector('[aria-label="Application navigation"]');
    expect(nav.querySelector('a[href="/family-import"]')).toBeNull();
    expect(nav.textContent).not.toContain("Family Import");
    if (state.reviewer) {
      expect(nav.querySelectorAll('a[href="/constituency-import"]')).toHaveLength(1);
      expect(nav.querySelectorAll('a[href="/import-history"]')).toHaveLength(1);
    }
  });

  it.each(["admin", "advancement_services", "mgo,admin"])("offers Home and Setup Hub in editor breadcrumbs for %s", async role => {
    state.profileRole = role;
    await renderShell("/report-configurations");
    const crumbs = container.querySelector('[aria-label="Breadcrumb"]');
    expect(crumbs).toHaveTextContent("HomeSetup HubReport Access & Configurations");
    expect(crumbs.querySelector('a[href="/setup"]')).toHaveTextContent("Setup Hub");
    expect(crumbs.querySelector('a[href="/"]')).toHaveTextContent("Home");
  });

  it.each(["mgo", "executive"])("does not add a setup breadcrumb for an actual %s account", async role => {
    state.profileRole = role;
    await renderShell("/report-configurations");
    expect(container.querySelector('[aria-label="Breadcrumb"] a[href="/setup"]')).toBeNull();
  });

  it("uses configured branding and labels without changing navigation permissions", async () => {
    state.organization = { institutionName:'Example College', applicationName:'Advancement Hub', shortName:'EC', terminology:{mgo:'Gift Officer', advancementServices:'Data Services', executive:'Leadership'} };
    await renderShell();
    expect(container.querySelector('a[aria-label="Advancement Hub home"]')).toHaveAttribute('title','Example College');
    expect(container.textContent).toContain('ECAdvancement HubData Services');
    expect(container.querySelector('[data-testid="page-label"]')).toHaveTextContent('Gift Officer');
    await act(async () => { fireEvent.click(container.querySelector('[aria-label="Open account menu"]')); });
    expect(container.querySelector('[aria-label="Account menu"]')).toHaveTextContent('Admin · Data Services view');
    expect(container.querySelector('[aria-label="Account menu"]')).toHaveTextContent('Gift Officer');
  });
  it("keeps page labels and shell labels in sync when saved settings change", async () => {
    await renderShell();
    expect(container.querySelector('[data-testid="page-label"]')).toHaveTextContent('MGO');
    state.organization = { terminology: { mgo: 'Fundraiser' } };
    await renderShell();
    expect(container.querySelector('[data-testid="page-label"]')).toHaveTextContent('Fundraiser');
  });
  it("shows saved organization logos in the header and menu, with safe initials fallback", async () => {
    const logo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jVh0AAAAASUVORK5CYII=";
    state.organization = { shortName: 'EC', logoDataUrl:logo };
    await renderShell();
    expect(container.querySelector('header img')).toHaveAttribute('src',logo);
    await act(async () => { fireEvent.click(container.querySelector('[aria-label="Open navigation menu"]')); });
    expect(container.querySelectorAll(`img[src="${logo}"]`)).toHaveLength(2);
    state.organization = { shortName:'EC', logoDataUrl:'https://tracker.test/logo.svg' };
    await renderShell();
    expect(container.querySelectorAll('img')).toHaveLength(0);
    expect(container.textContent).toContain('EC');
  });
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
    expect(container.querySelector('a[href="/constituency-import"] span[aria-label]')).toBeNull();
    expect(container.querySelector('a[href="/import-history"]')).toHaveTextContent("Import History");
    expect(container.querySelector('a[href="/pledge-payments"]')).toHaveTextContent("Pledge Payments");
    expect(container.querySelector('a[href="/prospect-exports"]')).toHaveTextContent("Top Prospect Exports");
    expect(container.textContent).toContain("Reports & Exports");
  });

  it("shows actionable notifications and routes global searches to constituent lookup", async () => {
    await renderShell();

    await act(async () => {
      fireEvent.click(container.querySelector('button[aria-label="8 items need attention"]'));
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

  it.each([false, true])("starts the menu with the same three Home paths, without duplicate links (reviewer: %s)", async reviewer => {
    state.reviewer = reviewer;
    await renderShell(reviewer ? "/constituency-import" : "/follow-ups");
    await act(async () => { fireEvent.click(container.querySelector('[aria-label="Open navigation menu"]')); });
    const nav = container.querySelector('[aria-label="Application navigation"]');
    const firstSection = nav.querySelector("section");
    expect(firstSection.querySelector("h2")).toHaveTextContent("Start here");
    const hrefs = reviewer ? ["/submissions", "/constituency-import", "/prospect-exports"] : ["/my-top-prospects", "/follow-ups", "/reports"];
    expect([...firstSection.querySelectorAll("a")].map(link => link.getAttribute("href"))).toEqual(hrefs);
    if (!reviewer) expect(firstSection.querySelector('a[href="/reports"]')).toHaveTextContent(/^Reports$/);
    for (const href of hrefs) expect(nav.querySelectorAll(`a[href="${href}"]`)).toHaveLength(1);
    expect(firstSection.querySelector('[aria-current="page"]')).toHaveAttribute("href", reviewer ? "/constituency-import" : "/follow-ups");
    if (!reviewer) expect(nav.querySelector('a[href="/constituency-import"]')).toBeNull();
    await act(async () => { fireEvent.click(container.querySelector('[aria-label="Close navigation menu"]')); });
    expect(container.querySelector('[aria-label="Application navigation"]')).toBeNull();
  });
});
