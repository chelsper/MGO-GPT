import { readManualGoalConfig, saveManualGoalEntry } from "@/app/api/utils/fyRevenueAdjustments";
import { requireRevenueContext, revenueHeaders as headers, revenueFailure, readRevenueCommand } from "@/app/api/utils/fyRevenueContext";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const { canManage } = await requireRevenueContext();
    return Response.json({ goal: await readManualGoalConfig(), canManage }, { headers });
  } catch (error) { return revenueFailure(error); }
}
export async function POST(request) {
  try {
    const { user, canManage } = await requireRevenueContext(true);
    const { body } = await readRevenueCommand(request, ["save", "archive", "restore"]);
    const goal = await saveManualGoalEntry({ ...body, user });
    return Response.json({ goal, canManage }, { headers });
  } catch (error) { return revenueFailure(error); }
}
