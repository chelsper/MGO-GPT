import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PortfolioCard } from "./PortfolioWorklist";
import PortfolioContactDetails, { PortfolioContactRefreshProvider } from "./PortfolioContactDetails";

let observers;
const person = { constituentId: "100", name: "Donor", email: "saved@example.com", phone: null,
  address: "100 Main Street", contactCheckedAt: "2020-01-01T00:00:00Z", contactDataSource: "nxt-summary-cache" };
function View({ people = [person], density = "compact", enabled = true, workspaceId = 44 }) {
  return <PortfolioContactRefreshProvider key={workspaceId} viewerId={2} workspaceId={workspaceId} enabled={enabled}>
    {people.map(p => <PortfolioCard key={p.constituentId} person={p} density={density}>
      <PortfolioContactDetails person={p} />
    </PortfolioCard>)}
  </PortfolioContactRefreshProvider>;
}
const tick = ms => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const show = (index = 0, visible = true) => act(() => observers[index].callback([{ isIntersecting: visible }]));
beforeEach(() => {
  vi.useFakeTimers(); observers = [];
  vi.stubGlobal("IntersectionObserver", class {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe = vi.fn(); disconnect = vi.fn();
  });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "updated", contacts: {
    email: "new@example.com", phone: null, address: null, contactCheckedAt: new Date().toISOString(),
  } }) }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("visible portfolio contacts", () => {
  it("makes no contact requests for collapsed or off-screen details", async () => {
    render(<View />);
    await tick(1000); expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Show details for Donor" }));
    expect(screen.getByText("saved@example.com")).toBeVisible();
    await tick(1000); expect(fetch).not.toHaveBeenCalled();
    show(); await tick(300);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(screen.getByText("new@example.com")).toBeVisible();
    expect(screen.queryByText("100 Main Street")).not.toBeInTheDocument();
  });
  it("does not fetch freshly checked contacts, including a confirmed empty record", async () => {
    render(<View density="detailed" people={[{ ...person, email: null, address: null, contactCheckedAt: new Date().toISOString() }]} />);
    show(); await tick(1000);
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByText("No contact details available")).toBeVisible();
  });
  it("only fetches visible cards in Detailed view and cancels queued cards that leave view", async () => {
    render(<View density="detailed" people={[person, { ...person, constituentId: "101", name: "Other" }]} />);
    show(0); show(1); show(1, false);
    await tick(3000);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toContain("/100/portfolio-contact");
  });
  it("keeps saved contacts visible on slow checks and throttling, without repeated calls", async () => {
    let finish;
    fetch.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    render(<View density="detailed" />);
    show(); await tick(300);
    expect(screen.getByText("Checking contact details only...")).toBeVisible();
    expect(screen.getByText("saved@example.com")).toBeVisible();
    await act(async () => finish({ ok: false, json: async () => ({ status: "paused", reason: "throttled",
      retryAt: new Date(Date.now() + 60000).toISOString() }) }));
    expect(screen.getByText("saved@example.com")).toBeVisible();
    expect(screen.getByRole("button", { name: "Contact checks paused briefly" })).toBeDisabled();
    await tick(61000);
    expect(fetch).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Retry contact check" }));
    await tick(300);
    expect(screen.getByText("new@example.com")).toBeVisible();
  });
  it("does not fetch in the local fallback", async () => {
    render(<View density="detailed" enabled={false} />);
    show(); await tick(1000);
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Check contact details" })).not.toBeInTheDocument();
  });
  it("allows an explicit check when IntersectionObserver is unavailable", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    render(<View density="detailed" />);
    fireEvent.click(screen.getByRole("button", { name: "Check contact details" }));
    await tick(300);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("isolates contacts when the selected workspace changes mid-request", async () => {
    let finish;
    fetch.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const view = render(<View density="detailed" />);
    show(); await tick(300);
    view.rerender(<View density="detailed" workspaceId={45} people={[{ ...person, email: "other@example.com" }]} />);
    await act(async () => finish({ ok: true, json: async () => ({ status: "updated", contacts: {
      email: "wrong-workspace@example.com", phone: null, address: null, contactCheckedAt: new Date().toISOString(),
    } }) }));
    expect(screen.queryByText("wrong-workspace@example.com")).not.toBeInTheDocument();
    expect(screen.getByText("other@example.com")).toBeVisible();
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
  });
  it("does not regress contacts when a newer explicit summary arrives", async () => {
    const view = render(<View density="detailed" />);
    show(); await tick(300);
    const newer = new Date(Date.now() + 1000).toISOString();
    view.rerender(<View density="detailed" people={[{ ...person, email: "newer@example.com", contactCheckedAt: newer }]} />);
    expect(screen.getByText("newer@example.com")).toBeVisible();
  });
  it("runs once in Strict Mode", async () => {
    render(<StrictMode><View density="detailed" /></StrictMode>);
    show(observers.length - 1); await tick(1000);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
