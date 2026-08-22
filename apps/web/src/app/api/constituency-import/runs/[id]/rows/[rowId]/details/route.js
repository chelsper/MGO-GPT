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
  buildNameFormatDetailWrites,
  buildProfileDetailWrites,
  serializeContactSnapshot,
  serializeNameFormat,
} from "@/app/api/constituency-import/preview/route";
import { getQuotaPauseNotice } from "@/app/api/constituency-import/quotaPause";
import { isReviewerRole } from "@/utils/workspaceRoles";

const DETAIL_SCOPES = new Set(["profile", "contacts", "nameFormats"]);
const SCOPE_WRITE_TYPES = {
  profile: new Set(["profile_detail_review", "constituent_name", "constituent_profile"]),
  contacts: new Set(["contact_detail_review", "email_address", "phone", "address"]),
  nameFormats: new Set(["name_format_detail_review", "constituent_name_format"]),
};

function cleanText(value) {
  return String(value || "").trim();
}

function getCollection(payload) {
  return Array.isArray(payload?.value) ? payload.value : Array.isArray(payload) ? payload : [];
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
  };
  return (Array.isArray(reasons) ? reasons : []).filter(
    (reason) => !patterns[scope].test(cleanText(reason)),
  );
}

async function fetchCurrentContacts({ userId, authUserId, origin, constituentId }) {
  const basePath = `/constituent/v1/constituents/${encodeURIComponent(constituentId)}`;
  const [emails, phones, addresses] = await Promise.all([
    blackbaudApiFetch(`${basePath}/emailaddresses`, { userId, authUserId, origin }),
    blackbaudApiFetch(`${basePath}/phones`, { userId, authUserId, origin }),
    blackbaudApiFetch(`${basePath}/addresses`, { userId, authUserId, origin }),
  ]);

  return serializeContactSnapshot({
    emails: getCollection(emails),
    phones: getCollection(phones),
    addresses: getCollection(addresses),
  });
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
    if (preview.nxtChecksPaused) {
      return Response.json(
        { error: "NXT checks are paused until Blackbaud's call-volume quota is available." },
        { status: 409 },
      );
    }

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
    let profileSnapshot = preview.profileSnapshot || null;
    let contactsSnapshotLoaded = Boolean(preview.contactsSnapshotLoaded);
    let nameFormatsSnapshotLoaded = Boolean(preview.nameFormatsSnapshotLoaded);
    const deferredHydration = getDeferredHydration(preview);
    let reasons = Array.isArray(preview.reasons) ? preview.reasons : [];
    const detailMessages = [];

    if (scopes.includes("profile")) {
      const detailedMatch = await getBlackbaudConstituentById({
        userId: authResult.user.id,
        authUserId: authResult.user.id,
        origin,
        constituentId,
      });
      const profileWrites = buildProfileDetailWrites(
        preview.input || {},
        detailedMatch,
      );
      writePlan = appendScopeWrites(removeScopeWrites(writePlan, "profile"), "profile", profileWrites);
      deferredHydration.detail = false;
      profileSnapshot = detailedMatch?.raw || null;
      reasons = removeDetailReason(reasons, "profile");
      detailMessages.push("Loaded the current NXT name and profile values for this record.");
    }

    if (scopes.includes("contacts") && hasContactInput(preview.input)) {
      currentContacts = await fetchCurrentContacts({
        userId: authResult.user.id,
        authUserId: authResult.user.id,
        origin,
        constituentId,
      });
      const contactPreview = buildContactDetailPreview(preview.input || {}, currentContacts, {});
      writePlan = appendScopeWrites(
        removeScopeWrites(writePlan, "contacts"),
        "contacts",
        contactPreview.writes,
      );
      deferredHydration.contacts = false;
      contactsSnapshotLoaded = true;
      reasons = [
        ...removeDetailReason(reasons, "contacts"),
        ...contactPreview.noopReasons,
      ];
      detailMessages.push("Loaded the current NXT contact values for this record.");
    }

    if (scopes.includes("nameFormats") && preview.input?.nameFormatUpdate) {
      currentNameFormats = await fetchCurrentNameFormats({
        userId: authResult.user.id,
        authUserId: authResult.user.id,
        origin,
        constituentId,
      });
      const nameFormatWrites = buildNameFormatDetailWrites(
        preview.input || {},
        currentNameFormats,
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
    }

    const hasDeferredHydration = Object.values(deferredHydration).some(Boolean);
    const nextStatus = getNextStatus(row, writePlan);
    const nextPreview = {
      ...preview,
      status: nextStatus,
      currentContacts,
      currentNameFormats,
      profileSnapshot,
      contactsSnapshotLoaded,
      nameFormatsSnapshotLoaded,
      deferredHydration: hasDeferredHydration ? deferredHydration : null,
      writePlan,
      reasons: [...new Set(reasons)],
    };
    const nextResult = {
      ...(row.blackbaud_result && typeof row.blackbaud_result === "object" ? row.blackbaud_result : {}),
      detailHydration: {
        ...(row.blackbaud_result?.detailHydration || {}),
        loadedAt: new Date().toISOString(),
        scopes,
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
      message: detailMessages.join(" ") || "Loaded current NXT record details.",
      status: nextStatus,
      scopes,
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
