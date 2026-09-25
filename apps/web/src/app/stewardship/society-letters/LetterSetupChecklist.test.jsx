import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import Checklist, { letterSetupProgress } from "./LetterSetupChecklist";

vi.mock("./SavedLetterPreview", () => ({
  default: ({ template, sample, onReady, onClose }) => (
    <div role="dialog">
      <p>{sample ? "Fictional sample" : "Not a sample"}</p>
      <button onClick={() => onReady(template.version)}>
        Finish loading sample
      </button>
      <button onClick={onClose}>Close sample</button>
    </div>
  ),
}));

const data = {
  settings: { societyKeys: ["ood", "president"] },
  definitions: [
    { key: "ood", name: "Order of the Dolphin" },
    { key: "president", name: "President's Society" },
  ],
  setup: { key: "source-key", sourceConfigured: true, membershipCurrent: true },
  templates: [
    { societyKey: "ood", societyName: "Order of the Dolphin", version: "one" },
    {
      societyKey: "president",
      societyName: "President's Society",
      version: "two",
    },
  ],
};

describe("guided letter setup", () => {
  it("uses saved metadata and never assumes missing metadata or default mappings are complete", () => {
    expect(letterSetupProgress({ ...data, setup: undefined }).next.key).toBe(
      "source",
    );
    expect(
      letterSetupProgress({ ...data, settings: null, templates: [], setup: {} })
        .completed,
    ).toBe(0);
    const unloaded = letterSetupProgress({
      ...data,
      setup: { ...data.setup, membershipCurrent: false },
    });
    expect(unloaded.next.key).toBe("fields");
    expect(
      letterSetupProgress({ ...data, templates: data.templates.slice(0, 1) })
        .next.key,
    ).toBe("templates");
  });
  it("requires every selected society sample and invalidates only its changed context or template", () => {
    const progress = letterSetupProgress(data);
    const viewed = data.templates.map(progress.sampleKey);
    expect(letterSetupProgress(data, viewed).completed).toBe(4);
    expect(
      letterSetupProgress(
        { ...data, setup: { ...data.setup, key: "new-period" } },
        viewed,
      ).next.key,
    ).toBe("samples");
    expect(
      letterSetupProgress(
        {
          ...data,
          templates: [
            data.templates[0],
            { ...data.templates[1], version: "replaced" },
          ],
        },
        viewed,
      ).next.key,
    ).toBe("samples");
    expect(letterSetupProgress(data, viewed.slice(0, 1)).completed).toBe(3);
  });
  it("opens a fictional sample only on demand and marks it viewed only after successful rendering", () => {
    const navigate = vi.fn(),
      viewed = vi.fn();
    render(
      <Checklist
        data={data}
        viewed={[]}
        onViewed={viewed}
        onNavigate={navigate}
        busy={false}
      />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(viewed).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Preview Order of the Dolphin sample",
      }),
    );
    expect(screen.getByText("Fictional sample")).toBeVisible();
    expect(viewed).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Finish loading sample" }),
    );
    expect(viewed).toHaveBeenCalledWith("source-key/ood/one");
    fireEvent.click(screen.getByRole("button", { name: "Close sample" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Edit query-field mappings" }),
    );
    expect(navigate).toHaveBeenCalledWith("fields");
  });
  it("keeps daily review compact and setup does not imply permission to send", () => {
    const navigate = vi.fn();
    render(<Checklist compact data={data} viewed={[]} onNavigate={navigate} />);
    expect(screen.getByText("Letter setup saved")).toBeVisible();
    expect(screen.queryByText("Next: sample preview.")).not.toBeInTheDocument();
    expect(
      screen.getByText(/Query settings and letters are saved/),
    ).toBeVisible();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Open setup checklist" }),
    );
    expect(navigate).toHaveBeenCalledWith("setup");
    expect(screen.queryByText(/ready to send/i)).not.toBeInTheDocument();
  });
  it("blocks sample actions when a template or current source is missing", () => {
    render(
      <Checklist
        data={{
          ...data,
          setup: { sourceConfigured: false },
          templates: [data.templates[0]],
        }}
        viewed={[]}
        onNavigate={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", {
        name: "Preview Order of the Dolphin sample",
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", {
        name: "Preview President's Society sample",
      }),
    ).toBeDisabled();
  });
});
