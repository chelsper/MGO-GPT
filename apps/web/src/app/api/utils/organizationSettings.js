import sql from "@/app/api/utils/sql";
import { ORGANIZATION_REPORTING_POLICY, reportingSettingsChangeError } from "@/utils/organizationRuntimePolicy";
import {
  normalizeOrganizationSettings,
  validateOrganizationSettings,
} from "@/utils/organizationSettings";

export { DEFAULT_ORGANIZATION_SETTINGS, SUPPORTED_DATE_FORMATS } from "@/utils/organizationSettings";
export { normalizeOrganizationSettings, validateOrganizationSettings } from "@/utils/organizationSettings";

export const ORGANIZATION_SETTINGS_ID = 1;

function mapRow(row) {
  return normalizeOrganizationSettings(row);
}

async function readOrganizationRow(sqlClient) {
  const rows = await sqlClient`
    SELECT
      institution_name,
      short_name,
      application_name,
      advancement_services_notification_email,
      notification_sender_name,
      time_zone,
      currency_code,
      date_format,
      fiscal_year_start_month,
      allowed_email_domains,
      terminology,
      created_at,
      updated_at,
      to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS revision
    FROM organization_settings
    WHERE id = ${ORGANIZATION_SETTINGS_ID}
    LIMIT 1
  `;

  return rows[0];
}

export async function getOrganizationSettings(sqlClient = sql) {
  return mapRow(await readOrganizationRow(sqlClient));
}

export async function getOrganizationConfiguration(sqlClient = sql) {
  const row = await readOrganizationRow(sqlClient);
  return { settings: mapRow(row), revision: row?.revision || null, reportingPolicy: ORGANIZATION_REPORTING_POLICY };
}

export async function getOrganizationSettingsHistory(sqlClient = sql) {
  return sqlClient`
    SELECT a.id, a.created_at, a.changed_fields, u.name AS actor_name
    FROM organization_settings_audits a LEFT JOIN users u ON u.id = a.actor_user_id
    ORDER BY a.id DESC LIMIT 10
  `;
}

function settingsError(message, status) {
  return Object.assign(new Error(message), { status });
}

export async function saveOrganizationSettings({
  settings,
  userId,
  expectedRevision,
  sqlClient = sql,
}) {
  const error = validateOrganizationSettings(settings);
  if (error) throw settingsError(error, 400);
  const current = await getOrganizationConfiguration(sqlClient);
  if (!expectedRevision || expectedRevision !== current.revision) {
    throw settingsError("Institution settings changed or this page is out of date. Reload the saved profile, review your changes, and save again.", 409);
  }
  const normalized = normalizeOrganizationSettings(settings);
  const guardedChange = reportingSettingsChangeError(current.settings, normalized);
  if (guardedChange) throw settingsError(guardedChange, 400);
  const changedFields = Object.keys(normalized).filter(key => JSON.stringify(normalized[key]) !== JSON.stringify(current.settings[key]));
  if (!changedFields.length) return current;
  // Optimistic version check and audit insert share a statement/transaction.
  // A failed audit rolls back the setting change; a stale writer changes nothing.
  const rows = await sqlClient`
    WITH updated AS (
      UPDATE organization_settings SET
        institution_name = ${normalized.institutionName},
        short_name = ${normalized.shortName},
        application_name = ${normalized.applicationName},
        advancement_services_notification_email = ${normalized.advancementServicesNotificationEmail},
        notification_sender_name = ${normalized.notificationSenderName},
        allowed_email_domains = ${JSON.stringify(normalized.allowedEmailDomains)}::jsonb,
        terminology = ${JSON.stringify(normalized.terminology)}::jsonb,
        updated_by = ${userId},
        updated_at = GREATEST(clock_timestamp(), updated_at + INTERVAL '1 microsecond')
      WHERE id = ${ORGANIZATION_SETTINGS_ID} AND updated_at = ${expectedRevision}::timestamptz
      RETURNING *
    ), audit AS (
      INSERT INTO organization_settings_audits
        (actor_user_id, previous_settings, settings, changed_fields)
      SELECT ${userId}, ${JSON.stringify(current.settings)}::jsonb,
        ${JSON.stringify(normalized)}::jsonb, ${JSON.stringify(changedFields)}::jsonb
      FROM updated
      RETURNING id, created_at, changed_fields
    )
    SELECT updated.*, to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS revision,
      (SELECT row_to_json(audit) FROM audit) AS change
    FROM updated
  `;
  if (!rows[0]) throw settingsError("Institution settings changed while you were editing. Reload the saved profile before saving again.", 409);
  return { settings: mapRow(rows[0]), revision: rows[0].revision, reportingPolicy: ORGANIZATION_REPORTING_POLICY, change: rows[0].change };
}
