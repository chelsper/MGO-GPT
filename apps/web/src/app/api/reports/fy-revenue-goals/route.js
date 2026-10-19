import { validateRevenueSource } from "@/utils/fyRevenueGoals";
import { inspectRevenueQuery, publicRevenueState, readRevenueState, refreshRevenue, revenueTransport } from "@/app/api/utils/fyRevenueGoals";
import { requireRevenueContext as context, revenueHeaders as headers, revenueFailure as failure, readRevenueCommand } from "@/app/api/utils/fyRevenueContext";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { canManage, title } = await context();
    return Response.json({ ...publicRevenueState(await readRevenueState()), canManage, title }, { headers });
  } catch (error) { return failure(error); }
}

export async function POST(request) {
  try {
    const { user, canManage, title } = await context(true);
    const { body, origin } = await readRevenueCommand(request);
    if (body.operation === "fields") {
      const transport = await revenueTransport(origin);
      return Response.json(inspectRevenueQuery(await transport.metadata()), { headers });
    }
    const input = validateRevenueSource(body.input);
    const state = await refreshRevenue({ input, revision: body.revision, user, transport: await revenueTransport(origin) });
    return Response.json({ ...publicRevenueState(state), canManage, title }, { headers });
  } catch (error) { return failure(error); }
}
