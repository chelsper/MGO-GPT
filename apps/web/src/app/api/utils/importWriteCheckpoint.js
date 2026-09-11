import sql from "./sql";

export async function persistImportWriteCheckpoint(row, audit) {
  const saved = await sql`
    UPDATE constituency_import_rows
    SET blackbaud_result = ${JSON.stringify(audit)}::jsonb, updated_at = NOW()
    WHERE id = ${row.id} AND run_id = ${row.run_id} AND status = 'Applying'
    RETURNING id
  `;
  if (!saved.length) throw new Error("The import row changed while sending. Stop and compare its saved results with NXT before continuing.");
}
