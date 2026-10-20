import upload from "@/app/api/utils/upload";
import { requireActiveAccount, privateJson, endpointFailure } from "@/app/api/utils/legacyEndpointAccess";
import { getAuthorizedUpload } from "@/app/api/utils/legacyMediaInput";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const user = await requireActiveAccount(request, { mutation: true });
    const buffer = await getAuthorizedUpload(request, user);
    return privateJson(await upload({ buffer }));
  } catch (error) {
    return endpointFailure(error, "File upload is unavailable. Please try again shortly.");
  }
}
