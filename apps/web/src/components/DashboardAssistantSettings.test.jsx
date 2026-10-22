import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import DashboardAssistantSettings from "./DashboardAssistantSettings";
import { DEFAULT_DASHBOARD_ASSISTANT } from "@/utils/dashboardAssistantSettings";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function Editor() {
  const [value, setValue] = useState(DEFAULT_DASHBOARD_ASSISTANT);
  return <DashboardAssistantSettings value={value} onChange={setValue} />;
}
const expand = text => fireEvent.click(screen.getByText(text, { selector: "summary" }));
it("previews tone and approved wording locally without donor data or saving", () => {
  vi.stubGlobal("fetch", vi.fn()); render(<Editor />);
  expand("Draft tone & thank-you wording");
  fireEvent.change(screen.getByLabelText("Preferred draft tone"), { target: { value: "professional" } });
  const preview = screen.getByLabelText("Sample thank-you preview");
  expect(preview).toHaveTextContent("With appreciation,");
  expect(preview).toHaveTextContent("$2,500.00");
  fireEvent.change(screen.getByLabelText(/Organization-approved thank-you wording/), { target: { value: "We value your support.\nPlease stay in touch." } });
  expect(preview).toHaveTextContent("We value your support.");
  expect(preview).toHaveTextContent("[Preferred greeting]");
  expect(preview).toHaveTextContent("[Your name]");
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText(/Organization-approved thank-you wording/), { target: { value: "" } });
  expect(preview).not.toHaveTextContent("We value your support.");
  expect(preview).toHaveTextContent("We appreciate your support.");
});
it("keeps unfinished inputs visible, explains invalid thresholds, and never resets other edits", () => {
  render(<Editor />); expand("Reminder timing & gift thresholds");
  const gifts = screen.getByLabelText(/Suggest stewardship for gifts over/);
  fireEvent.change(gifts, { target: { value: "" } });
  fireEvent.change(screen.getByLabelText("Helper name"), { target: { value: "Guide" } });
  expect(gifts).toHaveValue(null);
  expect(screen.getByRole("alert")).toHaveTextContent("whole number");
  fireEvent.change(gifts, { target: { value: "10000" } });
  expect(screen.getByRole("alert")).toHaveTextContent("must be higher");
  fireEvent.change(screen.getByLabelText(/Offer documentation checks/), { target: { value: "20000" } });
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByLabelText("Helper name")).toHaveValue("Guide");
});
it("respects the existing form save lock and renders wording as plain text", () => {
  render(<DashboardAssistantSettings disabled value={{ ...DEFAULT_DASHBOARD_ASSISTANT, thankYouMessage: "<img src=x onerror=alert(1)>" }} onChange={vi.fn()} />);
  expand("Draft tone & thank-you wording");
  expect(screen.getByLabelText("Preferred draft tone")).toBeDisabled();
  expect(screen.getByLabelText(/Organization-approved thank-you wording/)).toBeDisabled();
  const preview = screen.getByLabelText("Sample thank-you preview");
  expect(within(preview).getByText(/<img src=x/)).toBeVisible();
  expect(preview.querySelector("img")).toBeNull();
});
