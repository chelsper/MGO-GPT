import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import {
  getBlackbaudConfigIssues,
  listBlackbaudGifts,
} from "@/app/api/utils/blackbaud";
import { fetchAnnualGivingSocieties } from "../../utils/annualGivingSocieties.js";

const MAX_CONSTITUENT_IDS = 50;
const CONCURRENT_REQUESTS = 4;

function parseConstituentIds(request) {
  const searchParams = new URL(request.url).searchParams;
  const rawValues = [
    ...searchParams.getAll("constituentId"),
    ...searchParams.getAll("constituentIds"),
  ];
  const seen = new Set();
  const ids = [];

  for (const value of rawValues) {
    const parts = String(value || "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);

    for (const part of parts) {
      if (seen.has(part)) continue;
      seen.add(part);
      ids.push(part);
      if (ids.length >= MAX_CONSTITUENT_IDS) return ids;
    }
  }

  return ids;
}

async function runWithConcurrency(items, limit, mapper) {
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      await mapper(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
}

export async function GET(request) {
  try {
    await ensureAppSchema();

    const session = await auth(request);
    if (!session?.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

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

    const constituentIds = parseConstituentIds(request);
    if (constituentIds.length === 0) {
      return Response.json(
        { byConstituentId: {}, warnings: {} },
        { headers: { "Cache-Control": "private, max-age=300" } },
      );
    }

    const { workspaceUser: user, sessionUser, isActing } =
      await getWorkspaceUser(session, request);
    if (!user) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    const authUserId = isActing ? sessionUser?.id || user.id : user.id;
    const byConstituentId = {};
    const warnings = {};

    await runWithConcurrency(
      constituentIds,
      CONCURRENT_REQUESTS,
      async (constituentId) => {
        try {
          byConstituentId[constituentId] = await fetchAnnualGivingSocieties({
            listGifts: listBlackbaudGifts,
            userId: user.id,
            authUserId,
            origin,
            constituentId,
          });
        } catch (error) {
          byConstituentId[constituentId] = null;
          warnings[constituentId] =
            error instanceof Error
              ? error.message
              : "Annual giving society lookup failed";
        }
      },
    );

    return Response.json(
      { byConstituentId, warnings },
      { headers: { "Cache-Control": "private, max-age=300" } },
    );
  } catch (error) {
    console.error("Error fetching annual giving society batch:", error);
    return Response.json(
      {
        error:
          error instanceof Error && error.message
            ? error.message
            : "Failed to fetch annual giving societies",
      },
      { status: 500 },
    );
  }
}
