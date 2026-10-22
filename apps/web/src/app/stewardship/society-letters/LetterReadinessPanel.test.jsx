import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act as reactAct,
  fireEvent,
  render,
  screen,
  cleanup,
} from "@testing-library/react";
import Panel, { ReadinessSettings } from "./LetterReadinessPanel";
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
  it("accepts an appeal code without a numeric-format validation error and sends only the selected identifier", () => {
    const act = vi.fn();
    render(<ReadinessSettings data={base} busy={false} act={act} />);
    fireEvent.click(screen.getByText("Letter appeal settings for this period"));
    const code = screen.getByLabelText("Order of the Dolphin appeal code");
    fireEvent.change(code, { target: { value: "CY26OOD-MGO" } });
    fireEvent.change(
      screen.getByLabelText("Order of the Dolphin appeal description"),
      { target: { value: "CY2026 OOD Letter Sent via JUMGOGPT" } },
    );
    expect(code.checkValidity()).toBe(true);
    expect(code).not.toHaveAttribute("pattern");
    expect(
      screen.getByRole("button", { name: "Verify and save appeal settings" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(
      screen.getByRole("button", { name: "Verify and save appeal settings" }),
    );
    expect(act).toHaveBeenCalledExactlyOnceWith({
      action: "readiness_settings",
      confirm: true,
      appeals: {
        ood: {
          lookupId: "CY26OOD-MGO",
          description: "CY2026 OOD Letter Sent via JUMGOGPT",
        },
      },
    });
  });
  it("retains old numeric-ID mappings and can switch explicitly to a code without sending the stale ID", () => {
    const act = vi.fn();
    render(
      <ReadinessSettings
        data={{
          ...base,
          readiness: {
            policy: {
              appeals: { ood: { id: "100", description: "OOD letter" } },
            },
          },
        }}
        busy={false}
        act={act}
      />,
    );
    expect(
      screen.getByLabelText("Order of the Dolphin appeal system record ID"),
    ).toHaveValue("100");
    fireEvent.click(screen.getByText("Letter appeal settings for this period"));
    expect(
      screen.getByLabelText("Order of the Dolphin find appeal by"),
    ).toHaveValue("system");
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(
      screen.getByRole("button", { name: "Verify and save appeal settings" }),
    );
    expect(act).toHaveBeenLastCalledWith({
      action: "readiness_settings",
      confirm: true,
      appeals: { ood: { id: "100", description: "OOD letter" } },
    });
    fireEvent.change(
      screen.getByLabelText("Order of the Dolphin find appeal by"),
      { target: { value: "lookup" } },
    );
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    fireEvent.change(
      screen.getByLabelText("Order of the Dolphin appeal code"),
      { target: { value: "CODE" } },
    );
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(
      screen.getByRole("button", { name: "Verify and save appeal settings" }),
    );
    expect(act).toHaveBeenLastCalledWith({
      action: "readiness_settings",
      confirm: true,
      appeals: { ood: { lookupId: "CODE", description: "OOD letter" } },
    });
  });
  it("reopens verified codes as codes and hides the saved mapping note when edited", () => {
    render(
      <ReadinessSettings
        data={{
          ...base,
          readiness: {
            policy: {
              appeals: {
                ood: { id: "100", lookupId: "OOD", description: "OOD letter" },
              },
            },
          },
        }}
        busy={false}
        act={vi.fn()}
      />,
    );
    expect(
      screen.getByLabelText("Order of the Dolphin appeal code"),
    ).toHaveValue("OOD");
    fireEvent.click(screen.getByText("Letter appeal settings for this period"));
    expect(screen.getByText(/Saved appeal: OOD/)).toBeVisible();
    fireEvent.change(
      screen.getByLabelText("Order of the Dolphin appeal code"),
      { target: { value: "OTHER" } },
    );
    expect(screen.queryByText(/Saved appeal:/)).not.toBeInTheDocument();
  });
  it("links to separate setup without starting a readiness check or showing configuration forms", () => {
    const act = vi.fn(),
      openSettings = vi.fn();
    render(
      <Panel
        data={base}
        rows={rows}
        channel="post"
        act={act}
        onOpenSettings={openSettings}
      />,
    );
    expect(
      screen.queryByText("Letter appeal settings for this period"),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Open appeal settings" }),
    );
    expect(openSettings).toHaveBeenCalledOnce();
    expect(act).not.toHaveBeenCalled();
  });
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
