import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import sql from "@/app/api/utils/sql";
import {
  blackbaudApiFetch,
  getBlackbaudConstituentById,
  isBlackbaudQuotaExceededError,
} from "@/app/api/utils/blackbaud";
import {
  buildContactDetailPreview,
  buildEducationRelationshipWrite,
  buildDeferredContactDetailWrite,
  buildConstituencyCodeWrites,
  buildNameFormatDetailWrites,
  buildProfileDetailWrites,
  getContactSnapshotStatus,
  getRequiredContactSnapshotKinds,
  hasUsableProfileSnapshot,
  mapConstituencyCode,
  previewConstituencyChange,
  serializeContactSnapshot,
  serializeEducation,
  serializeNameFormat,
} from "@/app/api/constituency-import/preview/route";
import {
  getQuotaPauseNotice,
  isQuotaPausedText,
  QUOTA_PAUSED_MATCH_METHOD,
} from "@/app/api/constituency-import/quotaPause";
import { isReviewerRole } from "@/utils/workspaceRoles";

const DETAIL_SCOPES = new Set(["profile", "contacts", "nameFormats", "educations", "codes"]);
const SCOPE_WRITE_TYPES = {
  profile: new Set(["profile_detail_review", "constituent_name", "constituent_profile"]),
  contacts: new Set(["contact_detail_review", "email_address", "phone", "address"]),
  nameFormats: new Set(["name_format_detail_review", "constituent_name_format"]),
  educations: new Set(["education_relationship"]),
  codes: new Set(["constituent_code_detail_review", "constituent_code"]),
};

function cleanText(value) {
  return String(value || "").trim();
}

function getCollection(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];

  const queue = [payload];
  const seen = new Set();
  const collectionKeys = ["value", "items", "data", "results"];
  while (queue.length) {
    const candidate = queue.shift();
    if (!candidate || typeof candidate !== "object" || seen.has(candidate)) continue;
    seen.add(candidate);
    if (Array.isArray(candidate)) return candidate;
    collectionKeys.forEach((key) => {
      if (candidate[key]) queue.push(candidate[key]);
    });
  }
  return [];
}

function getPreview(row) {
  return row?.preview && typeof row.preview === "object" ? row.preview : {};
}

function getWritePlan(row) {
  if (Array.isArray(row?.requested_writes) && row.requested_writes.length) {
    return row.requested_writes;
  }
  return Array.isArray(getPreview(row).writePlan) ? getPreview(row).writePlan : [];
}

function getMatchedConstituentId(row) {
  const preview = getPreview(row);
  return cleanText(
    row?.matched_blackbaud_constituent_id ||
      preview.match?.blackbaudConstituentId ||
      preview.input?.blackbaudConstituentId,
  );
}

function summarizeRows(rows) {
  return rows.reduce(
    (summary, row) => {
      summary.total += 1;
      if (row.status === "Ready") summary.ready += 1;
      if (row.status === "Needs Review") summary.needsReview += 1;
      if (row.status === "Conflict") summary.conflict += 1;
      if (row.status === "Skipped") summary.skipped += 1;
      if (row.status === "Applied") summary.applied += 1;
      if (row.status === "Failed") summary.failed += 1;
      return summary;
    },
    { total: 0, ready: 0, needsReview: 0, conflict: 0, skipped: 0, applied: 0, failed: 0 },
  );
}

async function refreshRunSummary(runId) {
  const rows = await sql`
    SELECT status
    FROM constituency_import_rows
    WHERE run_id = ${runId}
  `;
  const summary = summarizeRows(rows);
  const nextStatus = summary.failed > 0 || summary.needsReview > 0 || summary.ready > 0
    ? "partially_applied"
    : "applied";

  await sql`
    UPDATE constituency_import_runs
    SET
      status = ${nextStatus},
      summary = ${JSON.stringify(summary)}::jsonb,
      ready_count = ${summary.ready},
      needs_review_count = ${summary.needsReview},
      conflict_count = ${summary.conflict},
      skipped_count = ${summary.skipped},
      applied_count = ${summary.applied},
      failed_count = ${summary.failed},
      updated_at = NOW()
    WHERE id = ${runId}
  `;
}

