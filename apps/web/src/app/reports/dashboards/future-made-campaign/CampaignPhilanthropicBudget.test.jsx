import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import CampaignOverview from "./CampaignOverview";
import CampaignFiscalYears from "./CampaignFiscalYears";
import CampaignPhilanthropicBudget from "./CampaignPhilanthropicBudget";
import { campaignPartShare } from "./campaignBreakdown";

function fixture() {
  return {runId:"saved",effectiveCents:30000,originalCents:31000,netCents:30000,writeOffCents:1000,pledgeBalanceCents:7000,uniqueRows:3,rawRows:4,segments:{fiscalYearStartMonth:7,
    committed:{status:"ready",cents:30000},received:{status:"ready",cents:23000},
    classification:{status:"ready",investmentCents:11000,philanthropicCents:19000,investmentReceivedCents:9000,philanthropicReceivedCents:14000},
    budgetRelieving:{status:"ready",cents:23000,otherCents:7000,receivedCents:20000,otherReceivedCents:3000},
    budgetPhilanthropic:{status:"ready",cents:13000,otherCents:6000,receivedCents:11000,otherReceivedCents:3000},
    fiscalYears:[
      {fiscal_year:2027,effective_cents:10000,received_cents:8000,investment_cents:3000,philanthropic_cents:7000,investment_received_cents:3000,philanthropic_received_cents:5000,
        budget_relieving_cents:7000,other_budget_cents:3000,budget_relieving_received_cents:6000,other_budget_received_cents:2000,
        budget_philanthropic_cents:4000,other_philanthropic_cents:3000,budget_philanthropic_received_cents:3000,other_philanthropic_received_cents:2000},
      {fiscal_year:2026,effective_cents:20000,received_cents:15000,investment_cents:8000,philanthropic_cents:12000,investment_received_cents:6000,philanthropic_received_cents:9000,
        budget_relieving_cents:16000,other_budget_cents:4000,budget_relieving_received_cents:14000,other_budget_received_cents:1000,
        budget_philanthropic_cents:9000,other_philanthropic_cents:3000,budget_philanthropic_received_cents:8000,other_philanthropic_received_cents:1000},
    ]}};
}
const card = label => screen.getByRole("article",{name:`${label} Budget Relieving share of Philanthropic giving`});
const select = () => fireEvent.change(screen.getByLabelText("Fiscal-year chart breakdown"),{target:{value:"budgetPhilanthropic"}});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});

