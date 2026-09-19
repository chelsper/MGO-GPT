import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getOrCreateUser from "@/app/api/utils/getOrCreateUser";
import {
  createBlackbaudConstituentCustomField,
  getBlackbaudConfigIssues,
  listBlackbaudConstituentCustomFields,
} from "@/app/api/utils/blackbaud";
import { invalidateReportSnapshot } from "@/app/api/utils/reportCache";
import { isAdminRole, isExecutiveRole } from "@/utils/workspaceRoles";
import { getReportAccessForUser } from "@/app/api/utils/reportAccess";
import { requireListSameOrigin } from "@/app/api/utils/constituentListContext";

const FUTURE_MADE_PHASE_TWO_CACHE_KEY = "report:future-made-phase-ii";

const CUSTOM_FIELD_CATEGORY = "Prospect Research";
const CUSTOM_FIELD_DESCRIPTION = "Future. Made. Phase II";
const APP_TIME_ZONE = "America/New_York";

function canManageFutureMadePhaseTwoList(role) {
  return isAdminRole(role) || isExecutiveRole(role);
}

function getTodayDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function buildMembershipComment(user) {
  const addedBy = String(user?.name || user?.email || "").trim();
  return addedBy ? `Added from JUMGOGPT by ${addedBy}` : "Added from JUMGOGPT";
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("en-US");
}

function normalizeLooseBlackbaudText(value) {
  return String(value || "")
    .toLocaleLowerCase("en-US")
    .replace(/[.\-_/]+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getFieldDescriptionCandidates(field) {
  const candidates = [
    field?.description,
    field?.value ??
      field?.code_table_entry ??
      field?.code_table_entry_name ??
      field?.code_table_entry_description ??
      field?.codetableentry_value ??
      null,
    field?.comment,
  ];
  return candidates
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

function fieldMatchesFutureMadePhaseTwo(field) {
  if (normalizeText(field?.category) !== normalizeText(CUSTOM_FIELD_CATEGORY)) {
    return false;
  }

  const expected = normalizeLooseBlackbaudText(CUSTOM_FIELD_DESCRIPTION);
  return getFieldDescriptionCandidates(field).some(
    (candidate) => normalizeLooseBlackbaudText(candidate) === expected,
  );
}

async function getCurrentUser() {
  await ensureAppSchema();
  const session = await auth();
  if (!session?.user?.email) return null;
  return getOrCreateUser(session, "admin");
}

export async function POST(request) {
  try {
    requireListSameOrigin(request);
    const user = await getCurrentUser();
    if (!user || user.active === false) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const access = await getReportAccessForUser("future-made-phase-ii", user);
    if (!access.canView) return Response.json({ error: "This list is not shared with you." }, { status: 403 });
    if (access.dataConfiguration?.version === 1) return Response.json({ error: "This list has new membership settings. Open it from Lists and use its current Add constituent controls." }, { status: 409 });

    if (!canManageFutureMadePhaseTwoList(user.role)) {
      return Response.json(
        { error: "Only executives and admins can add constituents to Future. Made. Phase II." },
        { status: 403 },
      );
    }

    const origin = new URL(request.url).origin;
    const configurationIssues = getBlackbaudConfigIssues(origin);
    if (configurationIssues.length) {
      return Response.json(
        { error: `Blackbaud configuration is incomplete: ${configurationIssues.join(", ")}` },
        { status: 500 },
      );
    }

    const body = await request.json().catch(() => null);
    const constituentId = String(
      body?.constituentId || body?.blackbaudConstituentId || "",
    ).trim();

    if (!constituentId) {
      return Response.json(
        { error: "A Blackbaud constituent ID is required." },
        { status: 400 },
      );
    }

    const customFields = await listBlackbaudConstituentCustomFields({
      userId: user.id,
      authUserId: user.id,
      origin,
      constituentId,
    });

    const existingField = (Array.isArray(customFields) ? customFields : []).find(
      fieldMatchesFutureMadePhaseTwo,
    );

    if (existingField) {
      return Response.json({
        status: "already_present",
        constituentId,
        customFieldId:
          existingField?.id ||
          existingField?.custom_field_id ||
          existingField?.customFieldId ||
          null,
      });
    }

    const created = await createBlackbaudConstituentCustomField({
      userId: user.id,
      authUserId: user.id,
      origin,
      payload: {
        parent_id: constituentId,
        category: CUSTOM_FIELD_CATEGORY,
        description: CUSTOM_FIELD_DESCRIPTION,
        comment: buildMembershipComment(user),
        date: getTodayDate(),
      },
    });

    await invalidateReportSnapshot(FUTURE_MADE_PHASE_TWO_CACHE_KEY);

    return Response.json({
      status: "added",
      constituentId,
      customFieldId:
        created?.id || created?.custom_field_id || created?.customFieldId || null,
    });
  } catch (error) {
    console.error("Failed to add Future. Made. Phase II attribute:", error);
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not add the constituent to Future. Made. Phase II.",
      },
      { status: error?.status || 500 },
    );
  }
}
