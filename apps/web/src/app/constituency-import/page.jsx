"use client";

import { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import { ArrowLeft, FileText, Upload } from "lucide-react";
import useUser from "@/utils/useUser";
import useWorkspaceView from "@/utils/useWorkspaceView";
import { isReviewerRole } from "@/utils/workspaceRoles";

const IMPORT_FIELDS = [
  {
    key: "blackbaudConstituentId",
    header: "NXT System ID",
    label: "NXT System ID",
    group: "Match fields",
    description: "Best match key when available. This is the internal Blackbaud record ID.",
    recommended: true,
  },
  {
    key: "lookupId",
    header: "NXT Lookup ID",
    label: "NXT Lookup ID",
    group: "Match fields",
    description: "Strong match key commonly visible on the NXT constituent profile.",
    recommended: true,
  },
  {
    key: "firstName",
    header: "First Name",
    label: "First Name",
    group: "Name fields",
    description: "Used for matching and for eventual new-record import work.",
    recommended: true,
  },
  {
    key: "lastName",
    header: "Last Name",
    label: "Last Name",
    group: "Name fields",
    description: "Used with First Name or Preferred Name for matching.",
    recommended: true,
  },
  {
    key: "preferredName",
    header: "Preferred Name",
    label: "Preferred Name",
    group: "Name fields",
    description: "Optional, but useful when the name used by MGOs differs from legal first name.",
  },
  {
    key: "email",
    header: "Email Address",
    label: "Email Address",
    group: "Email fields",
    description: "Useful supporting match data. Email-only matches still require human review.",
  },
  {
    key: "emailType",
    header: "Email Type",
    label: "Email Type",
    group: "Email fields",
    description: "Optional NXT email type, such as Home, Business, or Other.",
  },
  {
    key: "emailMakePrimary",
    header: "Email Make Primary?",
    label: "Email Make Primary?",
    group: "Email fields",
    description: "Optional yes/no flag for whether this email should become primary.",
  },
  {
    key: "email2",
    header: "Email 2 Address",
    label: "Email 2 Address",
    group: "Email fields",
    description: "Second email address to add or update.",
    additionalSet: "secondEmail",
  },
  {
    key: "email2Type",
    header: "Email 2 Type",
    label: "Email 2 Type",
    group: "Email fields",
    description: "NXT email type for the second email, such as Home, Business, or Other.",
    additionalSet: "secondEmail",
  },
  {
    key: "email2MakePrimary",
    header: "Email 2 Make Primary?",
    label: "Email 2 Make Primary?",
    group: "Email fields",
    description: "Optional yes/no flag for whether the second email should become primary.",
    additionalSet: "secondEmail",
  },
  {
    key: "phoneNumber",
    header: "Phone Number",
    label: "Phone Number",
    group: "Phone fields",
    description: "Phone number to add or update.",
  },
  {
    key: "phoneType",
    header: "Phone Type",
    label: "Phone Type",
    group: "Phone fields",
    description: "Optional NXT phone type, such as Home, Mobile, Business, or Other.",
  },
  {
    key: "phoneMakePrimary",
    header: "Phone Make Primary?",
    label: "Phone Make Primary?",
    group: "Phone fields",
    description: "Optional yes/no flag for whether this phone should become primary.",
  },
  {
    key: "phone2Number",
    header: "Phone 2 Number",
    label: "Phone 2 Number",
    group: "Phone fields",
    description: "Second phone number to add or update.",
    additionalSet: "secondPhone",
  },
  {
    key: "phone2Type",
    header: "Phone 2 Type",
    label: "Phone 2 Type",
    group: "Phone fields",
    description: "NXT phone type for the second phone, such as Home, Mobile, Business, or Other.",
    additionalSet: "secondPhone",
  },
  {
    key: "phone2MakePrimary",
    header: "Phone 2 Make Primary?",
    label: "Phone 2 Make Primary?",
    group: "Phone fields",
    description: "Optional yes/no flag for whether the second phone should become primary.",
    additionalSet: "secondPhone",
  },
  {
    key: "addressType",
    header: "Address Type",
    label: "Address Type",
    group: "Address fields",
    description: "Optional NXT address type, such as Home, Business, Seasonal, or Other.",
  },
  {
    key: "addressLine1",
    header: "Address Line 1",
    label: "Address Line 1",
    group: "Address fields",
    description: "Primary street address line.",
  },
  {
    key: "addressLine2",
    header: "Address Line 2",
    label: "Address Line 2",
    group: "Address fields",
    description: "Apartment, suite, unit, or secondary address line.",
  },
  {
    key: "city",
    header: "City",
    label: "City",
    group: "Address fields",
    description: "Address city.",
  },
  {
    key: "state",
    header: "State",
    label: "State",
    group: "Address fields",
    description: "Address state or province.",
  },
  {
    key: "postalCode",
    header: "ZIP/Postal Code",
    label: "ZIP/Postal Code",
    group: "Address fields",
    description: "Address ZIP or postal code.",
  },
  {
    key: "country",
    header: "Country",
    label: "Country",
    group: "Address fields",
    description: "Address country. Can be blank when the import source already assumes United States.",
  },
  {
    key: "addressMakePrimary",
    header: "Address Make Primary?",
    label: "Address Make Primary?",
    group: "Address fields",
    description: "Optional yes/no flag for whether this address should become primary.",
  },
  {
    key: "sourceConstituency",
    header: "Current Constituent Code",
    label: "Current Constituent Code",
    group: "Constituent code fields",
    description: "Use when replacing or end-dating an existing constituent code.",
  },
  {
    key: "targetConstituency",
    header: "New Constituent Code",
    label: "New Constituent Code",
    group: "Constituent code fields",
    description: "The constituent code to add or replace with. Choose the behavior below this field.",
    recommended: true,
  },
  {
    key: "startDate",
    header: "New Constituent Code Start Date",
    label: "New Constituent Code Start Date",
    group: "Constituent code fields",
    description: "Optional start date for the new constituent code. This can be blank.",
  },
  {
    key: "endDate",
    header: "New Constituent Code End Date",
    label: "New Constituent Code End Date",
    group: "Constituent code fields",
    description:
      "Optional end date for add actions. For replace/end-date actions, this is the date used to end the current code.",
  },
  {
    key: "educationInstitution",
    header: "Education Institution",
    label: "Education Institution",
    group: "Education relationship fields",
    description: "School, college, or university name for an education relationship.",
  },
  {
    key: "educationDegree",
    header: "Education Degree",
    label: "Education Degree",
    group: "Education relationship fields",
    description: "Degree name or credential, when available.",
  },
  {
    key: "educationMajor",
    header: "Education Major",
    label: "Education Major",
    group: "Education relationship fields",
    description: "Major, program, or academic area, when available.",
  },
  {
    key: "educationClassYear",
    header: "Education Class Year",
    label: "Education Class Year",
    group: "Education relationship fields",
    description: "Graduation or class year, when available.",
  },
  {
    key: "educationRelationshipMakePrimary",
    header: "Education Relationship Make Primary?",
    label: "Education Relationship Make Primary?",
    group: "Education relationship fields",
    description: "Optional yes/no flag for whether this education relationship should be primary.",
  },
  {
    key: "organizationName",
    header: "Organization Name",
    label: "Organization Name",
    group: "Organization relationship fields",
    description: "Organization or employer name for an organization relationship.",
  },
  {
    key: "organizationRelationshipType",
    header: "Organization Relationship Type",
    label: "Organization Relationship Type",
    group: "Organization relationship fields",
    description: "Relationship type, such as Employee, Board Member, Owner, or Other.",
  },
  {
    key: "organizationTitle",
    header: "Organization Title",
    label: "Organization Title",
    group: "Organization relationship fields",
    description: "Title, role, or position at the organization.",
  },
  {
    key: "organizationStartDate",
    header: "Organization Relationship Start Date",
    label: "Organization Relationship Start Date",
    group: "Organization relationship fields",
    description: "Optional start date for the organization relationship.",
  },
  {
    key: "organizationEndDate",
    header: "Organization Relationship End Date",
    label: "Organization Relationship End Date",
    group: "Organization relationship fields",
    description: "Optional end date for the organization relationship.",
  },
  {
    key: "organizationRelationshipMakePrimary",
    header: "Organization Relationship Make Primary?",
    label: "Organization Relationship Make Primary?",
    group: "Organization relationship fields",
    description: "Optional yes/no flag for whether this organization relationship should be primary.",
  },
];

const DEFAULT_ACTIVE_FIELDS = {
  blackbaudConstituentId: false,
  lookupId: true,
  firstName: true,
  lastName: true,
  preferredName: false,
  email: true,
  emailType: false,
  emailMakePrimary: false,
  email2: false,
  email2Type: false,
  email2MakePrimary: false,
  phoneNumber: false,
  phoneType: false,
  phoneMakePrimary: false,
  phone2Number: false,
  phone2Type: false,
  phone2MakePrimary: false,
  addressType: false,
  addressLine1: false,
  addressLine2: false,
  city: false,
  state: false,
  postalCode: false,
  country: false,
  addressMakePrimary: false,
  sourceConstituency: false,
  targetConstituency: true,
  startDate: true,
  endDate: false,
  educationInstitution: false,
  educationDegree: false,
  educationMajor: false,
  educationClassYear: false,
  educationRelationshipMakePrimary: false,
  organizationName: false,
  organizationRelationshipType: false,
  organizationTitle: false,
  organizationStartDate: false,
  organizationEndDate: false,
  organizationRelationshipMakePrimary: false,
};

const FIELD_GROUP_ORDER = [
  "Match fields",
  "Name fields",
  "Email fields",
  "Phone fields",
  "Address fields",
  "Constituent code fields",
  "Education relationship fields",
  "Organization relationship fields",
];

const FIELD_GROUP_HELP = {
  "Match fields": "Use one or more strong identifiers to avoid duplicate records.",
  "Name fields": "Name columns used for matching and future new-record imports.",
  "Email fields": "Email columns, including the optional primary flag.",
  "Phone fields": "Phone columns, including the optional primary flag.",
  "Address fields": "Address columns, including the optional primary flag.",
  "Constituent code fields": "Constituent-code add/replace options and optional dates.",
  "Education relationship fields": "Education columns can add a new relationship or update an existing one, such as Student to Alumni.",
  "Organization relationship fields": "Organization columns are staged as additional relationships so existing affiliations are not replaced.",
};

const DEFAULT_OPEN_FIELD_GROUPS = {
  "Match fields": true,
  "Name fields": true,
  "Constituent code fields": true,
};

const ADDITIONAL_CONTACT_SETS = {
  "Email fields": {
    keys: ["email2", "email2Type", "email2MakePrimary"],
    addLabel: "+ Add second email",
    removeLabel: "Remove second email",
    description: "Adds Email 2 Address, Email 2 Type, and Email 2 Make Primary? columns.",
  },
  "Phone fields": {
    keys: ["phone2Number", "phone2Type", "phone2MakePrimary"],
    addLabel: "+ Add second phone",
    removeLabel: "Remove second phone",
    description: "Adds Phone 2 Number, Phone 2 Type, and Phone 2 Make Primary? columns.",
  },
};

const CONSTITUENCY_ACTIONS = [
  {
    value: "add",
    label: "Add Additional",
    description: "Add the new code while keeping any existing constituent codes.",
  },
  {
    value: "replace",
    label: "Replace Existing",
    description: "Requires Current Constituent Code so the preview knows what would be replaced.",
  },
];

const EDUCATION_RELATIONSHIP_ACTIONS = [
  {
    value: "add",
    label: "Add New Education Relationship",
    description: "Create an additional education relationship and leave existing education rows intact.",
  },
  {
    value: "update",
    label: "Update Existing Education Relationship",
    description: "Use when the row should revise an existing education relationship, such as Student to Alumni.",
  },
];

function makeTemplateRows(fields) {
  const headers = fields.map((field) => field.header);
  const rowOne = fields.map((field) => {
    switch (field.key) {
      case "blackbaudConstituentId":
        return "";
      case "lookupId":
        return "123456";
      case "firstName":
        return "Jane";
      case "lastName":
        return "Dolphin";
      case "preferredName":
        return "Jane";
      case "email":
        return "jane@example.com";
      case "emailType":
        return "Home";
      case "emailMakePrimary":
        return "Yes";
      case "email2":
        return "jane.business@example.com";
      case "email2Type":
        return "Business";
      case "email2MakePrimary":
        return "No";
      case "phoneNumber":
        return "(904) 555-0101";
      case "phoneType":
        return "Mobile";
      case "phoneMakePrimary":
        return "No";
      case "phone2Number":
        return "(904) 555-0199";
      case "phone2Type":
        return "Home";
      case "phone2MakePrimary":
        return "Yes";
      case "addressType":
        return "Home";
      case "addressLine1":
        return "2800 University Blvd N";
      case "addressLine2":
        return "";
      case "city":
        return "Jacksonville";
      case "state":
        return "FL";
      case "postalCode":
        return "32211";
      case "country":
        return "United States";
      case "addressMakePrimary":
        return "Yes";
      case "sourceConstituency":
        return "Student";
      case "targetConstituency":
        return "Alumni - Bachelor's Degree";
      case "startDate":
        return "2026-05-01";
      case "endDate":
        return "";
      case "educationInstitution":
        return "Jacksonville University";
      case "educationDegree":
        return "Bachelor of Science";
      case "educationMajor":
        return "Nursing";
      case "educationClassYear":
        return "2026";
      case "educationRelationshipMakePrimary":
        return "Yes";
      case "organizationName":
        return "Dolphin Health System";
      case "organizationRelationshipType":
        return "Employee";
      case "organizationTitle":
        return "Director";
      case "organizationStartDate":
        return "2024-01-15";
      case "organizationEndDate":
        return "";
      case "organizationRelationshipMakePrimary":
        return "Yes";
      default:
        return "";
    }
  });
  const rowTwo = fields.map((field) => {
    switch (field.key) {
      case "blackbaudConstituentId":
        return "";
      case "lookupId":
        return "234567";
      case "firstName":
        return "Sam";
      case "lastName":
        return "Dolphin";
      case "preferredName":
        return "";
      case "email":
        return "sam@example.com";
      case "emailType":
        return "Business";
      case "emailMakePrimary":
        return "No";
      case "email2":
        return "sam.home@example.com";
      case "email2Type":
        return "Home";
      case "email2MakePrimary":
        return "Yes";
      case "phoneNumber":
        return "(904) 555-0102";
      case "phoneType":
        return "Home";
      case "phoneMakePrimary":
        return "Yes";
      case "phone2Number":
        return "(904) 555-0198";
      case "phone2Type":
        return "Business";
      case "phone2MakePrimary":
        return "No";
      case "addressType":
        return "Business";
      case "addressLine1":
        return "1 Dolphin Way";
      case "addressLine2":
        return "Suite 200";
      case "city":
        return "Jacksonville";
      case "state":
        return "FL";
      case "postalCode":
        return "32202";
      case "country":
        return "United States";
      case "addressMakePrimary":
        return "No";
      case "sourceConstituency":
        return "";
      case "targetConstituency":
        return "Alumni - Graduate Degree";
      case "startDate":
        return "2026-05-01";
      case "endDate":
        return "";
      case "educationInstitution":
        return "Jacksonville University";
      case "educationDegree":
        return "Master of Business Administration";
      case "educationMajor":
        return "Business";
      case "educationClassYear":
        return "2026";
      case "educationRelationshipMakePrimary":
        return "No";
      case "organizationName":
        return "Dolphin Foundation";
      case "organizationRelationshipType":
        return "Board Member";
      case "organizationTitle":
        return "Trustee";
      case "organizationStartDate":
        return "2025-07-01";
      case "organizationEndDate":
        return "";
      case "organizationRelationshipMakePrimary":
        return "No";
      default:
        return "";
    }
  });
  return Papa.unparse([headers, rowOne, rowTwo]);
}

function parseCsv(text) {
  const parsed = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => String(header || "").trim(),
  });

  const rows = Array.isArray(parsed.data)
    ? parsed.data.filter((row) =>
        Object.values(row || {}).some((value) => String(value || "").trim()),
      )
    : [];
  const headers = parsed.meta?.fields?.filter(Boolean) || [];
  return { rows, headers, errors: parsed.errors || [] };
}

