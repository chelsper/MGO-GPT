import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import CampaignOverview from "./CampaignOverview";
import CampaignFiscalYears from "./CampaignFiscalYears";
import Setup from "./CampaignInvestmentSetup";

function fixture() {
  return {runId:"saved",originalCents:31000,effectiveCents:30000,netCents:30000,writeOffCents:1000,pledgeBalanceCents:7000,uniqueRows:3,rawRows:4,
    segments:{fiscalYearStartMonth:7,committed:{status:"ready",cents:30000},received:{status:"ready",cents:23000},
      classification:{status:"ready",investmentCents:11000,philanthropicCents:19000,investmentReceivedCents:9000,philanthropicReceivedCents:14000},
      budgetRelieving:{status:"ready",queryId:"31072",cents:23000,receivedCents:20000,otherCents:7000,otherReceivedCents:3000},
      fiscalYears:[
        {fiscal_year:2027,effective_cents:10000,received_cents:8000,investment_cents:3000,philanthropic_cents:7000,investment_received_cents:3000,philanthropic_received_cents:5000,
          budget_relieving_cents:7000,other_budget_cents:3000,budget_relieving_received_cents:6000,other_budget_received_cents:2000},
        {fiscal_year:2026,effective_cents:20000,received_cents:15000,investment_cents:8000,philanthropic_cents:12000,investment_received_cents:6000,philanthropic_received_cents:9000,
          budget_relieving_cents:16000,other_budget_cents:4000,budget_relieving_received_cents:14000,other_budget_received_cents:1000},
      ]}};
}
const row=()=>screen.getByRole("img",{name:/^FY2027:/});
const toggle=(group,name)=>within(screen.getByRole("group",{name:group})).getByRole("button",{name,exact:true});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});

