import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import sql from "@/app/api/utils/sql";
import {
  buildContactDetailPreview,
  buildDeferredContactDetailWrite,
  getContactSnapshotStatus,
} from "@/app/api/constituency-import/preview/route";
import { isReviewerRole } from "@/utils/workspaceRoles";

const CONTACT_WRITE_TYPES = new Set([
  "contact_detail_review",
  "email_address",
  "phone",
  "address",
]);
const EDUCATION_FIELDS = new Set(["major", "minor"]);
const ADDRESS_FIELDS = [
  "addressLine1",
  "addressLine2",
  "city",
  "state",
  "postalCode",
  "country",
];

class InvalidCorrectionError extends Error {}

function cleanText(value) {
  return String(value ?? "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim();
}

function objectOrEmpty(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
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

function getNextStatus(row, writePlan) {
  if (["Applied", "Failed", "Conflict", "Skipped"].includes(row.status)) return row.status;
  // A source correction cannot resolve another pending review requirement. Preserve
  // a held row until its existing review has been explicitly completed.
  if (row.status === "Needs Review") return "Needs Review";
  if (writePlan.some((write) => write?.requiresReview)) return "Needs Review";
  return writePlan.length ? "Ready" : "Skipped";
}

function removeContactWrites(writePlan) {
  return writePlan.filter((write) => !CONTACT_WRITE_TYPES.has(write?.type));
}

function appendContactWrites(writePlan, writes) {
  const next = [];
  let inserted = false;

  writePlan.forEach((write) => {
    if (!CONTACT_WRITE_TYPES.has(write?.type)) {
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

function validateText(value, { label, required = false, maxLength = 200 }) {
  const text = cleanText(value);
  if (required && !text) {
    throw new InvalidCorrectionError(`${label} is required.`);
  }
  if (text.length > maxLength) {
    throw new InvalidCorrectionError(`${label} must be ${maxLength} characters or fewer.`);
  }
  if (/\r|\n/.test(text)) {
    throw new InvalidCorrectionError(
      `${label} cannot contain a line break. Use Address Line 2 for a second address line.`,
    );
  }
  return text;
}

function updateOverrideAudit({ overrides, section, field, originalValue, correctedValue, user, correctedAt }) {
  const sectionValues = objectOrEmpty(overrides[section]);
  const prior = objectOrEmpty(sectionValues[field]);
  return {
    ...overrides,
    [section]: {
      ...sectionValues,
      [field]: {
        originalValue: hasOwn(prior, "originalValue") ? prior.originalValue : originalValue,
        correctedValue,
        correctedAt,
        correctedByUserId: user.id,
        correctedByEmail: user.email || "",
      },
    },
  };
}

function replaceEducationWriteValues(writePlan, relationship) {
  let foundEducationWrite = false;
  const nextWritePlan = writePlan.map((write) => {
    if (write?.type !== "education_relationship") return write;
    foundEducationWrite = true;

    const nextWrite = {
      ...write,
      major: cleanText(relationship.major),
      minor: cleanText(relationship.minor),
    };

    // A duplicate-safe no-op was based on the original CSV values. Once a reviewer
    // corrects the major/minor, require an explicit current-row selection instead of
    // assuming the original duplicate still applies.
    if (write.action === "skip_existing") {
      const {
        existingEducation,
        reviewSelection,
        targetEducationId,
        ...reviewWrite
      } = nextWrite;
      return {
        ...reviewWrite,
        action: "review_existing",
        duplicatePolicy: "review_and_update_selected",
        requiresReview: true,
        validationMessage:
          "The staged education major or minor was corrected. Choose the exact current NXT education relationship to update before sending this record.",
      };
    }

    return nextWrite;
  });

  if (!foundEducationWrite) {
    throw new Error("This row has no staged education relationship to correct.");
  }
  return nextWritePlan;
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
        { error: "Only Advancement Services users can correct staged import values." },
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

export async function POST(request, { params }) {
  try {
    await ensureAppSchema();
    const authResult = await requireReviewer(request);
    if (authResult.error) return authResult.error;

    const routeParams = parseRouteParams(params);
    if (routeParams.error) return Response.json({ error: routeParams.error }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const hasEducationChanges = Object.keys(objectOrEmpty(body?.education)).some((field) =>
      EDUCATION_FIELDS.has(field),
    );
    const hasAddressChanges = Array.isArray(body?.addressUpdates);
    if (!hasEducationChanges && !hasAddressChanges) {
      return Response.json({ error: "Provide at least one staged CSV correction." }, { status: 400 });
    }

    const rows = await sql`
      SELECT *
      FROM constituency_import_rows
      WHERE id = ${routeParams.rowId} AND run_id = ${routeParams.runId}
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) return Response.json({ error: "Import row not found" }, { status: 404 });
    if (["Applied", "Failed", "Skipped"].includes(row.status)) {
      return Response.json(
        { error: "This row cannot be corrected after it has been applied, failed, or skipped." },
        { status: 409 },
      );
    }

    const preview = getPreview(row);
    const originalInput = objectOrEmpty(preview.input);
    const nextInput = {
      ...originalInput,
      educationRelationship: objectOrEmpty(originalInput.educationRelationship),
      addressUpdates: Array.isArray(originalInput.addressUpdates)
        ? originalInput.addressUpdates.map((address) => ({ ...objectOrEmpty(address) }))
        : [],
    };
    let nextWritePlan = getWritePlan(row).map((write) => ({ ...write }));
    let overrides = objectOrEmpty(preview.csvOverrides);
    const correctedAt = new Date().toISOString();
    const changedLabels = [];
    let educationValuesChanged = false;
    let addressValuesChanged = false;

    if (hasEducationChanges) {
      if (!originalInput.educationRelationship || !Object.keys(originalInput.educationRelationship).length) {
        return Response.json(
          { error: "This row has no education values to correct." },
          { status: 409 },
        );
      }
      const submittedEducation = objectOrEmpty(body.education);
      EDUCATION_FIELDS.forEach((field) => {
        if (!hasOwn(submittedEducation, field)) return;
        const label = field === "major" ? "Education Major" : "Education Minor";
        const nextValue = validateText(submittedEducation[field], { label, maxLength: 160 });
        const previousValue = cleanText(nextInput.educationRelationship[field]);
        if (nextValue === previousValue) return;
        nextInput.educationRelationship[field] = nextValue;
        educationValuesChanged = true;
        overrides = updateOverrideAudit({
          overrides,
          section: "education",
          field,
          originalValue: previousValue,
          correctedValue: nextValue,
          user: authResult.user,
          correctedAt,
        });
        changedLabels.push(label);
      });
      if (educationValuesChanged) {
        nextWritePlan = replaceEducationWriteValues(nextWritePlan, nextInput.educationRelationship);
      }
    }

    if (hasAddressChanges) {
      if (!nextInput.addressUpdates.length) {
        return Response.json({ error: "This row has no address values to correct." }, { status: 409 });
      }
      if (body.addressUpdates.length !== nextInput.addressUpdates.length) {
        return Response.json(
          { error: "Address corrections must keep the same number of staged addresses." },
          { status: 400 },
        );
      }

      body.addressUpdates.forEach((submittedAddress, index) => {
        const submitted = objectOrEmpty(submittedAddress);
        const currentAddress = nextInput.addressUpdates[index];
        ADDRESS_FIELDS.forEach((field) => {
          if (!hasOwn(submitted, field)) return;
          const label = {
            addressLine1: "Address Line 1",
            addressLine2: "Address Line 2",
            city: "Address City",
            state: "Address State",
            postalCode: "Address Postal Code",
            country: "Address Country",
          }[field];
          const nextValue = validateText(submitted[field], {
            label,
            required: field === "addressLine1",
            maxLength: field === "postalCode" ? 40 : 160,
          });
          const previousValue = cleanText(currentAddress[field]);
          if (nextValue === previousValue) return;
          currentAddress[field] = nextValue;
          addressValuesChanged = true;
          const addressKey = String(index);
          const addressOverrides = objectOrEmpty(overrides.addresses);
          overrides = {
            ...overrides,
            addresses: updateOverrideAudit({
              overrides: addressOverrides,
              section: addressKey,
              field,
              originalValue: previousValue,
              correctedValue: nextValue,
              user: authResult.user,
              correctedAt,
            }),
          };
          changedLabels.push(`${label} for address ${index + 1}`);
        });
      });

      if (addressValuesChanged) {
        const contactDecisions = objectOrEmpty(preview.contactReviewDecisions);
        const contactSnapshotStatus = getContactSnapshotStatus(
          preview.contactSnapshotStatus,
          preview.contactsSnapshotLoaded === true,
        );
        const contactPreview = buildContactDetailPreview(
          nextInput,
          preview.currentContacts || { emails: [], phones: [], addresses: [] },
          contactDecisions,
          { snapshotStatus: contactSnapshotStatus },
        );
        const deferredContactWrite = buildDeferredContactDetailWrite(
          nextInput,
          contactDecisions,
          contactPreview.unavailableKinds,
        );
        nextWritePlan = appendContactWrites(
          removeContactWrites(nextWritePlan),
          [...contactPreview.writes, deferredContactWrite].filter(Boolean),
        );
      }
    }

    if (!changedLabels.length) {
      return Response.json({ error: "No staged CSV values changed." }, { status: 400 });
    }

    const deferredHydration = objectOrEmpty(preview.deferredHydration);
    if (addressValuesChanged) {
      const contactDecisions = objectOrEmpty(preview.contactReviewDecisions);
      const contactSnapshotStatus = getContactSnapshotStatus(
        preview.contactSnapshotStatus,
        preview.contactsSnapshotLoaded === true,
      );
      const contactPreview = buildContactDetailPreview(
        nextInput,
        preview.currentContacts || { emails: [], phones: [], addresses: [] },
        contactDecisions,
        { snapshotStatus: contactSnapshotStatus },
      );
      deferredHydration.contacts = Boolean(
        buildDeferredContactDetailWrite(nextInput, contactDecisions, contactPreview.unavailableKinds),
      );
    }
    const hasDeferredHydration = Object.values(deferredHydration).some(Boolean);
    const nextStatus = getNextStatus(row, nextWritePlan);
    const correctionMessage = `Advancement Services corrected staged CSV value${changedLabels.length === 1 ? "" : "s"}: ${changedLabels.join(", ")}.`;
    const nextPreview = {
      ...preview,
      input: nextInput,
      csvOverrides: overrides,
      status: nextStatus,
      writePlan: nextWritePlan,
      deferredHydration: hasDeferredHydration ? deferredHydration : null,
      reasons: [
        ...(Array.isArray(preview.reasons) ? preview.reasons : []).filter(
          (reason) => !/^Advancement Services corrected staged CSV values?:/i.test(cleanText(reason)),
        ),
        correctionMessage,
      ],
    };

    await sql`
      UPDATE constituency_import_rows
      SET
        status = ${nextStatus},
        preview = ${JSON.stringify(nextPreview)}::jsonb,
        requested_writes = ${JSON.stringify(nextWritePlan)}::jsonb,
        updated_at = NOW()
      WHERE id = ${routeParams.rowId} AND run_id = ${routeParams.runId}
    `;
    await refreshRunSummary(routeParams.runId);

    return Response.json({
      status: nextStatus,
      message:
        "Saved the staged CSV correction. The uploaded CSV and all NXT records remain unchanged until this row is later sent to NXT.",
    });
  } catch (error) {
    if (!(error instanceof InvalidCorrectionError)) {
      console.error("Error saving constituency import source override:", error);
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to save staged CSV correction" },
      { status: error instanceof InvalidCorrectionError ? 400 : 500 },
    );
  }
}
