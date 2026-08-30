import sql from "@/app/api/utils/sql";
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

export async function getOrganizationSettings(sqlClient = sql) {
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
      updated_at
    FROM organization_settings
    WHERE id = ${ORGANIZATION_SETTINGS_ID}
    LIMIT 1
  `;

  return rows[0] ? mapRow(rows[0]) : normalizeOrganizationSettings();
}

export async function saveOrganizationSettings({
  settings,
  userId,
  sqlClient = sql,
}) {
  const normalized = normalizeOrganizationSettings(settings);
  const rows = await sqlClient`
    INSERT INTO organization_settings (
      id,
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
      created_by,
      updated_by,
      updated_at
    ) VALUES (
      ${ORGANIZATION_SETTINGS_ID},
      ${normalized.institutionName},
      ${normalized.shortName},
      ${normalized.applicationName},
      ${normalized.advancementServicesNotificationEmail},
      ${normalized.notificationSenderName},
      ${normalized.timeZone},
      ${normalized.currencyCode},
      ${normalized.dateFormat},
      ${normalized.fiscalYearStartMonth},
      ${JSON.stringify(normalized.allowedEmailDomains)}::jsonb,
      ${JSON.stringify(normalized.terminology)}::jsonb,
      ${userId || null},
      ${userId || null},
      NOW()
    )
    ON CONFLICT (id) DO UPDATE
    SET
      institution_name = EXCLUDED.institution_name,
      short_name = EXCLUDED.short_name,
      application_name = EXCLUDED.application_name,
      advancement_services_notification_email = EXCLUDED.advancement_services_notification_email,
      notification_sender_name = EXCLUDED.notification_sender_name,
      time_zone = EXCLUDED.time_zone,
      currency_code = EXCLUDED.currency_code,
      date_format = EXCLUDED.date_format,
      fiscal_year_start_month = EXCLUDED.fiscal_year_start_month,
      allowed_email_domains = EXCLUDED.allowed_email_domains,
      terminology = EXCLUDED.terminology,
      updated_by = EXCLUDED.updated_by,
      updated_at = NOW()
    RETURNING
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
      terminology
  `;

  return rows[0] ? mapRow(rows[0]) : normalized;
}
