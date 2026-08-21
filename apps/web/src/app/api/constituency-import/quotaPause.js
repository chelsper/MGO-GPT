const QUOTA_PAUSED_MATCH_METHOD = "NXT checks paused";
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

export { QUOTA_PAUSED_MATCH_METHOD };

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

  const storedMatchMethod = cleanText(row?.match_method || persistedPreview.matchMethod);
  if (persistedPreview.nxtChecksPaused || storedMatchMethod === QUOTA_PAUSED_MATCH_METHOD) {
    return true;
  }

  const details = [
    storedMatchMethod,
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

export function normalizeQuotaPausedImportRow(row) {
  const persistedPreview = row?.preview && typeof row.preview === "object" ? row.preview : {};
  const quotaPaused = isQuotaPausedImportRow(row, persistedPreview);
  if (!quotaPaused) {
    return { quotaPaused: false, preview: persistedPreview };
  }

  return {
    quotaPaused: true,
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

export function sanitizeQuotaPauseWarnings(warnings) {
  const values = Array.isArray(warnings) ? warnings : [];
  return values.map((warning) =>
    isQuotaPausedText(warning) ? getQuotaPauseNotice(warning) : warning,
  );
}