async function requireReviewer(request) {
  const session = await auth();
  if (!session?.user?.email) {
    return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { sessionUser: user } = await getWorkspaceUser(session, request);
  if (!user) {
    return { error: Response.json({ error: "User not found" }, { status: 404 }) };
  }
  if (!isReviewerRole(user.role)) {
    return {
      error: Response.json(
        { error: "Only Advancement Services users can review import rows." },
        { status: 403 },
      ),
    };
  }
  return { user };
}

function parseRouteParams(params) {
  const runId = cleanText(params?.id);
  const rowId = cleanText(params?.rowId);
  if (!/^\d+$/.test(runId) || !/^\d+$/.test(rowId)) {
    return { error: "Invalid import run or row ID" };
  }
  return { runId, rowId };
}

function getRequestedScopes(body) {
  const requested = Array.isArray(body?.scopes) ? body.scopes : ["profile"];
  const scopes = [...new Set(requested.map(cleanText).filter((scope) => DETAIL_SCOPES.has(scope)))];
  return scopes.length ? scopes : ["profile"];
}

function removeScopeWrites(writePlan, scope) {
  const typeSet = SCOPE_WRITE_TYPES[scope];
  return writePlan.filter((write) => !typeSet.has(write?.type));
}

function appendScopeWrites(writePlan, scope, writes) {
  const typeSet = SCOPE_WRITE_TYPES[scope];
  const next = [];
  let inserted = false;

  writePlan.forEach((write) => {
    if (!typeSet.has(write?.type)) {
      next.push(write);
      return;
    }
    if (!inserted) {
      next.push(...writes);
      inserted = true;
    }
  });

  if (!inserted) next.push(...writes);
  return next;
}

function hasContactInput(input) {
  return Boolean(
    input?.emailUpdates?.length || input?.phoneUpdates?.length || input?.addressUpdates?.length,
  );
}

function hasContactSectionAction(decisions) {
  const section = (kind) =>
    decisions?.[kind]?.__section && typeof decisions[kind].__section === "object"
      ? decisions[kind].__section
      : {};
  return Boolean(
    cleanText(section("email").existingPrimaryTargetId) ||
      cleanText(section("phone").existingPrimaryTargetId) ||
      cleanText(section("address").previousAddressTargetId),
  );
}

function hasConstituencyInput(input) {
  return Boolean(cleanText(input?.sourceConstituency) || cleanText(input?.targetConstituency));
}

function getNextStatus(row, writePlan) {
  if (["Applied", "Failed", "Conflict"].includes(row.status)) return row.status;
  if (writePlan.some((write) => write?.requiresReview)) return "Needs Review";
  return writePlan.length ? "Ready" : "Skipped";
}

function getDeferredHydration(preview) {
  return preview?.deferredHydration && typeof preview.deferredHydration === "object"
    ? { ...preview.deferredHydration }
    : {};
}

function removeDetailReason(reasons, scope) {
  const patterns = {
    profile: /load the current NXT name and profile values/i,
    contacts: /load the current NXT email, phone, and address values/i,
    nameFormats: /load the current NXT addressee and salutation values/i,
    educations: /load the current NXT education relationships/i,
    codes: /(?:load the current NXT constituencies|Current constituency .* was not found on the NXT record\.)/i,
  };
  return (Array.isArray(reasons) ? reasons : []).filter(
    (reason) => !patterns[scope].test(cleanText(reason)),
  );
}

async function fetchCurrentContacts({
  userId,
  authUserId,
  origin,
  constituentId,
  kinds = ["emails", "phones", "addresses"],
}) {
  const basePath = `/constituent/v1/constituents/${encodeURIComponent(constituentId)}`;
  const availableRequests = [
    ["emails", `${basePath}/emailaddresses`],
    ["phones", `${basePath}/phones`],
    ["addresses", `${basePath}/addresses`],
  ];
  const requestedKinds = new Set(
    (Array.isArray(kinds) ? kinds : []).filter((kind) =>
      ["emails", "phones", "addresses"].includes(kind),
    ),
  );
  const requests = availableRequests.filter(([kind]) => requestedKinds.has(kind));

  if (!requests.length) {
    return {
      contacts: { emails: [], phones: [], addresses: [] },
      loaded: { emails: false, phones: false, addresses: false },
      errors: [],
    };
  }

  const results = await Promise.allSettled(
    requests.map(([, path]) => blackbaudApiFetch(path, { userId, authUserId, origin })),
  );
  const quotaFailure = results.find(
    (result) => result.status === "rejected" && isBlackbaudQuotaExceededError(result.reason),
  );
  if (quotaFailure?.status === "rejected") throw quotaFailure.reason;

  const contacts = { emails: [], phones: [], addresses: [] };
  const loaded = { emails: false, phones: false, addresses: false };
  const errors = [];
  results.forEach((result, index) => {
    const [kind] = requests[index];
    if (result.status === "fulfilled") {
      contacts[kind] = getCollection(result.value);
      loaded[kind] = true;
      return;
    }
    errors.push(
      `Could not load current NXT ${kind}: ${
        result.reason instanceof Error ? result.reason.message : "Unknown error"
      }`,
    );
  });

  return { contacts: serializeContactSnapshot(contacts), loaded, errors };
}

async function fetchCurrentNameFormats({ userId, authUserId, origin, constituentId }) {
  const payload = await blackbaudApiFetch(
    `/constituent/v1/constituents/${encodeURIComponent(constituentId)}/nameformats/summary`,
    { userId, authUserId, origin },
  );
  return {
    addressee: serializeNameFormat(payload?.primary_addressee || payload?.primaryAddressee),
    salutation: serializeNameFormat(payload?.primary_salutation || payload?.primarySalutation),
  };
}

async function fetchCurrentConstituencyCodes({ userId, authUserId, origin, constituentId }) {
  const payload = await blackbaudApiFetch(
    `/constituent/v1/constituents/${encodeURIComponent(constituentId)}/constituentcodes`,
    { userId, authUserId, origin },
  );
  return getCollection(payload).map(mapConstituencyCode).filter((code) => code.label);
}

async function fetchCurrentEducations({ userId, authUserId, origin, constituentId }) {
  const payload = await blackbaudApiFetch(
    `/constituent/v1/constituents/${encodeURIComponent(constituentId)}/educations`,
    { userId, authUserId, origin },
  );
  return getCollection(payload);
}

function serializeConstituencyCode(code) {
  return {
    id: cleanText(code?.id),
    label: cleanText(code?.label),
    startDate: formatDate(code?.startDate),
    endDate: formatDate(code?.endDate),
  };
}

function formatDate(value) {
  if (!value) return "";
  if (typeof value !== "object") return cleanText(value);
  const nestedValue =
    value.date ||
    value.value ||
    value.date_value ||
    value.formatted_value ||
    value.formatted ||
    value.iso ||
    value.text;
  if (nestedValue && nestedValue !== value) return formatDate(nestedValue);

  const year = Number(value.y ?? value.year);
  const month = Number(value.m ?? value.month);
  const day = Number(value.d ?? value.day);
  if (year && month && day) return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (year && month) return `${year}-${String(month).padStart(2, "0")}`;
  return year ? String(year) : "";
}

function getDeferredWrite(writePlan, type) {
  return (Array.isArray(writePlan) ? writePlan : []).find(
    (write) => write?.type === type && write?.deferredHydration,
  );
}

function hasReviewDecisions(value) {
  return Boolean(
    value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length,
  );
}

function getContactReviewDecisions(preview, writePlan) {
  const deferred = getDeferredWrite(writePlan, "contact_detail_review")?.contactDecisions;
  return hasReviewDecisions(deferred)
    ? deferred
    : hasReviewDecisions(preview?.contactReviewDecisions)
      ? preview.contactReviewDecisions
      : {};
}

function getFieldReviewDecisions(preview, writePlan, type) {
  const deferred = getDeferredWrite(writePlan, type)?.fieldDecisions;
  return hasReviewDecisions(deferred)
    ? deferred
    : hasReviewDecisions(preview?.fieldReviewDecisions)
      ? preview.fieldReviewDecisions
      : {};
}

function getDetailFailureMessage(scope, error) {
  const name =
    scope === "profile"
      ? "profile"
      : scope === "contacts"
        ? "contact"
      : scope === "nameFormats"
          ? "name-format"
          : scope === "educations"
            ? "education"
          : "constituency";
  if (isBlackbaudQuotaExceededError(error)) {
    return `NXT ${name} checks are paused. ${getQuotaPauseNotice(error)}`;
  }
  const message = error instanceof Error ? error.message : "Unknown NXT error.";
  return `Could not load the current NXT ${name} values: ${message}`;
}

export async function POST(request, { params }) {
  try {
    await ensureAppSchema();
    const authResult = await requireReviewer(request);
    if (authResult.error) return authResult.error;

    const routeParams = parseRouteParams(params);
    if (routeParams.error) return Response.json({ error: routeParams.error }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const scopes = getRequestedScopes(body);
    const rows = await sql`
      SELECT *
      FROM constituency_import_rows
      WHERE id = ${routeParams.rowId} AND run_id = ${routeParams.runId}
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) return Response.json({ error: "Import row not found" }, { status: 404 });

    const preview = getPreview(row);

    const constituentId = getMatchedConstituentId(row);
    if (!constituentId) {
      return Response.json(
        { error: "A matched NXT constituent is required before current record details can be loaded." },
        { status: 409 },
      );
    }

    const origin = new URL(request.url).origin;
    let writePlan = getWritePlan(row);
    let currentContacts = preview.currentContacts || { emails: [], phones: [], addresses: [] };
    let currentNameFormats = preview.currentNameFormats || {
      addressee: { id: "", value: "" },
      salutation: { id: "", value: "" },
    };
    let currentCodes = (Array.isArray(preview.currentCodeDetails)
      ? preview.currentCodeDetails
      : [])
      .map(mapConstituencyCode)
      .filter((code) => code.label);
    let currentCodeDetails = currentCodes.map(serializeConstituencyCode);
    let proposedCodes = Array.isArray(preview.proposedCodes) ? preview.proposedCodes : [];
    let currentEducations = Array.isArray(preview.currentEducations)
      ? preview.currentEducations
      : [];
    let currentMatch = preview.match || null;
    let profileSnapshot = preview.profileSnapshotLoaded === true ? preview.profileSnapshot || null : null;
    let profileSnapshotLoaded = Boolean(
      profileSnapshot && hasUsableProfileSnapshot({ raw: profileSnapshot }),
    );
    let contactSnapshotStatus = getContactSnapshotStatus(
      preview.contactSnapshotStatus,
      preview.contactsSnapshotLoaded === true,
    );
    let contactsSnapshotLoaded = Object.values(contactSnapshotStatus).every(Boolean);
    let nameFormatsSnapshotLoaded = Boolean(preview.nameFormatsSnapshotLoaded);
    let codesSnapshotLoaded = Boolean(preview.codesSnapshotLoaded);
    const deferredHydration = getDeferredHydration(preview);
    let reasons = (Array.isArray(preview.reasons) ? preview.reasons : []).filter(
      (reason) => !isQuotaPausedText(reason),
    );
    const detailMessages = [];
    const failedScopes = [];
    const detailFailureMessages = [];
    let quotaPauseEncountered = false;
    let loadedAnyScope = false;
    const recordScopeFailure = (scope, error) => {
      if (!failedScopes.includes(scope)) failedScopes.push(scope);
      if (isBlackbaudQuotaExceededError(error)) quotaPauseEncountered = true;
      const message = getDetailFailureMessage(scope, error);
      detailFailureMessages.push(message);
      reasons = [...reasons, message];
    };

    if (scopes.includes("profile")) {
      try {
        const detailedMatch = await getBlackbaudConstituentById({
          userId: authResult.user.id,
          authUserId: authResult.user.id,
          origin,
          constituentId,
        });
        if (!hasUsableProfileSnapshot(detailedMatch)) {
          throw new Error(
            "NXT returned an incomplete constituent profile response. No blank profile values were staged.",
          );
        }
        const profileWrites = buildProfileDetailWrites(
          preview.input || {},
          detailedMatch,
          getFieldReviewDecisions(preview, writePlan, "profile_detail_review"),
        );
        writePlan = appendScopeWrites(removeScopeWrites(writePlan, "profile"), "profile", profileWrites);
        deferredHydration.detail = false;
        currentMatch = detailedMatch;
        profileSnapshot =
          detailedMatch?.raw && typeof detailedMatch.raw === "object" ? detailedMatch.raw : {};
        profileSnapshotLoaded = true;
        reasons = removeDetailReason(reasons, "profile");
        detailMessages.push("Loaded the current NXT name and profile values for this record.");
        loadedAnyScope = true;
      } catch (error) {
        recordScopeFailure("profile", error);
      }
    }

    const contactReviewDecisions = getContactReviewDecisions(preview, writePlan);
    if (
      scopes.includes("contacts") &&
      (hasContactInput(preview.input) || hasContactSectionAction(contactReviewDecisions))
    ) {
      try {
        const requiredContactKinds = getRequiredContactSnapshotKinds(
          preview.input || {},
          contactReviewDecisions,
        );
        const contactResult = await fetchCurrentContacts({
          userId: authResult.user.id,
          authUserId: authResult.user.id,
          origin,
          constituentId,
          kinds: requiredContactKinds,
        });
        ["emails", "phones", "addresses"].forEach((kind) => {
          if (contactResult.loaded[kind]) {
            currentContacts = {
              ...currentContacts,
              [kind]: contactResult.contacts[kind],
            };
            contactSnapshotStatus[kind] = true;
          }
        });
        const contactPreview = buildContactDetailPreview(
          preview.input || {},
          currentContacts,
          contactReviewDecisions,
          { snapshotStatus: contactSnapshotStatus },
        );
        const deferredContactWrite = buildDeferredContactDetailWrite(
          preview.input || {},
          contactReviewDecisions,
          contactPreview.unavailableKinds,
        );
        writePlan = appendScopeWrites(
          removeScopeWrites(writePlan, "contacts"),
          "contacts",
          [...contactPreview.writes, deferredContactWrite].filter(Boolean),
        );
        deferredHydration.contacts = Boolean(deferredContactWrite);
        contactsSnapshotLoaded = Object.values(contactSnapshotStatus).every(Boolean);
        reasons = [
          ...removeDetailReason(reasons, "contacts"),
          ...contactPreview.noopReasons,
          ...contactResult.errors,
        ];
        if (deferredContactWrite) {
          if (!failedScopes.includes("contacts")) failedScopes.push("contacts");
          detailFailureMessages.push(
            "Some current NXT contact values could not be loaded. The available values were saved; retry the contact review to load the remaining section.",
          );
        }
        detailMessages.push(
          deferredContactWrite
            ? "Loaded the available current NXT contact values. The remaining contact section stays in review until NXT returns it."
            : "Loaded the current NXT contact values for this record.",
        );
        loadedAnyScope = true;
      } catch (error) {
        recordScopeFailure("contacts", error);
      }
    }

    if (scopes.includes("nameFormats") && preview.input?.nameFormatUpdate) {
      try {
        currentNameFormats = await fetchCurrentNameFormats({
          userId: authResult.user.id,
          authUserId: authResult.user.id,
          origin,
          constituentId,
        });
        const nameFormatWrites = buildNameFormatDetailWrites(
          preview.input || {},
          currentNameFormats,
          getFieldReviewDecisions(preview, writePlan, "name_format_detail_review"),
        );
        writePlan = appendScopeWrites(
          removeScopeWrites(writePlan, "nameFormats"),
          "nameFormats",
          nameFormatWrites,
        );
        deferredHydration.nameFormats = false;
        nameFormatsSnapshotLoaded = true;
        reasons = removeDetailReason(reasons, "nameFormats");
        detailMessages.push("Loaded the current NXT addressee and salutation values for this record.");
        loadedAnyScope = true;
      } catch (error) {
        recordScopeFailure("nameFormats", error);
      }
    }

    if (scopes.includes("educations") && preview.input?.educationRelationship) {
      try {
        const liveEducations = await fetchCurrentEducations({
          userId: authResult.user.id,
          authUserId: authResult.user.id,
          origin,
          constituentId,
        });
        const educationWrite = buildEducationRelationshipWrite(
          preview.input || {},
          currentMatch,
          liveEducations,
        );
        writePlan = appendScopeWrites(
          removeScopeWrites(writePlan, "educations"),
          "educations",
          educationWrite ? [educationWrite] : [],
        );
        currentEducations = liveEducations.map(serializeEducation);
        deferredHydration.educations = false;
        reasons = removeDetailReason(reasons, "educations");
        detailMessages.push("Loaded the current NXT education relationships for this record.");
        loadedAnyScope = true;
      } catch (error) {
        recordScopeFailure("educations", error);
      }
    }

    if (scopes.includes("codes") && hasConstituencyInput(preview.input)) {
      try {
        currentCodes = await fetchCurrentConstituencyCodes({
          userId: authResult.user.id,
          authUserId: authResult.user.id,
          origin,
          constituentId,
        });
        const codePreview = previewConstituencyChange(preview.input || {}, currentCodes, {
          useHierarchy: preview.useHierarchy !== false,
        });
        const codeWrites = buildConstituencyCodeWrites(preview.input || {}, codePreview);
        writePlan = appendScopeWrites(removeScopeWrites(writePlan, "codes"), "codes", codeWrites);
        deferredHydration.codes = false;
        currentCodeDetails = currentCodes.map(serializeConstituencyCode);
        proposedCodes = codePreview.proposedCodes;
        codesSnapshotLoaded = true;
        reasons = [
          ...removeDetailReason(reasons, "codes"),
          ...codePreview.reasons,
        ];
        detailMessages.push("Loaded the current NXT constituencies for this record.");
        loadedAnyScope = true;
      } catch (error) {
        recordScopeFailure("codes", error);
      }
    }

    const hasDeferredHydration = Object.values(deferredHydration).some(Boolean);
    const nextStatus = getNextStatus(row, writePlan);
    const refreshedQuotaPause =
      loadedAnyScope &&
      (preview.nxtChecksPaused || preview.matchMethod === QUOTA_PAUSED_MATCH_METHOD);
    const nextPreview = {
      ...preview,
      nxtChecksPaused: quotaPauseEncountered,
      quotaRecoveryRequired: false,
      status: nextStatus,
      matchStatus:
        refreshedQuotaPause && constituentId ? "matched" : preview.matchStatus || row.match_status || "",
      matchMethod: refreshedQuotaPause ? "Saved match refreshed" : preview.matchMethod || row.match_method || "",
      currentContacts,
      currentNameFormats,
      currentCodes: currentCodes.map((code) => code.label),
      currentCodeDetails,
      proposedCodes,
      profileSnapshot,
      profileSnapshotLoaded,
      contactSnapshotStatus,
      contactsSnapshotLoaded,
      nameFormatsSnapshotLoaded,
      codesSnapshotLoaded,
      currentEducations,
      deferredHydration: hasDeferredHydration ? deferredHydration : null,
      writePlan,
      reasons: [...new Set(reasons)],
      intentDisposition:
        preview.intentDisposition?.key === "nxt_checks_paused" && !quotaPauseEncountered
          ? null
          : preview.intentDisposition || null,
    };
    const previousResult =
      row.blackbaud_result && typeof row.blackbaud_result === "object" ? row.blackbaud_result : {};
    const nextResult = {
      ...(isQuotaPausedText(previousResult) ? {} : previousResult),
      detailHydration: {
        ...(row.blackbaud_result?.detailHydration || {}),
        loadedAt: new Date().toISOString(),
        scopes,
        failedScopes,
      },
    };

    await sql`
      UPDATE constituency_import_rows
      SET
        status = ${nextStatus},
        preview = ${JSON.stringify(nextPreview)}::jsonb,
        requested_writes = ${JSON.stringify(writePlan)}::jsonb,
        blackbaud_result = ${JSON.stringify(nextResult)}::jsonb,
        blackbaud_error = NULL,
        updated_at = NOW()
      WHERE id = ${routeParams.rowId} AND run_id = ${routeParams.runId}
    `;
    await refreshRunSummary(routeParams.runId);

    return Response.json({
      message: [...detailMessages, ...detailFailureMessages].join(" ") || "Loaded current NXT record details.",
      status: nextStatus,
      scopes,
      failedScopes,
      complete: failedScopes.length === 0,
    });
  } catch (error) {
    console.error("Error loading current NXT import review details:", error);
    if (isBlackbaudQuotaExceededError(error)) {
      return Response.json(
        { error: `NXT details could not be loaded. ${getQuotaPauseNotice(error)}` },
        { status: 429 },
      );
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to load current NXT record details" },
      { status: 500 },
    );
  }
}
