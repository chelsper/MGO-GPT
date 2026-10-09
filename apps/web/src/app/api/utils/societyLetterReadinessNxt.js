import { blackbaudApiFetch } from "./blackbaud";
import { letterError } from "@/utils/societyLetters";
import {
  completeAppealCatalog,
  appealByLookupCode,
} from "./societyLetterAppealCatalog";

const idPattern = /^[1-9][0-9]{0,17}$/;
export function letterRecordId(value) {
  const id = String(value ?? "").trim();
  if (!idPattern.test(id))
    throw letterError("A valid NXT system record ID is required.");
  return id;
}

// All paths are constructed here, never supplied by the browser or an API next link.
export function readinessReader(ctx, fetcher = blackbaudApiFetch) {
  let calls = 0;
  const deadline = Date.now() + 60000;
  let catalog;
  async function get(path) {
    if (++calls > 12 || Date.now() > deadline)
      throw letterError(
        "This household needs a larger NXT review. No readiness approval was saved.",
      );
    return fetcher(path, {
      userId: ctx.user.id,
      origin: ctx.origin,
      method: "GET",
      timeoutMs: 5000,
      maxRetries: 0,
    });
  }
  async function collection(path, profile, label, requireOwner = true) {
    const constituentId = String(profile.id);
    const member = `${profile.name || "Constituent"} (ID ${constituentId})`;
    let payload;
    try {
      payload = await get(path);
    } catch (error) {
      // A verified relationship-only profile is not a missing constituent.
      // Keep this distinct from an empty consent list; household evaluation
      // must confirm a reciprocal, full-constituent spouse before permitting it.
      if (
        !requireOwner &&
        profile.is_constituent === false &&
        error.httpStatus === 404 &&
        error.blackbaudErrorName === "ResourceNotFound" &&
        error.blackbaudErrorCode === 404
      )
        return null;
      if (error.httpStatus === 404) {
        const detail =
          profile.is_constituent === false
            ? "NXT identifies this person as a spouse or relationship-only record, not a full constituent. Review how this household should be recorded before continuing."
            : "The constituent profile was found. Check this record and your access in NXT before trying again.";
        throw letterError(
          `NXT could not return ${label} for ${member}. ${detail}`,
        );
      }
      throw error;
    }
    // These single-constituent endpoints default to all records. Never infer
    // completeness from an empty/missing array or silently accept a partial page.
    if (
      !Array.isArray(payload?.value) ||
      !Number.isInteger(payload.count) ||
      payload.count !== payload.value.length ||
      payload.count > 2000 ||
      payload.next_link ||
      payload.nextLink ||
      payload.continuation_token ||
      payload.value.some(
        (item) =>
          !item ||
          typeof item !== "object" ||
          Array.isArray(item) ||
          !item.id ||
          ((requireOwner || Object.hasOwn(item, "constituent_id")) &&
            String(item.constituent_id) !== constituentId),
      ) ||
      new Set(payload.value.map((item) => String(item.id))).size !==
        payload.count
    )
      throw letterError(
        `NXT returned incomplete or conflicting ${label} for ${member}. Review this record in NXT before continuing.`,
      );
    return payload.value;
  }
  return {
    async appealByCode(lookupId, description) {
      if (!catalog)
        catalog = completeAppealCatalog(
          await get("/fundraising/v1/appeals?include_inactive=true&limit=5000"),
        );
      const appeal = appealByLookupCode(
        catalog,
        { lookupId, description },
        "letter-sent",
      );
      return {
        id: letterRecordId(appeal.id),
        lookupId: appeal.lookup_id,
        description: appeal.description,
      };
    },
    async appeal(id) {
      id = letterRecordId(id);
      const appeal = await get(`/fundraising/v1/appeals/${id}`);
      if (String(appeal?.id) !== id || typeof appeal.description !== "string")
        throw letterError(
          "The letter appeal could not be verified in NXT. Check its system record ID.",
        );
      if (appeal.inactive !== false)
        throw letterError(
          "The letter-sent appeal is inactive or its active status could not be verified. Check NXT before saving.",
        );
      return {
        id,
        ...(typeof appeal.lookup_id === "string"
          ? { lookupId: appeal.lookup_id }
          : {}),
        description: appeal.description,
      };
    },
    async member(id) {
      id = letterRecordId(id);
      const base = `/constituent/v1/constituents/${id}`;
      const profile = await get(base);
      if (
        String(profile?.id) !== id ||
        !["Individual", "Organization"].includes(profile.type)
      )
        throw letterError(
          "The current constituent identity could not be verified in NXT.",
        );
      const appeals = await collection(
        `${base}/appeals`,
        profile,
        "appeal records",
      );
      // Society recognition letters do not use contact/solicit codes as holds.
      // Explicit address/email flags and consent records are still checked.
      // Consent rows are scoped by the requested constituent, and the official
      // response does not repeat constituent_id. Reject it if present and wrong.
      const consents = await collection(
        `/commpref/v1/constituents/${id}/consents?most_recent_only=true`,
        profile,
        "consent records",
        false,
      );
      return {
        profile,
        appeals,
        consents,
        ...(consents === null
          ? { consentUnavailable: "relationship_only" }
          : {}),
      };
    },
  };
}
