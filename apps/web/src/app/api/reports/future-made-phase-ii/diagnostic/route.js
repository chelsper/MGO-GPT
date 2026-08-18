import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getOrCreateUser from "@/app/api/utils/getOrCreateUser";
import {
  blackbaudApiFetch,
  getBlackbaudConfigIssues,
} from "@/app/api/utils/blackbaud";
import {
  FUTURE_MADE_PHASE_TWO_REPORT_KEY,
  getReportAccessForUser,
} from "@/app/api/utils/reportAccess";

const LIST_DATA_MODELS_PATH = "/lst-lists/datamodels";
const MODEL_NAME_PATTERN = /constituent/i;
const RELEVANT_FIELD_PATTERN =
  /custom|category|description|constituent|name|lookup|record|prospect/i;

function getStringValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function getFutureMadePhaseTwoQueryConfig() {
  return {
    queryId: getStringValue(process.env.BLACKBAUD_FUTURE_MADE_PHASE_TWO_QUERY_ID),
    queryName:
      getStringValue(process.env.BLACKBAUD_FUTURE_MADE_PHASE_TWO_QUERY_NAME) ||
      "Future. Made. Phase II",
  };
}

function toSafeFieldMetadata(value) {
  if (!value || typeof value !== "object") return null;

  const fieldId = getStringValue(value.field_id || value.id || value.name);
  const displayName = getStringValue(
    value.display_name || value.displayName || value.caption || value.label,
  );
  const searchableValue = `${fieldId} ${displayName}`;
  if (!searchableValue || !RELEVANT_FIELD_PATTERN.test(searchableValue)) {
    return null;
  }

  return {
    fieldId: fieldId || null,
    displayName: displayName || null,
    dataType: getStringValue(value.data_type || value.dataType || value.type) || null,
    filterable: Boolean(value.filterable || value.is_filterable || value.is_filter),
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

async function getCurrentUser() {
  await ensureAppSchema();
  const session = await auth();
  if (!session?.user?.email) return null;
  return getOrCreateUser(session, "admin");
}

export async function GET(request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const access = await getReportAccessForUser(FUTURE_MADE_PHASE_TWO_REPORT_KEY, user);
    if (!access.canView) {
      return Response.json(
        { error: "Future. Made. Phase II is not shared with you." },
        { status: 403 },
      );
    }

    const origin = new URL(request.url).origin;
    const configurationIssues = getBlackbaudConfigIssues(origin);
    if (configurationIssues.length) {
      return Response.json(
        { error: "Blackbaud configuration is incomplete", configurationIssues },
        { status: 500 },
      );
    }

    const dataModels = await blackbaudApiFetch(LIST_DATA_MODELS_PATH, {
      userId: user.id,
      authUserId: user.id,
      origin,
    });

    const availableDataModels = getDataModelNames(dataModels);
    const candidateModelNames = availableDataModels.filter((name) => MODEL_NAME_PATTERN.test(name));
    const candidateModels = await Promise.all(
      candidateModelNames.slice(0, 12).map(async (modelName) => {
        try {
          const payload = await blackbaudApiFetch(
            `${LIST_DATA_MODELS_PATH}/${encodeURIComponent(modelName)}`,
            {
              userId: user.id,
              authUserId: user.id,
              origin,
            },
          );

          return {
            modelName,
            fields: collectRelevantFields(payload).sort((left, right) =>
              `${left.displayName || ""}${left.fieldId || ""}`.localeCompare(
                `${right.displayName || ""}${right.fieldId || ""}`,
              ),
            ),
          };
        } catch (error) {
          return {
            modelName,
            error: error instanceof Error ? error.message : "Unable to inspect model",
            fields: [],
          };
        }
      }),
    );

    const responsePayload = {
      queryConfig: getFutureMadePhaseTwoQueryConfig(),
      availableDataModels,
      candidateModels,
    };

    console.info(
      "Future. Made. Phase II diagnostic",
      JSON.stringify(responsePayload, null, 2),
    );

    return Response.json(responsePayload, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("Future. Made. Phase II diagnostic error:", error);
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to inspect Future. Made. Phase II report metadata.",
      },
      { status: 500 },
    );
  }
}
