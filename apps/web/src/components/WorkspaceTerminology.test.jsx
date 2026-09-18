import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { WorkspaceTerminologyProvider, useWorkspaceLabels } from "./WorkspaceTerminology";

function Editor() {
  const labels = useWorkspaceLabels();
  const [draft, setDraft] = useState("");
  return <><p>{labels.mgo} / {labels.executive}</p><input aria-label="Draft" value={draft} onChange={event => setDraft(event.target.value)} /></>;
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("uses existing defaults before settings load, without a settings request", () => {
  vi.stubGlobal("fetch", vi.fn());
  render(<Editor />);
  expect(screen.getByText("MGO / Executive")).toBeVisible();
  expect(fetch).not.toHaveBeenCalled();
});

it("updates display labels without remounting drafts, fetching, or rendering labels as markup", () => {
  vi.stubGlobal("fetch", vi.fn());
  const view = render(<WorkspaceTerminologyProvider><Editor /></WorkspaceTerminologyProvider>);
  fireEvent.change(screen.getByLabelText("Draft"), { target: { value: "Unsaved follow-up" } });
  view.rerender(<WorkspaceTerminologyProvider terminology={{ mgo: " <b>Gift Officer</b> ", executive: "Leadership" }}><Editor /></WorkspaceTerminologyProvider>);
  expect(screen.getByText("<b>Gift Officer</b> / Leadership")).toBeVisible();
  expect(view.container.querySelector("b")).toBeNull();
  expect(screen.getByLabelText("Draft")).toHaveValue("Unsaved follow-up");
  view.rerender(<WorkspaceTerminologyProvider terminology={{ mgo: " " }}><Editor /></WorkspaceTerminologyProvider>);
  expect(screen.getByText("MGO / Executive")).toBeVisible();
  expect(fetch).not.toHaveBeenCalled();
});
