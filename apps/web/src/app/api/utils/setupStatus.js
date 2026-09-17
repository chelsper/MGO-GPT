import sql from "./sql";
import { getReportRefreshUser } from "./reportRefresh";
import { canManageWorkspaceRole, isMgoRole } from "@/utils/workspaceRoles";
import { ORGANIZATION_REPORTING_POLICY } from "@/utils/organizationRuntimePolicy";

const text = (value) => typeof value === "string" && Boolean(value.trim());
const result = (state, summary, details = []) => ({ state, summary, details });
const count = (value) => {
  if (
    typeof value !== "number" &&
    !(typeof value === "string" && /^\d+$/.test(value))
  )
    throw new Error("Invalid saved count");
  const number = Number(value);
  if (value == null || !Number.isSafeInteger(number) || number < 0)
    throw new Error("Invalid saved count");
  return number;
};

async function organization() {
  const [row] = await sql`
    SELECT institution_name, application_name, short_name, terminology
    FROM organization_settings WHERE id = 1 LIMIT 1
  `;
  if (
    !row ||
    ![row.institution_name, row.application_name, row.short_name].every(text)
  ) {
    return result(
      "needs_setup",
      "Add or review the organization name and application branding.",
    );
  }
  return result("ready", `Saved profile: ${row.institution_name}.`, [
    `Application name: ${row.application_name}.`,
    `Fundraising workspace label: ${text(row.terminology?.mgo) ? row.terminology.mgo : "MGO (default)"}.`,
    "Terminology currently controls shared navigation and account menus, not every page or export. Review inherited defaults before using a copied installation.",
  ]);
}

async function connection() {
  const configured = [
    "BLACKBAUD_CLIENT_ID",
    "BLACKBAUD_CLIENT_SECRET",
    "BLACKBAUD_SUBSCRIPTION_KEY",
  ].every((key) => text(process.env[key]));
  if (!configured)
    return result(
      "technical",
      "Required NXT application credentials are missing from this deployment.",
      [
        "Ask the deployment owner to configure the connection. Credentials are never displayed here.",
      ],
    );
  // This existing resolver reads saved metadata only; it never renews tokens.
  const owner = await getReportRefreshUser();
  if (!owner)
    return result(
      "needs_setup",
      "No saved account is available for scheduled NXT work.",
      [
        "An authorized Admin or Advancement Services account owner must connect NXT. A separate personal connection is not required for every fundraiser.",
      ],
    );
  if (!canManageWorkspaceRole(owner.role))
    return result(
      "technical",
      "The selected scheduled account does not have a supported app role.",
      [
        "Ask the deployment owner to review the scheduled-account configuration. This hub does not change permissions or select another account.",
      ],
    );
  const [row] = await sql`
    SELECT NULLIF(BTRIM(access_token), '') IS NOT NULL AS has_access,
      NULLIF(BTRIM(refresh_token), '') IS NOT NULL AS has_refresh
    FROM blackbaud_connections WHERE user_id = ${owner.id} LIMIT 1
  `;
  const ready = row?.has_access === true && row?.has_refresh === true;
  return result(
    ready ? "ready" : "needs_setup",
    ready
      ? "A scheduled connection and automatic-renewal token are saved."
      : "The scheduled account needs connection setup or renewal support.",
    [
      `Scheduled account: ${String(owner.name || "Unnamed account").slice(0, 200)}.`,
      "Saved credentials do not prove current NXT permissions, sandbox identity, or API availability. Only the account owner should manage their connection; throttling alone is not a reason to reconnect.",
    ],
  );
}

async function fundraisers() {
  const rows = await sql`
    SELECT role, NULLIF(BTRIM(blackbaud_constituent_id), '') IS NOT NULL AS has_system_id
    FROM users WHERE active = TRUE
  `;
  const workspaces = rows.filter((row) => isMgoRole(row.role));
  const mapped = workspaces.filter((row) => row.has_system_id === true).length;
  return result(
    workspaces.length > 0 && mapped === workspaces.length
      ? "ready"
      : "needs_setup",
    workspaces.length
      ? `${mapped} of ${workspaces.length} active fundraising workspaces have a saved NXT system-ID mapping.`
      : "No active fundraising workspaces have been set up.",
    [
      "Counts include active accounts with the MGO permission role, regardless of the displayed job title. Inactive accounts are excluded.",
      "A saved system ID is not proof that it identifies the correct NXT fundraiser. Review identity and any additional credit IDs in Security & Access; a Lookup ID alone does not complete this check.",
    ],
  );
}

function sources() {
  const policy = ORGANIZATION_REPORTING_POLICY;
  const month = new Intl.DateTimeFormat("en-US", {
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2026, policy.fiscalYearStartMonth - 1, 1)));
  return result(
    "technical",
    "Custom dashboard queries are editable; built-in source rules still need technical configuration to transfer.",
    [
      `Active reporting rules: fiscal year begins ${month} 1; ${policy.timeZone}; ${policy.currencyCode}.`,
      `Pledge source: query ${policy.pledgeQuery.id}, ${policy.pledgeQuery.type} records, ${policy.pledgeQuery.systemIdHeader} system-ID column. This source was not tested here.`,
      "Choose custom dashboard query IDs in the report editor. Built-in query boundaries, fiscal rules and historical snapshots require a reviewed technical change. Field Settings is not a universal query-mapping editor.",
      "Stored timezone, currency, fiscal-start and date-format preferences do not override these active rules. Documented email domains do not change sign-in access.",
    ],
  );
}

async function reports() {
  const [row] = await sql`
    SELECT COUNT(*) FILTER (WHERE configuration_kind = 'dashboard')::int AS dashboards,
      COUNT(*) FILTER (WHERE configuration_kind = 'dashboard' AND active = TRUE)::int AS enabled,
      COUNT(*) FILTER (WHERE configuration_kind = 'standard')::int AS built_ins
    FROM report_configurations
  `;
  const dashboards = count(row?.dashboards);
  const enabled = count(row?.enabled);
  const builtIns = count(row?.built_ins);
  if (enabled > dashboards) throw new Error("Invalid dashboard counts");
  return result(
    dashboards + builtIns > 0 ? "ready" : "needs_setup",
    dashboards + builtIns > 0
      ? `${dashboards} custom dashboards saved (${enabled} enabled); ${builtIns} built-in report configurations saved.`
      : "No report configurations have been saved yet.",
    [
      "This checks saved definitions, not report data, query validity, or audience correctness. Review Configure, Access, and Preview in the report editor before publishing.",
      "Saving layout or access does not run a query. Test query and Refresh data are separate, explicit actions. Built-in reports retain their specialized calculations.",
    ],
  );
}

export async function readSetupStatus({ viewerId, isAdmin }) {
  const sections = {};
  // No schema initialization, token renewal, provider calls or snapshot reads.
  // Each failed section stays unknown while the other saved checks remain usable.
  for (const [key, read] of Object.entries({
    organization,
    connection,
    fundraisers,
    sources,
    reports,
  })) {
    try {
      sections[key] = await read();
    } catch {
      sections[key] = result(
        "unknown",
        "Saved setup could not be read. Reload status; if this persists, ask the deployment owner to investigate.",
      );
    }
  }
  return {
    version: 1,
    viewerId: String(viewerId),
    isAdmin,
    readAt: new Date().toISOString(),
    sections,
  };
}