it("shows a separate budget subset and does not add it to campaign or philanthropic totals",()=>{
  render(<CampaignOverview data={fixture()}/>);
  expect(screen.getByRole("article",{name:"Committed campaign total"})).toHaveTextContent("$300.00");
  const budget=within(screen.getByRole("table",{name:"Budget Relieving campaign totals"}));
  expect(budget.getByRole("row",{name:"Budget Relieving $230.00 $200.00"})).toBeInTheDocument();
  expect(budget.getByRole("row",{name:"Other campaign giving $70.00 $30.00"})).toBeInTheDocument();
  expect(screen.getByRole("table",{name:"Campaign investment and philanthropic totals"})).toHaveTextContent("Philanthropic$190.00$140.00");
  expect(screen.getByText(/may overlap Comprehensive Investment or Philanthropic giving/)).toBeVisible();
  expect(screen.getByRole("img",{name:/^Committed budget relief/})).toHaveAccessibleName(/Budget Relieving \$230.00 \(76.7%\)/);
});
it("keeps Budget Relieving, composition, and fiscal-year revenue toggles independent without requests",()=>{
  const fetch=vi.fn();vi.stubGlobal("fetch",fetch);
  render(<><CampaignOverview data={fixture()}/><CampaignFiscalYears data={fixture()}/></>);
  fireEvent.click(toggle("Budget Relieving view","Received to date"));
  expect(screen.getByRole("img",{name:/^Received to date budget relief/})).toHaveAccessibleName(/Budget Relieving \$200.00 \(87%\)/);
  expect(toggle("Campaign composition view","Committed")).toHaveAttribute("aria-pressed","true");
  expect(toggle("Fiscal-year chart view","Committed")).toHaveAttribute("aria-pressed","true");
  expect(fetch).not.toHaveBeenCalled();
});
it("uses the same fiscal chart scale and coordinates the budget chart with exact details",()=>{
  render(<CampaignFiscalYears data={fixture()}/>);
  fireEvent.change(screen.getByLabelText("Fiscal-year chart breakdown"),{target:{value:"budgetRelieving"}});
  expect(row()).toHaveAccessibleName(/Other campaign giving \$30.00; Budget Relieving \$70.00/);
  expect(row().querySelectorAll('div[aria-hidden="true"] > span')).toHaveLength(2);
  expect(row().querySelectorAll('div[aria-hidden="true"] > span')[1]).toHaveStyle({width:"35%"});
  fireEvent.click(screen.getByText("View fiscal-year details"));
  expect(screen.getByLabelText("Fiscal-year view")).toHaveValue("budgetRelieving");
  expect(screen.getByRole("table",{name:"Fiscal-year Budget Relieving totals"})).toHaveTextContent("Campaign total$300.00$230.00$70.00$230.00$200.00$30.00");
  fireEvent.click(toggle("Fiscal-year chart view","Received to date"));
  expect(row()).toHaveAccessibleName(/Received to date \$80.00. Other campaign giving \$20.00; Budget Relieving \$60.00/);
  expect(row().querySelectorAll('div[aria-hidden="true"] > span')[1]).toHaveStyle({width:"30%"});
  fireEvent.change(screen.getByLabelText("Fiscal-year view"),{target:{value:"classification"}});
  expect(screen.getByLabelText("Fiscal-year chart breakdown")).toHaveValue("investment");
  expect(row()).toHaveAccessibleName(/Comprehensive Investment/);
  fireEvent.change(screen.getByLabelText("Fiscal-year view"),{target:{value:"amounts"}});
  fireEvent.change(screen.getByLabelText("Fiscal-year chart breakdown"),{target:{value:"budgetRelieving"}});
  expect(screen.getByRole("table",{name:"Fiscal-year campaign recognition"})).toBeInTheDocument();
});
it("defaults to the available budget breakdown without requiring investment classification",()=>{
  const data=fixture();delete data.segments.classification;
  render(<CampaignFiscalYears data={data}/>);
  expect(row()).toHaveAccessibleName(/Budget Relieving/);
  expect(screen.getByLabelText("Fiscal-year chart breakdown")).toHaveValue("budgetRelieving");
});
it.each(["missing","negative","unreconciled"])("does not draw misleading budget proportions for %s values",problem=>{
  const data=fixture();
  data.segments.budgetRelieving.cents=problem==="missing" ? null : problem==="negative" ? -100 : 22000;
  if(problem==="negative")data.segments.budgetRelieving.otherCents=30100;
  render(<CampaignOverview data={data}/>);
  expect(screen.queryByRole("img",{name:/budget relief/})).not.toBeInTheDocument();
  expect(screen.getByRole("table",{name:"Budget Relieving campaign totals"})).toBeInTheDocument();
  expect(screen.getByRole("img",{name:/campaign composition/})).toBeInTheDocument();
});
it("keeps budget fiscal bars total-only if category amounts fail reconciliation",()=>{
  const data=fixture();data.segments.fiscalYears[0].budget_relieving_cents=1;
  render(<CampaignFiscalYears data={data}/>);
  fireEvent.change(screen.getByLabelText("Fiscal-year chart breakdown"),{target:{value:"budgetRelieving"}});
  expect(screen.getByText(/Category amounts cannot be reconciled/)).toBeInTheDocument();
  expect(row()).not.toHaveAccessibleName(/Budget Relieving/);
  expect(row().querySelectorAll('div[aria-hidden="true"] > span')).toHaveLength(1);
});
it("distinguishes not configured, verified zero, and missing received data",()=>{
  const data=fixture();data.segments.budgetRelieving={status:"source_needed",cents:null};
  const {rerender}=render(<CampaignOverview data={data}/>);
  expect(screen.queryByRole("table",{name:"Budget Relieving campaign totals"})).not.toBeInTheDocument();
  data.segments.budgetRelieving={status:"ready",cents:0,otherCents:30000,receivedCents:null,otherReceivedCents:null};
  data.segments.received={status:"source_needed",cents:null};
  rerender(<CampaignOverview data={data}/>);
  const table=screen.getByRole("table",{name:"Budget Relieving campaign totals"});
  expect(table).toHaveTextContent("Budget Relieving$0.00");
  expect(within(table).queryByText("Received to date")).not.toBeInTheDocument();
  expect(toggle("Budget Relieving view","Received to date")).toBeDisabled();
});
it("defaults budget setup to 31072 and saves only confirmed gift-ID metadata",async()=>{
  const readFields=vi.fn().mockResolvedValue({queryId:"31072",queryName:"Budget Relieving",fields:["Gift ID","Gift Import ID","System Record ID","Gift Amount"]});
  const command=vi.fn().mockResolvedValue(true),close=vi.fn();
  render(<Setup kind="budgetRelieving" data={{version:7,config:{investment:{queryId:"31071"}}}} readFields={readFields} command={command} onClose={close}/>);
  expect(screen.getByLabelText("Budget Relieving query ID")).toHaveValue("31072");expect(readFields).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:"Load classification fields"}));await screen.findByRole("status");
  expect(screen.getByLabelText("Classification gift system record ID")).toHaveValue("System Record ID");
  fireEvent.click(screen.getByRole("checkbox"));fireEvent.click(screen.getByRole("button",{name:"Save classification query"}));
  await act(async()=>{});
  expect(command).toHaveBeenCalledExactlyOnceWith("budgetRelieving",{queryId:"31072",queryName:"Budget Relieving",giftIdColumn:"System Record ID",confirmed:true},{_version:7});
  expect(close).toHaveBeenCalledTimes(1);
});
