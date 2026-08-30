export const SUPPORTED_DATE_FORMATS = [
  "MM/DD/YYYY",
  "DD/MM/YYYY",
  "YYYY-MM-DD",
];

export const DEFAULT_ORGANIZATION_SETTINGS = Object.freeze({
  institutionName: "Jacksonville University",
  shortName: "JU",
  applicationName: "JUMGOGPT",
  advancementServicesNotificationEmail: "devdata@ju.edu",
  notificationSenderName: "JUMGOGPT",
  timeZone: "America/New_York",
  currencyCode: "USD",
  dateFormat: "MM/DD/YYYY",
  fiscalYearStartMonth: 7,
  allowedEmailDomains: ["ju.edu"],
  terminology: {
    mgo: "MGO",
    advancementServices: "Advancement Services",
    executive: "Executive",
  },
});

function asObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function getValue(source, ...keys) {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) return source[key];
  }
  return undefined;
}

function normalizeText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function normalizeEmail(value, fallback = "") {
  const email = normalizeText(value).toLocaleLowerCase("en-US");
  return isValidEmail(email) ? email : fallback;
}

function normalizeDomains(value, fallback = []) {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[\n,;]+/)
      : fallback;
  const seen = new Set();

  return values.reduce((domains, item) => {
    const domain = String(item || "")
      .trim()
      .toLocaleLowerCase("en-US")
      .replace(/^@/, "");
    if (!domain || seen.has(domain)) return domains;
    seen.add(domain);
    domains.push(domain);
    return domains;
  }, []);
}

function normalizeTerminology(value) {
  const terminology = asObject(value);
  return {
    mgo: normalizeText(terminology.mgo, DEFAULT_ORGANIZATION_SETTINGS.terminology.mgo),
    advancementServices: normalizeText(
      terminology.advancementServices || terminology.advancement_services,
      DEFAULT_ORGANIZATION_SETTINGS.terminology.advancementServices,
    ),
    executive: normalizeText(
      terminology.executive,
      DEFAULT_ORGANIZATION_SETTINGS.terminology.executive,
    ),
  };
}

function normalizeFiscalYearStartMonth(value) {
  const month = Number(value);
  return Number.isInteger(month) && month >= 1 && month <= 12
    ? month
    : DEFAULT_ORGANIZATION_SETTINGS.fiscalYearStartMonth;
}

function isValidTimeZone(value) {
  try {
    Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function normalizeOrganizationSettings(value = {}) {
  const source = asObject(value);
  const rawDomains = getValue(
    source,
    "allowedEmailDomains",
    "allowed_email_domains",
  );
  const timeZone = normalizeText(
    getValue(source, "timeZone", "time_zone"),
    DEFAULT_ORGANIZATION_SETTINGS.timeZone,
  );
  const dateFormat = normalizeText(
    getValue(source, "dateFormat", "date_format"),
    DEFAULT_ORGANIZATION_SETTINGS.dateFormat,
  );

  return {
    institutionName: normalizeText(
      getValue(source, "institutionName", "institution_name"),
      DEFAULT_ORGANIZATION_SETTINGS.institutionName,
    ),
    shortName: normalizeText(
      getValue(source, "shortName", "short_name"),
      DEFAULT_ORGANIZATION_SETTINGS.shortName,
    ),
    applicationName: normalizeText(
      getValue(source, "applicationName", "application_name"),
      DEFAULT_ORGANIZATION_SETTINGS.applicationName,
    ),
    advancementServicesNotificationEmail: normalizeEmail(
      getValue(
        source,
        "advancementServicesNotificationEmail",
        "advancement_services_notification_email",
      ),
      DEFAULT_ORGANIZATION_SETTINGS.advancementServicesNotificationEmail,
    ),
    notificationSenderName: normalizeText(
      getValue(source, "notificationSenderName", "notification_sender_name"),
      DEFAULT_ORGANIZATION_SETTINGS.notificationSenderName,
    ),
    timeZone: isValidTimeZone(timeZone)
      ? timeZone
      : DEFAULT_ORGANIZATION_SETTINGS.timeZone,
    currencyCode: normalizeText(
      getValue(source, "currencyCode", "currency_code"),
      DEFAULT_ORGANIZATION_SETTINGS.currencyCode,
    )
      .toUpperCase()
      .slice(0, 3),
    dateFormat: SUPPORTED_DATE_FORMATS.includes(dateFormat)
      ? dateFormat
      : DEFAULT_ORGANIZATION_SETTINGS.dateFormat,
    fiscalYearStartMonth: normalizeFiscalYearStartMonth(
      getValue(source, "fiscalYearStartMonth", "fiscal_year_start_month"),
    ),
    allowedEmailDomains:
      rawDomains === undefined
        ? [...DEFAULT_ORGANIZATION_SETTINGS.allowedEmailDomains]
        : normalizeDomains(rawDomains),
    terminology: normalizeTerminology(source.terminology),
  };
}

export function validateOrganizationSettings(value = {}) {
  const source = asObject(value);
  const requiredFields = [
    ["institutionName", "Institution name"],
    ["shortName", "Short name"],
    ["applicationName", "Application name"],
  ];

  for (const [key, label] of requiredFields) {
    if (!normalizeText(source[key])) return `${label} is required`;
  }

  if (!isValidEmail(source.advancementServicesNotificationEmail)) {
    return "Enter a valid Advancement Services notification email";
  }

  if (!normalizeText(source.notificationSenderName)) {
    return "Notification sender name is required";
  }

  const timeZone = normalizeText(source.timeZone);
  if (!timeZone || !isValidTimeZone(timeZone)) {
    return "Select a valid IANA time zone";
  }

  const currencyCode = normalizeText(source.currencyCode).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currencyCode)) {
    return "Currency code must use three uppercase letters, such as USD";
  }

  if (!SUPPORTED_DATE_FORMATS.includes(normalizeText(source.dateFormat))) {
    return "Select a supported date format";
  }

  const fiscalYearStartMonth = Number(source.fiscalYearStartMonth);
  if (
    !Number.isInteger(fiscalYearStartMonth) ||
    fiscalYearStartMonth < 1 ||
    fiscalYearStartMonth > 12
  ) {
    return "Fiscal-year start month must be between January and December";
  }

  const domains = normalizeDomains(source.allowedEmailDomains);
  const invalidDomain = domains.find(
    (domain) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(domain),
  );
  if (invalidDomain) {
    return `"${invalidDomain}" is not a valid email domain`;
  }

  return null;
}
