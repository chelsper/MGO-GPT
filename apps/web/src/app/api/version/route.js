import { appReleaseVersion } from "../utils/appReleaseVersion";

export async function GET() {
  return Response.json(
    appReleaseVersion(),
    { headers: { "Cache-Control": "no-store" } },
  );
}
