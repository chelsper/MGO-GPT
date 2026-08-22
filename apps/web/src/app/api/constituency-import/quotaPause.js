const QUOTA_PAUSED_MATCH_METHOD = "NXT checks paused";
const QUOTA_RECOVERY_MATCH_METHOD = "Saved match needs refresh";
const QUOTA_PAUSED_PATTERN =
  /(?:call[-\s]volume quota|out of call volume quota|quota will be replenished|nxt checks are paused)/i;

function cleanText(value) {
  return String(value || "").trim();
}

function toText(value) {
  if (value instanceof Error) return cleanText(value.message);
  if (Array.isArray(value)) return value.map(toText).filter(Boolean).join(" ");
  if (value && typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }
  return cleanText(value);
}

function getInput(preview) {
  return preview?.input && typeof preview.input === "object" ? preview.input : {};
}

function getSavedMatch(row, preview, input) {
  const blackbaudConstituentId = cleanText(
    row?.matched_blackbaud_constituent_id ||
      preview?.match?.blackbaudConstituentId ||
      input?.blackbaudConstituentId,
  );
  if (!blackbaudConstituentId) return null;

  return {
    blackbaudConstituentId,
    lookupId: cleanText(
      row?.matched_lookup_id || preview?.match?.lookupId || input?.lookupId,
    ) || null,
    name: cleanText(preview?.match?.name || input?.constituentName) || null,
    email: cleanText(preview?.match?.email || input?.email) || null,
  };
}

function getDeferredContactKinds(input, contactDecisions) {
  const section = (kind) =>
    contactDecisions?.[kind]?.__section && typeof contactDecisions[kind].__section === "object"
      ? contactDecisions[kind].__section
      : {};
  const kinds = [];
  if (
    input?.emailUpdates?.length ||
    (section("email").primaryOverride === true &&
      cleanText(section("email").existingPrimaryTargetId))
  ) {
    kinds.push("emails");
  }
  if (
    input?.phoneUpdates?.length ||
    (section("phone").primaryOverride === true &&
      cleanText(section("phone").existingPrimaryTargetId))
  ) {
    kinds.push("phones");
  }
  if (input?.addressUpdates?.length || cleanText(section("address").previousAddressTargetId)) {
    kinds.push("addresses");
  }
  return kinds;
}

function buildRecoveryWritePlan(input, preview) {
  const writes = [];
  const fieldDecisions =
    preview?.fieldReviewDecisions && typeof preview.fieldReviewDecisions === "object"
      ? preview.fieldReviewDecisions
      : {};
  const contactDecisions =
    preview?.contactReviewDecisions && typeof preview.contactReviewDecisions === "object"
      ? preview.contactReviewDecisions
      : {};
  const hasProfileUpdate = Boolean(
    input?.nameUpdate || input?.individualProfileUpdate || input?.educationRelationship,
  );
  const pendingContactKinds = getDeferredContactKinds(input, contactDecisions);

  if (hasProfileUpdate) {
    writes.push({
      type: "profile_detail_review",
      action: "load_current",
      requiresReview: true,
      deferredHydration: true,
      fieldDecisions,
      validationMessage:
        "Open this row to load the current NXT name and profile values before reviewing CSV changes.",
    });
  }

  if (pendingContactKinds.length) {
    writes.push({
      type: "contact_detail_review",
      action: "load_current",
      requiresReview: true,
      deferredHydration: true,
      contactDecisions,
      pendingKinds: pendingContactKinds,
      validationMessage:
        `Open this row to load the current NXT ${pendingContactKinds
          .map((kind) => ({ emails: "email", phones: "phone", addresses: "address" })[kind])
          .join(", ")} value${pendingContactKinds.length === 1 ? "" : "s"} before reviewing CSV changes.`,
    });
  }

  if (input?.nameFormatUpdate) {
    writes.push({
      type: "name_format_detail_review",
      action: "load_current",
      requiresReview: true,
      deferredHydration: true,
      fieldDecisions,
      validationMessage:
        "Open this row to load the current NXT addressee and salutation values before reviewing CSV changes.",
    });
  }

  if (cleanText(input?.sourceConstituency) || cleanText(input?.targetConstituency)) {
    writes.push({
      type: "constituent_code_detail_review",
      action: "load_current",
      requiresReview: true,
      deferredHydration: true,
      validationMessage:
        "Open this row to load the current NXT constituencies before reviewing this constituency change.",
    });
  }

  if (input?.educationRelationship) {
    const relationship = input.educationRelationship;
    const action = cleanText(relationship.action) || "add";
    writes.push({
      type: "education_relationship",
      action: action === "review-update" ? "review_existing" : action,
      duplicatePolicy:
        action === "review-update" ? "review_and_update_selected" : "review_before_apply",
      recordType: "Individual",
      institution: cleanText(relationship.institution),
      degree: cleanText(relationship.degree),
      major: cleanText(relationship.major),
      minor: cleanText(relationship.minor),
      schoolType: cleanText(relationship.schoolType),
      campus: cleanText(relationship.campus),
      fraternitySorority: cleanText(relationship.fraternitySorority),
      gpa: cleanText(relationship.gpa),
      classYear: cleanText(relationship.classYear),
      status: cleanText(relationship.status),
      dateGraduated: cleanText(relationship.dateGraduated),
      dateEntered: cleanText(relationship.dateEntered),
      dateLeft: cleanText(relationship.dateLeft),
      makePrimary: relationship.makePrimary || "",
      requiresReview: true,
      deferredHydration: true,
      validationMessage:
        action === "review-update"
          ? "Open this row to load the current NXT education relationships before choosing which one to update."
          : "Open this row to load the current NXT education relationships before confirming this education import.",
    });
  }

  return writes;
}