function statusTone(status) {
  switch (status) {
    case "Ready":
      return { bg: "#DCFCE7", fg: "#166534", border: "#BBF7D0" };
    case "Applied":
      return { bg: "#DBEAFE", fg: "#1D4ED8", border: "#BFDBFE" };
    case "Needs Review":
      return { bg: "#FEF3C7", fg: "#92400E", border: "#FDE68A" };
    case "Skipped":
      return { bg: "#E0F2FE", fg: "#075985", border: "#BAE6FD" };
    case "Conflict":
      return { bg: "#FEE2E2", fg: "#991B1B", border: "#FECACA" };
    case "Failed":
      return { bg: "#FEE2E2", fg: "#991B1B", border: "#FECACA" };
    default:
      return { bg: "#F3F4F6", fg: "#374151", border: "#E5E7EB" };
  }
}

function Pill({ children, tone = "neutral" }) {
  const tones = {
    blue: { bg: "#EFF6FF", fg: "#1D4ED8", border: "#BFDBFE" },
    green: { bg: "#DCFCE7", fg: "#166534", border: "#BBF7D0" },
    amber: { bg: "#FEF3C7", fg: "#92400E", border: "#FDE68A" },
    red: { bg: "#FEE2E2", fg: "#991B1B", border: "#FECACA" },
    neutral: { bg: "#F3F4F6", fg: "#374151", border: "#E5E7EB" },
  };
  const colors = tones[tone] || tones.neutral;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: "999px",
        border: `1px solid ${colors.border}`,
        backgroundColor: colors.bg,
        color: colors.fg,
        padding: "5px 10px",
        fontSize: "12px",
        fontWeight: 800,
      }}
    >
      {children}
    </span>
  );
}

