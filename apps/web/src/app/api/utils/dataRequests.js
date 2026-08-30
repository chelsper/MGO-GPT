export const DATA_REQUEST_STATUS_OPEN = "Open";
export const DATA_REQUEST_STATUS_IN_PROGRESS = "In Progress";
export const DATA_REQUEST_STATUS_COMPLETED = "Completed";
export const DATA_REQUEST_STATUS_DECLINED = "Declined";

export const DATA_REQUEST_STATUSES = new Set([
  DATA_REQUEST_STATUS_OPEN,
  DATA_REQUEST_STATUS_IN_PROGRESS,
  DATA_REQUEST_STATUS_COMPLETED,
  DATA_REQUEST_STATUS_DECLINED,
]);

export const DATA_REQUEST_TYPE_CONTACT_INFO = "Contact info update";
export const DATA_REQUEST_TYPE_RECORD_UPDATE = "Record update";
export const DATA_REQUEST_TYPE_RESEARCH = "Research request";

export function normalizeDataRequestStatus(value, fallback = DATA_REQUEST_STATUS_OPEN) {
  const normalized = String(value || "").trim();
  return DATA_REQUEST_STATUSES.has(normalized) ? normalized : fallback;
}

export function normalizeDataRequestType(value) {
  const normalized = String(value || "").trim();
  return normalized || DATA_REQUEST_TYPE_RECORD_UPDATE;
}

export async function upsertOpenDataRequest({
  sql,
  requesterUserId,
  ownerUserId,
  prospectId = null,
  prospectPoolId = null,
  constituentId = null,
  blackbaudConstituentId = null,
  constituentName,
  requestType = DATA_REQUEST_TYPE_RECORD_UPDATE,
  requestNote,
  providedData = null,
  sourceContext,
}) {
  const cleanName = String(constituentName || "").trim();
  const cleanNote = String(requestNote || "").trim();
  const cleanRequestType = normalizeDataRequestType(requestType);
  const cleanSourceContext = String(sourceContext || "app").trim() || "app";

  if (!cleanName && !constituentId && !blackbaudConstituentId && !prospectId && !prospectPoolId) {
    throw new Error("A constituent, prospect, or pool entry is required for a data request.");
  }

  if (!cleanNote && !providedData) {
    throw new Error("Add a note or the updated information before sending this to Advancement Services.");
  }

  const existing =
    prospectPoolId || prospectId || constituentId || blackbaudConstituentId
      ? await sql`
          SELECT id
          FROM data_change_requests
          WHERE requester_user_id = ${requesterUserId}
            AND status IN (${DATA_REQUEST_STATUS_OPEN}, ${DATA_REQUEST_STATUS_IN_PROGRESS})
            AND (
              (${prospectPoolId || null}::BIGINT IS NOT NULL AND prospect_pool_id = ${prospectPoolId || null})
              OR (${prospectId || null}::BIGINT IS NOT NULL AND prospect_id = ${prospectId || null})
              OR (${constituentId || null}::BIGINT IS NOT NULL AND constituent_id = ${constituentId || null})
              OR (
                ${blackbaudConstituentId || null}::TEXT IS NOT NULL
                AND blackbaud_constituent_id = ${blackbaudConstituentId || null}
              )
            )
          ORDER BY updated_at DESC
          LIMIT 1
        `
      : [];

  if (existing.length > 0) {
    const updated = await sql`
      UPDATE data_change_requests
      SET
        owner_user_id = COALESCE(${ownerUserId || null}, owner_user_id),
        prospect_id = COALESCE(${prospectId || null}, prospect_id),
        prospect_pool_id = COALESCE(${prospectPoolId || null}, prospect_pool_id),
        constituent_id = COALESCE(${constituentId || null}, constituent_id),
        blackbaud_constituent_id = COALESCE(${blackbaudConstituentId || null}, blackbaud_constituent_id),
        constituent_name = COALESCE(${cleanName || null}, constituent_name),
        request_type = ${cleanRequestType},
        request_note = ${cleanNote || null},
        provided_data = ${providedData ? JSON.stringify(providedData) : null}::jsonb,
        source_context = ${cleanSourceContext},
        updated_at = NOW()
      WHERE id = ${existing[0].id}
      RETURNING *
    `;
    return updated[0]
      ? { ...updated[0], notification_event: "updated" }
      : null;
  }

  const created = await sql`
    INSERT INTO data_change_requests (
      requester_user_id,
      owner_user_id,
      prospect_id,
      prospect_pool_id,
      constituent_id,
      blackbaud_constituent_id,
      constituent_name,
      request_type,
      request_note,
      provided_data,
      source_context,
      status,
      created_at,
      updated_at
    )
    VALUES (
      ${requesterUserId},
      ${ownerUserId || null},
      ${prospectId || null},
      ${prospectPoolId || null},
      ${constituentId || null},
      ${blackbaudConstituentId || null},
      ${cleanName || null},
      ${cleanRequestType},
      ${cleanNote || null},
      ${providedData ? JSON.stringify(providedData) : null}::jsonb,
      ${cleanSourceContext},
      ${DATA_REQUEST_STATUS_OPEN},
      NOW(),
      NOW()
    )
    RETURNING *
  `;

  return created[0]
    ? { ...created[0], notification_event: "created" }
    : null;
}