function buildRecoveryDeferredHydration(input, contactDecisions) {
  const contactKinds = getDeferredContactKinds(input, contactDecisions);
  return {
    detail: Boolean(input?.nameUpdate || input?.individualProfileUpdate || input?.educationRelationship),
    contacts: contactKinds.length > 0,
    nameFormats: Boolean(input?.nameFormatUpdate),
    educations: Boolean(input?.educationRelationship),
    codes: Boolean(cleanText(input?.sourceConstituency) || cleanText(input?.targetConstituency)),
  };
}

function normalizeExpiredQuotaPausePreview(row, preview) {
  const input = getInput(preview);
  const match = getSavedMatch(row, preview, input);
  const contactDecisions =
    preview?.contactReviewDecisions && typeof preview.contactReviewDecisions === "object"
      ? preview.contactReviewDecisions
      : {};
  const deferredHydration = buildRecoveryDeferredHydration(input, contactDecisions);

  return {
    ...preview,
    nxtChecksPaused: false,
    quotaRecoveryRequired: true,
    status: "Needs Review",
    matchStatus: match ? "matched" : "needs_review",
    matchMethod: match ? QUOTA_RECOVERY_MATCH_METHOD : "NXT refresh required",
    confidence: match ? Number(row?.confidence || preview?.confidence || 0) : 0,
    match,
    currentCodes: [],
    currentCodeDetails: [],
    currentContacts: { emails: [], phones: [], addresses: [] },
    contactSnapshotStatus: { emails: false, phones: false, addresses: false },
    contactsSnapshotLoaded: false,
    currentNameFormats: {
      addressee: { id: "", value: "" },
      salutation: { id: "", value: "" },
    },
    nameFormatsSnapshotLoaded: false,
    profileSnapshot: null,
    profileSnapshotLoaded: false,
    currentEducations: [],
    codesSnapshotLoaded: false,
    deferredHydration,
    proposedCodes: [],
    writePlan: buildRecoveryWritePlan(input, preview),
    reasons: [
      "A previous Blackbaud quota pause has expired. Load the current NXT values for this saved row before confirming or sending it.",
    ],
    intentDisposition: {
      key: "needs_resolution",
      label: "Refresh NXT values",
      allowApply: false,
      message:
        "This saved row was paused while Blackbaud was unavailable. Refresh its current NXT values before confirming any changes.",
    },
  };
}

export { QUOTA_PAUSED_MATCH_METHOD, QUOTA_RECOVERY_MATCH_METHOD };

export function isQuotaPausedText(value) {
  return QUOTA_PAUSED_PATTERN.test(toText(value));
}

