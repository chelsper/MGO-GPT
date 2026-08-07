import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import { isReviewerRole } from "@/utils/workspaceRoles";
import { blackbaudApiFetch } from "@/app/api/utils/blackbaud";

const TABLE_FIELDS = {
  educationDegree: {
    label: "education degree",
    paths: ["/constituent/v1/educations/degrees"],
  },
  educationSchoolType: {
    label: "education school type",
    paths: ["/constituent/v1/educations/types"],
  },
  educationStatus: {
    label: "education status",
    paths: ["/constituent/v1/educations/statuses"],
  },
  educationMajor: {
    label: "education major",
    paths: ["/constituent/v1/educations/subjects"],
  },
  educationMinor: {
    label: "education minor",
    paths: ["/constituent/v1/educations/subjects"],
  },
};

function cleanText(value) {
  return String(value || "").trim();
}

function normalizeText(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getValues(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.value)) return payload.value;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.values)) return payload.values;
  return [];
}

function getOptionLabel(value) {
  if (typeof value === "string") return cleanText(value);
  if (!value || typeof value !== "object") return "";
  return cleanText(
    value.description ||
      value.name ||
      value.value ||
      value.label ||
      value.display_name ||
      value.id,
  );
}

function editDistance(left, right) {
  const a = normalizeText(left);
  const b = normalizeText(right);
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let row = 1; row <= a.length; row += 1) {
    let diagonal = previous[0];
    previous[0] = row;
    for (let column = 1; column <= b.length; column += 1) {
      const beforeUpdate = previous[column];
      previous[column] = Math.min(
        previous[column] + 1,
        previous[column - 1] + 1,
        diagonal + (a[row - 1] === b[column - 1] ? 0 : 1),
      );
      diagonal = beforeUpdate;
    }
  }
  return previous[b.length];
}

function scoreSuggestion(query, candidate) {
  const normalizedQuery = normalizeText(query);
  const normalizedCandidate = normalizeText(candidate);
  if (!normalizedQuery || !normalizedCandidate) return 0;
  if (normalizedCandidate === normalizedQuery) return 100;
  if (normalizedCandidate.startsWith(normalizedQuery)) return 92;
  if (normalizedCandidate.includes(normalizedQuery)) return 84;
  const queryTokens = new Set(normalizedQuery.split(" ").filter(Boolean));
  const candidateTokens = new Set(normalizedCandidate.split(" ").filter(Boolean));
  const matchingTokens = [...queryTokens].filter((token) => candidateTokens.has(token)).length;
  const tokenScore = queryTokens.size ? (matchingTokens / queryTokens.size) * 70 : 0;
  const maximumLength = Math.max(normalizedQuery.length, normalizedCandidate.length);
  const distanceScore = maximumLength
    ? (1 - editDistance(normalizedQuery, normalizedCandidate) / maximumLength) * 60
    : 0;
  return Math.max(tokenScore, distanceScore);
}

async function fetchTableOptions({ field, userId, authUserId, origin }) {
  let lastError = null;
  for (const path of field.paths) {
    try {
      const payload = await blackbaudApiFetch(path, { userId, authUserId, origin });
      return getValues(payload)
        .map(getOptionLabel)
        .filter(Boolean);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Could not load NXT table entries.");
}

export async function POST(request) {
  try {
    await ensureAppSchema();
    const session = await auth();
    if (!session?.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { sessionUser } = await getWorkspaceUser(session, request);
    if (!sessionUser) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }
    if (!isReviewerRole(sessionUser.role)) {
      return Response.json(
        { error: "Only Advancement Services users can look up NXT table entries." },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const fieldKey = cleanText(body?.fieldKey);
    const value = cleanText(body?.value);
    const field = TABLE_FIELDS[fieldKey];
    if (!field) {
      return Response.json({ error: "This CSV field does not use an NXT table lookup." }, { status: 400 });
    }
    if (!value) {
      return Response.json({ suggestions: [], message: "Enter a CSV value before looking for NXT matches." });
    }

    const options = await fetchTableOptions({
      field,
      userId: sessionUser.id,
      authUserId: sessionUser.id,
      origin: new URL(request.url).origin,
    });
    const seen = new Set();
    const suggestions = options
      .map((candidate) => ({ candidate, score: scoreSuggestion(value, candidate) }))
      .filter(({ candidate, score }) => {
        const normalized = normalizeText(candidate);
        if (!normalized || seen.has(normalized) || score < 35) return false;
        seen.add(normalized);
        return true;
      })
      .sort((left, right) => right.score - left.score || left.candidate.localeCompare(right.candidate))
      .slice(0, 5)
      .map(({ candidate, score }) => ({
        value: candidate,
        confidence: Math.round(score),
        exact: normalizeText(candidate) === normalizeText(value),
      }));

    return Response.json({
      fieldKey,
      fieldLabel: field.label,
      sourceValue: value,
      suggestions,
      message: suggestions.length
        ? "Review an NXT table value below. Selecting one only updates this local preview."
        : `No close active NXT ${field.label} entries were found. Keep or edit the CSV value manually.`,
    });
  } catch (error) {
    console.error("Error loading constituency import table suggestions:", error);
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load NXT table suggestions",
      },
      { status: 500 },
    );
  }
}
