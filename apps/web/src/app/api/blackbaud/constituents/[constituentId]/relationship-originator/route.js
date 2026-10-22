import { originatorUser, requireOriginatorEditor, checkOriginatorRequest, originatorResponseError,
  originatorReview, saveOriginator, originatorHeaders } from "@/app/api/utils/relationshipOriginator";
import { systemId, OriginatorError } from "@/app/api/utils/relationshipOriginatorModel";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
async function context(request, params) {
  const user = await originatorUser();
  requireOriginatorEditor(user);
  const constituentId = systemId((await params).constituentId);
  if (!constituentId) throw new OriginatorError("A constituent system ID is required.", 400);
  return { user, constituentId, options: { userId: user.id, authUserId: user.id, origin: new URL(request.url).origin } };
}
export async function GET(request, { params }) {
  try {
    return Response.json(await originatorReview(await context(request, params)), { headers: originatorHeaders });
  } catch (error) { return originatorResponseError(error); }
}
export async function POST(request, { params }) {
  try {
    const ctx = await context(request, params);
    checkOriginatorRequest(request);
    const input = await request.json().catch(() => null);
    if (!input || typeof input !== "object") throw new OriginatorError("Review the originator form before saving.", 400);
    return Response.json(await saveOriginator({ ...ctx, input }), { headers: originatorHeaders });
  } catch (error) { return originatorResponseError(error); }
}
