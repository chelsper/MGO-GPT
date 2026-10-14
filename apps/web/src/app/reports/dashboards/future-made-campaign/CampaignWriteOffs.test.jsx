import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import CampaignWriteOffs from "./CampaignWriteOffs";
afterEach(cleanup);
const csv="Gift Amount,Gift Type,Pledge Balance,Gf_System_ID,Write off\n100,Pledge,0,11,25\n50,MG Pledge,0,12,10";
const props=()=>({data:{version:7,config:{queryId:"27460",mode:"gift",columns:{giftType:"Gift Type"}}},pending:false,active:false,
  readFields:vi.fn(async()=>({fields:["Gift Amount","Gift Pledge Balance","Gift Type"]})),onSave:vi.fn(async()=>({saved:true,started:true})),onClose:vi.fn()});
const choose=async()=>{
  fireEvent.change(screen.getByLabelText("Write-off CSV"),{target:{files:[{size:csv.length,text:async()=>csv}]}});
  await screen.findByText(/2 unique pledges/);
};
it("suggests the balance column and previews totals without saving or refreshing",async()=>{
  const p=props(); render(<CampaignWriteOffs {...p}/>);
  await waitFor(()=>expect(screen.getByLabelText("Current balance field in campaign query")).toHaveValue("Gift Pledge Balance"));
  await choose();
  expect(screen.getByText("$35.00")).toBeInTheDocument();
  expect(screen.getByLabelText("Upload contains")).toHaveValue("complete");
  expect(screen.getByLabelText("Upload contains")).toBeDisabled();
  expect(screen.getByRole("button",{name:"Save write-offs and refresh campaign"})).toBeDisabled();
  expect(p.onSave).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button",{name:"Save write-offs and refresh campaign"}));
  await waitFor(()=>expect(p.onSave).toHaveBeenCalledWith(expect.objectContaining({csv,confirmed:true,complete:true,balanceColumn:"Gift Pledge Balance"}),7));
  expect(await screen.findByRole("status")).toHaveTextContent("Write-offs saved");
});
it("supports incremental uploads but resets approval when the date changes",async()=>{
  const p=props(); p.data.config.writeOffLedger={count:1,writeOffCents:2500,completeAsOf:"2026-10-14",latestAsOf:"2026-10-14"};
  render(<CampaignWriteOffs {...p}/>); await choose();
  expect(screen.getByLabelText("Upload contains")).toHaveValue("updates");
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.change(screen.getByLabelText("Write-offs through"),{target:{value:"2026-10-15"}});
  expect(screen.getByRole("checkbox")).not.toBeChecked();
});
it("keeps a failed import draft and distinguishes a saved import from a failed refresh",async()=>{
  const p=props(); p.onSave.mockResolvedValue(false);
  render(<CampaignWriteOffs {...p}/>); await choose();
  fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(screen.getByRole("button",{name:"Save write-offs and refresh campaign"}));
  await waitFor(()=>expect(p.onSave).toHaveBeenCalled());
  expect(screen.getByLabelText("Write-off CSV preview")).toBeInTheDocument();
  p.onSave.mockResolvedValue({saved:true,started:false});
  fireEvent.click(screen.getByRole("button",{name:"Save write-offs and refresh campaign"}));
  expect(await screen.findByText(/retry without re-uploading/)).toBeInTheDocument();
});
it("blocks new imports while another refresh is running",async()=>{
  render(<CampaignWriteOffs {...props()} active/>);
  await waitFor(()=>expect(screen.getByLabelText("Current balance field in campaign query")).toHaveValue("Gift Pledge Balance"));
  expect(screen.getByLabelText("Write-off CSV")).toBeDisabled();
  expect(screen.getByRole("button",{name:"Save write-offs and refresh campaign"})).toBeDisabled();
});
it("shows parse failures and never enables saving a malformed file",async()=>{
  const p=props(); render(<CampaignWriteOffs {...p}/>);
  fireEvent.change(screen.getByLabelText("Write-off CSV"),{target:{files:[{size:12,text:async()=>"bad,headers"}]}});
  expect(await screen.findByRole("alert")).toHaveTextContent("five CSV columns");
  expect(screen.getByRole("button",{name:"Save write-offs and refresh campaign"})).toBeDisabled();
  expect(p.onSave).not.toHaveBeenCalled();
});