function renderList(values) {
  if (!Array.isArray(values) || values.length === 0) return "None found";
  return values.join(" -> ");
}

function formatWritePlanItem(write) {
  if (!write || typeof write !== "object") return "";

  if (write.type === "constituent_code") {
    const action = write.action === "replace" ? "Replace" : "Add";
    const from = write.sourceConstituency ? `${write.sourceConstituency} to ` : "";
    return `${action} constituent code: ${from}${write.targetConstituency || "unspecified"}`;
  }

  if (write.type === "education_relationship") {
    const action =
      write.action === "update" ? "Update existing education relationship" : "Add education relationship";
    const details = [write.institution, write.degree, write.major, write.classYear && `Class ${write.classYear}`]
      .filter(Boolean)
      .join(" / ");
    return `${action}: ${details || "details supplied in row"}`;
  }

  if (write.type === "organization_relationship") {
    const details = [write.name, write.relationshipType, write.title].filter(Boolean).join(" / ");
    return `Add organization relationship: ${details || "details supplied in row"}`;
  }

  return write.type || "Requested write";
}

function renderWritePlan(values) {
  if (!Array.isArray(values) || values.length === 0) return "No writes staged";
  return values.map(formatWritePlanItem).filter(Boolean).join(" | ");
}

function formatApplyResultItem(result) {
  if (!result || typeof result !== "object") return "";
  if (result.status === "applied") {
    if (result.type === "constituent_code") {
      if (result.action === "replace") {
        return (
          result.message ||
          `Replaced constituent code: ${result.sourceConstituency || "current code"} to ${
            result.targetConstituency || "selected code"
          }`
        );
      }
      if (result.action === "end-date") {
        return `End-dated constituent code: ${result.sourceConstituency || "selected code"}${
          result.endDate ? ` on ${result.endDate}` : ""
        }`;
      }
      if (result.action === "skip_existing") {
        return result.message || `${result.targetConstituency || "Selected code"} was already present.`;
      }
      return `Applied constituent code: ${result.targetConstituency || "selected code"}`;
    }
    return "Applied staged write.";
  }
  if (result.status === "manual_required") {
    return `Manual review: ${result.message || "This staged write is not automated yet."}`;
  }
  return result.message || result.status || "Apply result recorded.";
}

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function HeaderCode({ children }) {
  return (
    <code
      style={{
        display: "inline-flex",
        borderRadius: "8px",
        border: "1px solid #CBD5E1",
        backgroundColor: "#F8FAFC",
        padding: "4px 7px",
        color: "#0F172A",
        fontWeight: 800,
      }}
    >
      {children}
    </code>
  );
}

