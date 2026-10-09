import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import LetterBatchCard from "./LetterBatchCard";
import { unsubmittedLetter } from "../../../../test/societyLetterRecoveryFixture";

function fixture(status = "complete", channel = "post") {
  const item = {
    id: "letter",
    name: "Sample Recipient",
    batchId: "batch",
    channel,
    status: channel === "post" ? "prepared" : "pending_email",
    societyName: "Sample Society",
    societyKey: "sample",
    members: ["10"],
    period: { start: "2026-01-01", end: "2026-12-31" },
    coveredKeys: ["sample"],
    postalDocument: { format: "pdf" },
    ...(channel === "post"
      ? {
          postalApproval: { index: 0 },
          letterAppeals: {
            status,
            appeal: { id: "100", description: "Sample Appeal" },
            members: [
              {
                id: "10",
                status: status === "complete" ? "verified" : "pending",
              },
            ],
          },
        }
      : {}),
  };
  return {
    batch: {
      id: "batch",
      date: "2026-10-08T12:00:00Z",
      channel,
      items: [item],
    },
    busy: false,
    emailEnabled: true,
    definitions: [],
    receiptIds: {},
    act: vi.fn(),
    downloadBatch: vi.fn(),
    setConfirmation: vi.fn(),
    setReceiptIds: vi.fn(),
  };
}

describe("shared letter batch actions", () => {
  it("offers a confirmation to return only an unattempted approved letter", () => {
    const props = fixture("pending");
    props.batch.items = [unsubmittedLetter()];
    render(<LetterBatchCard {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Return to review" }));
    expect(props.setConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "return_letter_to_review",
        deliveryId: props.batch.items[0].id,
        householdId: "10",
      }),
    );
    expect(props.act).not.toHaveBeenCalled();
  });
  it.each(["attempted", "uncertain", "confirmed"])(
    "hides return for %s household members",
    (kind) => {
      const props = fixture("pending");
      const item = unsubmittedLetter();
      if (kind === "attempted")
        item.letterAppeals.members[1].attemptedAt = "2026-10-09T12:00:00Z";
      else
        item.letterAppeals.members[1].status =
          kind === "uncertain" ? "uncertain" : "verified";
      props.batch.items = [item];
      render(<LetterBatchCard {...props} />);
      expect(
        screen.queryByRole("button", { name: "Return to review" }),
      ).not.toBeInTheDocument();
    },
  );
  it("excludes returned letters from completion, print and mail controls but keeps their audit", () => {
    const props = fixture();
    const returned = {
      ...unsubmittedLetter(),
      status: "cancelled",
      returnToReview: { at: "2026-10-09T12:00:00Z", by: 1 },
    };
    props.batch.items.push(returned);
    render(<LetterBatchCard {...props} />);
    expect(screen.getByText(/1 returned to review/)).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Download print-ready PDF" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Download PDF letters (.zip)" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Mark batch mailed" }),
    ).toBeEnabled();
    expect(screen.getByText(/1 of 1 letters created/)).toBeVisible();
    fireEvent.click(screen.getByText("Recipients and acknowledgment coverage"));
    expect(
      screen.getAllByRole("button", { name: "Download this PDF letter" }),
    ).toHaveLength(1);
    expect(
      screen.queryByRole("button", {
        name: "Continue remaining appeal updates",
      }),
    ).not.toBeInTheDocument();
  });
  it("downloads confirmed batches and individual documents without marking them mailed", () => {
    const props = fixture();
    render(<LetterBatchCard {...props} guided />);
    fireEvent.click(
      screen.getByRole("button", { name: "Download print-ready PDF" }),
    );
    expect(props.downloadBatch).toHaveBeenCalledWith(
      "batch",
      undefined,
      "combined-pdf",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Download PDF letters (.zip)" }),
    );
    expect(props.downloadBatch).toHaveBeenCalledWith("batch");
    fireEvent.click(screen.getByText("Recipients and acknowledgment coverage"));
    fireEvent.click(
      screen.getByRole("button", { name: "Download this PDF letter" }),
    );
    expect(props.downloadBatch).toHaveBeenLastCalledWith(
      "batch",
      "letter",
      "pdf",
    );
    expect(props.act).not.toHaveBeenCalled();
    expect(props.setConfirmation).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Mark batch mailed" }));
    expect(props.setConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({ action: "mailed", batchId: "batch" }),
    );
    expect(props.act).not.toHaveBeenCalled();
  });
  it("does not download or mark mailed while any appeal receipt is pending", () => {
    const props = fixture("pending");
    render(<LetterBatchCard {...props} guided />);
    const download = screen.getByRole("button", {
      name: "Download PDF letters (.zip)",
    });
    expect(download).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Download print-ready PDF" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Mark batch mailed" }),
    ).toBeDisabled();
    const details = screen.getByText("Recipients and acknowledgment coverage");
    expect(details.closest("details")).not.toHaveAttribute("open");
    fireEvent.click(details);
    expect(
      screen.getByRole("button", { name: "Download this PDF letter" }),
    ).toBeDisabled();
    fireEvent.click(download);
    expect(props.downloadBatch).not.toHaveBeenCalled();
    expect(props.act).not.toHaveBeenCalled();
  });
  it("retains explicit email send confirmation and environment gating in history", () => {
    const props = fixture("complete", "email");
    const { rerender } = render(
      <LetterBatchCard {...props} emailEnabled={false} />,
    );
    expect(
      screen.getByRole("button", { name: "Send queued emails" }),
    ).toBeDisabled();
    rerender(<LetterBatchCard {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Send queued emails" }));
    expect(props.setConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({ action: "send", batchId: "batch" }),
    );
    expect(props.act).not.toHaveBeenCalled();
  });
  it.each(["word", "mixed", "unapproved", "email", "cancelled"])(
    "does not offer a print-ready PDF for %s letters",
    (kind) => {
      const props = fixture("complete", kind === "email" ? "email" : "post");
      if (kind === "word") props.batch.items[0].postalDocument.format = "docx";
      if (kind === "mixed")
        props.batch.items.push({
          ...props.batch.items[0],
          id: "word",
          postalDocument: { format: "docx" },
        });
      if (kind === "unapproved") delete props.batch.items[0].postalApproval;
      if (kind === "cancelled") props.batch.items[0].status = "cancelled";
      render(<LetterBatchCard {...props} />);
      expect(
        screen.queryByRole("button", { name: "Download print-ready PDF" }),
      ).not.toBeInTheDocument();
    },
  );
});
