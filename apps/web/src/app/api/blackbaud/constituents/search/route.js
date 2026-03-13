import { auth } from "@/auth";
import getOrCreateUser from "@/app/api/utils/getOrCreateUser";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import {
  getBlackbaudConfigIssues,
  searchBlackbaudConstituents,
} from "@/app/api/utils/blackbaud";

export async function GET(request) {
  const session = await auth();
  if (!session?.user?.email) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureAppSchema();

  const origin = new URL(request.url).origin;
  const configIssues = getBlackbaudConfigIssues(origin);
  if (configIssues.length > 0) {
    return Response.json(
      {
        error: "Blackbaud is not configured",
        configIssues,
      },
      { status: 400 },
    );
  }

  const query = new URL(request.url).searchParams.get("q")?.trim() || "";
  if (query.length < 2) {
    return Response.json(
      { error: "Search query must be at least 2 characters" },
      { status: 400 },
    );
  }

  try {
    const user = await getOrCreateUser(session);
    const results = await searchBlackbaudConstituents({
      userId: user.id,
      origin,
      query,
    });

    return Response.json({
      query,
      count: results.length,
      results,
    });
  } catch (error) {
    console.error("Blackbaud constituent search error:", error);
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to search Blackbaud constituents",
      },
      { status: 500 },
    );
  }
}
