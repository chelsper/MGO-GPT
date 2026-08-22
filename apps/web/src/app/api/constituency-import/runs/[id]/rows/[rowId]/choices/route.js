import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import sql from "@/app/api/utils/sql";
import {
  buildContactDetailPreview,
  buildDeferredContactDetailWrite,
  buildNameFormatDetailWrites,
  buildProfileDetailWrites,
  getContactSnapshotStatus,
  hasUsableProfileSnapshot,
} from "@/app/api/constituency-import/preview/route";
import { isReviewerRole } from "@/utils/workspaceRoles";

const SCOPE_WRITE_TYPES = {
  profile: new Set(["profile_detail_review", "constituent_name", "constituent_profile"]),
  contacts: new Set(["contact_detail_review", "email_address", "phone", "address"]),
  nameFormats: new Set(["name_format_detail_review", "constituent_name_format"]),
};

function cleanText(value) {
  return String(value || "").trim();
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

function getDeferredReviewWrite(writePlan, type) {
  return writePlan.find((write) => write?.type === type && write?.deferredHydration);
}

function buildDeferredProfileWrite(input, fieldDecisions) {
  if (!input?.nameUpdate && !input?.individualProfileUpdate) return [];
  return [
    {
      type: "profile_detail_review",
      action: "load_current",
      requiresReview: true,
      deferredHydration: true,
      fieldDecisions,
      validationMessage:
        "Current NXT name and profile values have not been loaded. Load the record details before applying this row.",
    },
  ];
}

function buildDeferredNameFormatWrite(input, fieldDecisions) {
  if (!input?.nameFormatUpdate) return [];
  return [
    {
      type: "name_format_detail_review",
      action: "load_current",
      requiresReview: true,
      deferredHydration: true,
      fieldDecisions,
      validationMessage:
        "Current NXT addressee and salutation values have not been loaded. Load the record details before applying this row.",
    },
  ];
}

function getNextStatus(row, writePlan) {
  if (["Applied", "Failed", "Conflict"].includes(row.status)) return row.status;
  if (writePlan.some((write) => write?.requiresReview)) return "Needs Review";
  return writePlan.length ? "Ready" : "Skipped";
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
  const nextStatus =
    summary.failed > 0 || summary.needsReview > 0 || summary.ready > 0
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
        { error: "Only Advancement Services users can save import review choices." },
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

function objectOrEmpty(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export async function POST(request, { params }) {
  try {
    await ensureAppSchema();
    const authResult = await requireReviewer(request);
    if (authResult.error) return authResult.error;

    const routeParams = parseRouteParams(params);
    if (routeParams.error) return Response.json({ error: routeParams.error }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const contactDecisions = objectOrEmpty(body?.contactDecisions);
    const fieldDecisions = objectOrEmpty(body?.fieldDecisions);
    const saveContactDecisions = body?.saveContactDecisions === true;
    const saveFieldDecisions = body?.saveFieldDecisions === true;
    if (!saveContactDecisions && !saveFieldDecisions) {
      return Response.json({ error: "Choose at least one review section to save." }, { status: 400 });
    }

    const rows = await sql`
      SELECT *
      FROM constituency_import_rows
      WHERE id = ${routeParams.rowId} AND run_id = ${routeParams.runId}
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) return Response.json({ error: "Import row not found" }, { status: 404 });

    const preview = getPreview(row);
    let writePlan = getWritePlan(row).map((write) => ({ ...write }));
    const nextPreview = { ...preview };
    const deferredHydration =
      preview.deferredHydration && typeof preview.deferredHydration === "object"
        ? { ...preview.deferredHydration }
        : {};
    const input = preview.input || {};
    const messages = [];

    if (saveContactDecisions) {
      nextPreview.contactReviewDecisions = contactDecisions;
      const contactSnapshotStatus = getContactSnapshotStatus(
        preview.contactSnapshotStatus,
        preview.contactsSnapshotLoaded === true,
      );
      const contactPreview = buildContactDetailPreview(
        input,
        preview.currentContacts || { emails: [], phones: [], addresses: [] },
        contactDecisions,
        { snapshotStatus: contactSnapshotStatus },
      );
      const deferredContactWrite = buildDeferredContactDetailWrite(
        input,
        contactDecisions,
        contactPreview.unavailableKinds,
      );
      writePlan = appendScopeWrites(
        removeScopeWrites(writePlan, "contacts"),
        "contacts",
        [...contactPreview.writes, deferredContactWrite].filter(Boolean),
      );
      deferredHydration.contacts = Boolean(deferredContactWrite);
      messages.push(
        deferredContactWrite
          ? "Saved contact choices. Any unavailable NXT contact section remains in review before this row can be sent."
          : "Saved contact and primary-designation choices.",
      );
    }

    if (saveFieldDecisions) {
      nextPreview.fieldReviewDecisions = fieldDecisions;
      if (
        preview.profileSnapshotLoaded === true &&
        preview.profileSnapshot &&
        hasUsableProfileSnapshot({ raw: preview.profileSnapshot })
      ) {
        const profileWrites = buildProfileDetailWrites(
          input,
          { raw: preview.profileSnapshot },
          fieldDecisions,
        );
        writePlan = appendScopeWrites(
          removeScopeWrites(writePlan, "profile"),
          "profile",
          profileWrites,
        );
        deferredHydration.detail = false;
      } else {
        const deferredWrite = getDeferredReviewWrite(writePlan, "profile_detail_review");
        writePlan = appendScopeWrites(
          removeScopeWrites(writePlan, "profile"),
          "profile",
          deferredWrite
            ? [{ ...deferredWrite, fieldDecisions }]
            : buildDeferredProfileWrite(input, fieldDecisions),
        );
        deferredHydration.detail = Boolean(input?.nameUpdate || input?.individualProfileUpdate);
      }

      if (input?.nameFormatUpdate) {
        if (preview.nameFormatsSnapshotLoaded === true) {
          const formatWrites = buildNameFormatDetailWrites(
            input,
            preview.currentNameFormats || {},
            fieldDecisions,
          );
          writePlan = appendScopeWrites(
            removeScopeWrites(writePlan, "nameFormats"),
            "nameFormats",
            formatWrites,
          );
          deferredHydration.nameFormats = false;
        } else {
          const deferredWrite = getDeferredReviewWrite(writePlan, "name_format_detail_review");
          writePlan = appendScopeWrites(
            removeScopeWrites(writePlan, "nameFormats"),
            "nameFormats",
            deferredWrite
              ? [{ ...deferredWrite, fieldDecisions }]
              : buildDeferredNameFormatWrite(input, fieldDecisions),
          );
          deferredHydration.nameFormats = true;
        }
      }
      messages.push("Saved name, profile, and format choices.");
    }

    const hasDeferredHydration = Object.values(deferredHydration).some(Boolean);
    const nextStatus = getNextStatus(row, writePlan);
    nextPreview.status = nextStatus;
    nextPreview.writePlan = writePlan;
    nextPreview.deferredHydration = hasDeferredHydration ? deferredHydration : null;
    const constituentId = getMatchedConstituentId(row);

    await sql`
      UPDATE constituency_import_rows
      SET
        status = ${nextStatus},
        preview = ${JSON.stringify(nextPreview)}::jsonb,
        requested_writes = ${JSON.stringify(writePlan)}::jsonb,
        blackbaud_error = NULL,
        updated_at = NOW()
      WHERE id = ${routeParams.rowId} AND run_id = ${routeParams.runId}
    `;
    await refreshRunSummary(routeParams.runId);

    return Response.json({
      status: nextStatus,
      matchedConstituentId: constituentId || null,
      message: messages.join(" "),
      preview: nextPreview,
      writePlan,
    });
  } catch (error) {
    console.error("Error saving constituency import review choices:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to save import review choices" },
      { status: 500 },
    );
  }
}
