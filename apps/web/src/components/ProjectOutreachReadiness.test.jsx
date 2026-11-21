import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import Readiness from "./ProjectOutreachReadiness";
import { report, snapshot, saved } from "../../test/fixtures/projectOutreach";
afterEach(cleanup);
const manager={...saved,canManage:true,callers:[{id:8,name:"Fictional Caller"}],nxtReadiness:{state:"saved",checkedAt:"2026-11-21T15:00:00Z",callers:[{id:8,name:"Fictional Caller",connection:"not_connected",fundraiserMapped:false}]}};
function show(state=manager,extra={}) {
  const onSetup=vi.fn(),onReviewSource=vi.fn();
  render(<Readiness report={report} snapshot={snapshot} saved={state} onSetup={onSetup} onReviewSource={onReviewSource} {...extra}/>);
  fireEvent.click(screen.getByText(/Setup & readiness/));
  return {onSetup,onReviewSource};
}
it("links directly to the current project's mappings and access without refreshing", () => {
  const {onSetup,onReviewSource}=show();
  expect(screen.getByRole("link",{name:"Map system ID"})).toHaveAttribute("href","/report-configurations?report=list-fictional-outreach&tab=Configure");
  expect(screen.getByRole("link",{name:"Review project access"})).toHaveAttribute("href","/report-configurations?report=list-fictional-outreach&tab=Access");
  fireEvent.click(screen.getByRole("button",{name:"Edit phone numbers"}));
  expect(onSetup).toHaveBeenCalledWith("phoneColumn");
  fireEvent.click(screen.getByRole("button",{name:"Go to list refresh"}));
  expect(onReviewSource).toHaveBeenCalledTimes(1);
});
it("states the saved-only limitation and directs callers to their own settings", () => {
  show();
  expect(screen.getByText(/This is not a live NXT check/)).toBeInTheDocument();
  expect(screen.getByText(/No saved NXT connection/)).toBeInTheDocument();
  expect(screen.getByText("Save outcome only")).toBeInTheDocument();
  expect(screen.getByRole("link",{name:"My NXT settings"})).toHaveAttribute("href","/settings");
  expect(screen.queryByRole("link",{name:"Admin account setup"})).not.toBeInTheDocument();
});
it("does not give a caller manager controls or expose unrelated connection information", () => {
  show({...manager,canManage:false,callers:[]});
  expect(screen.queryByRole("link",{name:"Review project access"})).not.toBeInTheDocument();
  expect(screen.queryByRole("button",{name:/Edit/})).not.toBeInTheDocument();
  expect(screen.getByRole("heading",{name:"Your NXT setup"})).toBeInTheDocument();
});
it("keeps unavailable advisory status distinct from failed outreach and shows admin link only when allowed", () => {
  show({...manager,nxtReadiness:{state:"unavailable"},canManageAccounts:true});
  expect(screen.getByText(/Saved connection status is unavailable. Local outreach still works/)).toBeInTheDocument();
  expect(screen.getByRole("link",{name:"Admin account setup"})).toHaveAttribute("href","/access-management#workspace-users");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
