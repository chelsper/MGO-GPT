import { inspectBudgetCashQuery, readBudgetCashState, refreshBudgetCash } from "@/app/api/utils/fyBudgetCash";
import { publicRevenueState, revenueTransport } from "@/app/api/utils/fyRevenueGoals";
import { requireRevenueContext, revenueHeaders as headers, revenueFailure, readRevenueCommand } from "@/app/api/utils/fyRevenueContext";
import { BUDGET_CASH_QUERY_ID, validateBudgetCashSource } from "@/utils/fyBudgetCash";

export const maxDuration = 300;
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const { canManage } = await requireRevenueContext();
    return Response.json({ ...publicRevenueState(await readBudgetCashState()), canManage }, { headers });
  } catch (error) { return revenueFailure(error); }
}
export async function POST(request) {
  try {
    const { user, canManage } = await requireRevenueContext(true);
    const { body, origin } = await readRevenueCommand(request);
    if (body.operation === "fields") {
      const transport = await revenueTransport(origin, BUDGET_CASH_QUERY_ID);
      return Response.json(inspectBudgetCashQuery(await transport.metadata()), { headers });
    }
    const input = validateBudgetCashSource(body.input);
    const state = await refreshBudgetCash({ input, revision: body.revision, user, transport: await revenueTransport(origin, BUDGET_CASH_QUERY_ID) });
    return Response.json({ ...publicRevenueState(state), canManage }, { headers });
  } catch (error) { return revenueFailure(error); }
}