export function getQuotaPauseNotice(value) {
  const text = toText(value);
  const durationMatch = text.match(
    /(?:quota (?:will be )?replenished|replenished)\s+in\s+(\d{1,2}):(\d{2}):(\d{2})/i,
  );
  const aboutMatch = text.match(/about\s+(\d+)\s+minutes?/i);
  const durationMinutes = durationMatch
    ? Math.ceil(
        (Number(durationMatch[1]) * 60 * 60 + Number(durationMatch[2]) * 60 + Number(durationMatch[3])) /
          60,
      )
    : Number(aboutMatch?.[1] || 0);
  const wait = durationMinutes
    ? ` Blackbaud estimates availability in about ${durationMinutes} minute${durationMinutes === 1 ? "" : "s"}.`
    : "";

  return `Blackbaud's call-volume quota is temporarily unavailable.${wait} This import row was saved safely; no NXT record was checked and no NXT change is staged or will be sent until the quota is restored.`;
}

export function normalizeQuotaPausedPreview(preview, notice) {
  return {
    ...(preview && typeof preview === "object" ? preview : {}),
    nxtChecksPaused: true,
    status: "Needs Review",
    matchStatus: "needs_review",
    matchMethod: QUOTA_PAUSED_MATCH_METHOD,
    confidence: 0,
    match: null,
    currentCodes: [],
    currentCodeDetails: [],
    currentContacts: { emails: [], phones: [], addresses: [] },
    currentNameFormats: {
      addressee: { id: "", value: "" },
      salutation: { id: "", value: "" },
    },
    currentEducations: [],
    deferredHydration: null,
    proposedCodes: [],
    writePlan: [],
    reasons: [notice],
    intentDisposition: {
      key: "nxt_checks_paused",
      label: "NXT checks paused",
      allowApply: false,
      message:
        "This import row is saved safely. Blackbaud did not allow an NXT lookup, so it cannot be reviewed or sent until the quota is replenished.",
    },
  };
}

export function isQuotaPausedImportRow(row, preview) {
  const persistedPreview = preview && typeof preview === "object" ? preview : {};
  const status = cleanText(row?.status || persistedPreview.status);
  if (["Applied", "Failed"].includes(status)) return false;

  const previewMatchMethod = cleanText(persistedPreview.matchMethod);
  const storedMatchMethod = cleanText(row?.match_method);
  if (
    persistedPreview.nxtChecksPaused ||
    previewMatchMethod === QUOTA_PAUSED_MATCH_METHOD ||
    (!previewMatchMethod && storedMatchMethod === QUOTA_PAUSED_MATCH_METHOD)
  ) {
    return true;
  }

  // A successful scoped refresh records a new preview match method. Do not let
  // the historical database column or old provider payload re-pause that row.
  if (previewMatchMethod) return false;

  const details = [
    storedMatchMethod || previewMatchMethod,
    persistedPreview.reasons,
    row?.blackbaud_error,
    row?.blackbaud_result,
  ];
  const text = toText(details);
  return (
    isQuotaPausedText(text) &&
    /saved safely without attempting further nxt calls|retry its review after|nxt checks are paused/i.test(text)
  );
}

export function normalizeQuotaPausedImportRow(row, { quotaPaused = true } = {}) {
  const persistedPreview = row?.preview && typeof row.preview === "object" ? row.preview : {};
  const wasQuotaPaused = isQuotaPausedImportRow(row, persistedPreview);
  if (!wasQuotaPaused) {
    return { quotaPaused: false, quotaRecoveryRequired: false, preview: persistedPreview };
  }

  if (!quotaPaused) {
    return {
      quotaPaused: false,
      quotaRecoveryRequired: true,
      preview: normalizeExpiredQuotaPausePreview(row, persistedPreview),
    };
  }

  return {
    quotaPaused: true,
    quotaRecoveryRequired: false,
    preview: normalizeQuotaPausedPreview(
      persistedPreview,
      getQuotaPauseNotice([
        row?.match_method,
        persistedPreview.matchMethod,
        persistedPreview.reasons,
        row?.blackbaud_error,
        row?.blackbaud_result,
      ]),
    ),
  };
}

export function sanitizeQuotaPauseWarnings(warnings, { quotaPaused = true } = {}) {
  const values = Array.isArray(warnings) ? warnings : [];
  return values.flatMap((warning) => {
    if (!isQuotaPausedText(warning)) return [warning];
    return quotaPaused ? [getQuotaPauseNotice(warning)] : [];
  });
}
