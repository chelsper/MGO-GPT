import sql from "./sql";

export const PORTFOLIO_ASSIGNMENT_REQUEST_TYPE = "Portfolio assignment request";
export const PORTFOLIO_ASSIGNMENT_REQUEST_SOURCE = "constituent_lookup_assignment";

// Local requests only. This module intentionally has no NXT or portfolio writer.
export async function savePortfolioAssignmentRequest({ user, constituentId, constituentName, reason = "", verifyOnly = false }) {
  if (verifyOnly) {
    const [request] = await sql`
      SELECT * FROM data_change_requests
      WHERE requester_user_id = ${user.id} AND blackbaud_constituent_id = ${constituentId}
        AND request_type = ${PORTFOLIO_ASSIGNMENT_REQUEST_TYPE} AND source_context = ${PORTFOLIO_ASSIGNMENT_REQUEST_SOURCE}
      ORDER BY created_at DESC, id DESC LIMIT 1
    `;
    return { request: request || null, created: false };
  }
  const note = [
    `Please review assigning ${constituentName} to ${user.name || user.email} as Lead Solicitor.`,
    `Requested by: ${user.name || user.email} (${user.email}). NXT constituent system ID: ${constituentId}.`,
    reason ? `Reason: ${reason}` : null,
    "Advancement Services must review current assignments and approve any change. Submitting this request does not update NXT or add this constituent to a portfolio. If approved, make the assignment in NXT before marking this request Completed.",
  ].filter(Boolean).join("\n\n");
  // A separate statement after the lock sees the preceding request's committed
  // row. Do not overwrite an open request, its reviewer notes, or other data requests.
  const [, created, current] = await sql.transaction([
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${`portfolio-assignment-request:${user.id}:${constituentId}`}, 0))`,
    sql`
      INSERT INTO data_change_requests (
        requester_user_id, owner_user_id, blackbaud_constituent_id, constituent_name,
        request_type, request_note, source_context, status, created_at, updated_at
      )
      SELECT ${user.id}, ${user.id}, ${constituentId}, ${constituentName},
        ${PORTFOLIO_ASSIGNMENT_REQUEST_TYPE}, ${note}, ${PORTFOLIO_ASSIGNMENT_REQUEST_SOURCE}, 'Open', NOW(), NOW()
      WHERE NOT EXISTS (
        SELECT 1 FROM data_change_requests
        WHERE requester_user_id = ${user.id} AND blackbaud_constituent_id = ${constituentId}
          AND request_type = ${PORTFOLIO_ASSIGNMENT_REQUEST_TYPE} AND source_context = ${PORTFOLIO_ASSIGNMENT_REQUEST_SOURCE}
          AND status IN ('Open', 'In Progress')
      )
      RETURNING *
    `,
    sql`
      SELECT * FROM data_change_requests
      WHERE requester_user_id = ${user.id} AND blackbaud_constituent_id = ${constituentId}
        AND request_type = ${PORTFOLIO_ASSIGNMENT_REQUEST_TYPE} AND source_context = ${PORTFOLIO_ASSIGNMENT_REQUEST_SOURCE}
        AND status IN ('Open', 'In Progress')
      ORDER BY created_at DESC, id DESC LIMIT 1
    `,
  ], { isolationLevel: "ReadCommitted" });
  const request = created[0] || current[0];
  if (!request) throw new Error("Assignment request was not saved");
  return { request, created: created.length > 0 };
}