export default function ConstituencyImportPage() {
  const { data: user, loading } = useUser();
  const [profile, setProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [activeFields, setActiveFields] = useState(DEFAULT_ACTIVE_FIELDS);
  const [openFieldGroups, setOpenFieldGroups] = useState(DEFAULT_OPEN_FIELD_GROUPS);
  const [constituencyAction, setConstituencyAction] = useState("add");
  const [educationRelationshipAction, setEducationRelationshipAction] = useState("add");
  const [useHierarchy, setUseHierarchy] = useState(true);
  const [rawCsv, setRawCsv] = useState(() =>
    makeTemplateRows(IMPORT_FIELDS.filter((field) => DEFAULT_ACTIVE_FIELDS[field.key])),
  );
  const [rows, setRows] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [sourceFilename, setSourceFilename] = useState("");
  const [parseMessage, setParseMessage] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [savingRun, setSavingRun] = useState(false);
  const [savedRuns, setSavedRuns] = useState([]);
  const [loadingSavedRuns, setLoadingSavedRuns] = useState(false);
  const [loadingRunId, setLoadingRunId] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [applyingRun, setApplyingRun] = useState(false);

  const profileRole = profile?.user?.role || profile?.workspaceUser?.role || user?.role || "";
  const { effectiveRole } = useWorkspaceView(profileRole);
  const isReviewer = isReviewerRole(effectiveRole);

  const selectedFields = useMemo(
    () => IMPORT_FIELDS.filter((field) => activeFields[field.key]),
    [activeFields],
  );
  const expectedHeaders = selectedFields.map((field) => field.header);
  const mappings = useMemo(
    () =>
      selectedFields.reduce((acc, field) => {
        acc[field.key] = field.header;
        return acc;
      }, {}),
    [selectedFields],
  );
  const missingHeaders = expectedHeaders.filter((header) => !headers.includes(header));
  const extraHeaders = headers.filter((header) => !expectedHeaders.includes(header));
  const educationRelationshipFieldsActive = Boolean(
    activeFields.educationInstitution ||
      activeFields.educationDegree ||
      activeFields.educationMajor ||
      activeFields.educationClassYear,
  );
  const organizationRelationshipFieldsActive = Boolean(
    activeFields.organizationName ||
      activeFields.organizationRelationshipType ||
      activeFields.organizationTitle,
  );
  const hasImportOperation = Boolean(
    activeFields.targetConstituency ||
      educationRelationshipFieldsActive ||
      organizationRelationshipFieldsActive,
  );
  const mappedIdentityField = Boolean(
    activeFields.blackbaudConstituentId ||
      activeFields.lookupId ||
      activeFields.email ||
      (activeFields.firstName && activeFields.lastName),
  );
  const canPreview =
    rows.length > 0 &&
    mappedIdentityField &&
    missingHeaders.length === 0 &&
    hasImportOperation;
  const readySavedRows =
    preview?.savedRun && Array.isArray(preview?.rows)
      ? preview.rows.filter((row) => row.status === "Ready" && !row.appliedAt).length
      : 0;

  useEffect(() => {
    if (loading) return;
    let active = true;
    setLoadingProfile(true);
    fetch("/api/users/profile")
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error || "Failed to load profile");
        if (active) setProfile(payload);
      })
      .catch((profileError) => {
        if (active) {
          setError(profileError instanceof Error ? profileError.message : "Failed to load profile");
        }
      })
      .finally(() => {
        if (active) setLoadingProfile(false);
      });
    return () => {
      active = false;
    };
  }, [loading]);

  useEffect(() => {
    const parsed = parseCsv(rawCsv);
    setRows(parsed.rows);
    setHeaders(parsed.headers);
    setPreview(null);
    setSaveMessage("");
    if (parsed.errors.length > 0) {
      setParseMessage(`Parsed ${parsed.rows.length} rows with ${parsed.errors.length} CSV warning(s).`);
    } else {
      setParseMessage(parsed.rows.length ? `Parsed ${parsed.rows.length} rows.` : "");
    }
  }, [rawCsv]);

  useEffect(() => {
    if (!isReviewer) return;
    fetchSavedRuns();
  }, [isReviewer]);

  const summaryCards = useMemo(() => {
    const summary = preview?.summary || {};
    return [
      ["Ready", summary.ready || 0, "green"],
      ["Needs Review", summary.needsReview || 0, "amber"],
      ["Conflicts", summary.conflict || 0, "red"],
      ["Skipped", summary.skipped || 0, "blue"],
      ["Total", summary.total || rows.length || 0, "neutral"],
    ];
  }, [preview, rows.length]);

  function toggleField(key) {
    setActiveFields((current) => ({ ...current, [key]: !current[key] }));
    setPreview(null);
  }

  function setContactFieldSetActive(group, active) {
    const contactSet = ADDITIONAL_CONTACT_SETS[group];
    if (!contactSet) return;
    setActiveFields((current) => {
      const next = { ...current };
      contactSet.keys.forEach((key) => {
        next[key] = active;
      });
      return next;
    });
    setPreview(null);
  }

  function toggleFieldGroup(group) {
    setOpenFieldGroups((current) => ({ ...current, [group]: !current[group] }));
  }

  function selectConstituencyAction(nextAction) {
    setConstituencyAction(nextAction);
    setActiveFields((current) => ({
      ...current,
      targetConstituency: true,
      sourceConstituency: nextAction === "replace" ? true : current.sourceConstituency,
    }));
    if (nextAction !== "add") {
      setUseHierarchy(true);
    }
    setPreview(null);
  }

  function useTemplateCsv() {
    setRawCsv(makeTemplateRows(selectedFields));
    setSourceFilename("Template CSV");
  }

  function downloadTemplateCsv() {
    const csv = makeTemplateRows(selectedFields);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "constituency-import-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function handleFileUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setSourceFilename(file.name || "");
    const reader = new FileReader();
    reader.onload = () => setRawCsv(String(reader.result || ""));
    reader.readAsText(file);
  }

  async function fetchSavedRuns() {
    setLoadingSavedRuns(true);
    try {
      const response = await fetch("/api/constituency-import/runs?limit=8");
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load saved import previews");
      }
      setSavedRuns(Array.isArray(payload?.runs) ? payload.runs : []);
    } catch (savedRunError) {
      setError(
        savedRunError instanceof Error
          ? savedRunError.message
          : "Failed to load saved import previews",
      );
    } finally {
      setLoadingSavedRuns(false);
    }
  }

  async function loadSavedRun(runId) {
    setLoadingRunId(String(runId));
    setError("");
    setSaveMessage("");
    try {
      const response = await fetch(`/api/constituency-import/runs?id=${encodeURIComponent(runId)}`);
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load saved import preview");
      }
      setPreview(payload);
      setSaveMessage(`Loaded saved import run #${payload?.savedRun?.id || runId}.`);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Failed to load saved import preview",
      );
    } finally {
      setLoadingRunId("");
    }
  }

  async function applySavedRun() {
    const runId = preview?.savedRun?.id;
    if (!runId || applyingRun) return;

    const shouldApply = window.confirm(
      "Apply ready constituent-code rows to NXT now? Replace and end-date rows require an end date. Education and organization relationship rows will stay staged for manual review.",
    );
    if (!shouldApply) return;

    setApplyingRun(true);
    setError("");
    setSaveMessage("");
    try {
      const response = await fetch(`/api/constituency-import/runs/${encodeURIComponent(runId)}/apply`, {
        method: "POST",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to apply saved import run");
      }

      setPreview(payload);
      setSaveMessage(payload?.applySummary?.message || `Applied import run #${runId}.`);
      fetchSavedRuns();
    } catch (applyError) {
      setError(
        applyError instanceof Error ? applyError.message : "Failed to apply saved import run",
      );
    } finally {
      setApplyingRun(false);
    }
  }

  async function requestPreview({ saveRun = false } = {}) {
    if (saveRun) {
      setSavingRun(true);
    } else {
      setPreviewing(true);
    }
    setError("");
    setSaveMessage("");
    if (!saveRun) {
      setPreview(null);
    }
    try {
      const response = await fetch("/api/constituency-import/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows,
          mappings,
          defaults: { defaultAction: constituencyAction, educationRelationshipAction, useHierarchy },
          sourceFilename,
          saveRun,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to preview constituency import");
      }
      setPreview(payload);
      if (saveRun && payload?.savedRun?.id) {
        setSaveMessage(`Saved import run #${payload.savedRun.id}. No NXT records were changed.`);
        fetchSavedRuns();
      }
    } catch (previewError) {
      setError(
        previewError instanceof Error
          ? previewError.message
          : "Failed to preview constituency import",
      );
    } finally {
      setPreviewing(false);
      setSavingRun(false);
    }
  }

  function downloadPreviewCsv() {
    if (!preview?.rows?.length) return;
    const csv = Papa.unparse(
      preview.rows.map((row) => ({
        rowNumber: row.rowNumber,
        status: row.status,
        confidence: row.confidence,
        matchMethod: row.matchMethod,
        firstName: row.input?.firstName || "",
        lastName: row.input?.lastName || "",
        preferredName: row.input?.preferredName || "",
        inputLookupId: row.input?.lookupId || "",
        inputSystemId: row.input?.blackbaudConstituentId || "",
        matchedName: row.match?.name || "",
        matchedLookupId: row.match?.lookupId || "",
        matchedSystemId: row.match?.blackbaudConstituentId || "",
        action: row.input?.action || constituencyAction,
        sourceConstituency: row.input?.sourceConstituency || "",
        targetConstituency: row.input?.targetConstituency || "",
        currentCodes: renderList(row.currentCodes),
        proposedCodes: renderList(row.proposedCodes),
        writePlan: renderWritePlan(row.writePlan),
        reasons: (row.reasons || []).join(" | "),
      })),
    );
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "constituency-import-preview.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  if (loading || loadingProfile) {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "#6B7280" }}>
        Loading import preview...
      </main>
    );
  }

  if (!isReviewer) {
    return (
      <main style={{ minHeight: "100vh", backgroundColor: "#F8FAFC", padding: "28px 18px 48px" }}>
        <div style={{ maxWidth: "900px", margin: "0 auto" }}>
          <a
            href="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              color: "#4F46E5",
              fontWeight: 800,
              textDecoration: "none",
              marginBottom: "16px",
            }}
          >
            <ArrowLeft size={18} /> Return to home
          </a>
          <section
            style={{
              backgroundColor: "white",
              border: "1px solid #FECACA",
              borderRadius: "20px",
              padding: "24px",
            }}
          >
            <Pill tone="red">Advancement Services only</Pill>
            <h1 style={{ margin: "14px 0 0", color: "#111827" }}>
              Constituency imports need reviewer access
            </h1>
            <p style={{ color: "#6B7280", lineHeight: 1.5 }}>
              This preview tool is intentionally limited to Advancement Services and workspace
              admins because it inspects NXT constituency data.
            </p>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100vh", backgroundColor: "#F8FAFC", padding: "28px 18px 56px" }}>
      <div style={{ maxWidth: "1180px", margin: "0 auto" }}>
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "18px",
            marginBottom: "18px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <a
              href="/"
              aria-label="Return to home"
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "12px",
                border: "1px solid #E5E7EB",
                display: "grid",
                placeItems: "center",
                color: "#374151",
                backgroundColor: "white",
              }}
            >
              <ArrowLeft size={20} />
            </a>
            <div>
              <h1 style={{ margin: 0, fontSize: "30px", color: "#111827" }}>
                Constituency Import Preview
              </h1>
              <p style={{ margin: "6px 0 0", color: "#6B7280" }}>
                Configure exact CSV headers, preview matches, and review constituent-code changes.
              </p>
            </div>
          </div>
          <Pill tone={preview?.savedRun ? "green" : "blue"}>
            {preview?.savedRun ? "Saved run: guarded NXT apply" : "Preview only: no NXT writes"}
          </Pill>
        </header>

        <section
          style={{
            backgroundColor: "#ECFDF5",
            border: "1px solid #A7F3D0",
            borderRadius: "18px",
            padding: "16px 18px",
            marginBottom: "18px",
            color: "#065F46",
            lineHeight: 1.5,
          }}
        >
          This version is template-first: choose the fields you are importing, use the exact CSV
          headers shown here, then upload the file. You can now save preview runs for review, but
          this still does not write to NXT.
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: "18px",
            alignItems: "start",
          }}
        >
          <div style={{ display: "grid", gap: "18px" }}>
            <section
              style={{
                backgroundColor: "white",
                border: "1px solid #E5E7EB",
                borderRadius: "20px",
                padding: "20px",
                display: "grid",
                gap: "16px",
              }}
            >
              <div>
                <h2 style={{ margin: 0, fontSize: "22px", color: "#111827" }}>
                  1. Choose import fields
                </h2>
                <p style={{ margin: "6px 0 0", color: "#6B7280", lineHeight: 1.5 }}>
                  Turn on only the NXT fields represented in your import. The CSV must use the
                  exact column headers shown on each active field.
                </p>
              </div>

              {FIELD_GROUP_ORDER.map((group) => {
                const contactSet = ADDITIONAL_CONTACT_SETS[group];
                const contactSetActive = contactSet
                  ? contactSet.keys.some((key) => activeFields[key])
                  : false;
                const groupFields = IMPORT_FIELDS.filter(
                  (field) =>
                    field.group === group && (!field.additionalSet || contactSetActive),
                );
                const isOpen = Boolean(openFieldGroups[group]);
                const activeCount = groupFields.filter((field) => activeFields[field.key]).length;
                return (
                  <div
                    key={group}
                    style={{
                      border: "1px solid #E5E7EB",
                      borderRadius: "16px",
                      overflow: "hidden",
                      backgroundColor: "white",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => toggleFieldGroup(group)}
                      aria-expanded={isOpen}
                      style={{
                        width: "100%",
                        border: "none",
                        backgroundColor: isOpen ? "#F8FAFC" : "white",
                        color: "#111827",
                        padding: "14px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        flexWrap: "wrap",
                        gap: "12px",
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      <span>
                        <span style={{ display: "block", fontSize: "16px", fontWeight: 900 }}>
                          {group}
                        </span>
                        <span
                          style={{
                            display: "block",
                            marginTop: "4px",
                            color: "#6B7280",
                            lineHeight: 1.4,
                          }}
                        >
                          {FIELD_GROUP_HELP[group]}
                        </span>
                      </span>
                      <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <Pill tone={activeCount ? "green" : "neutral"}>
                          {activeCount}/{groupFields.length} active
                        </Pill>
                        <span style={{ color: "#4F46E5", fontWeight: 900 }}>
                          {isOpen ? "Hide" : "Show"}
                        </span>
                      </span>
                    </button>
                    {isOpen ? (
                      <div
                        style={{
                          borderTop: "1px solid #E5E7EB",
                          display: "grid",
                          gap: "10px",
                          padding: "14px",
                        }}
                      >
                      {groupFields.map((field) => {
                        const active = Boolean(activeFields[field.key]);
                        return (
                          <div key={field.key} style={{ display: "grid", gap: "8px" }}>
                            <button
                              type="button"
                              onClick={() => toggleField(field.key)}
                              style={{
                                display: "grid",
                                gridTemplateColumns: "auto 1fr",
                                gap: "12px",
                                textAlign: "left",
                                border: active ? "2px solid #6D5DFB" : "1px solid #E5E7EB",
                                borderRadius: "14px",
                                padding: "13px",
                                backgroundColor: active ? "#F5F3FF" : "white",
                                cursor: "pointer",
                              }}
                            >
                              <span
                                aria-hidden="true"
                                style={{
                                  width: "22px",
                                  height: "22px",
                                  borderRadius: "7px",
                                  border: active ? "2px solid #6D5DFB" : "2px solid #CBD5E1",
                                  backgroundColor: active ? "#6D5DFB" : "white",
                                  color: "white",
                                  display: "grid",
                                  placeItems: "center",
                                  fontSize: "14px",
                                  fontWeight: 900,
                                }}
                              >
                                {active ? "✓" : ""}
                              </span>
                              <span>
                                <span
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "8px",
                                    flexWrap: "wrap",
                                    color: "#111827",
                                    fontWeight: 900,
                                  }}
                                >
                                  {field.label}
                                  {field.recommended ? <Pill tone="green">Recommended</Pill> : null}
                                </span>
                                <span style={{ display: "block", marginTop: "6px" }}>
                                  CSV header: <HeaderCode>{field.header}</HeaderCode>
                                </span>
                                <span
                                  style={{
                                    display: "block",
                                    marginTop: "6px",
                                    color: "#6B7280",
                                    lineHeight: 1.45,
                                  }}
                                >
                                  {field.description}
                                </span>
                              </span>
                            </button>
                            {field.key === "targetConstituency" && active ? (
                              <div
                                style={{
                                  border: "1px solid #C7D2FE",
                                  borderRadius: "16px",
                                  backgroundColor: "#EEF2FF",
                                  padding: "14px",
                                  display: "grid",
                                  gap: "12px",
                                }}
                              >
                                <div>
                                  <div
                                    style={{
                                      color: "#312E81",
                                      fontSize: "13px",
                                      fontWeight: 900,
                                      textTransform: "uppercase",
                                      letterSpacing: "0.05em",
                                    }}
                                  >
                                    New Constituent Code behavior
                                  </div>
                                  <p
                                    style={{
                                      margin: "5px 0 0",
                                      color: "#4338CA",
                                      lineHeight: 1.45,
                                    }}
                                  >
                                    Choose what should happen when this row matches an existing NXT
                                    record.
                                  </p>
                                </div>
                                <div
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                                    gap: "10px",
                                  }}
                                >
                                  {CONSTITUENCY_ACTIONS.map((action) => {
                                    const selected = constituencyAction === action.value;
                                    return (
                                      <button
                                        key={action.value}
                                        type="button"
                                        onClick={() => selectConstituencyAction(action.value)}
                                        style={{
                                          border: selected
                                            ? "2px solid #6D5DFB"
                                            : "1px solid #C7D2FE",
                                          borderRadius: "14px",
                                          backgroundColor: selected ? "white" : "#F8FAFC",
                                          color: selected ? "#312E81" : "#475569",
                                          padding: "12px",
                                          textAlign: "left",
                                          cursor: "pointer",
                                        }}
                                      >
                                        <span style={{ display: "block", fontWeight: 900 }}>
                                          {action.label}
                                        </span>
                                        <span
                                          style={{
                                            display: "block",
                                            marginTop: "5px",
                                            lineHeight: 1.4,
                                          }}
                                        >
                                          {action.description}
                                        </span>
                                      </button>
                                    );
                                  })}
                                </div>
                                {constituencyAction === "add" ? (
                                  <label
                                    style={{
                                      display: "flex",
                                      gap: "10px",
                                      alignItems: "flex-start",
                                      color: "#111827",
                                      fontWeight: 800,
                                    }}
                                  >
                                    <input
                                      type="checkbox"
                                      name="useConstituencyHierarchy"
                                      checked={useHierarchy}
                                      onChange={(event) => {
                                        setUseHierarchy(event.target.checked);
                                        setPreview(null);
                                      }}
                                      style={{ marginTop: "4px" }}
                                    />
                                    <span>
                                      Use hierarchy?
                                      <span
                                        style={{
                                          display: "block",
                                          marginTop: "3px",
                                          color: "#6B7280",
                                          fontWeight: 600,
                                          lineHeight: 1.4,
                                        }}
                                      >
                                        When enabled, the preview places the new code according to
                                        the configured constituency hierarchy.
                                      </span>
                                    </span>
                                  </label>
                                ) : (
                                  <p
                                    style={{
                                      margin: 0,
                                      color: "#6B7280",
                                      lineHeight: 1.45,
                                    }}
                                  >
                                    Replace Existing automatically requires the Current Constituent
                                    Code field so the preview can identify the code to replace.
                                  </p>
                                )}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                      {group === "Education relationship fields" &&
                      educationRelationshipFieldsActive ? (
                        <div
                          style={{
                            border: "1px solid #C7D2FE",
                            borderRadius: "16px",
                            backgroundColor: "#EEF2FF",
                            padding: "14px",
                            display: "grid",
                            gap: "12px",
                          }}
                        >
                          <div>
                            <div
                              style={{
                                color: "#312E81",
                                fontSize: "13px",
                                fontWeight: 900,
                                textTransform: "uppercase",
                                letterSpacing: "0.05em",
                              }}
                            >
                              Education relationship behavior
                            </div>
                            <p
                              style={{
                                margin: "5px 0 0",
                                color: "#4338CA",
                                lineHeight: 1.45,
                              }}
                            >
                              Choose whether these education columns should create a new education
                              relationship or update an existing one already on the matched NXT
                              record.
                            </p>
                          </div>
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                              gap: "10px",
                            }}
                          >
                            {EDUCATION_RELATIONSHIP_ACTIONS.map((action) => {
                              const selected = educationRelationshipAction === action.value;
                              return (
                                <button
                                  key={action.value}
                                  type="button"
                                  onClick={() => {
                                    setEducationRelationshipAction(action.value);
                                    setPreview(null);
                                  }}
                                  style={{
                                    border: selected
                                      ? "2px solid #6D5DFB"
                                      : "1px solid #C7D2FE",
                                    borderRadius: "14px",
                                    backgroundColor: selected ? "white" : "#F8FAFC",
                                    color: selected ? "#312E81" : "#475569",
                                    padding: "12px",
                                    textAlign: "left",
                                    cursor: "pointer",
                                  }}
                                >
                                  <span style={{ display: "block", fontWeight: 900 }}>
                                    {action.label}
                                  </span>
                                  <span
                                    style={{
                                      display: "block",
                                      marginTop: "5px",
                                      lineHeight: 1.4,
                                    }}
                                  >
                                    {action.description}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}
                      {contactSet ? (
                        <div
                          style={{
                            borderTop: "1px dashed #CBD5E1",
                            paddingTop: "12px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            flexWrap: "wrap",
                            gap: "10px",
                          }}
                        >
                          <p style={{ margin: 0, color: "#6B7280", lineHeight: 1.45 }}>
                            {contactSet.description}
                          </p>
                          <button
                            type="button"
                            onClick={() => setContactFieldSetActive(group, !contactSetActive)}
                            style={{
                              border: contactSetActive
                                ? "1px solid #FCA5A5"
                                : "1px solid #C7D2FE",
                              borderRadius: "999px",
                              backgroundColor: "white",
                              color: contactSetActive ? "#991B1B" : "#4338CA",
                              padding: "9px 13px",
                              fontWeight: 900,
                              cursor: "pointer",
                            }}
                          >
                            {contactSetActive ? contactSet.removeLabel : contactSet.addLabel}
                          </button>
                        </div>
                      ) : null}
                    </div>
                    ) : null}
                  </div>
                );
              })}
            </section>

            <section
              style={{
                backgroundColor: "white",
                border: "1px solid #E5E7EB",
                borderRadius: "20px",
                padding: "20px",
                display: "grid",
                gap: "14px",
              }}
            >
              <div>
                <h2 style={{ margin: 0, fontSize: "22px", color: "#111827" }}>
                  2. Prepare exact CSV headers
                </h2>
                <p style={{ margin: "6px 0 0", color: "#6B7280", lineHeight: 1.5 }}>
                  Your file should include these active headers. Extra columns are ignored in the
                  preview; missing active headers block preview.
                </p>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {expectedHeaders.map((header) => (
                  <HeaderCode key={header}>{header}</HeaderCode>
                ))}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
                <button
                  type="button"
                  onClick={useTemplateCsv}
                  style={{
                    border: "1px solid #C7D2FE",
                    borderRadius: "999px",
                    backgroundColor: "white",
                    color: "#4338CA",
                    padding: "10px 14px",
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  Put template in upload box
                </button>
                <button
                  type="button"
                  onClick={downloadTemplateCsv}
                  style={{
                    border: "1px solid #D1D5DB",
                    borderRadius: "999px",
                    backgroundColor: "white",
                    color: "#374151",
                    padding: "10px 14px",
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  Download template CSV
                </button>
              </div>
            </section>
          </div>

          <aside
            style={{
              backgroundColor: "white",
              border: "1px solid #E5E7EB",
              borderRadius: "20px",
              padding: "20px",
              position: "sticky",
              top: "16px",
              display: "grid",
              gap: "14px",
            }}
          >
            <div>
              <h2 style={{ margin: 0, fontSize: "20px", color: "#111827" }}>
                Preview checklist
              </h2>
              <p style={{ margin: "6px 0 0", color: "#6B7280", lineHeight: 1.5 }}>
                Nothing on this page writes to NXT.
              </p>
            </div>
            <div style={{ display: "grid", gap: "8px" }}>
              <Pill tone={mappedIdentityField ? "green" : "amber"}>
                {mappedIdentityField
                  ? "Identity fields active"
                  : "Activate ID, lookup, email, or first/last name"}
              </Pill>
              <Pill tone={hasImportOperation ? "green" : "amber"}>
                {hasImportOperation
                  ? "Import operation selected"
                  : "Activate a constituent code or relationship field"}
              </Pill>
              {activeFields.targetConstituency ? (
                <Pill tone="blue">
                  Constituent code:{" "}
                  {constituencyAction === "add" ? "Add Additional" : "Replace Existing"}
                </Pill>
              ) : null}
              {educationRelationshipFieldsActive ? (
                <Pill tone="blue">
                  Education:{" "}
                  {educationRelationshipAction === "update" ? "Update Existing" : "Add New"}
                </Pill>
              ) : null}
              {organizationRelationshipFieldsActive ? (
                <Pill tone="blue">Organization: Add Additional</Pill>
              ) : null}
              <Pill tone={rows.length ? "green" : "amber"}>
                {rows.length ? `${rows.length} rows parsed` : "Upload CSV rows"}
              </Pill>
              <Pill tone={missingHeaders.length === 0 ? "green" : "red"}>
                {missingHeaders.length === 0
                  ? "All active headers present"
                  : `${missingHeaders.length} active header(s) missing`}
              </Pill>
            </div>
            {error ? (
              <div
                style={{
                  border: "1px solid #FECACA",
                  borderRadius: "14px",
                  backgroundColor: "#FEF2F2",
                  color: "#991B1B",
                  padding: "12px",
                  fontWeight: 800,
                }}
              >
                {error}
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => requestPreview()}
              disabled={!canPreview || previewing}
              style={{
                border: "none",
                borderRadius: "14px",
                backgroundColor: !canPreview || previewing ? "#CBD5E1" : "#6D5DFB",
                color: "white",
                padding: "13px 16px",
                fontWeight: 900,
                fontSize: "15px",
                cursor: !canPreview || previewing ? "not-allowed" : "pointer",
              }}
            >
              {previewing ? "Previewing..." : "Preview import"}
            </button>
            {preview?.rows?.length ? (
              <>
                <button
                  type="button"
                  onClick={() => requestPreview({ saveRun: true })}
                  disabled={savingRun}
                  style={{
                    border: "1px solid #A7F3D0",
                    borderRadius: "14px",
                    backgroundColor: savingRun ? "#E5E7EB" : "#ECFDF5",
                    color: savingRun ? "#64748B" : "#047857",
                    padding: "12px 16px",
                    fontWeight: 900,
                    cursor: savingRun ? "not-allowed" : "pointer",
                  }}
                >
                  {savingRun ? "Saving preview..." : "Save preview run"}
                </button>
                <button
                  type="button"
                  onClick={downloadPreviewCsv}
                  style={{
                    display: "inline-flex",
                    justifyContent: "center",
                    alignItems: "center",
                    gap: "8px",
                    border: "1px solid #D1D5DB",
                    borderRadius: "14px",
                    backgroundColor: "white",
                    color: "#374151",
                    padding: "12px 16px",
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  <FileText size={16} /> Export preview CSV
                </button>
              </>
            ) : null}
            {saveMessage ? (
              <div
                style={{
                  border: "1px solid #A7F3D0",
                  borderRadius: "14px",
                  backgroundColor: "#ECFDF5",
                  color: "#065F46",
                  padding: "12px",
                  fontWeight: 800,
                  lineHeight: 1.4,
                }}
              >
                {saveMessage}
              </div>
            ) : null}
            <div
              style={{
                borderTop: "1px solid #E5E7EB",
                paddingTop: "14px",
                display: "grid",
                gap: "10px",
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: "16px", color: "#111827" }}>
                  Saved preview runs
                </h3>
                <p style={{ margin: "4px 0 0", color: "#6B7280", lineHeight: 1.4 }}>
                  Reopen a prior preview without rechecking NXT.
                </p>
              </div>
              {loadingSavedRuns ? (
                <span style={{ color: "#6B7280" }}>Loading saved previews...</span>
              ) : savedRuns.length ? (
                <div style={{ display: "grid", gap: "8px" }}>
                  {savedRuns.map((run) => (
                    <button
                      key={run.id}
                      type="button"
                      onClick={() => loadSavedRun(run.id)}
                      disabled={loadingRunId === run.id}
                      style={{
                        border: "1px solid #E5E7EB",
                        borderRadius: "14px",
                        backgroundColor: "white",
                        color: "#111827",
                        padding: "11px 12px",
                        textAlign: "left",
                        cursor: loadingRunId === run.id ? "wait" : "pointer",
                      }}
                    >
                      <span style={{ display: "block", fontWeight: 900 }}>
                        Run #{run.id} · {run.sourceFilename || "CSV preview"}
                      </span>
                      <span
                        style={{
                          display: "block",
                          marginTop: "4px",
                          color: "#6B7280",
                          fontSize: "13px",
                          lineHeight: 1.35,
                        }}
                      >
                        {run.readyCount} ready · {run.appliedCount} applied ·{" "}
                        {run.needsReviewCount} review · {run.failedCount} failed ·{" "}
                        {formatDateTime(run.createdAt)}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <span style={{ color: "#6B7280" }}>No saved import previews yet.</span>
              )}
            </div>
          </aside>
        </section>

        <section
          style={{
            marginTop: "18px",
            backgroundColor: "white",
            border: "1px solid #E5E7EB",
            borderRadius: "20px",
            padding: "20px",
            display: "grid",
            gap: "16px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
            <div>
              <h2 style={{ margin: 0, fontSize: "22px", color: "#111827" }}>
                3. Upload CSV and review preview
              </h2>
              <p style={{ margin: "6px 0 0", color: "#6B7280" }}>
                Paste CSV content or upload a file exported from a data append.
              </p>
              {sourceFilename ? (
                <p style={{ margin: "6px 0 0", color: "#64748B", fontWeight: 800 }}>
                  Source: {sourceFilename}
                </p>
              ) : null}
            </div>
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                alignSelf: "start",
                border: "1px solid #C7D2FE",
                borderRadius: "999px",
                color: "#4338CA",
                padding: "10px 14px",
                cursor: "pointer",
                fontWeight: 800,
              }}
            >
              <Upload size={16} /> Upload CSV
              <input
                id="constituency-import-file"
                name="constituency-import-file"
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileUpload}
                style={{ display: "none" }}
              />
            </label>
          </div>

          <textarea
            name="constituency-import-csv"
            value={rawCsv}
            onChange={(event) => setRawCsv(event.target.value)}
            rows={8}
            spellCheck={false}
            style={{
              width: "100%",
              boxSizing: "border-box",
              border: "1px solid #D1D5DB",
              borderRadius: "14px",
              padding: "14px",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: "13px",
              color: "#111827",
              backgroundColor: "#F9FAFB",
            }}
          />
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center" }}>
            <Pill tone={rows.length ? "green" : "neutral"}>
              {rows.length ? `${rows.length} rows parsed` : "No rows parsed"}
            </Pill>
            {parseMessage ? <span style={{ color: "#6B7280" }}>{parseMessage}</span> : null}
          </div>
          {missingHeaders.length ? (
            <div
              style={{
                border: "1px solid #FECACA",
                borderRadius: "14px",
                backgroundColor: "#FEF2F2",
                color: "#991B1B",
                padding: "12px",
                fontWeight: 800,
              }}
            >
              Missing active CSV headers: {missingHeaders.join(", ")}
            </div>
          ) : null}
          {extraHeaders.length ? (
            <div
              style={{
                border: "1px solid #FDE68A",
                borderRadius: "14px",
                backgroundColor: "#FFFBEB",
                color: "#92400E",
                padding: "12px",
                fontWeight: 800,
              }}
            >
              Extra CSV headers will be ignored in this preview: {extraHeaders.join(", ")}
            </div>
          ) : null}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: "10px",
            }}
          >
            {summaryCards.map(([label, value, tone]) => (
              <div
                key={label}
                style={{
                  border: "1px solid #E5E7EB",
                  borderRadius: "14px",
                  padding: "14px",
                  backgroundColor: "#F9FAFB",
                }}
              >
                <div style={{ color: "#6B7280", fontSize: "12px", fontWeight: 900, textTransform: "uppercase" }}>
                  {label}
                </div>
                <div
                  style={{
                    marginTop: "8px",
                    fontSize: "26px",
                    fontWeight: 900,
                    color: statusTone(label === "Conflicts" ? "Conflict" : label).fg,
                  }}
                >
                  {value}
                </div>
                <div style={{ marginTop: "4px" }}>
                  <Pill tone={tone}>{label}</Pill>
                </div>
              </div>
            ))}
          </div>

          {preview?.warnings?.length ? (
            <div
              style={{
                border: "1px solid #FDE68A",
                borderRadius: "14px",
                backgroundColor: "#FFFBEB",
                color: "#92400E",
                padding: "12px",
                fontWeight: 800,
              }}
            >
              {preview.warnings.join(" ")}
            </div>
          ) : null}

          {preview?.savedRun ? (
            <div
              style={{
                border: "1px solid #A7F3D0",
                borderRadius: "14px",
                backgroundColor: "#ECFDF5",
                color: "#065F46",
                padding: "12px",
                fontWeight: 800,
                lineHeight: 1.45,
                display: "flex",
                justifyContent: "space-between",
                gap: "12px",
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <span>
                Saved import run #{preview.savedRun.id}. {readySavedRows} ready unapplied row
                {readySavedRows === 1 ? "" : "s"} can be applied to NXT.
              </span>
              <button
                type="button"
                onClick={applySavedRun}
                disabled={!readySavedRows || applyingRun}
                style={{
                  border: "1px solid #047857",
                  borderRadius: "999px",
                  backgroundColor: !readySavedRows || applyingRun ? "#D1FAE5" : "#047857",
                  color: !readySavedRows || applyingRun ? "#047857" : "white",
                  padding: "9px 14px",
                  fontWeight: 900,
                  cursor: !readySavedRows || applyingRun ? "not-allowed" : "pointer",
                }}
              >
                {applyingRun ? "Applying..." : "Apply ready rows"}
              </button>
            </div>
          ) : null}

          {preview?.rows?.length ? (
            <div style={{ display: "grid", gap: "12px" }}>
              {preview.rows.map((row) => {
                const colors = statusTone(row.status);
                return (
                  <article
                    key={row.rowNumber}
                    style={{
                      border: `1px solid ${colors.border}`,
                      borderLeft: `6px solid ${colors.fg}`,
                      borderRadius: "16px",
                      padding: "16px",
                      display: "grid",
                      gap: "12px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "start",
                        justifyContent: "space-between",
                        gap: "12px",
                        flexWrap: "wrap",
                      }}
                    >
                      <div>
                        <div style={{ color: "#6B7280", fontSize: "12px", fontWeight: 900 }}>
                          ROW {row.rowNumber}
                        </div>
                        <h3 style={{ margin: "4px 0 0", color: "#111827" }}>
                          {row.input?.constituentName ||
                            row.input?.lookupId ||
                            row.input?.blackbaudConstituentId ||
                            "Unnamed row"}
                        </h3>
                        <p style={{ margin: "6px 0 0", color: "#6B7280" }}>
                          {row.match?.name
                            ? `Matched to ${row.match.name}${row.match.lookupId ? ` · Lookup ID ${row.match.lookupId}` : ""}`
                            : "No NXT match selected"}
                        </p>
                      </div>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                        <span
                          style={{
                            border: `1px solid ${colors.border}`,
                            borderRadius: "999px",
                            backgroundColor: colors.bg,
                            color: colors.fg,
                            padding: "6px 10px",
                            fontSize: "12px",
                            fontWeight: 900,
                          }}
                        >
                          {row.status}
                        </span>
                        <Pill tone="neutral">{row.confidence}% confidence</Pill>
                        <Pill tone="blue">{row.matchMethod}</Pill>
                      </div>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                        gap: "12px",
                      }}
                    >
                      <div>
                        <div style={{ color: "#6B7280", fontSize: "12px", fontWeight: 900, textTransform: "uppercase" }}>
                          Requested change
                        </div>
                        <div style={{ marginTop: "6px", color: "#111827", fontWeight: 800 }}>
                          {row.input?.action || constituencyAction}: {row.input?.sourceConstituency || "None"} to{" "}
                          {row.input?.targetConstituency || "None"}
                        </div>
                      </div>
                      <div>
                        <div style={{ color: "#6B7280", fontSize: "12px", fontWeight: 900, textTransform: "uppercase" }}>
                          Current NXT constituencies
                        </div>
                        <div style={{ marginTop: "6px", color: "#111827" }}>
                          {renderList(row.currentCodes)}
                        </div>
                      </div>
                      <div>
                        <div style={{ color: "#6B7280", fontSize: "12px", fontWeight: 900, textTransform: "uppercase" }}>
                          Proposed preview
                        </div>
                        <div style={{ marginTop: "6px", color: "#111827" }}>
                          {renderList(row.proposedCodes)}
                        </div>
                      </div>
                    </div>

                    {row.writePlan?.length ? (
                      <div
                        style={{
                          border: "1px solid #C7D2FE",
                          borderRadius: "12px",
                          backgroundColor: "#EEF2FF",
                          padding: "11px 12px",
                          display: "grid",
                          gap: "8px",
                        }}
                      >
                        <div
                          style={{
                            color: "#312E81",
                            fontSize: "12px",
                            fontWeight: 900,
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                          }}
                        >
                          Staged writes
                        </div>
                        <div style={{ display: "grid", gap: "6px" }}>
                          {row.writePlan.map((write, writeIndex) => (
                            <div
                              key={`${write.type || "write"}-${writeIndex}`}
                              style={{ color: "#1E1B4B", fontWeight: 800, lineHeight: 1.4 }}
                            >
                              {formatWritePlanItem(write)}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {row.blackbaudError ? (
                      <div
                        style={{
                          border: "1px solid #FECACA",
                          borderRadius: "12px",
                          backgroundColor: "#FEF2F2",
                          padding: "11px 12px",
                          color: "#991B1B",
                          fontWeight: 800,
                          lineHeight: 1.4,
                        }}
                      >
                        NXT apply failed: {row.blackbaudError}
                      </div>
                    ) : Array.isArray(row.blackbaudResult?.results) &&
                      row.blackbaudResult.results.length ? (
                      <div
                        style={{
                          border: "1px solid #BAE6FD",
                          borderRadius: "12px",
                          backgroundColor: "#F0F9FF",
                          padding: "11px 12px",
                          display: "grid",
                          gap: "6px",
                        }}
                      >
                        <div
                          style={{
                            color: "#075985",
                            fontSize: "12px",
                            fontWeight: 900,
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                          }}
                        >
                          Apply result
                        </div>
                        {row.blackbaudResult.results.map((result, resultIndex) => (
                          <div
                            key={`${result.type || "result"}-${resultIndex}`}
                            style={{ color: "#0C4A6E", fontWeight: 800, lineHeight: 1.4 }}
                          >
                            {formatApplyResultItem(result)}
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {row.reasons?.length ? (
                      <div
                        style={{
                          border: "1px solid #E5E7EB",
                          borderRadius: "12px",
                          padding: "10px 12px",
                          color: "#4B5563",
                          backgroundColor: "#F9FAFB",
                        }}
                      >
                        {row.reasons.join(" ")}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : (
            <div
              style={{
                border: "1px dashed #CBD5E1",
                borderRadius: "16px",
                padding: "28px",
                textAlign: "center",
                color: "#64748B",
              }}
            >
              Preview results will appear here after you upload matching headers and run the preview.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
