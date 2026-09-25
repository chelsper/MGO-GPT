import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act as reactAct,
  fireEvent,
  render,
  screen,
  cleanup,
} from "@testing-library/react";
import Panel from "./LetterReadinessPanel";
const base = {
  period: { key: "2026", start: "2026-01-01", end: "2026-12-31" },
  settings: { societyKeys: ["ood"] },
  definitions: [{ key: "ood", name: "Order of the Dolphin" }],
  readiness: { policy: null, issue: null, job: null },
};
const rows = [
  { householdId: "10", readiness: { post: { status: "unchecked" } } },
];
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
describe("readiness panel", () => {
  it("opens without NXT requests and starts only explicitly", async () => {
    const act = vi.fn(async () => base);
    render(<Panel data={base} rows={rows} channel="post" act={act} />);
    expect(act).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Check readiness (1)" }),
    );
    expect(act).toHaveBeenCalledWith({
      action: "check_readiness",
      channel: "post",
      householdIds: ["10"],
    });
    expect(screen.getByText(/Nothing is sent/)).toBeTruthy();
  });
  it("requires period appeal setup and does not override it", () => {
    render(
      <Panel
        data={{ ...base, readiness: { issue: "Save letter appeal settings" } }}
        rows={rows}
        channel="post"
        act={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Check readiness (1)" }).disabled,
    ).toBe(true);
    expect(
      screen.getByRole("button", { name: "Verify and save appeal settings" })
        .disabled,
    ).toBe(true);
  });
  it("does not restart saved jobs on page open", async () => {
    vi.useFakeTimers();
    const act = vi.fn();
    render(
      <Panel
        data={{
          ...base,
          readiness: {
            job: {
              id: "j",
              status: "running",
              checked: 2,
              total: 4,
              channel: "post",
            },
          },
        }}
        rows={rows}
        channel="post"
        act={act}
      />,
    );
    await reactAct(async () => vi.advanceTimersByTime(5000));
    expect(act).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Resume check" })).toBeTruthy();
  });
  it("respects cooldown and provides stop without sending", () => {
    const act = vi.fn();
    render(
      <Panel
        data={{
          ...base,
          readiness: {
            job: {
              id: "j",
              status: "paused",
              checked: 2,
              total: 4,
              retryAt: new Date(Date.now() + 60000).toISOString(),
            },
          },
        }}
        rows={rows}
        channel="post"
        act={act}
      />,
    );
    expect(screen.getByRole("button", { name: "Resume check" }).disabled).toBe(
      true,
    );
    fireEvent.click(screen.getByRole("button", { name: "Stop check" }));
    expect(act).toHaveBeenCalledWith({
      action: "cancel_readiness",
      jobId: "j",
    });
  });
  it("does not recheck fresh ready or acknowledged households automatically", () => {
    const checked = rows.map((row) => ({
      ...row,
      readiness: { post: { status: "already_acknowledged" } },
    }));
    render(<Panel data={base} rows={checked} channel="post" act={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: "Check readiness (0)" }).disabled,
    ).toBe(true);
    expect(screen.getByText("Already acknowledged: 1")).toBeTruthy();
  });
  it("enables resume after cooldown without calling NXT automatically", async () => {
    vi.useFakeTimers();
    const act = vi.fn();
    render(
      <Panel
        data={{
          ...base,
          readiness: {
            job: {
              id: "j",
              status: "paused",
              checked: 1,
              total: 2,
              channel: "post",
              retryAt: new Date(Date.now() + 1000).toISOString(),
            },
          },
        }}
        rows={rows}
        channel="post"
        act={act}
      />,
    );
    expect(screen.getByRole("button", { name: "Resume check" }).disabled).toBe(
      true,
    );
    await reactAct(async () => vi.advanceTimersByTime(1100));
    expect(screen.getByRole("button", { name: "Resume check" }).disabled).toBe(
      false,
    );
    expect(act).not.toHaveBeenCalled();
  });
});