it("shows both philanthropic shares without changing the all-campaign budget view or totals",()=>{
  const fetch=vi.fn();vi.stubGlobal("fetch",fetch);
  render(<CampaignOverview data={fixture()}/>);
  expect(card("Committed")).toHaveTextContent("$130.00of $190.00 in Philanthropic giving68.4%");
  expect(card("Received to date")).toHaveTextContent("$110.00of $140.00 in Philanthropic giving78.6%");
  expect(screen.getByRole("table",{name:"Budget Relieving campaign totals"})).toHaveTextContent("Budget Relieving$230.00$200.00");
  expect(screen.getByRole("article",{name:"Committed campaign total"})).toHaveTextContent("$300.00");
  expect(screen.getByText(/Only gifts outside Comprehensive Investment/)).toBeVisible();
  expect(fetch).not.toHaveBeenCalled();
});
it("uses philanthropic denominators and preserves the same scale across committed and received fiscal views",()=>{
  const fetch=vi.fn();vi.stubGlobal("fetch",fetch);
  render(<CampaignFiscalYears data={fixture()}/>);select();
  const row=screen.getByRole("img",{name:/^FY2027:/});
  expect(row).toHaveAccessibleName(/Committed Philanthropic \$70.00.*Budget Relieving \$40.00.*57.1%/);
  expect(screen.getByText("Budget Relieving: $40.00 (57.1% of Philanthropic giving)")).toBeVisible();
  fireEvent.click(screen.getByText("View fiscal-year details"));
  expect(screen.getByLabelText("Fiscal-year view")).toHaveValue("budgetPhilanthropic");
  const table=screen.getByRole("table",{name:"Fiscal-year Budget Relieving share of Philanthropic giving"});
  expect(table).toHaveTextContent("Philanthropic total$190.00$130.00$60.0068.4%$140.00$110.00$30.0078.6%");
  fireEvent.click(within(screen.getByRole("group",{name:"Fiscal-year chart view"})).getByRole("button",{name:"Received to date"}));
  expect(row).toHaveAccessibleName(/Received to date Philanthropic \$50.00.*Budget Relieving \$30.00.*60%/);
  expect(row.querySelectorAll('div[aria-hidden="true"] > span')[1]).toHaveStyle({width:"25%"});
  fireEvent.change(screen.getByLabelText("Fiscal-year view"),{target:{value:"budgetRelieving"}});
  expect(screen.getByLabelText("Fiscal-year chart breakdown")).toHaveValue("budgetRelieving");
  expect(row).toHaveAccessibleName(/Received to date \$80.00.*Budget Relieving \$60.00/);
  expect(fetch).not.toHaveBeenCalled();
});
it.each(["classification","budgetRelieving","budgetPhilanthropic"])("requires verified %s rather than displaying a false zero",key=>{
  const data=fixture();data.segments[key]={status:"source_needed"};
  render(<><CampaignPhilanthropicBudget data={data}/><CampaignFiscalYears data={data}/></>);
  expect(screen.getByText(/Missing classifications are not treated as zero/)).toBeInTheDocument();
  expect(screen.queryByRole("article",{name:/Budget Relieving share/})).not.toBeInTheDocument();
  expect(screen.queryByRole("option",{name:"Budget Relieving within Philanthropic giving"})).not.toBeInTheDocument();
});
it("distinguishes a verified zero share, a zero denominator, and missing received data",()=>{
  const data=fixture();data.segments.budgetPhilanthropic.cents=0;data.segments.budgetPhilanthropic.otherCents=19000;
  const {rerender}=render(<CampaignPhilanthropicBudget data={data}/>);
  expect(card("Committed")).toHaveTextContent("0% of Philanthropic giving");
  data.segments.classification.philanthropicCents=0;data.segments.budgetPhilanthropic.otherCents=0;
  data.segments.received={status:"source_needed"};
  rerender(<CampaignPhilanthropicBudget data={data}/>);
  expect(card("Committed")).toHaveTextContent("No percentage: the Philanthropic total is $0.00");
  expect(screen.queryByRole("article",{name:/Received to date Budget/})).not.toBeInTheDocument();
  expect(screen.getByText(/Received share needs saved pledge-balance data/)).toBeInTheDocument();
});
it.each(["negative","missing","mismatch"])("withholds percentages for %s data while keeping exact values",problem=>{
  const data=fixture();
  data.segments.budgetPhilanthropic.cents=problem==="negative" ? -100 : problem==="missing" ? null : 14000;
  if(problem==="negative")data.segments.budgetPhilanthropic.otherCents=19100;
  render(<CampaignPhilanthropicBudget data={data}/>);
  expect(card("Committed")).toHaveTextContent("Percentage unavailable");
  expect(card("Committed")).not.toHaveTextContent("% of");
});
it("does not use campaign totals as a fallback when philanthropic fiscal amounts are incomplete",()=>{
  const data=fixture();delete data.segments.fiscalYears[0].philanthropic_cents;
  render(<CampaignFiscalYears data={data}/>);select();
  expect(screen.getByText(/Some fiscal-year amounts are unavailable/)).toBeInTheDocument();
  const row=screen.getByRole("img",{name:/^FY2027:/});
  expect(row.querySelectorAll('div[aria-hidden="true"] > span')).toHaveLength(0);
  expect(row).not.toHaveAccessibleName(/\$100.00/);
});
it("withholds a fiscal percentage if that year's subsets or overall classification totals do not reconcile",()=>{
  const data=fixture();data.segments.fiscalYears[0].budget_philanthropic_cents=4001;
  render(<CampaignFiscalYears data={data}/>);select();
  expect(screen.getByText(/Category amounts cannot be reconciled/)).toBeInTheDocument();
  expect(screen.getByText("Budget Relieving: $40.01 (percentage unavailable)")).toBeVisible();
  expect(screen.getByRole("img",{name:/^FY2027:/})).not.toHaveAccessibleName(/57.1%/);
});
it.each([
  [1,9999,10000,"<0.1%"],[9999,1,10000,">99.9%"],[500,0,500,"100%"],
  [0,500,500,"0%"],[0,0,0,null],[-1,501,500,null],[1,null,500,null],
  [500,1,500,null],[Number.MAX_SAFE_INTEGER,1,Number.MAX_SAFE_INTEGER,null],
])("safely formats share %s / %s / %s",(amount,other,total,expected)=>{
  expect(campaignPartShare(amount,other,total)).toBe(expected);
});
