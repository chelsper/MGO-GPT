import {
  DASHBOARD_LIMITS,
  getDashboardTableFingerprint,
  getDashboardValueFingerprint,
  normalizeDashboardConfiguration,
  validateDashboardConfiguration,
} from "@/app/api/utils/dashboardConfiguration";

export const ALUMNI_DONOR_ROW_REFRESH_POLICIES = [
  {
    key: "refreshable",
    label: "Refresh with report",
    description:
      "Runs the saved NXT query again when an administrator or the scheduled report refresh requests new data.",
  },
  {
    key: "frozen",
    label: "Frozen snapshot",
    description:
      "Keeps its last successful total and makes no further NXT calls until the saved query ID changes or it is made refreshable again.",
  },
];

export const ALUMNI_FAMILY_DASHBOARD_PANEL_TYPES = [
  {
    key: "alumni_donor_count",
    label: "Alumni Donor Count by Fiscal Year",
    description: "Display saved NXT query totals in a fiscal-year or period-based panel.",
  },
];

// The active editor now uses saved NXT query rows. Keep this empty legacy
// export temporarily so an older, hidden editor branch cannot break a build
// while persisted dashboard configurations are migrated.
export const AVAILABLE_CONSTITUENCY_CODES = [];

const REFRESH_POLICY_KEYS = new Set(
  ALUMNI_DONOR_ROW_REFRESH_POLICIES.map((policy) => policy.key),
);
const PANEL_TYPE_KEYS = new Set(
  ALUMNI_FAMILY_DASHBOARD_PANEL_TYPES.map((panel) => panel.key),
);
const GENERIC_PANEL_LAYOUTS = new Set([
  "rows",
  "table",
  "metric",
  "query_results",
]);

const DEFAULT_PANEL_KEY = "alumni-donor-count-by-fiscal-year";
const DEFAULT_PANEL_TITLE = "Alumni Donor Count by Fiscal Year";

export const DEFAULT_ALUMNI_FAMILY_ENGAGEMENT_DASHBOARD = {
  dashboardVersion: 2,
  panels: [
    {
      key: DEFAULT_PANEL_KEY,
      type: "alumni_donor_count",
      title: DEFAULT_PANEL_TITLE,
      width: "half",
      rows: [
        {
          key: "fy27-alumni-giving",
          label: "FY27 Alumni Giving",
          queryId: "30976",
          queryName: "Alumni Donors FY27",
          refreshPolicy: "refreshable",
        },
        {
          key: "fy26-alumni-giving",
          label: "FY26 Alumni Giving",
          queryId: "30679",
          queryName: "Alumni Donors FY26",
          refreshPolicy: "frozen",
        },
      ],
    },
  ],
};

// Existing installations stored the same report as a direct, generated NXT
// query. Preserve the familiar export name so callers can migrate safely.
export const DEFAULT_ALUMNI_DONOR_CONFIGURATION = DEFAULT_ALUMNI_FAMILY_ENGAGEMENT_DASHBOARD;

const LEGACY_SAVED_QUERY_IDS = new Map([
  ["fy27-alumni-giving", { id: "30976", name: "Alumni Donors FY27" }],
  ["fy26-alumni-giving", { id: "30679", name: "Alumni Donors FY26" }],
  ["2026-07-01:2027-06-30", { id: "30976", name: "Alumni Donors FY27" }],
  ["2025-07-01:2026-06-30", { id: "30679", name: "Alumni Donors FY26" }],
]);

