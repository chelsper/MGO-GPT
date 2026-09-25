import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ExclusionAppealSettings, {
  ExclusionSyncStatus,
} from "./ExclusionAppealSettings";
import LetterExclusionDialog from "./LetterExclusionDialog";

const appeal = {
  id: "773",
  lookupId: "CY26PRESSOCEX-MGO",
  description: "CY 2026 Pres Society Letter Excluded - MGO GPT",
};
const recipient = {
  name: "Alex and Pat Example",
  members: ["10", "11"],
  societyKey: "presidents",
  societyName: "President's Society",
  period: { key: "2026", start: "2026-01-01", end: "2026-12-31" },
};
const appealSettings = {
  current: true,
  policy: { appeals: { presidents: appeal } },
};
beforeEach(() => {
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
});
describe("exclusion appeal controls", () => {
  it("shows exact appeal and members and requires reason/date/confirmation before NXT writes", () => {
    const save = vi.fn();
    render(
      <LetterExclusionDialog
        recipient={recipient}
        appealSettings={appealSettings}
        today="2026-09-25"
        onSave={save}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(/CY26PRESSOCEX-MGO/)).toBeInTheDocument();
    expect(screen.getByText(/10, 11/)).toBeInTheDocument();
    expect(screen.getByLabelText("Exclusion date")).toHaveValue("2026-09-25");
    const submit = screen.getByRole("button", {
      name: "Exclude and record in NXT",
    });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Reason (NXT comments)"), {
      target: { value: "Sending to associated individuals instead" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    expect(submit).toBeEnabled();
    fireEvent.change(screen.getByLabelText("Exclusion date"), {
      target: { value: "2026-09-24" },
    });
    expect(submit).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(submit);
    expect(save).toHaveBeenCalledWith({
      reason: "Sending to associated individuals instead",
      exclusionDate: "2026-09-24",
      confirmNxt: true,
    });
  });
  it("does not imply NXT was updated for unconfigured or stale settings", () => {
    const { rerender } = render(
      <LetterExclusionDialog
        recipient={recipient}
        today="2026-09-25"
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(/App-only exclusion:/)).toBeInTheDocument();
    rerender(
      <LetterExclusionDialog
        recipient={recipient}
        appealSettings={{ ...appealSettings, current: false }}
        today="2026-09-25"
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Exclude and record in NXT" }),
    ).toBeDisabled();
  });
  it("verifies lookup-code configuration without applying appeals", async () => {
    const act = vi.fn().mockResolvedValue({});
    const data = {
      period: recipient.period,
      settings: { sourceMode: "society_queries", societyKeys: ["presidents"] },
      definitions: [{ key: "presidents", name: "President's Society" }],
      exclusionAppeals: {},
    };
    render(<ExclusionAppealSettings data={data} act={act} />);
    fireEvent.click(screen.getByText("NXT exclusion appeal settings"));
    fireEvent.change(
      screen.getByLabelText("President's Society exclusion appeal code"),
      { target: { value: appeal.lookupId } },
    );
    fireEvent.change(
      screen.getByLabelText("President's Society exclusion appeal description"),
      { target: { value: appeal.description } },
    );
    expect(
      screen.getByRole("button", { name: "Verify and save exclusion appeals" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(
      screen.getByRole("button", { name: "Verify and save exclusion appeals" }),
    );
    await waitFor(() =>
      expect(act).toHaveBeenCalledWith({
        action: "exclusion_appeal_settings",
        confirm: true,
        appeals: {
          presidents: {
            lookupId: appeal.lookupId,
            description: appeal.description,
          },
        },
      }),
    );
  });
  it("allows read-only verification but never resend controls for uncertain creates", () => {
    const act = vi.fn();
    const item = {
      id: "excluded-1",
      nxt: {
        appeal,
        date: "2026-09-25",
        members: [{ id: "10", status: "uncertain" }],
        status: "needs_review",
        message: "Verify before continuing.",
      },
    };
    render(<ExclusionSyncStatus item={item} act={act} />);
    expect(
      screen.queryByRole("button", { name: "Continue remaining NXT updates" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Verify NXT status (read only)" }),
    );
    expect(act).toHaveBeenCalledWith({
      action: "verify_exclusion_appeal",
      exclusionId: item.id,
    });
  });
  it("shows diagnostic details without implying an unconfirmed appeal must be deleted", () => {
    const item = {
      id: "excluded-1",
      nxt: {
        appeal,
        date: "2026-09-25",
        status: "needs_review",
        message: "NXT denied this request. (HTTP 403.)",
        members: [
          {
            id: "10",
            status: "pending",
            lastWriteFailure: {
              httpStatus: 403,
              providerName: "AccessDenied",
              providerCode: 123,
            },
          },
        ],
      },
    };
    render(<ExclusionSyncStatus item={item} act={vi.fn()} />);
    fireEvent.click(screen.getByText("Last NXT request details"));
    expect(screen.getByText(/Member 10: HTTP 403/)).toBeInTheDocument();
    expect(
      screen.getByText(/If it exists in NXT, remove it there first/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Continue remaining NXT updates" }),
    ).toBeDisabled();
  });
});
