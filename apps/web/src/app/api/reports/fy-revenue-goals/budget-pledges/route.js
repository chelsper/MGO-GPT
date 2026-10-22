import { continueBudgetPledgeRefresh, inspectBudgetPledgeQuery, publicBudgetPledgeState, readBudgetPledgeState, startBudgetPledgeRefresh, savePledgeAdjustment } from "@/app/api/utils/fyBudgetPledges";
import { revenueTransport } from "@/app/api/utils/fyRevenueGoals";
import { requireRevenueContext, revenueHeaders as headers, revenueFailure, readRevenueCommand } from "@/app/api/utils/fyRevenueContext";
import { BUDGET_PLEDGE_QUERY_ID, validateBudgetPledgeSource } from "@/utils/fyBudgetPledges";
import { revenueError } from "@/utils/fyRevenueGoals";

export const maxDuration = 300;
export const dynamic = "force-dynamic";
export async function GET(request) {
  try {
    const { canManage } = await requireRevenueContext();
    const params = new URL(request.url).searchParams, page = params.get("page") || "1", search = params.get("search") || "";
    if ([...params.keys()].some(key => !["page", "search"].includes(key)) || !/^[1-9]\d{0,4}$/.test(page) || search.length > 150)
      throw revenueError("Use a valid installment page or a search of up to 150 characters.");
    const state = publicBudgetPledgeState(await readBudgetPledgeState(), { page: Number(page), search });
    return Response.json({ ...state, job: canManage ? state.job : null, canManage }, { headers });
  } catch (error) { return revenueFailure(error); }
}
export async function POST(request) {
  try {
    const { user, canManage } = await requireRevenueContext(true);
    const { body, origin } = await readRevenueCommand(request, ["fields", "refresh", "continue", "adjust", "reset-adjustment"]);
    if (["adjust", "reset-adjustment"].includes(body.operation)) {
      const state = await savePledgeAdjustment({ ...body, user });
      return Response.json({ ...publicBudgetPledgeState(state), canManage }, { headers });
    }
    const input = body.operation === "refresh" ? validateBudgetPledgeSource(body.input) : undefined;
    const transport = await revenueTransport(origin, BUDGET_PLEDGE_QUERY_ID);
    if (body.operation === "fields") return Response.json(inspectBudgetPledgeQuery(await transport.metadata()), { headers });
    const args = { input, revision: body.revision, user, transport };
    const state = body.operation === "refresh" ? await startBudgetPledgeRefresh(args) : await continueBudgetPledgeRefresh(args);
    return Response.json({ ...publicBudgetPledgeState(state), canManage }, { headers });
  } catch (error) { return revenueFailure(error); }
}