function parseConfiguration(value) {
  if (!value || typeof value !== "object") {
    if (typeof value !== "string") return {};
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  return value;
}

function normalizeText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function normalizeRefreshPolicy(value, fallback = "refreshable") {
  const policy = normalizeText(value).toLocaleLowerCase("en-US");
  return REFRESH_POLICY_KEYS.has(policy) ? policy : fallback;
}

function createKey(value, index, usedKeys, fallbackPrefix) {
  const base = normalizeText(value)
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  const preferredKey = base || `${fallbackPrefix}-${index + 1}`;
  let key = preferredKey;
  let suffix = 2;
  while (usedKeys.has(key)) {
    key = `${preferredKey}-${suffix}`;
    suffix += 1;
  }
  usedKeys.add(key);
  return key;
}

function getLegacySavedQuery(row) {
  const key = normalizeText(row?.key);
  const dateKey = `${normalizeText(row?.fiscalYearStart)}:${normalizeText(row?.fiscalYearEnd)}`;
  return LEGACY_SAVED_QUERY_IDS.get(key) || LEGACY_SAVED_QUERY_IDS.get(dateKey) || null;
}

function normalizeSavedQueryId(value) {
  return normalizeText(value).slice(0, 40);
}

function normalizeRows(value, { fallbackRows = [] } = {}) {
  const candidateRows = Array.isArray(value) ? value.slice(0, 12) : fallbackRows;
  const usedKeys = new Set();

  return candidateRows.map((row, index) => {
    const fallback = fallbackRows[index] || {};
    const legacyQuery = getLegacySavedQuery(row);
    const queryId = normalizeSavedQueryId(row?.queryId || legacyQuery?.id || fallback.queryId);
    const queryName = normalizeText(
      row?.queryName || legacyQuery?.name || fallback.queryName,
    ).slice(0, 200);
    const label = normalizeText(row?.label, fallback.label || `Donor count ${index + 1}`).slice(0, 120);

    return {
      key: createKey(row?.key || label, index, usedKeys, "donor-count"),
      label,
      queryId,
      queryName,
      refreshPolicy: normalizeRefreshPolicy(row?.refreshPolicy, fallback.refreshPolicy || "refreshable"),
    };
  });
}

function normalizePanelType(value) {
  const type = normalizeText(value);
  return PANEL_TYPE_KEYS.has(type) ? type : "alumni_donor_count";
}

function normalizePanelWidth(value, fallback = "half") {
  return ["half", "full"].includes(value) ? value : fallback;
}

function normalizePanels(value, { fallbackPanels = [] } = {}) {
  const candidatePanels = Array.isArray(value)
    ? value.slice(0, DASHBOARD_LIMITS.panels)
    : fallbackPanels;
  const usedKeys = new Set();

  return candidatePanels.map((panel, index) => {
    const fallback = fallbackPanels[index] || {};
    const key = createKey(
      panel?.key || panel?.title,
      index,
      usedKeys,
      "dashboard-panel",
    );
    if (GENERIC_PANEL_LAYOUTS.has(panel?.layout)) {
      const candidate = { ...panel, key };
      try {
        return normalizeDashboardConfiguration({
          version: 1,
          panels: [candidate],
        }).panels[0];
      } catch {
        // Keep the draft shape intact so validation can return the precise
        // generic dashboard error instead of silently converting its type.
        return candidate;
      }
    }
    const type = normalizePanelType(panel?.type || fallback.type);
    const title = normalizeText(panel?.title, fallback.title || DEFAULT_PANEL_TITLE).slice(0, 160);
    const fallbackRows = Array.isArray(fallback.rows) ? fallback.rows : [];

    return {
      key,
      type,
      title,
      width: normalizePanelWidth(panel?.width, fallback.width || "half"),
      rows: normalizeRows(panel?.rows, { fallbackRows }),
    };
  });
}

function hasLegacyDonorConfiguration(value) {
  return Array.isArray(value?.rows) || Object.hasOwn(value || {}, "constituencies");
}

function getLegacyPanels(configuration) {
  const defaultPanel = DEFAULT_ALUMNI_FAMILY_ENGAGEMENT_DASHBOARD.panels[0];
  return [
    {
      key: DEFAULT_PANEL_KEY,
      type: "alumni_donor_count",
      title: DEFAULT_PANEL_TITLE,
      width: "half",
      rows: normalizeRows(configuration.rows, { fallbackRows: defaultPanel.rows }),
    },
  ];
}

export function normalizeAlumniFamilyEngagementDashboard(value) {
  const configuration = parseConfiguration(value);
  const hasExplicitPanels = Array.isArray(configuration.panels);
  const fallbackPanels = hasLegacyDonorConfiguration(configuration)
    ? getLegacyPanels(configuration)
    : DEFAULT_ALUMNI_FAMILY_ENGAGEMENT_DASHBOARD.panels;

  return {
    dashboardVersion: 2,
    panels: normalizePanels(
      hasExplicitPanels ? configuration.panels : fallbackPanels,
      // Empty explicitly configured panels must remain empty. That lets an
      // administrator build a dashboard incrementally without creating calls.
      { fallbackPanels: hasExplicitPanels ? [] : fallbackPanels },
    ),
  };
}

export const normalizeAlumniDonorConfiguration = normalizeAlumniFamilyEngagementDashboard;

export function getAlumniDonorCountPanels(value) {
  return normalizeAlumniFamilyEngagementDashboard(value).panels
    .filter((panel) => panel.type === "alumni_donor_count")
    .map((panel) => ({ ...panel, rows: panel.rows.map((row) => ({ ...row })) }));
}

export function getAlumniGenericDashboard(value) {
  const panels = normalizeAlumniFamilyEngagementDashboard(value).panels.filter(
    (panel) => GENERIC_PANEL_LAYOUTS.has(panel.layout),
  );
  return normalizeDashboardConfiguration({ version: 1, panels });
}

export function getAlumniDonorCountRows(value) {
  return getAlumniDonorCountPanels(value).flatMap((panel) =>
    panel.rows.map((row) => ({
      ...row,
      panelKey: panel.key,
      panelTitle: panel.title,
      panelType: panel.type,
    })),
  );
}

export const getAlumniDonorQueryRows = getAlumniDonorCountRows;

export function getAlumniFamilyEngagementDashboardFingerprint(value) {
  const dashboard = normalizeAlumniFamilyEngagementDashboard(value);
  return JSON.stringify({
    dashboardVersion: 2,
    panels: dashboard.panels.map((panel) =>
      panel.type === "alumni_donor_count"
        ? {
            key: panel.key,
            type: panel.type,
            rows: panel.rows.map((row) => ({
              key: row.key,
              queryId: row.queryId,
            })),
          }
        : {
            key: panel.key,
            layout: panel.layout,
            sources:
              panel.layout === "query_results"
                ? [getDashboardTableFingerprint(panel)]
                : panel.values.map(getDashboardValueFingerprint),
          },
    ),
  });
}

export const getAlumniDonorConfigurationFingerprint = getAlumniFamilyEngagementDashboardFingerprint;

// A row policy controls when a total is refreshed, not what it means. Labels
// and query names can likewise be edited without invalidating a compatible
// saved total. Changing the saved NXT query ID always invalidates it.
export function getAlumniDonorCountRowFingerprint(value, countRow) {
  const dashboard = normalizeAlumniFamilyEngagementDashboard(value);
  const row = countRow || getAlumniDonorCountRows(dashboard)[0] || {};

  return JSON.stringify({
    dashboardVersion: 2,
    panelKey: row.panelKey || dashboard.panels[0]?.key || "",
    panelType: row.panelType || dashboard.panels[0]?.type || "",
    key: row.key || "",
    queryId: row.queryId || "",
  });
}

export function validateAlumniFamilyEngagementDashboard(value) {
  const dashboard = normalizeAlumniFamilyEngagementDashboard(value);
  if (dashboard.panels.length > DASHBOARD_LIMITS.panels) {
    return `An Alumni dashboard accepts at most ${DASHBOARD_LIMITS.panels} panels.`;
  }
  const panelKeys = new Set();
  const genericPanels = [];

  for (const panel of dashboard.panels) {
    if (panelKeys.has(panel.key)) return "Each dashboard panel needs a unique key.";
    panelKeys.add(panel.key);
    if (GENERIC_PANEL_LAYOUTS.has(panel.layout)) {
      genericPanels.push(panel);
      continue;
    }
    if (!panel.title) return "Each dashboard panel needs a title.";
    if (!PANEL_TYPE_KEYS.has(panel.type)) return "Select a supported dashboard panel type.";

    const rowKeys = new Set();
    const labels = new Set();
    for (const row of panel.rows) {
      if (rowKeys.has(row.key)) return `Each row in ${panel.title} needs a unique key.`;
      rowKeys.add(row.key);
      if (!row.label) return "Each donor count row needs a label.";
      const normalizedLabel = row.label.toLocaleLowerCase("en-US");
      if (labels.has(normalizedLabel)) {
        return `Use a different label for each donor count; ${row.label} is repeated.`;
      }
      labels.add(normalizedLabel);
      if (!/^\d{1,40}$/.test(row.queryId)) {
        return `Enter the numeric saved NXT query system record ID for ${row.label}.`;
      }
    }
  }

  if (genericPanels.length) {
    const genericError = validateDashboardConfiguration({
      version: 1,
      panels: genericPanels,
    });
    if (genericError) return genericError;
  }

  return "";
}

export const validateAlumniDonorConfiguration = validateAlumniFamilyEngagementDashboard;
