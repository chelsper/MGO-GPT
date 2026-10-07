import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
vi.mock("./SavedLetterPreview", () => ({
  default: ({ draft, onReady }) => (
    <button
      onClick={() => onReady()}
      data-request={JSON.stringify(draft.request)}
    >
      Finish loading preview
    </button>
  ),
}));
import FinalPostalLetterDialog, {
  LetterAppealStatus,
} from "./FinalPostalLetterDialog";
const preview = {
  token: "safe-token",
  appeal: {
    id: "100",
    lookupId: "PRES26",
    description: "CY26 President Letter",
  },
  row: {
    householdId: "10",
    name: "Alex and Pat Sample",
    societyName: "President's Society",
    letterDate: "2026-09-25",
    members: ["10", "11"],
    memberNames: [
      { constituentId: "10", firstName: "Alex", lastName: "Sample" },
      { constituentId: "11", firstName: "Pat", lastName: "Sample" },
    ],
    addressee: "Alex and Pat",
    address: "10 Test St",
    templateVersion: "v1",
    templateFilename: "letter.docx",
  },
};
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function () {
    this.setAttribute("open", "");
  });
  HTMLDialogElement.prototype.close = vi.fn(function () {
    this.removeAttribute("open");
  });
});
afterEach(cleanup);
describe("final letter confirmation", () => {
  it("allows saved review without a repeat preview, requires approval and prevents repeat submit", () => {
    const onConfirm = vi.fn();
    render(
      <FinalPostalLetterDialog
        preview={preview}
        revision={4}
        onClose={vi.fn()}
        onConfirm={onConfirm}
      />,
    );
    expect(screen.getByText("Alex Sample (ID 10)")).toBeTruthy();
    expect(screen.getByText("Pat Sample (ID 11)")).toBeTruthy();
    const submit = screen.getByRole("button", {
      name: "Create letter and apply appeal",
    });
    expect(submit.disabled).toBe(true);
    expect(screen.getByRole("checkbox").disabled).toBe(false);
    fireEvent.click(
      screen.getByRole("button", { name: "Preview letter (optional)" }),
    );
    const loader = screen.getByRole("button", {
      name: "Finish loading preview",
    });
    expect(JSON.parse(loader.dataset.request)).toEqual({
      action: "preview_final_postal_document",
      revision: 4,
      householdId: "10",
      previewToken: "safe-token",
    });
    expect(submit.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(submit);
    fireEvent.click(submit);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(submit.disabled).toBe(true);
    expect(screen.getByText(/Close and reload saved history/)).toBeTruthy();
  });
  it("does not turn verification into write approval; uncertain members have no continue button", () => {
    const item = {
      name: "Alex and Pat",
      status: "prepared",
      letterAppeals: {
        status: "needs_review",
        appeal: preview.appeal,
        members: [
          { id: "10", status: "verified" },
          { id: "11", status: "uncertain" },
        ],
      },
    };
    const onVerify = vi.fn(),
      onContinue = vi.fn();
    const view = render(
      <LetterAppealStatus
        item={item}
        onVerify={onVerify}
        onContinue={onContinue}
      />,
    );
    expect(
      screen.queryByRole("button", {
        name: "Continue remaining appeal updates",
      }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Verify NXT status (read only)" }),
    );
    expect(onVerify).toHaveBeenCalledTimes(1);
    expect(onContinue).not.toHaveBeenCalled();
    item.letterAppeals.members[1].status = "pending";
    view.rerender(
      <LetterAppealStatus
        item={item}
        onVerify={onVerify}
        onContinue={onContinue}
      />,
    );
    const next = screen.getByRole("button", {
      name: "Continue remaining appeal updates",
    });
    expect(next.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(next);
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(next.disabled).toBe(true);
  });
  it("shows completion without implying the letter is mailed", () => {
    render(
      <LetterAppealStatus
        item={{
          name: "Alex",
          status: "prepared",
          letterAppeals: {
            status: "complete",
            appeal: preview.appeal,
            message: "Letter created; not mailed.",
            members: [{ id: "10", status: "verified" }],
          },
        }}
      />,
    );
    expect(
      screen.getByText("Appeal confirmed for every full constituent"),
    ).toBeTruthy();
    expect(screen.getByText("Letter created; not mailed.")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
