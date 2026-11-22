import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import Panel from "./ProjectOutreachPanel";
import { report, saved, snapshot } from "../../test/fixtures/projectOutreach";

let state, requests, reply;
beforeEach(() => {
  state = structuredClone(saved);
  requests = [];
  reply = null;
  vi.stubGlobal("fetch", vi.fn(async (_url, options = {}) => {
    if (options.method !== "POST") return Response.json(state);
    requests.push(JSON.parse(options.body));
    return reply ? reply() : Response.json({error:"Fictional save rejected; no data changed."}, {status:409});
  }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function open() {
  render(<Panel report={report} snapshot={snapshot} />);
  fireEvent.click(await screen.findByRole("button", {name:"Record outcome",exact:true}));
  return screen.getByRole("form", {name:"Record outcome for Fictional Avery"});
}
const select = name => fireEvent.click(screen.getByRole("radio", {name, exact:true}));
const save = () => screen.getByRole("button", {name:"Save outcome only",exact:true});

it.each(["Reached", "Left voicemail", "No answer", "Follow-up needed", "Declined", "Contact issue"])("selects %s without recording or changing the next step", async name => {
  await open();
  const group = screen.getByRole("group", {name:"What happened?"});
  expect(within(group).getAllByRole("radio")).toHaveLength(6);
  expect(within(group).queryByRole("radio", {checked:true})).not.toBeInTheDocument();
  select(name);
  expect(within(group).getAllByRole("radio", {checked:true})).toHaveLength(1);
  expect(screen.getByRole("radio", {name,exact:true})).toBeChecked();
  expect(screen.getByLabelText("Next step")).toHaveValue("follow_up");
  expect(screen.getByLabelText("Follow-up date")).toHaveValue("");
  expect(screen.getByLabelText("Notes")).toHaveValue("");
  expect(screen.getByLabelText(/I reviewed contact/)).not.toBeChecked();
  expect(save()).toBeDisabled();
  expect(requests).toEqual([]);
});
it("switches the selected outcome without clearing notes, date, confirmation or explicit completion", async () => {
  await open();
  select("Reached");
  fireEvent.change(screen.getByLabelText("Notes"), {target:{value:"Actual fictional notes"}});
  fireEvent.click(screen.getByLabelText(/I reviewed contact/));
  fireEvent.click(screen.getByRole("button", {name:"Tomorrow",exact:true}));
  select("Left voicemail");
  expect(screen.getByRole("radio", {name:"Reached",exact:true})).not.toBeChecked();
  expect(screen.getByLabelText("Follow-up date")).toHaveValue("2026-11-21");
  fireEvent.change(screen.getByLabelText("Next step"), {target:{value:"complete"}});
  select("No answer");
  expect(screen.getByLabelText("Next step")).toHaveValue("complete");
  expect(screen.getByLabelText("Notes")).toHaveValue("Actual fictional notes");
  expect(screen.getByLabelText(/I reviewed contact/)).toBeChecked();
  expect(screen.queryByRole("button", {name:"Tomorrow",exact:true})).not.toBeInTheDocument();
  expect(requests).toEqual([]);
});
it("fills editable dates from JU's loaded date rather than a backdated interaction", async () => {
  state.today = "2026-12-31";
  await open();
  fireEvent.change(screen.getByLabelText("Interaction date"), {target:{value:"2026-11-20"}});
  fireEvent.click(screen.getByRole("button", {name:"Tomorrow",exact:true}));
  expect(screen.getByLabelText("Follow-up date")).toHaveValue("2027-01-01");
  fireEvent.click(screen.getByRole("button", {name:"Next week",exact:true}));
  expect(screen.getByLabelText("Follow-up date")).toHaveValue("2027-01-07");
  expect(screen.getByRole("button", {name:"Next week",exact:true})).toHaveAttribute("aria-pressed","true");
  expect(screen.getByRole("button", {name:"Tomorrow",exact:true})).toHaveAttribute("aria-pressed","false");
  fireEvent.change(screen.getByLabelText("Follow-up date"), {target:{value:"2027-01-15"}});
  expect(screen.getByRole("button", {name:"Next week",exact:true})).toHaveAttribute("aria-pressed","false");
  expect(screen.getByText(/2026-12-31, the JU date/)).toBeInTheDocument();
  expect(requests).toEqual([]);
});
it.each(["available", "missing", "rejected"])("Choose date focuses the editable date when the native picker is %s", async mode => {
  await open();
  const date = screen.getByLabelText("Follow-up date");
  const picker = vi.fn(() => { if (mode === "rejected") throw new Error("Unavailable"); });
  Object.defineProperty(date, "showPicker", {configurable:true,value:mode === "missing" ? undefined : picker});
  fireEvent.click(screen.getByRole("button", {name:"Tomorrow",exact:true}));
  fireEvent.click(screen.getByRole("button", {name:"Choose date",exact:true}));
  expect(date).toHaveFocus();
  expect(date).toHaveValue("2026-11-21");
  expect(picker).toHaveBeenCalledTimes(mode === "missing" ? 0 : 1);
  expect(requests).toEqual([]);
});
it("requires an outcome, notes, date and contact confirmation before either save", async () => {
  await open();
  fireEvent.change(screen.getByLabelText("Notes"), {target:{value:"Fictional conversation"}});
  fireEvent.click(screen.getByRole("button", {name:"Tomorrow",exact:true}));
  fireEvent.click(screen.getByLabelText(/I reviewed contact/));
  expect(save()).toBeDisabled();
  select("Reached");
  expect(save()).toBeEnabled();
  fireEvent.change(screen.getByLabelText("Notes"), {target:{value:" "}});
  expect(save()).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Notes"), {target:{value:"Fictional conversation"}});
  fireEvent.change(screen.getByLabelText("Follow-up date"), {target:{value:"2026-11-19"}});
  expect(save()).toBeDisabled();
  fireEvent.click(screen.getByRole("button", {name:"Next week",exact:true}));
  fireEvent.click(screen.getByLabelText(/I reviewed contact/));
  expect(save()).toBeDisabled();
  expect(screen.getByRole("button", {name:"Save & submit NXT action"})).toBeDisabled();
  expect(requests).toEqual([]);
});
it("records the unchanged outcome code only after an explicit save and disables shortcuts while busy", async () => {
  await open();
  select("Contact issue");
  fireEvent.click(screen.getByRole("button", {name:"Next week",exact:true}));
  fireEvent.change(screen.getByLabelText("Notes"), {target:{value:"Fictional correction; no call made"}});
  fireEvent.click(screen.getByLabelText(/I reviewed contact/));
  expect(screen.getByText(/Task\/Other/)).toBeInTheDocument();
  expect(requests).toEqual([]);
  let finish;
  reply = () => new Promise(resolve => { finish = resolve; });
  fireEvent.click(save());
  await waitFor(() => expect(requests).toHaveLength(1));
  for (const radio of screen.getAllByRole("radio")) expect(radio).toBeDisabled();
  for (const name of ["Tomorrow","Next week","Choose date"]) {
    expect(screen.getByRole("button", {name,exact:true})).toBeDisabled();
  }
  expect(requests[0]).toMatchObject({operation:"record",result:{outcome:"contact_issue",stage:"follow_up",nextDate:"2026-11-27",contactReviewed:true}});
  finish(Response.json({error:"Fictional save rejected"},{status:409}));
  await screen.findByRole("alert");
  expect(requests.map(r => r.operation)).toEqual(["record"]);
  expect(screen.getByRole("radio", {name:"Contact issue"})).toBeChecked();
  expect(screen.getByLabelText("Follow-up date")).toHaveValue("2026-11-27");
});
it("clears the follow-up date on explicit completion, without restoring an old shortcut", async () => {
  await open();
  fireEvent.click(screen.getByRole("button", {name:"Tomorrow",exact:true}));
  fireEvent.change(screen.getByLabelText("Next step"), {target:{value:"complete"}});
  fireEvent.change(screen.getByLabelText("Next step"), {target:{value:"follow_up"}});
  expect(screen.getByLabelText("Follow-up date")).toHaveValue("");
  expect(screen.getByRole("button", {name:"Tomorrow",exact:true})).toHaveAttribute("aria-pressed","false");
  expect(requests).toEqual([]);
});
