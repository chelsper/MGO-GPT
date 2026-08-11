import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import {
  blackbaudApiFetch,
  getBlackbaudConfigIssues,
} from "@/app/api/utils/blackbaud";
import { isReviewerRole } from "@/utils/workspaceRoles";

const LIST_DATA_MODELS_PATH = "/lst-lists/datamodels";
const CONTRIBUTION_DATA_MODEL_PATH = "/lst-lists/datamodels/contribution";
const RELEVANT_FIELD_PATTERN =
  /gift|credit|recognition|recipient|constituent|amount|date|type|planned|payment|soft/i;

function getStringValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toSafeFieldMetadata(value) {
  if (!value || typeof value !== "object") return null;

  const fieldId = getStringValue(value.field_id || value.id || value.name);
  const displayName = getStringValue(
    value.display_name || value.displayName || value.caption || value.label,
  );
  if (!fieldId && !displayName) return null;

  const searchableValue = `${fieldId} ${displayName}`;
  if (!RELEVANT_FIELD_PATTERN.test(searchableValue)) return null;

  return {
    fieldId: fieldId || null,
    displayName: displayName || null,
    dataType: getStringValue(value.data_type || value.dataType || value.type) || null,
    filterable: Boolean(value.filterable || value.is_filterable),
    sortable: Boolean(value.sortable || value.is_sortable),
  };
}

function collectRelevantFields(value, seen = new Set(), results = []) {
  if (!value || typeof value !== "object") return results;

  if (Array.isArray(value)) {
    value.forEach((entry) => collectRelevantFields(entry, seen, results));
    return results;
  }

  const metadata = toSafeFieldMetadata(value);
  if (metadata) {
    const key = `${metadata.fieldId || ""}:${metadata.displayName || ""}`;
    if (!seen.has(key)) {
      seen.add(key);
      results.push(metadata);
    }
  }

  Object.values(value).forEach((entry) => collectRelevantFields(entry, seen, results));
  return results;
}

function getDataModelNames(payload) {
  const dataModels = Array.isArray(payload?.data_models)
    ? payload.data_models
    : Array.isArray(payload?.value)
      ? payload.value
      : Array.isArray(payload)
        ? payload
        : [];

  return dataModels
    .map((model) => getStringValue(model?.name || model?.data_model_name))
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
}

export async function GET(request) {
  try {
    await ensureAppSchema();

    const session = await auth(request);
    if (!session?.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { sessionUser } = await getWorkspaceUser(session, request);
    if (!sessionUser || !isReviewerRole(sessionUser.role)) {
      return Response.json({ error: "Forbidden - reviewers only" }, { status: 403 });
    }

    const origin = new URL(request.url).origin;
    const configIssues = getBlackbaudConfigIssues(origin);
    if (configIssues.length > 0) {
      return Response.json(
        { error: "Blackbaud is not configured", configIssues },
        { status: 400 },
      );
    }

    // These calls read List V2 schema metadata only. They never request
    // constituent, gift, or credit records and cannot modify NXT data.
    const [dataModels, contributionModel] = await Promise.all([
      blackbaudApiFetch(LIST_DATA_MODELS_PATH, {
        userId: sessionUser.id,
        authUserId: sessionUser.id,
        origin,
      }),
      blackbaudApiFetch(CONTRIBUTION_DATA_MODEL_PATH, {
        userId: sessionUser.id,
        authUserId: sessionUser.id,
        origin,
      }),
    ]);

    return Response.json(
      {
        availableDataModels: getDataModelNames(dataModels),
        contributionFields: collectRelevantFields(contributionModel).sort((left, right) =>
          `${left.displayName || ""}${left.fieldId || ""}`.localeCompare(
            `${right.displayName || ""}${right.fieldId || ""}`,
          ),
        ),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("Unable to inspect Blackbaud contribution data model:", error);
    return Response.json(
      {
        error:
          error instanceof Error && error.message
            ? error.message
            : "Unable to inspect Blackbaud contribution data model",
      },
      { status: 500 },
    );
  }
}

export { collectRelevantFields, getDataModelNames };
