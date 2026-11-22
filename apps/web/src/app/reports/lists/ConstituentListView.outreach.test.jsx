import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
const mocks=vi.hoisted(()=>({list:vi.fn(),refresh:vi.fn()}));
vi.mock("./useConstituentList",()=>({default:mocks.list}));
vi.mock("@/app/reports/SharedReportHeader",()=>({default:({action,backHref,backLabel})=><header><a href={backHref}>{backLabel}</a>{action}</header>}));
vi.mock("@/components/ProjectOutreachPanel",()=>({default:({onReviewSource})=><button onClick={onReviewSource}>Go to list refresh</button>}));
vi.mock("@/components/ListRefreshStatus",()=>({default:()=>null,ListRefreshDetails:()=>null}));
import View from "./ConstituentListView";
import { report, snapshot } from "../../../../test/fixtures/projectOutreach";
beforeEach(()=>{
  vi.clearAllMocks();
  window.history.replaceState({}, "", "/project-outreach/list-fictional-outreach");
  Element.prototype.scrollIntoView=vi.fn();
  mocks.list.mockReturnValue({data:{report:{...report,canConfigure:true},snapshot},refresh:mocks.refresh,reload:vi.fn()});
});
afterEach(cleanup);
it("takes staff to the refresh control without starting a query",()=>{
  render(<View params={{listKey:report.key}} projectRoute outreachRoute/>);
  fireEvent.click(screen.getByRole("button",{name:"Go to list refresh"}));
  expect(screen.getByRole("button",{name:"Refresh list"})).toHaveFocus();
  expect(mocks.refresh).not.toHaveBeenCalled();
});
it("targets the specific project configuration when a query needs setup",()=>{
  mocks.list.mockReturnValue({data:{report:{...report,canConfigure:true},refresh:{status:"needs_configuration"}},refresh:mocks.refresh});
  render(<View params={{listKey:report.key}} projectRoute outreachRoute/>);
  fireEvent.click(screen.getByRole("button",{name:"Go to list refresh"}));
  const link=screen.getByRole("link",{name:"List settings"});
  expect(link).toHaveFocus();
  expect(link).toHaveAttribute("href",`/report-configurations?report=${report.key}&tab=Configure`);
  expect(mocks.refresh).not.toHaveBeenCalled();
});
it("returns to Tasks and preserves that origin between project tabs",()=>{
  window.history.replaceState({}, "", `/project-outreach/${report.key}?from=tasks`);
  render(<View params={{listKey:report.key}} projectRoute outreachRoute/>);
  expect(screen.getByRole("link", {name:"Back to My Tasks"})).toHaveAttribute("href", "/tasks");
  expect(screen.getByRole("link", {name:"List & tags"})).toHaveAttribute("href", `/reports/project-prospecting/${report.key}?from=tasks`);
  expect(screen.getByRole("link", {name:"Outreach assignments"})).toHaveAttribute("href", `/project-outreach/${report.key}?from=tasks`);
  expect(mocks.refresh).not.toHaveBeenCalled();
});
it.each(["", "?from=https://external.test", "?from=//external.test"])("preserves direct project navigation for %s",query=>{
  window.history.replaceState({}, "", `/project-outreach/${report.key}${query}`);
  render(<View params={{listKey:report.key}} projectRoute outreachRoute/>);
  expect(screen.getByRole("link", {name:"Back to Project Outreach"})).toHaveAttribute("href", "/project-outreach");
  expect(screen.queryByRole("link", {name:"Back to My Tasks"})).not.toBeInTheDocument();
});
