import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import sql from "@/app/api/utils/sql";
import {
  blackbaudApiFetch,
  findBlackbaudConstituentByEmail,
  getBlackbaudConstituentById,
  isBlackbaudQuotaExceededError,
  searchBlackbaudConstituents,
} from "@/app/api/utils/blackbaud";
import {
  cleanText,
  getCollection,
  getFamilyImportRow,
  parseFamilyRouteParams,
  refreshFamilyImportRunSummary,
  requireFamilyImportReviewer,
  serializeFamilyImportRow,
  toFamilyCandidate,
} from "@/app/api/family-import/utils";
import { getFamilyRowReadiness } from "@/utils/familyImport";

export const runtime = "nodejs";
// A single row handles at most two parents and three relationships. Keeping
// the duration bounded avoids tying up a function on an unhealthy NXT call.
export const maxDuration = 60;

const REQUEST_OPTIONS = { timeoutMs: 10000, maxRetries: 0 };

function parseStoredObject(value, fallback = {}) {
  if (value && typeof value === "object") return value;
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function normalizeText(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseBirthDate(value) {
  const normalized = cleanText(value);
  if (!normalized) return null;
  const isoMatch = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const usMatch = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!isoMatch && !usMatch) return undefined;

  const year = Number(isoMatch?.[1] ?? usMatch?.[3]);
  const month = Number(isoMatch?.[2] ?? usMatch?.[1]);
  const day = Number(isoMatch?.[3] ?? usMatch?.[2]);
  const currentTwoDigitYear = new Date().getUTCFullYear() % 100;
  const resolvedYear = year < 100 ? (year <= currentTwoDigitYear ? 2000 + year : 1900 + year) : year;
  const date = new Date(Date.UTC(resolvedYear, month - 1, day));
  if (
    date.getUTCFullYear() !== resolvedYear ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return undefined;
  }
  return { y: resolvedYear, m: month, d: day };
}

function extractCreatedConstituent(result) {
  const queue = [result];
  const seen = new Set();
  while (queue.length) {
    const candidate = queue.shift();
    if (!candidate || typeof candidate !== "object" || seen.has(candidate)) continue;
    seen.add(candidate);
    if (Array.isArray(candidate)) {
      candidate.forEach((item) => queue.push(item));
      continue;
    }
    const id = cleanText(
      candidate.id || candidate.constituent_id || candidate.constituentId || candidate.record_id,
    );
    if (id) {
      return {
        blackbaudConstituentId: id,
        lookupId: cleanText(candidate.lookup_id || candidate.lookupId),
      };
    }
    ["data", "value", "result", "constituent", "record", "response"].forEach((key) => {
      if (candidate[key]) queue.push(candidate[key]);
    });
  }
  return null;
}

function getPersonSelection(review, key) {
  const selection = review?.selections?.[key];
  return selection && typeof selection === "object" ? selection : null;
}

function getParent(input, key) {
  return (Array.isArray(input?.parents) ? input.parents : []).find(
    (parent) => parent?.key === key,
  ) || null;
}

function getRelationship(review, key) {
  return review?.relationships?.[key] && typeof review.relationships[key] === "object"
    ? review.relationships[key]
    : {};
}

function appendStep(application, step) {
  const steps = Array.isArray(application?.steps) ? application.steps : [];
  return {
    ...(application || {}),
    steps: [...steps.slice(-79), { at: new Date().toISOString(), ...step }],
  };
}

function getApplicationParent(application, key) {
  const parent = application?.parents?.[key];
  return parent && typeof parent === "object" ? parent : {};
}

async function persistApplication({ runId, rowId, application, status = "Applying", error = null }) {
  await sql`
    UPDATE family_import_rows
    SET
      status = ${status},
      application = ${JSON.stringify(application)}::jsonb,
      blackbaud_result = ${JSON.stringify({
        lastAttemptAt: new Date().toISOString(),
        steps: application.steps || [],
      })}::jsonb,
      blackbaud_error = ${error},
      updated_at = NOW()
    WHERE id = ${rowId}
      AND run_id = ${runId}
  `;
}

function getCreatePayload(person) {
  const first = cleanText(person?.firstName);
  const last = cleanText(person?.lastName);
  if (!first || !last) {
    throw new Error("First Name and Last Name are required before a new parent can be created in NXT.");
  }
  const birthdate = parseBirthDate(person?.birthDate);
  if (cleanText(person?.birthDate) && !birthdate) {
    throw new Error("Parent Birth Date must use MM/DD/YY, MM/DD/YYYY, or YYYY-MM-DD.");
  }

  const payload = { type: "Individual", first, last };
  if (cleanText(person?.preferredName)) payload.preferred_name = cleanText(person.preferredName);
  if (cleanText(person?.title)) payload.title = cleanText(person.title);
  if (cleanText(person?.suffix)) payload.suffix = cleanText(person.suffix);
  if (cleanText(person?.gender)) payload.gender = cleanText(person.gender);
  if (birthdate) payload.birthdate = birthdate;
  return payload;
}

function candidateLooksLikePerson(candidate, person) {
  const candidateEmail = normalizeText(candidate?.email || candidate?.raw?.primary_email);
  const inputEmail = normalizeText(person?.email);
  if (candidateEmail && inputEmail && candidateEmail === inputEmail) return true;
  const expected = normalizeText([person?.firstName, person?.lastName].filter(Boolean).join(" "));
  const actual = normalizeText(candidate?.name || candidate?.raw?.name);
  return Boolean(expected && actual && actual === expected);
}

async function findPossibleDuplicate({ request, user, person }) {
  const origin = new URL(request.url).origin;
  if (cleanText(person?.email)) {
    const match = await findBlackbaudConstituentByEmail({
      userId: user.id,
      authUserId: user.id,
      origin,
      email: person.email,
      requestOptions: REQUEST_OPTIONS,
    });
    // An exact email is sufficient to stop a create. Names can legitimately
    // differ after a marriage or preferred-name change, but duplicate email
    // records are not safe to create automatically.
    if (match) return match;
    return null;
  }

  const name = [person?.firstName, person?.lastName].map(cleanText).filter(Boolean).join(" ");
  if (!name) return null;
  const matches = await searchBlackbaudConstituents({
    userId: user.id,
    authUserId: user.id,
    origin,
    query: name,
    requestOptions: REQUEST_OPTIONS,
  });
  return matches.find((candidate) => candidateLooksLikePerson(candidate, person)) || null;
}

async function addNewParentContacts({ request, user, parent, constituentId, application, parentKey }) {
  const origin = new URL(request.url).origin;
  const parentApplication = getApplicationParent(application, parentKey);
  const contacts = { ...(parentApplication.contacts || {}) };
  let nextApplication = application;

  const markContact = async (kind, details) => {
    contacts[kind] = details;
    nextApplication = {
      ...nextApplication,
      parents: {
        ...(nextApplication.parents || {}),
        [parentKey]: { ...getApplicationParent(nextApplication, parentKey), contacts },
      },
    };
    nextApplication = appendStep(nextApplication, { parentKey, kind: `parent_${kind}`, ...details });
    await persistApplication({
      runId: nextApplication.runId,
      rowId: nextApplication.rowId,
      application: nextApplication,
    });
  };

  if (cleanText(parent?.email) && !contacts.email) {
    if (cleanText(parent?.emailType)) {
      await blackbaudApiFetch("/constituent/v1/emailaddresses", {
        userId: user.id,
        authUserId: user.id,
        origin,
        method: "POST",
        body: {
          constituent_id: String(constituentId),
          address: cleanText(parent.email),
          type: cleanText(parent.emailType),
          primary: true,
        },
        ...REQUEST_OPTIONS,
      });
      await markContact("email", { status: "applied", value: cleanText(parent.email) });
    } else {
      await markContact("email", {
        status: "skipped", message: "Email Type was not supplied, so the new parent's email was not added.",
      });
    }
  }

  if (cleanText(parent?.phone) && !contacts.phone) {
    if (cleanText(parent?.phoneType)) {
      await blackbaudApiFetch("/constituent/v1/phones", {
        userId: user.id,
        authUserId: user.id,
        origin,
        method: "POST",
        body: {
          constituent_id: String(constituentId),
          number: cleanText(parent.phone),
          type: cleanText(parent.phoneType),
          primary: true,
        },
        ...REQUEST_OPTIONS,
      });
      await markContact("phone", { status: "applied", value: cleanText(parent.phone) });
    } else {
      await markContact("phone", {
        status: "skipped", message: "Phone Type was not supplied, so the new parent's phone was not added.",
      });
    }
  }

  if (cleanText(parent?.addressLine1) && !contacts.address) {
    if (cleanText(parent?.addressType)) {
      await blackbaudApiFetch("/constituent/v1/addresses", {
        userId: user.id,
        authUserId: user.id,
        origin,
        method: "POST",
        body: {
          constituent_id: String(constituentId),
          type: cleanText(parent.addressType),
          primary: true,
          address_lines: [cleanText(parent.addressLine1), cleanText(parent.addressLine2)]
            .filter(Boolean)
            .join("\r\n"),
          city: cleanText(parent.city),
          state: cleanText(parent.state),
          postal_code: cleanText(parent.postalCode),
          country: cleanText(parent.country),
        },
        ...REQUEST_OPTIONS,
      });
      await markContact("address", { status: "applied", value: cleanText(parent.addressLine1) });
    } else {
      await markContact("address", {
        status: "skipped", message: "Address Type was not supplied, so the new parent's address was not added.",
      });
    }
  }

  return nextApplication;
}

async function ensureParent({ request, user, input, review, application, parentKey }) {
  const person = getParent(input, parentKey);
  const selection = getPersonSelection(review, parentKey);
  const parentLabel = parentKey === "parent2" ? "Parent 2" : "Parent 1";
  if (!person || !selection) {
    throw new Error(`${parentLabel} needs an explicit NXT selection before this family can be sent.`);
  }

  if (selection.mode === "existing") {
    const candidate = toFamilyCandidate(selection.candidate);
    if (!candidate) throw new Error(`${parentLabel} needs a valid selected NXT record.`);
    return { constituentId: candidate.blackbaudConstituentId, application };
  }

  if (selection.mode !== "create" || selection.confirmed !== true) {
    throw new Error(`${parentLabel} must be matched to an existing record or explicitly approved for creation.`);
  }

  const alreadyCreated = getApplicationParent(application, parentKey);
  if (cleanText(alreadyCreated.constituentId)) {
    return { constituentId: cleanText(alreadyCreated.constituentId), application };
  }

  const duplicate = await findPossibleDuplicate({ request, user, person });
  if (duplicate) {
    const candidate = toFamilyCandidate(duplicate);
    throw new Error(
      `A likely existing NXT record was found for ${parentLabel}: ${candidate?.name || "existing constituent"}${candidate?.lookupId ? ` (Lookup ID ${candidate.lookupId})` : ""}. Select that record instead of creating a duplicate.`,
    );
  }

  const createResult = await blackbaudApiFetch("/constituent/v1/constituents", {
    userId: user.id,
    authUserId: user.id,
    origin: new URL(request.url).origin,
    method: "POST",
    body: getCreatePayload(person),
    ...REQUEST_OPTIONS,
  });
  const created = extractCreatedConstituent(createResult);
  if (!created?.blackbaudConstituentId) {
    throw new Error(
      `NXT accepted creation for ${parentLabel} but did not return a constituent ID. Do not retry automatically; reconcile the new NXT record before continuing.`,
    );
  }

  let nextApplication = {
    ...application,
    parents: {
      ...(application.parents || {}),
      [parentKey]: {
        constituentId: created.blackbaudConstituentId,
        lookupId: created.lookupId,
        mode: "created",
        createdAt: new Date().toISOString(),
        contacts: {},
      },
    },
  };
  nextApplication = appendStep(nextApplication, {
    parentKey,
    kind: "parent_create",
    status: "applied",
    constituentId: created.blackbaudConstituentId,
    lookupId: created.lookupId,
  });
  await persistApplication({
    runId: nextApplication.runId,
    rowId: nextApplication.rowId,
    application: nextApplication,
  });

  nextApplication = await addNewParentContacts({
    request,
    user,
    parent: person,
    constituentId: created.blackbaudConstituentId,
    application: nextApplication,
    parentKey,
  });
  return { constituentId: created.blackbaudConstituentId, application: nextApplication };
}

function relationshipHasTarget(relationship, targetId) {
  const ids = [
    relationship?.relation_id,
    relationship?.related_constituent_id,
    relationship?.relatedConstituentId,
    relationship?.relation?.id,
    relationship?.constituent_id,
  ].map(cleanText);
  return ids.includes(cleanText(targetId));
}

function relationshipType(relationship) {
  return cleanText(
    relationship?.type ||
      relationship?.relation_type ||
      relationship?.relationship?.type ||
      relationship?.relationship_type,
  );
}

async function ensureRelationship({ request, user, application, key, constituentId, relationId, type, reciprocalType, spouseHead }) {
  const knownRelationship = application?.relationships?.[key];
  if (knownRelationship?.status === "applied") return application;

  const origin = new URL(request.url).origin;
  const existingPayload = await blackbaudApiFetch(
    `/constituent/v1/constituents/${encodeURIComponent(String(constituentId))}/relationships`,
    {
      userId: user.id,
      authUserId: user.id,
      origin,
      ...REQUEST_OPTIONS,
    },
  );
  const matchingRelationship = getCollection(existingPayload).find((relationship) =>
    relationshipHasTarget(relationship, relationId),
  );
  const alreadyExists = Boolean(matchingRelationship);

  // Do not reinterpret an existing relationship between the same people. A
  // reviewer must resolve a type mismatch in NXT instead of this importer
  // changing the relationship implicitly.
  const existingType = relationshipType(matchingRelationship);
  if (existingType && normalizeText(existingType) !== normalizeText(type)) {
    throw new Error(
      `An existing relationship to this constituent is already recorded as ${existingType}. Review it in NXT before adding ${cleanText(type)}.`,
    );
  }

  if (!alreadyExists) {
    const payload = {
      constituent_id: String(constituentId),
      relation_id: String(relationId),
      type: cleanText(type),
      reciprocal_type: cleanText(reciprocalType),
    };
    if (spouseHead === "parent1") payload.is_constituent_head_of_household = true;
    if (spouseHead === "parent2") payload.is_spouse_head_of_household = true;
    await blackbaudApiFetch("/constituent/v1/relationships", {
      userId: user.id,
      authUserId: user.id,
      origin,
      method: "POST",
      body: payload,
      ...REQUEST_OPTIONS,
    });
  }

  let nextApplication = {
    ...application,
    relationships: {
      ...(application.relationships || {}),
      [key]: {
        status: "applied",
        constituentId: String(constituentId),
        relationId: String(relationId),
        existed: alreadyExists,
        appliedAt: new Date().toISOString(),
      },
    },
  };
  nextApplication = appendStep(nextApplication, {
    key,
    kind: "relationship",
    status: "applied",
    existed: alreadyExists,
    constituentId: String(constituentId),
    relationId: String(relationId),
  });
  await persistApplication({
    runId: nextApplication.runId,
    rowId: nextApplication.rowId,
    application: nextApplication,
  });
  return nextApplication;
}

async function verifySelectedStudent({ request, user, review }) {
  const candidate = toFamilyCandidate(getPersonSelection(review, "student")?.candidate);
  if (!candidate) throw new Error("Select the existing NXT student record before applying this family.");
  const verified = await getBlackbaudConstituentById({
    userId: user.id,
    authUserId: user.id,
    origin: new URL(request.url).origin,
    constituentId: candidate.blackbaudConstituentId,
    requestOptions: REQUEST_OPTIONS,
  });
  if (!verified?.blackbaudConstituentId) {
    throw new Error("The selected NXT student record is no longer available. Search and select it again.");
  }
  return verified.blackbaudConstituentId;
}

async function loadAndLockRow({ runId, rowId }) {
  const rows = await sql`
    UPDATE family_import_rows
    SET
      status = 'Applying',
      blackbaud_error = NULL,
      updated_at = NOW()
    WHERE id = ${rowId}
      AND run_id = ${runId}
      AND status IN ('Ready', 'Failed')
    RETURNING *
  `;
  return rows[0] || null;
}

export async function POST(request, { params }) {
  try {
    await ensureAppSchema();
    const authResult = await requireFamilyImportReviewer(request);
    if (authResult.error) return authResult.error;

    const parsedParams = parseFamilyRouteParams(params);
    if (parsedParams.error || !parsedParams.rowId) {
      return Response.json({ error: parsedParams.error || "Invalid family import row ID." }, { status: 400 });
    }
    const lockedRow = await loadAndLockRow({
      runId: parsedParams.runId,
      rowId: parsedParams.rowId,
    });
    if (!lockedRow) {
      return Response.json(
        { error: "This family row must be Ready, or a failed row being retried, before it can be sent to NXT." },
        { status: 409 },
      );
    }

    const input = parseStoredObject(lockedRow.input);
    const review = parseStoredObject(lockedRow.review);
    const readiness = getFamilyRowReadiness(input, review);
    if (!readiness.ready) {
      await sql`
        UPDATE family_import_rows
        SET status = 'Needs Review', updated_at = NOW()
        WHERE id = ${parsedParams.rowId} AND run_id = ${parsedParams.runId}
      `;
      await refreshFamilyImportRunSummary(parsedParams.runId);
      return Response.json(
        { error: "Finish the family review before sending this row to NXT.", readiness },
        { status: 409 },
      );
    }

    let application = {
      ...parseStoredObject(lockedRow.application),
      runId: parsedParams.runId,
      rowId: parsedParams.rowId,
      appliedByUserId: authResult.user.id,
      appliedByEmail: authResult.user.email,
      startedAt: new Date().toISOString(),
    };
    await persistApplication({
      runId: parsedParams.runId,
      rowId: parsedParams.rowId,
      application,
    });

    try {
      const studentId = await verifySelectedStudent({ request, user: authResult.user, review });
      application = appendStep(application, {
        kind: "student_verify",
        status: "applied",
        constituentId: studentId,
      });
      await persistApplication({ runId: parsedParams.runId, rowId: parsedParams.rowId, application });

      const parent1 = await ensureParent({
        request,
        user: authResult.user,
        input,
        review,
        application,
        parentKey: "parent1",
      });
      application = parent1.application;
      application = await ensureRelationship({
        request,
        user: authResult.user,
        application,
        key: "parent1_student",
        constituentId: parent1.constituentId,
        relationId: studentId,
        type: getRelationship(review, "parent1").type,
        reciprocalType: getRelationship(review, "parent1").reciprocalType,
      });

      let parent2 = null;
      if (getParent(input, "parent2")) {
        parent2 = await ensureParent({
          request,
          user: authResult.user,
          input,
          review,
          application,
          parentKey: "parent2",
        });
        application = parent2.application;
        application = await ensureRelationship({
          request,
          user: authResult.user,
          application,
          key: "parent2_student",
          constituentId: parent2.constituentId,
          relationId: studentId,
          type: getRelationship(review, "parent2").type,
          reciprocalType: getRelationship(review, "parent2").reciprocalType,
        });
      }

      const spouse = getRelationship(review, "spouse");
      if (spouse.enabled && parent2) {
        application = await ensureRelationship({
          request,
          user: authResult.user,
          application,
          key: "parent1_parent2_spouse",
          constituentId: parent1.constituentId,
          relationId: parent2.constituentId,
          type: spouse.type,
          reciprocalType: spouse.reciprocalType,
          spouseHead: spouse.householdHead,
        });
      }

      application = appendStep(application, { kind: "family_apply", status: "applied" });
      await persistApplication({
        runId: parsedParams.runId,
        rowId: parsedParams.rowId,
        application,
        status: "Applied",
      });
      await refreshFamilyImportRunSummary(parsedParams.runId);
      const updated = await getFamilyImportRow(parsedParams.runId, parsedParams.rowId);
      return Response.json({ row: serializeFamilyImportRow(updated) });
    } catch (error) {
      const message = error instanceof Error ? error.message : "NXT rejected the Family Import write.";
      application = appendStep(application, {
        kind: "family_apply",
        status: "failed",
        message,
        quotaPaused: isBlackbaudQuotaExceededError(error),
      });
      await persistApplication({
        runId: parsedParams.runId,
        rowId: parsedParams.rowId,
        application,
        status: "Failed",
        error: message,
      });
      await refreshFamilyImportRunSummary(parsedParams.runId);
      const updated = await getFamilyImportRow(parsedParams.runId, parsedParams.rowId);
      return Response.json(
        {
          error: message,
          quotaPaused: isBlackbaudQuotaExceededError(error),
          retryAfterMs: isBlackbaudQuotaExceededError(error) ? error.retryAfterMs : 0,
          row: serializeFamilyImportRow(updated),
        },
        { status: isBlackbaudQuotaExceededError(error) ? 429 : 422 },
      );
    }
  } catch (error) {
    console.error("Error applying Family Import row:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to apply Family Import row." },
      { status: 500 },
    );
  }
}
