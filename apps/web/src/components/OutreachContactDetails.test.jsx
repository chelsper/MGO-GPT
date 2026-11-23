import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import Details, { OutreachPhoneSummary } from "./OutreachContactDetails";
let copy;
beforeEach(()=>{
  copy=vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator",{clipboard:{writeText:copy}});
  vi.stubGlobal("fetch",vi.fn(()=>{throw new Error("No network allowed");}));
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it("shows useful contact choices and copies only on request, without creating actions or email drafts", async ()=>{
  render(<Details person={{phones:["904-555-0100"],alternatePhones:["904-555-0101"],emails:["avery@example.test"]}}/>);
  expect(screen.getByRole("link",{name:"Call 904-555-0100"})).toHaveAttribute("href","tel:9045550100");
  expect(screen.getByRole("link",{name:"Call 904-555-0101"})).toHaveAttribute("href","tel:9045550101");
  expect(screen.queryByRole("link",{name:/email/i})).not.toBeInTheDocument();
  expect(copy).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:"Copy email avery@example.test"}));
  await screen.findByText("Email copied.");
  expect(copy).toHaveBeenCalledExactlyOnceWith("avery@example.test");
  expect(fetch).not.toHaveBeenCalled();
});
it("provides manual-copy fallback when clipboard permission is denied", async ()=>{
  copy.mockRejectedValue(new Error("Denied"));
  render(<Details person={{phones:["904-555-0100"]}}/>);
  fireEvent.click(screen.getByRole("button",{name:"Copy phone 904-555-0100"}));
  await screen.findByText(/Select the displayed text to copy it manually/);
  expect(screen.getByText("904-555-0100")).toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});
it("retains questionable phone text for review instead of constructing a dial command",()=>{
  render(<Details person={{phones:["5550100;123"]}}/>);
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  expect(screen.getByText(/could not be made into a safe call link/)).toBeInTheDocument();
  expect(screen.getByText("5550100;123")).toBeInTheDocument();
});
it("shows no empty alternate-phone or email controls",()=>{
  render(<Details person={{phones:[]}}/>);
  expect(screen.getByText(/No phone number in the mapped contact columns/)).toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(screen.queryByText("Email")).not.toBeInTheDocument();
});
it("keeps alternate-only numbers visible without a false missing-phone warning",()=>{
  render(<><OutreachPhoneSummary person={{phones:[],alternatePhones:["904-555-0100"]}}/><Details person={{phones:[],alternatePhones:["904-555-0100"]}}/></>);
  expect(screen.getByText("Alternate phone: 904-555-0100")).toBeInTheDocument();
  expect(screen.getByRole("link",{name:"Call 904-555-0100"})).toBeInTheDocument();
  expect(screen.queryByText(/No phone number/)).not.toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});
it("deduplicates overview numbers and never exposes a one-click call from the summary",()=>{
  render(<OutreachPhoneSummary person={{phones:["904-555-0100"],alternatePhones:["(904) 555-0100","9045550100 x2"],emails:["avery@example.test"]}}/>);
  expect(screen.getByText("904-555-0100 / Alternate phone: 9045550100 x2")).toBeInTheDocument();
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(screen.queryByText("avery@example.test")).not.toBeInTheDocument();
});
it("does not carry a late copy result into the next person's contact card",async()=>{
  let resolve;
  copy.mockImplementation(()=>new Promise(r=>{resolve=r;}));
  const view=render(<Details person={{phones:["904-555-0100"]}}/>);
  fireEvent.click(screen.getByRole("button",{name:"Copy phone 904-555-0100"}));
  view.rerender(<Details person={{phones:["904-555-0101"]}}/>);
  resolve();
  await waitFor(()=>expect(screen.getByRole("button",{name:"Copy phone 904-555-0101"})).toBeEnabled());
  expect(screen.queryByText("Phone copied.")).not.toBeInTheDocument();
});
