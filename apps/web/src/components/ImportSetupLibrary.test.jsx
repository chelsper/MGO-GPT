import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ImportSetupLibrary from "./ImportSetupLibrary";

const configuration = { name: "Contacts", mappings: { email: "Email" }, defaults: { importIntent: "new", updateEmailFields: true } };
const setup = { id: "12", revision: 2, configuration };
const json = (body, ok = true) => ({ ok, json: async () => body });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function mount(props = {}) {
  const handlers = { onSelect: vi.fn(), onSaved: vi.fn(), onBusyChange: vi.fn() };
  render(<ImportSetupLibrary configuration={configuration} selected={setup} canSave {...handlers} {...props} />);
  return handlers;
}
async function loaded() {
  await waitFor(() => expect(screen.getByRole("button", { name: "Reload setups" })).toBeEnabled());
  fireEvent.click(screen.getByText("Save or manage a setup"));
}
it("does not apply any saved configuration until it is chosen", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => json({ setups: [setup] })));
  const handlers = mount({ selected: null }); await loaded();
  expect(screen.getByLabelText("Your saved setups")).toHaveValue("");
  expect(handlers.onSelect).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Your saved setups"), { target: { value: "12" } });
  expect(handlers.onSelect).toHaveBeenCalledWith(setup);
  expect(fetch.mock.calls.every(([, init]) => !init.method)).toBe(true);
});
it("keeps the draft after a failed load and offers retry", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new Error("Service unavailable")).mockResolvedValue(json({ setups: [setup] })));
  const handlers = mount();
  expect(await screen.findByRole("alert")).toHaveTextContent("Service unavailable");
  fireEvent.click(screen.getByRole("button", { name: "Reload setups" }));
  await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  expect(handlers.onSelect).not.toHaveBeenCalled();
});
it("requires confirmation for removal and never clears the current import draft", async () => {
  vi.stubGlobal("fetch", vi.fn(async (_, init) => json(init.method ? { deleted: true } : { setups: [setup] })));
  vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
  const handlers = mount(); await loaded();
  fireEvent.click(screen.getByRole("button", { name: "Remove setup" }));
  expect(fetch).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Remove setup" }));
  await screen.findByText(/Setup removed/);
  expect(handlers.onSelect).not.toHaveBeenCalled();
  expect(handlers.onSaved).toHaveBeenCalledWith(null);
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ id: "12", revision: 2 });
  expect(handlers.onBusyChange.mock.calls).toEqual([[true], [false]]);
});
it("preserves the current selection and edited name on a stale revision", async () => {
  vi.stubGlobal("fetch", vi.fn(async (_, init) => init.method ? json({ error: "This setup changed. Reload your setups." }, false) : json({ setups: [setup] })));
  const handlers = mount(); await loaded();
  fireEvent.change(screen.getByLabelText("Setup name"), { target: { value: "Edited contacts" } });
  fireEvent.click(screen.getByRole("button", { name: "Update selected setup" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("This setup changed");
  expect(screen.getByLabelText("Setup name")).toHaveValue("Edited contacts");
  expect(handlers.onSaved).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Reload setups" })).toBeEnabled();
});
it("disables configuration changes during import work", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => json({ setups: [setup] })));
  mount({ disabled: true });
  await screen.findByRole("option", { name: "Contacts" });
  fireEvent.click(screen.getByText("Save or manage a setup"));
  expect(screen.getByLabelText("Your saved setups")).toBeDisabled();
  for (const name of ["Save as new setup", "Update selected setup", "Remove setup"]) expect(screen.getByRole("button", { name })).toBeDisabled();
});

it("requires loading the latest configuration after a revision conflict, not just silently accepting its new revision", async () => {
  let current = setup;
  vi.stubGlobal("fetch", vi.fn(async () => json({ setups: [current] })));
  const handlers = mount(); await loaded();
  current = { ...setup, revision: 3, configuration: { ...configuration, name: "Changed elsewhere" } };
  fireEvent.click(screen.getByRole("button", { name: "Reload setups" }));
  const reload = await screen.findByRole("button", { name: "Load current saved setup" });
  expect(screen.getByRole("button", { name: "Update selected setup" })).toBeDisabled();
  expect(handlers.onSelect).not.toHaveBeenCalled();
  fireEvent.click(reload);
  expect(handlers.onSelect).toHaveBeenCalledWith(current);
});
