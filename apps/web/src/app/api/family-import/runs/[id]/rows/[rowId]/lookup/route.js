import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import {
  findBlackbaudConstituentByEmail,
  findBlackbaudConstituentByLookupId,
  getBlackbaudConstituentById,
  isBlackbaudQuotaExceededError,
  searchBlackbaudConstituents,
} from "@/app/api/utils/blackbaud";
import {
  cleanText,
  findFamilyPerson,
  getFamilyImportRow,
  parseFamilyRouteParams,
  requireFamilyImportReviewer,
  toFamilyCandidate,
} from "@/app/api/family-import/utils";

export const runtime = "nodejs";
export const maxDuration = 30;

const REQUEST_OPTIONS = { timeoutMs: 8000, maxRetries: 0 };

function dedupeCandidates(candidates) {
  const seen = new Set();
  return candidates.filter((candidate) => {
    const key = cleanText(candidate?.blackbaudConstituentId);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function lookupCandidates({ person, query, request, user }) {
  const origin = new URL(request.url).origin;
  const source = cleanText(query);
  const baseArgs = {
    userId: user.id,
    authUserId: user.id,
    origin,
    requestOptions: REQUEST_OPTIONS,
  };

  if (!source && cleanText(person?.systemId)) {
    const candidate = await getBlackbaudConstituentById({
      ...baseArgs,
      constituentId: person.systemId,
    });
    return candidate ? [candidate] : [];
  }
  if (!source && cleanText(person?.lookupId)) {
    const candidate = await findBlackbaudConstituentByLookupId({
      ...baseArgs,
      lookupId: person.lookupId,
    });
    return candidate ? [candidate] : [];
  }

  const searchText = source || cleanText(person?.email) || [person?.firstName, person?.lastName]
    .map(cleanText)
    .filter(Boolean)
    .join(" ");
  if (!searchText) {
    throw new Error("Enter a name, email address, NXT System ID, or Lookup ID before searching.");
  }

  if (searchText.includes("@")) {
    const candidate = await findBlackbaudConstituentByEmail({ ...baseArgs, email: searchText });
    return candidate ? [candidate] : [];
  }

  return searchBlackbaudConstituents({ ...baseArgs, query: searchText });
}

export async function POST(request, { params }) {
  try {
    await ensureAppSchema();
    const authResult = await requireFamilyImportReviewer(request);
    if (authResult.error) return authResult.error;

    const parsedParams = parseFamilyRouteParams(params);
    if (parsedParams.error || !parsedParams.rowId) {
      return Response.json({ error: parsedParams.error || "Invalid family import row ID." }, { status: 400 });
    }
    const body = await request.json().catch(() => ({}));
    const targetKey = cleanText(body?.targetKey);
    if (!["student", "parent1", "parent2"].includes(targetKey)) {
      return Response.json({ error: "Choose Student, Parent 1, or Parent 2 to search." }, { status: 400 });
    }

    const row = await getFamilyImportRow(parsedParams.runId, parsedParams.rowId);
    if (!row) {
      return Response.json({ error: "Family import row not found." }, { status: 404 });
    }
    const input = row.input && typeof row.input === "object" ? row.input : JSON.parse(row.input || "{}");
    const person = findFamilyPerson(input, targetKey);
    if (!person) {
      return Response.json({ error: "This person is not present in the uploaded family row." }, { status: 400 });
    }

    const candidates = dedupeCandidates(
      (await lookupCandidates({
        person,
        query: body?.query,
        request,
        user: authResult.user,
      }))
        .map(toFamilyCandidate)
        .filter(Boolean),
    );

    return Response.json({
      targetKey,
      candidates,
      searchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error looking up a Family Import person:", error);
    if (isBlackbaudQuotaExceededError(error)) {
      return Response.json(
        {
          error: error.message,
          quotaPaused: true,
          retryAfterMs: error.retryAfterMs,
        },
        { status: 429 },
      );
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to search NXT." },
      { status: 500 },
    );
  }
}
