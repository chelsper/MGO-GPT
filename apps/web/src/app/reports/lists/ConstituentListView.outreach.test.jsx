import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
const mocks=vi.hoisted(()=>({list:vi.fn(),refresh:vi.fn()}));
vi.mock("./useConstituentList",()=>({default:mocks.list}));
vi.mock("@/app/reports/SharedReportHeader",()=>({default:({action})=><header>{action}</header>}));
vi.mock("@/components/ProjectOutreachPanel",()=>({default:({onReviewSource})=><button onClick={onReviewSource}>Go to list refresh</button>}));
vi.mock("@/components/ListRefreshStatus",()=>({default:()=>null,ListRefreshDetails:()=>null}));
import View from "./ConstituentListView";
import { report, snapshot } from "../../../../test/fixtures/projectOutreach";
beforeEach(()=>{
  vi.clearAllMocks();
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
