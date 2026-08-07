"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
    description: "Used for matching and, when selected below, to update the matched NXT first name.",
    recommended: true,
  },
  {
    key: "lastName",
    header: "Last Name",
    label: "Last Name",
    group: "Name fields",
    description: "Used for matching and, when selected below, to update the matched NXT last name.",
    recommended: true,
  },
  {
    key: "preferredName",
    header: "Preferred Name",
    label: "Preferred Name",
    group: "Name fields",
    description: "Optional, but can update the matched NXT preferred name when it differs from the current value.",
  },
  {
    key: "title",
    header: "Title",
    label: "Title",
    group: "Individual profile fields",
    description: "Optional NXT title, such as Dr., Mr., Ms., or Rev.",
  },
  {
    key: "gender",
    header: "Gender",
    label: "Gender",
    group: "Individual profile fields",
    description: "Optional NXT gender value. The CSV value is reviewed against the current record before import.",
  },
  {
    key: "birthDate",
    header: "Birth Date",
    label: "Birth Date",
    group: "Individual profile fields",
    description: "Optional full birth date in MM/DD/YY, MM/DD/YYYY, or YYYY-MM-DD format. Partial dates are not imported automatically.",
  },
  {
    key: "suffix",
    header: "Suffix",
    label: "Suffix",
    group: "Individual profile fields",
    description: "Optional NXT suffix, such as Jr., Sr., III, or Ph.D.",
  },
  {
    key: "addressee",
    header: "Addressee",
    label: "Addressee",
    group: "Addressee and salutation fields",
    description: "Optional custom primary NXT addressee. A file-wide builder can supply a default when this column is blank.",
  },
  {
    key: "salutation",
    header: "Salutation",
    label: "Salutation",
    group: "Addressee and salutation fields",
    description: "Optional custom primary NXT salutation. A file-wide builder can supply a default when this column is blank.",
  },
  {
    key: "email",
    header: "Email Address",
    label: "Email Address",
    group: "Email fields",
    description:
      "Use for matching or, when selected below, to add an email address to the matched NXT record.",
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

const FIELD_BY_KEY = IMPORT_FIELDS.reduce((acc, field) => {
  acc[field.key] = field;
  return acc;
}, {});

const DEFAULT_ACTIVE_FIELDS = {
  blackbaudConstituentId: false,
  lookupId: true,
  firstName: true,
  lastName: true,
  preferredName: false,
  title: false,
  gender: false,
  birthDate: false,
  suffix: false,
  addressee: false,
  salutation: false,
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
  "Individual profile fields",
  "Addressee and salutation fields",
  "Email fields",
  "Phone fields",
  "Address fields",
  "Constituent code fields",
  "Education relationship fields",
  "Organization relationship fields",
];

const FIELD_GROUP_HELP = {
  "Match fields": "Use one or more strong identifiers to avoid duplicate records.",
  "Name fields": "Name columns can match records and, when selected, update the matched NXT name fields.",
  "Individual profile fields": "Optional title, gender, birth date, and suffix values for individual constituents.",
  "Addressee and salutation fields": "Optionally import custom primary NXT formats or build consistent values for an entire file.",
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
  "Individual profile fields": true,
  "Addressee and salutation fields": true,
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

const IMPORT_INTENTS = [
  {
    value: "updates",
    label: "Updates to existing NXT records",
    description:
      "Use existing IDs whenever possible. Name, email, and address matches remain review-only.",
  },
  {
    value: "new",
    label: "New constituent records",
    description:
      "Screen each row for duplicates first. Potential new records stay in review and are never created automatically.",
  },
  {
    value: "mixed",
    label: "A mix of new records and updates",
    description:
      "The preview separates confirmed updates, potential new records, and rows needing resolution.",
  },
];

const EDUCATION_RELATIONSHIP_ACTIONS = [
  {
    value: "add",
    label: "Add New Education Relationship",
    description:
      "Add a new education relationship only. Existing NXT education rows are never changed, and matching entries are skipped.",
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

function ensureCsvFilename(filename) {
  const safeFilename = String(filename || "constituency-import.csv").trim();
  return /\.csv$/i.test(safeFilename) ? safeFilename : `${safeFilename}.csv`;
}

function downloadCsv(csv, filename) {
  const content = String(csv || "");
  const csvContent = content.startsWith("\ufeff") ? content : `\ufeff${content}`;
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = ensureCsvFilename(filename);
  link.setAttribute("type", "text/csv");
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
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

  if (write.type === "constituent_name") {
    const fields = [
      write.firstName && `first name to ${write.firstName}`,
      write.lastName && `last name to ${write.lastName}`,
      write.preferredName && `preferred name to ${write.preferredName}`,
    ]
      .filter(Boolean)
      .join(", ");
    return `Update NXT ${fields || "name fields"}`;
  }

  if (write.type === "constituent_profile") {
    const fields = [
      write.title && `title to ${write.title}`,
      write.gender && `gender to ${write.gender}`,
      write.birthDate && `birth date to ${write.birthDate}`,
      write.suffix && `suffix to ${write.suffix}`,
    ]
      .filter(Boolean)
      .join(", ");
    return `Update NXT ${fields || "individual profile fields"}`;
  }

  if (write.type === "constituent_name_format") {
    const label = write.kind === "salutation" ? "salutation" : "addressee";
    return `Set primary NXT ${label} to ${write.value || "unspecified"}`;
  }

  if (write.type === "email_address") {
    if (write.action === "replace") {
      return `Replace selected email: ${write.address || "unspecified"}`;
    }
    const primary = write.makePrimary ? " and set as primary" : "";
    const type = write.emailType ? ` (${write.emailType})` : "";
    return `Add email as additional: ${write.address || "unspecified"}${type}${primary}`;
  }
  if (write.type === "phone") {
    if (write.action === "replace") {
      return `Replace selected phone: ${write.number || "unspecified"}`;
    }
    return `Add phone as additional: ${write.number || "unspecified"}${write.makePrimary ? " and set as primary" : ""}`;
  }
  if (write.type === "address") {
    if (write.action === "replace") {
      return `Replace selected address: ${write.addressLine1 || "unspecified"}`;
    }
    return `Add address as additional: ${write.addressLine1 || "unspecified"}${write.makePrimary ? " and set as primary" : ""}`;
  }

  if (write.type === "education_relationship") {
    const action =
      write.action === "skip_existing"
        ? "Matching education relationship already exists"
        : "Add education relationship";
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
    if (result.type === "constituent_name") {
      return result.message || "Updated matched NXT name fields.";
    }
    if (result.type === "constituent_profile") {
      return result.message || "Updated matched NXT individual profile fields.";
    }
    if (result.type === "constituent_name_format") {
      return result.message || "Updated the matched NXT primary name format.";
    }
    if (result.type === "email_address") {
      return result.message || "Applied the staged NXT email update.";
    }
    if (result.type === "phone") {
      return result.message || "Applied the staged NXT phone update.";
    }
    if (result.type === "address") {
      return result.message || "Applied the staged NXT address update.";
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

function getContactDecision(decisions, rowNumber, kind, index) {
  return decisions?.[String(rowNumber)]?.[kind]?.[String(index)] || {};
}

function getContactValue(contact, kind) {
  if (kind === "email") return contact?.address || "";
  if (kind === "phone") return contact?.number || "";
  return [contact?.addressLine1, contact?.addressLine2, contact?.city, contact?.state, contact?.postalCode]
    .filter(Boolean)
    .join(", ");
}

function getIncomingContactValue(contact, kind) {
  if (kind === "email") return contact?.address || "";
  if (kind === "phone") return contact?.number || "";
  return [contact?.addressLine1, contact?.addressLine2, contact?.city, contact?.state, contact?.postalCode]
    .filter(Boolean)
    .join(", ");
}

function ContactReviewPanel({ row, decisions, onDecisionChange }) {
  const sections = [
    { kind: "email", label: "Email addresses", values: row.input?.emailUpdates || [], contacts: row.currentContacts?.emails || [] },
    { kind: "phone", label: "Phone numbers", values: row.input?.phoneUpdates || [], contacts: row.currentContacts?.phones || [] },
    { kind: "address", label: "Addresses", values: row.input?.addressUpdates || [], contacts: row.currentContacts?.addresses || [] },
  ];

  if (!row.match?.blackbaudConstituentId) return null;

  return (
    <section
      style={{
        border: "1px solid #86EFAC",
        borderRadius: "14px",
        backgroundColor: "#F0FDF4",
        padding: "14px",
        display: "grid",
        gap: "14px",
      }}
    >
      <div>
        <div style={{ color: "#166534", fontSize: "12px", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Contact change review
        </div>
        <p style={{ margin: "5px 0 0", color: "#166534", lineHeight: 1.45 }}>
          Compare the current NXT value with the CSV value. Adding is the default and does not
          change an existing contact. Replacing retains the selected NXT type and primary setting.
        </p>
      </div>

      {sections.map((section) => {
        const primary = section.contacts.find((contact) => contact.primary) || null;
        const typeOptions = [...new Set(section.contacts.map((contact) => contact.type).filter(Boolean))];
        const defaultPrimaryIndex = section.values.findIndex((value) => value.makePrimary === true);

        return (
          <div key={section.kind} style={{ display: "grid", gap: "10px" }}>
            <div style={{ color: "#14532D", fontWeight: 900 }}>{section.label}</div>
            <div
              style={{
                border: "1px solid #BBF7D0",
                borderRadius: "12px",
                backgroundColor: "white",
                padding: "10px 12px",
              }}
            >
              <div style={{ color: "#6B7280", fontSize: "12px", fontWeight: 900, textTransform: "uppercase" }}>
                Current NXT {section.label.toLowerCase()}
              </div>
              {section.contacts.length ? (
                <div style={{ marginTop: "7px", display: "grid", gap: "5px" }}>
                  {section.contacts.map((contact) => (
                    <div key={contact.id || getContactValue(contact, section.kind)} style={{ color: "#111827", lineHeight: 1.35 }}>
                      <strong>{getContactValue(contact, section.kind)}</strong>
                      {contact.type ? ` · ${contact.type}` : ""}
                      {contact.primary ? " · Primary" : ""}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ marginTop: "7px", color: "#6B7280" }}>No current NXT {section.label.toLowerCase()} found.</div>
              )}
            </div>

            {!section.values.length ? (
              <div style={{ color: "#6B7280", fontSize: "14px", lineHeight: 1.4 }}>
                No CSV {section.kind === "email" ? "email address" : section.kind === "phone" ? "phone number" : "address"} is selected for import.
              </div>
            ) : null}

            {section.values.map((incoming, index) => {
              const decision = getContactDecision(decisions, row.rowNumber, section.kind, index);
              const mode = decision.mode === "replace" ? "replace" : "add";
              const selectedTarget = section.contacts.find((contact) => contact.id === decision.targetId) || null;
              const makePrimary =
                mode === "add" &&
                (decision.makePrimary === undefined
                  ? index === defaultPrimaryIndex
                  : decision.makePrimary === true);
              const datalistId = `contact-types-${row.rowNumber}-${section.kind}-${index}`;

              return (
                <div
                  key={`${section.kind}-${index}`}
                  style={{
                    border: "1px solid #A7F3D0",
                    borderRadius: "12px",
                    backgroundColor: "#ECFDF5",
                    padding: "12px",
                    display: "grid",
                    gap: "10px",
                  }}
                >
                  <div>
                    <div style={{ color: "#6B7280", fontSize: "12px", fontWeight: 900, textTransform: "uppercase" }}>
                      CSV value
                    </div>
                    <div style={{ marginTop: "4px", color: "#111827", fontWeight: 900 }}>
                      {getIncomingContactValue(incoming, section.kind)}
                      {incoming.type ? ` · ${incoming.type}` : ""}
                      {incoming.makePrimary === true ? " · CSV marks primary" : ""}
                    </div>
                  </div>

                  <label style={{ display: "grid", gap: "5px", color: "#374151", fontWeight: 800 }}>
                    Apply this CSV value as
                    <select
                      name={`contact-mode-${row.rowNumber}-${section.kind}-${index}`}
                      value={mode}
                      onChange={(event) =>
                        onDecisionChange(row.rowNumber, section.kind, index, {
                          mode: event.target.value,
                          targetId: event.target.value === "replace" ? decision.targetId || "" : "",
                        })
                      }
                      style={{ border: "1px solid #86EFAC", borderRadius: "9px", backgroundColor: "white", padding: "9px 10px", color: "#111827" }}
                    >
                      <option value="add">Add as an additional {section.kind === "email" ? "email address" : section.kind === "phone" ? "phone number" : "address"}</option>
                      <option value="replace" disabled={!section.contacts.length}>Replace a selected current NXT value</option>
                    </select>
                  </label>

                  {mode === "replace" ? (
                    <>
                      <label style={{ display: "grid", gap: "5px", color: "#374151", fontWeight: 800 }}>
                        Replace which current NXT value?
                        <select
                          name={`contact-target-${row.rowNumber}-${section.kind}-${index}`}
                          value={decision.targetId || ""}
                          onChange={(event) =>
                            onDecisionChange(row.rowNumber, section.kind, index, { targetId: event.target.value })
                          }
                          style={{ border: "1px solid #86EFAC", borderRadius: "9px", backgroundColor: "white", padding: "9px 10px", color: "#111827" }}
                        >
                          <option value="">Choose a current NXT value</option>
                          {section.contacts.map((contact) => (
                            <option key={contact.id} value={contact.id}>
                              {getContactValue(contact, section.kind)}{contact.type ? ` (${contact.type})` : ""}{contact.primary ? " - Primary" : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                      {selectedTarget ? (
                        <div style={{ color: "#166534", fontSize: "14px", lineHeight: 1.4 }}>
                          This will replace the value only. NXT will keep {selectedTarget.type || "the current type"} and {selectedTarget.primary ? "the primary designation" : "its non-primary designation"}.
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <label style={{ display: "flex", gap: "8px", alignItems: "center", color: "#374151", fontWeight: 800 }}>
                        <input
                          type="checkbox"
                          name={`contact-primary-${row.rowNumber}-${section.kind}-${index}`}
                          checked={makePrimary}
                          onChange={(event) =>
                            onDecisionChange(
                              row.rowNumber,
                              section.kind,
                              index,
                              { makePrimary: event.target.checked },
                              section.values.length,
                            )
                          }
                        />
                        Make the CSV value primary
                      </label>
                      {makePrimary && primary ? (
                        <div style={{ display: "grid", gap: "6px", padding: "10px", borderRadius: "10px", backgroundColor: "#DCFCE7", color: "#166534" }}>
                          <div style={{ fontWeight: 800 }}>
                            {getContactValue(primary, section.kind)} is currently primary and will be unmarked.
                          </div>
                          <label style={{ display: "grid", gap: "4px", color: "#166534", fontSize: "14px" }}>
                            Change the former primary's type (optional)
                            <input
                              name={`contact-demoted-type-${row.rowNumber}-${section.kind}-${index}`}
                              list={datalistId}
                              value={decision.demotedPrimaryType || ""}
                              onChange={(event) =>
                                onDecisionChange(row.rowNumber, section.kind, index, { demotedPrimaryType: event.target.value })
                              }
                              placeholder={`Keep ${primary.type || "current type"}`}
                              style={{ border: "1px solid #86EFAC", borderRadius: "8px", backgroundColor: "white", padding: "8px 9px", color: "#111827" }}
                            />
                            <datalist id={datalistId}>
                              {typeOptions.map((type) => <option key={type} value={type} />)}
                            </datalist>
                          </label>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </section>
  );
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
  const [importIntent, setImportIntent] = useState("updates");
  const [constituencyAction, setConstituencyAction] = useState("add");
  const [educationRelationshipAction, setEducationRelationshipAction] = useState("add");
  const [useHierarchy, setUseHierarchy] = useState(true);
  const [updateNameFields, setUpdateNameFields] = useState(false);
  const [updateIndividualProfileFields, setUpdateIndividualProfileFields] = useState(false);
  const [updateNameFormatFields, setUpdateNameFormatFields] = useState(false);
  const [buildNameFormats, setBuildNameFormats] = useState(false);
  const [addresseeFormat, setAddresseeFormat] = useState("title-preferred-last-suffix");
  const [salutationFormat, setSalutationFormat] = useState("dear-preferred");
  const [updateEmailFields, setUpdateEmailFields] = useState(false);
  const [updatePhoneFields, setUpdatePhoneFields] = useState(false);
  const [updateAddressFields, setUpdateAddressFields] = useState(false);
  const [contactDecisions, setContactDecisions] = useState({});
  const [contactDecisionsDirty, setContactDecisionsDirty] = useState(false);
  const [rows, setRows] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [sourceFilename, setSourceFilename] = useState("");
  const fileInputRef = useRef(null);
  const fileReadVersionRef = useRef(0);
  const lastReadFileRef = useRef(null);
  const [fileReadStatus, setFileReadStatus] = useState("");
  const [parseMessage, setParseMessage] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [savingRun, setSavingRun] = useState(false);
  const [savedRuns, setSavedRuns] = useState([]);
  const [loadingSavedRuns, setLoadingSavedRuns] = useState(false);
  const [loadingRunId, setLoadingRunId] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [completionMessage, setCompletionMessage] = useState("");
  const [applyingRun, setApplyingRun] = useState(false);
  const [creatingRowId, setCreatingRowId] = useState("");

  const profileRole = profile?.user?.role || profile?.workspaceUser?.role || user?.role || "";
  const { effectiveRole } = useWorkspaceView(profileRole);
  const isReviewer = isReviewerRole(effectiveRole);

  const selectedFields = useMemo(
    () => IMPORT_FIELDS.filter((field) => activeFields[field.key]),
    [activeFields],
  );
  const expectedHeaders = selectedFields.map((field) => field.header);
  const uploadedHeaderSet = useMemo(() => new Set(headers), [headers]);
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
  const hasUploadedHeader = (key) => {
    const header = FIELD_BY_KEY[key]?.header;
    return Boolean(activeFields[key] && header && uploadedHeaderSet.has(header));
  };
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
  const nameFieldsActive = Boolean(
    activeFields.firstName || activeFields.lastName || activeFields.preferredName,
  );
  const individualProfileFieldsActive = Boolean(
    activeFields.title || activeFields.gender || activeFields.birthDate || activeFields.suffix,
  );
  const emailFieldsActive = Boolean(activeFields.email || activeFields.email2);
  const phoneFieldsActive = Boolean(activeFields.phoneNumber || activeFields.phone2Number);
  const addressFieldsActive = Boolean(activeFields.addressLine1);
  const mappedNameUpdate = Boolean(
    updateNameFields &&
      (hasUploadedHeader("firstName") ||
        hasUploadedHeader("lastName") ||
        hasUploadedHeader("preferredName")),
  );
  const mappedIndividualProfileUpdate = Boolean(
    updateIndividualProfileFields &&
      (hasUploadedHeader("title") ||
        hasUploadedHeader("gender") ||
        hasUploadedHeader("birthDate") ||
        hasUploadedHeader("suffix")),
  );
  const mappedNameFormatUpdate = Boolean(
    updateNameFormatFields &&
      (hasUploadedHeader("addressee") ||
        hasUploadedHeader("salutation") ||
        (buildNameFormats &&
          (hasUploadedHeader("firstName") ||
            hasUploadedHeader("lastName") ||
            hasUploadedHeader("preferredName")))),
  );
  const mappedEmailUpdate = Boolean(
    updateEmailFields &&
      (hasUploadedHeader("email") || hasUploadedHeader("email2")),
  );
  const mappedPhoneUpdate = Boolean(
    updatePhoneFields &&
      (hasUploadedHeader("phoneNumber") || hasUploadedHeader("phone2Number")),
  );
  const mappedAddressUpdate = Boolean(
    updateAddressFields && hasUploadedHeader("addressLine1"),
  );
  const hasImportOperation = Boolean(
    activeFields.targetConstituency ||
      educationRelationshipFieldsActive ||
      organizationRelationshipFieldsActive ||
      updateNameFields ||
      updateIndividualProfileFields ||
      updateNameFormatFields ||
      updateEmailFields ||
      updatePhoneFields ||
      updateAddressFields,
  );
  const mappedIdentityField = Boolean(
    hasUploadedHeader("blackbaudConstituentId") ||
      hasUploadedHeader("lookupId") ||
      hasUploadedHeader("email") ||
      hasUploadedHeader("addressLine1") ||
      (hasUploadedHeader("firstName") && hasUploadedHeader("lastName")),
  );
  const mappedNewRecordIdentity = Boolean(
    hasUploadedHeader("firstName") && hasUploadedHeader("lastName"),
  );
  const mappedImportOperation = Boolean(
    hasUploadedHeader("targetConstituency") ||
      hasUploadedHeader("educationInstitution") ||
      hasUploadedHeader("educationDegree") ||
      hasUploadedHeader("educationMajor") ||
      hasUploadedHeader("educationClassYear") ||
      hasUploadedHeader("organizationName") ||
      hasUploadedHeader("organizationRelationshipType") ||
      hasUploadedHeader("organizationTitle") ||
      mappedNameUpdate ||
      mappedIndividualProfileUpdate ||
      mappedNameFormatUpdate ||
      mappedEmailUpdate ||
      mappedPhoneUpdate ||
      mappedAddressUpdate,
  );
  const identityRequirementMet =
    importIntent === "new" ? mappedNewRecordIdentity : mappedIdentityField;
  const identityRequirementCopy =
    importIntent === "new"
      ? "Include active First Name and Last Name columns for every potential new individual."
      : importIntent === "mixed"
        ? "Include an active matching column for existing records or First Name + Last Name for potential new individuals."
        : "Include at least one active matching column in the CSV, such as NXT System ID, NXT Lookup ID, Email Address, Address Line 1, or First Name + Last Name.";
  const canPreview =
    rows.length > 0 &&
    identityRequirementMet &&
    hasImportOperation &&
    mappedImportOperation;
  const previewBlockers = [
    rows.length === 0 ? "Add at least one CSV data row." : "",
    identityRequirementMet ? "" : identityRequirementCopy,
    hasImportOperation
      ? ""
      : "Select at least one import operation, such as a constituent code, relationship, individual update, name-format update, or contact update.",
    mappedImportOperation
      ? ""
      : "Include at least one active change column in the CSV, such as Title, Email Address, Addressee, Phone Number, Address Line 1, New Constituent Code, Education Institution, or Organization Name.",
  ].filter(Boolean);
  const readySavedRows =
    preview?.savedRun && Array.isArray(preview?.rows)
      ? preview.rows.filter((row) => row.status === "Ready" && !row.appliedAt).length
      : 0;
  const potentialNewRows =
    preview?.savedRun && Array.isArray(preview?.rows)
      ? preview.rows.filter(
          (row) =>
            row.intentDisposition?.key === "potential_new" &&
            !row.createdBlackbaudConstituentId,
        ).length
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

  function loadCsvPreviewData(csvText) {
    const parsed = parseCsv(csvText);
    const parsedHeaderSet = new Set(parsed.headers);
    setRows(parsed.rows);
    setHeaders(parsed.headers);
    setActiveFields((current) => {
      let changed = false;
      const next = { ...current };
      IMPORT_FIELDS.forEach((field) => {
        if (parsedHeaderSet.has(field.header) && !next[field.key]) {
          next[field.key] = true;
          changed = true;
        }
      });
      return changed ? next : current;
    });
    setPreview(null);
    setSaveMessage("");
    if (parsed.errors.length > 0) {
      setParseMessage(`Parsed ${parsed.rows.length} rows with ${parsed.errors.length} CSV warning(s).`);
    } else {
      setParseMessage(parsed.rows.length ? `Parsed ${parsed.rows.length} rows.` : "");
    }
  }

  useEffect(() => {
    if (!isReviewer) return;
    fetchSavedRuns();
  }, [isReviewer]);

  useEffect(() => {
    const input = fileInputRef.current;
    if (!input) return undefined;

    // Native events remain reliable when the page has recovered from a React hydration error.
    const handleNativeFileSelection = (event) => {
      readSelectedFile(event.currentTarget?.files?.[0]);
    };

    input.addEventListener("change", handleNativeFileSelection);
    input.addEventListener("input", handleNativeFileSelection);
    return () => {
      input.removeEventListener("change", handleNativeFileSelection);
      input.removeEventListener("input", handleNativeFileSelection);
    };
  }, []);

  const summaryCards = useMemo(() => {
    const summary = preview?.summary || {};
    if (importIntent !== "updates") {
      return [
        ["Ready updates", summary.ready || 0, "green"],
        ["Potential new records", summary.potentialNew || 0, "blue"],
        ["Needs resolution", summary.needsResolution || 0, "amber"],
        ["Conflicts", summary.conflict || 0, "red"],
        ["Skipped", summary.skipped || 0, "blue"],
        ["Total", summary.total || rows.length || 0, "neutral"],
      ];
    }
    return [
      ["Ready", summary.ready || 0, "green"],
      ["Needs Review", summary.needsReview || 0, "amber"],
      ["Conflicts", summary.conflict || 0, "red"],
      ["Skipped", summary.skipped || 0, "blue"],
      ["Total", summary.total || rows.length || 0, "neutral"],
    ];
  }, [importIntent, preview, rows.length]);

  const summaryToneColors = {
    green: "#166534",
    blue: "#1D4ED8",
    amber: "#92400E",
    red: "#991B1B",
    neutral: "#374151",
  };

  function selectImportIntent(nextIntent) {
    setImportIntent(nextIntent);
    setActiveFields((current) => {
      if (nextIntent === "new") {
        return {
          ...current,
          firstName: true,
          lastName: true,
        };
      }
      if (nextIntent === "mixed") {
        return {
          ...current,
          lookupId: true,
          firstName: true,
          lastName: true,
        };
      }
      return current;
    });
    setPreview(null);
    setContactDecisions({});
    setContactDecisionsDirty(false);
    setSaveMessage("");
  }

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

  function updateContactDecision(rowNumber, kind, index, change, contactCount = 0) {
    setContactDecisions((current) => {
      const rowKey = String(rowNumber);
      const rowDecisions = current[rowKey] || {};
      const kindDecisions = rowDecisions[kind] || {};
      const nextKindDecisions = {
        ...kindDecisions,
        [String(index)]: {
          ...(kindDecisions[String(index)] || {}),
          ...change,
        },
      };

      if (change.makePrimary === true) {
        for (let contactIndex = 0; contactIndex < contactCount; contactIndex += 1) {
          if (contactIndex !== index) {
            const key = String(contactIndex);
            nextKindDecisions[key] = {
              ...nextKindDecisions[key],
              makePrimary: false,
            };
          }
        }
      }

      return {
        ...current,
        [rowKey]: {
          ...rowDecisions,
          [kind]: nextKindDecisions,
        },
      };
    });
    setContactDecisionsDirty(true);
    setSaveMessage("");
  }

  function downloadTemplateCsv() {
    const csv = makeTemplateRows(selectedFields);
    const templateName =
      importIntent === "new"
        ? "new-constituents-import-template.csv"
        : importIntent === "mixed"
          ? "mixed-constituent-import-template.csv"
          : "constituent-update-import-template.csv";
    downloadCsv(csv, templateName);
  }

  async function readSelectedFile(file) {
    if (!file) return;
    if (lastReadFileRef.current === file) return;
    lastReadFileRef.current = file;
    const fileReadVersion = fileReadVersionRef.current + 1;
    fileReadVersionRef.current = fileReadVersion;
    setError("");
    setSaveMessage("");
    setCompletionMessage("");
    setPreview(null);
    setContactDecisions({});
    setContactDecisionsDirty(false);
    setSourceFilename(file.name || "");
    setFileReadStatus(`Reading ${file.name || "selected CSV"}...`);
    try {
      const csvText = await file.text();
      if (fileReadVersion !== fileReadVersionRef.current) return;
      loadCsvPreviewData(csvText);
      setFileReadStatus(`Loaded ${file.name || "selected CSV"}.`);
    } catch {
      if (fileReadVersion !== fileReadVersionRef.current) return;
      setRows([]);
      setHeaders([]);
      setFileReadStatus("");
      setError("The selected CSV could not be read. Please save it as a UTF-8 CSV and try again.");
    }
  }

  function handleFileUpload(event) {
    readSelectedFile(event.target.files?.[0]);
  }

  function resetImportWorkspace({ completion = "", resetFieldConfiguration = false } = {}) {
    fileReadVersionRef.current += 1;
    lastReadFileRef.current = null;
    if (resetFieldConfiguration) {
      setActiveFields(DEFAULT_ACTIVE_FIELDS);
      setOpenFieldGroups(DEFAULT_OPEN_FIELD_GROUPS);
      setImportIntent("updates");
      setConstituencyAction("add");
      setEducationRelationshipAction("add");
      setUseHierarchy(true);
      setUpdateNameFields(false);
      setUpdateIndividualProfileFields(false);
      setUpdateNameFormatFields(false);
      setBuildNameFormats(false);
      setAddresseeFormat("title-preferred-last-suffix");
      setSalutationFormat("dear-preferred");
      setUpdateEmailFields(false);
      setUpdatePhoneFields(false);
      setUpdateAddressFields(false);
    }
    setRows([]);
    setHeaders([]);
    setSourceFilename("");
    setFileReadStatus("");
    setParseMessage("");
    setPreview(null);
    setContactDecisions({});
    setContactDecisionsDirty(false);
    setError("");
    setSaveMessage("");
    setCompletionMessage(completion);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function clearUploadedCsv() {
    resetImportWorkspace();
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
      "Apply ready rows to NXT now? This may update constituent codes, add-only education and organization relationships, selected individual fields, custom primary addressees/salutations, and reviewed contact information. Contact replacements preserve the selected NXT type and primary setting. Replace and end-date constituent-code rows require an end date. Organization relationships require one exact existing NXT organization; ambiguous or missing matches stay in review.",
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

      const applied = Number(payload?.applySummary?.applied || 0);
      const manualRequired = Number(payload?.applySummary?.manualRequired || 0);
      const failed = Number(payload?.applySummary?.failed || 0);
      const fullyApplied = applied > 0 && manualRequired === 0 && failed === 0;

      if (fullyApplied) {
        resetImportWorkspace({
          completion: `Import complete. ${applied} row${applied === 1 ? " was" : "s were"} updated in Raiser's Edge NXT. The import workspace has been cleared and is ready for the next CSV.`,
          resetFieldConfiguration: true,
        });
        window.setTimeout(() => {
          document
            .getElementById("constituency-import-completion")
            ?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 0);
      } else {
        setPreview(payload);
        setSaveMessage(payload?.applySummary?.message || `Applied import run #${runId}.`);
      }
      fetchSavedRuns();
    } catch (applyError) {
      setError(
        applyError instanceof Error ? applyError.message : "Failed to apply saved import run",
      );
    } finally {
      setApplyingRun(false);
    }
  }

  async function createReviewedNxtRecord(row) {
    const runId = preview?.savedRun?.id;
    if (!runId || !row?.id || creatingRowId) return;

    const displayName = row.input?.constituentName || "this individual";
    const approved = window.confirm(
      `Create a new individual NXT record for ${displayName}? This is a one-record action. JUMGOGPT will run one final duplicate check before creating the constituent. Contact, constituency, education, and relationship changes will remain staged until you separately apply them.`,
    );
    if (!approved) return;

    setCreatingRowId(String(row.id));
    setError("");
    setSaveMessage("");
    try {
      const response = await fetch(
        `/api/constituency-import/runs/${encodeURIComponent(runId)}/rows/${encodeURIComponent(row.id)}/create`,
        { method: "POST" },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to create the NXT record");
      }

      await loadSavedRun(runId);
      setSaveMessage(
        payload?.message ||
          `Created the NXT record for ${displayName}. Review and apply its staged updates separately.`,
      );
      fetchSavedRuns();
    } catch (createError) {
      await loadSavedRun(runId);
      setError(
        createError instanceof Error ? createError.message : "Failed to create the NXT record",
      );
    } finally {
      setCreatingRowId("");
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
          defaults: {
            importIntent,
            defaultAction: constituencyAction,
            educationRelationshipAction: "add",
            useHierarchy,
            updateNameFields,
            updateIndividualProfileFields,
            updateNameFormatFields,
            buildNameFormats,
            addresseeFormat,
            salutationFormat,
            updateEmailFields,
            updatePhoneFields,
            updateAddressFields,
          },
          contactDecisions,
          sourceFilename,
          saveRun,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to preview constituency import");
      }
      setPreview(payload);
      setContactDecisionsDirty(false);
      window.setTimeout(() => {
        document
          .getElementById("constituency-import-preview-results")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 0);
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
        title: row.input?.title || "",
        gender: row.input?.gender || "",
        birthDate: row.input?.birthDate || "",
        suffix: row.input?.suffix || "",
        addressee: row.input?.nameFormatUpdate?.addressee || "",
        salutation: row.input?.nameFormatUpdate?.salutation || "",
        currentAddressee: row.currentNameFormats?.addressee?.value || "",
        currentSalutation: row.currentNameFormats?.salutation?.value || "",
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
    downloadCsv(csv, `${importIntent}-constituency-import-preview.csv`);
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
                Classify each CSV row, preview NXT matches, and safely review proposed updates.
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
          Choose what the file contains before selecting its fields. Every row is checked against
          NXT before it can be updated. Potential new records remain in controlled review; saving
          a preview never writes to NXT, and only a saved run's explicit Apply ready rows action
          can update confirmed existing records.
        </section>

        {completionMessage ? (
          <section
            id="constituency-import-completion"
            role="status"
            style={{
              backgroundColor: "#ECFDF5",
              border: "1px solid #6EE7B7",
              borderRadius: "18px",
              padding: "16px 18px",
              marginBottom: "18px",
              color: "#065F46",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "14px",
              flexWrap: "wrap",
            }}
          >
            <div>
              <div style={{ fontWeight: 900, fontSize: "18px" }}>Import complete</div>
              <div style={{ marginTop: "4px", lineHeight: 1.45 }}>{completionMessage}</div>
            </div>
            <button
              type="button"
              onClick={() => setCompletionMessage("")}
              style={{
                border: "1px solid #6EE7B7",
                borderRadius: "999px",
                backgroundColor: "white",
                color: "#047857",
                padding: "8px 12px",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              Dismiss
            </button>
          </section>
        ) : null}

        <section
          style={{
            backgroundColor: "white",
            border: "1px solid #E5E7EB",
            borderRadius: "20px",
            padding: "20px",
            marginBottom: "18px",
            display: "grid",
            gap: "14px",
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: "22px", color: "#111827" }}>
              1. What does this file contain?
            </h2>
            <p style={{ margin: "6px 0 0", color: "#6B7280", lineHeight: 1.5 }}>
              This determines how the preview classifies each row. A missing NXT match never
              creates a constituent automatically.
            </p>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
              gap: "12px",
            }}
          >
            {IMPORT_INTENTS.map((intent) => {
              const selected = importIntent === intent.value;
              return (
                <button
                  key={intent.value}
                  type="button"
                  onClick={() => selectImportIntent(intent.value)}
                  aria-pressed={selected}
                  style={{
                    border: selected ? "2px solid #6D5DFB" : "1px solid #E5E7EB",
                    borderRadius: "16px",
                    padding: "15px",
                    backgroundColor: selected ? "#F5F3FF" : "white",
                    color: "#111827",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <span style={{ display: "block", fontWeight: 900, fontSize: "16px" }}>
                    {intent.label}
                  </span>
                  <span style={{ display: "block", marginTop: "7px", color: "#6B7280", lineHeight: 1.45 }}>
                    {intent.description}
                  </span>
                </button>
              );
            })}
          </div>
          <div
            style={{
              borderRadius: "14px",
              border: "1px solid #BFDBFE",
              backgroundColor: "#EFF6FF",
              color: "#1E3A8A",
              padding: "12px 14px",
              lineHeight: 1.45,
            }}
          >
            <strong>How matching works:</strong> NXT System ID and Lookup ID are the only
            automatic update matches. Name, email, and address results are shown for human
            review. If identifiers disagree, the row must be resolved before any NXT update.
          </div>
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
                  2. Choose import fields
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
                              This import adds a new education relationship only. It never edits or
                              end-dates an existing NXT education row, and it safely skips an
                              identical education relationship.
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
                      {group === "Name fields" && nameFieldsActive ? (
                        <div
                          style={{
                            border: "1px solid #C7D2FE",
                            borderRadius: "16px",
                            backgroundColor: "#EEF2FF",
                            padding: "14px",
                          }}
                        >
                          <label
                            style={{
                              display: "flex",
                              alignItems: "flex-start",
                              gap: "10px",
                              color: "#111827",
                              cursor: "pointer",
                            }}
                          >
                            <input
                              type="checkbox"
                              name="updateMatchedNxtNameFields"
                              checked={updateNameFields}
                              onChange={(event) => {
                                setUpdateNameFields(event.target.checked);
                                setPreview(null);
                              }}
                              style={{ marginTop: "4px" }}
                            />
                            <span>
                              <span style={{ display: "block", fontWeight: 900 }}>
                                Update matched NXT name fields
                              </span>
                              <span
                                style={{
                                  display: "block",
                                  marginTop: "4px",
                                  color: "#4338CA",
                                  fontSize: "14px",
                                  lineHeight: 1.45,
                                }}
                              >
                                Use this for corrections to individual constituents, such as a
                                preferred name that differs from the current NXT record. Only
                                populated CSV cells are updated; blank name cells never clear an
                                existing NXT value.
                              </span>
                            </span>
                          </label>
                        </div>
                      ) : null}
                      {group === "Individual profile fields" && individualProfileFieldsActive ? (
                        <div
                          style={{
                            border: "1px solid #C7D2FE",
                            borderRadius: "16px",
                            backgroundColor: "#EEF2FF",
                            padding: "14px",
                          }}
                        >
                          <label
                            style={{
                              display: "flex",
                              alignItems: "flex-start",
                              gap: "10px",
                              color: "#111827",
                              cursor: "pointer",
                            }}
                          >
                            <input
                              type="checkbox"
                              name="updateMatchedNxtIndividualProfileFields"
                              checked={updateIndividualProfileFields}
                              onChange={(event) => {
                                setUpdateIndividualProfileFields(event.target.checked);
                                setPreview(null);
                              }}
                              style={{ marginTop: "4px" }}
                            />
                            <span>
                              <span style={{ display: "block", fontWeight: 900 }}>
                                Review and update matched individual fields
                              </span>
                              <span
                                style={{
                                  display: "block",
                                  marginTop: "4px",
                                  color: "#4338CA",
                                  fontSize: "14px",
                                  lineHeight: 1.45,
                                }}
                              >
                                Compare title, gender, birth date, and suffix against the current
                                NXT record before applying. Only populated CSV cells are staged;
                                blank cells never clear a value. Birth dates must be complete
                                MM/DD/YY, MM/DD/YYYY, or YYYY-MM-DD values.
                              </span>
                            </span>
                          </label>
                        </div>
                      ) : null}
                      {group === "Addressee and salutation fields" ? (
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
                          <label
                            style={{
                              display: "flex",
                              alignItems: "flex-start",
                              gap: "10px",
                              color: "#111827",
                              cursor: "pointer",
                            }}
                          >
                            <input
                              type="checkbox"
                              name="updateMatchedNxtNameFormats"
                              checked={updateNameFormatFields}
                              onChange={(event) => {
                                setUpdateNameFormatFields(event.target.checked);
                                setPreview(null);
                              }}
                              style={{ marginTop: "4px" }}
                            />
                            <span>
                              <span style={{ display: "block", fontWeight: 900 }}>
                                Review and update primary addressee and salutation
                              </span>
                              <span
                                style={{
                                  display: "block",
                                  marginTop: "4px",
                                  color: "#4338CA",
                                  fontSize: "14px",
                                  lineHeight: 1.45,
                                }}
                              >
                                Values entered in the CSV are compared with the current primary
                                NXT formats. Applying this creates a custom primary format; it
                                does not modify a constituent's legal name.
                              </span>
                            </span>
                          </label>

                          <label
                            style={{
                              display: "flex",
                              alignItems: "flex-start",
                              gap: "10px",
                              color: updateNameFormatFields ? "#111827" : "#94A3B8",
                              cursor: updateNameFormatFields ? "pointer" : "not-allowed",
                            }}
                          >
                            <input
                              type="checkbox"
                              name="buildDefaultNameFormats"
                              disabled={!updateNameFormatFields}
                              checked={buildNameFormats}
                              onChange={(event) => {
                                setBuildNameFormats(event.target.checked);
                                setPreview(null);
                              }}
                              style={{ marginTop: "4px" }}
                            />
                            <span>
                              <span style={{ display: "block", fontWeight: 900 }}>
                                Build default values for rows without a CSV format value
                              </span>
                              <span
                                style={{
                                  display: "block",
                                  marginTop: "4px",
                                  fontSize: "14px",
                                  lineHeight: 1.45,
                                }}
                              >
                                Useful for a file of new people or a consistent correction. An
                                explicit Addressee or Salutation CSV value always takes priority.
                              </span>
                            </span>
                          </label>

                          {updateNameFormatFields && buildNameFormats ? (
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                                gap: "12px",
                              }}
                            >
                              <label style={{ display: "grid", gap: "6px", color: "#312E81", fontWeight: 900 }}>
                                Default addressee
                                <select
                                  name="defaultAddresseeFormat"
                                  value={addresseeFormat}
                                  onChange={(event) => {
                                    setAddresseeFormat(event.target.value);
                                    setPreview(null);
                                  }}
                                  style={{ border: "1px solid #A5B4FC", borderRadius: "10px", backgroundColor: "white", color: "#111827", padding: "10px" }}
                                >
                                  <option value="title-preferred-last-suffix">Title + preferred name + last name + suffix</option>
                                  <option value="title-first-last-suffix">Title + first name + last name + suffix</option>
                                  <option value="preferred-last">Preferred name + last name</option>
                                  <option value="first-last">First name + last name</option>
                                </select>
                              </label>
                              <label style={{ display: "grid", gap: "6px", color: "#312E81", fontWeight: 900 }}>
                                Default salutation
                                <select
                                  name="defaultSalutationFormat"
                                  value={salutationFormat}
                                  onChange={(event) => {
                                    setSalutationFormat(event.target.value);
                                    setPreview(null);
                                  }}
                                  style={{ border: "1px solid #A5B4FC", borderRadius: "10px", backgroundColor: "white", color: "#111827", padding: "10px" }}
                                >
                                  <option value="dear-preferred">Dear + preferred name</option>
                                  <option value="dear-first">Dear + first name</option>
                                  <option value="preferred">Preferred name only</option>
                                  <option value="first">First name only</option>
                                </select>
                              </label>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      {group === "Email fields" && emailFieldsActive ? (
                        <div
                          style={{
                            border: "1px solid #BBF7D0",
                            borderRadius: "16px",
                            backgroundColor: "#F0FDF4",
                            padding: "14px",
                          }}
                        >
                          <label
                            style={{
                              display: "flex",
                              alignItems: "flex-start",
                              gap: "10px",
                              color: "#111827",
                              cursor: "pointer",
                            }}
                          >
                            <input
                              type="checkbox"
                              name="updateMatchedNxtEmailFields"
                              checked={updateEmailFields}
                              onChange={(event) => {
                                setUpdateEmailFields(event.target.checked);
                                setPreview(null);
                              }}
                              style={{ marginTop: "4px" }}
                            />
                            <span>
                              <span style={{ display: "block", fontWeight: 900 }}>
                                Review and import email addresses
                              </span>
                              <span
                                style={{
                                  display: "block",
                                  marginTop: "4px",
                                  color: "#166534",
                                  fontSize: "14px",
                                  lineHeight: 1.45,
                                }}
                              >
                                A real NXT system ID or lookup ID allows automatic application.
                                Without one, the preview can propose a match from name, email, and
                                address evidence, but it stays in review until a person confirms it.
                                Each preview will show the current NXT email addresses beside the
                                CSV value. You can add a new address or replace one selected NXT
                                address before the run is saved.
                              </span>
                            </span>
                          </label>
                        </div>
                      ) : null}
                      {group === "Phone fields" && phoneFieldsActive ? (
                        <div
                          style={{
                            border: "1px solid #BBF7D0",
                            borderRadius: "16px",
                            backgroundColor: "#F0FDF4",
                            padding: "14px",
                          }}
                        >
                          <label
                            style={{
                              display: "flex",
                              alignItems: "flex-start",
                              gap: "10px",
                              color: "#111827",
                              cursor: "pointer",
                            }}
                          >
                            <input
                              type="checkbox"
                              name="updateMatchedNxtPhoneFields"
                              checked={updatePhoneFields}
                              onChange={(event) => {
                                setUpdatePhoneFields(event.target.checked);
                                setPreview(null);
                              }}
                              style={{ marginTop: "4px" }}
                            />
                            <span>
                              <span style={{ display: "block", fontWeight: 900 }}>
                                Review and import phone numbers
                              </span>
                              <span
                                style={{
                                  display: "block",
                                  marginTop: "4px",
                                  color: "#166534",
                                  fontSize: "14px",
                                  lineHeight: 1.45,
                                }}
                              >
                                The preview compares each CSV phone number with current NXT phone
                                numbers. Choose whether to add it or replace a selected NXT value
                                before saving the run.
                              </span>
                            </span>
                          </label>
                        </div>
                      ) : null}
                      {group === "Address fields" && addressFieldsActive ? (
                        <div
                          style={{
                            border: "1px solid #BBF7D0",
                            borderRadius: "16px",
                            backgroundColor: "#F0FDF4",
                            padding: "14px",
                          }}
                        >
                          <label
                            style={{
                              display: "flex",
                              alignItems: "flex-start",
                              gap: "10px",
                              color: "#111827",
                              cursor: "pointer",
                            }}
                          >
                            <input
                              type="checkbox"
                              name="updateMatchedNxtAddressFields"
                              checked={updateAddressFields}
                              onChange={(event) => {
                                setUpdateAddressFields(event.target.checked);
                                setPreview(null);
                              }}
                              style={{ marginTop: "4px" }}
                            />
                            <span>
                              <span style={{ display: "block", fontWeight: 900 }}>
                                Review and import addresses
                              </span>
                              <span
                                style={{
                                  display: "block",
                                  marginTop: "4px",
                                  color: "#166534",
                                  fontSize: "14px",
                                  lineHeight: 1.45,
                                }}
                              >
                                The preview compares the CSV address with current NXT addresses.
                                Adding preserves current address values; replacing keeps the
                                selected NXT address type and primary setting.
                              </span>
                            </span>
                          </label>
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
                  3. Prepare exact CSV headers
                </h2>
                <p style={{ margin: "6px 0 0", color: "#6B7280", lineHeight: 1.5 }}>
                  Your file should include these active headers. Extra columns are ignored in the
                  preview; missing optional active headers are ignored.
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
              <Pill tone={identityRequirementMet ? "green" : "amber"}>
                {identityRequirementMet
                  ? importIntent === "new"
                    ? "New-record identity fields active"
                    : "Identity fields active"
                  : importIntent === "new"
                    ? "Activate first and last name"
                    : "Activate ID, lookup, email, or first/last name"}
              </Pill>
              <Pill tone="blue">
                {importIntent === "updates"
                  ? "Existing-record update mode"
                  : importIntent === "new"
                    ? "Potential new records stay in review"
                    : "Mixed file: updates and new candidates"}
              </Pill>
              <Pill tone={hasImportOperation ? "green" : "amber"}>
                {hasImportOperation
                  ? "Import operation selected"
                  : "Select a constituent code, relationship, name, or email operation"}
              </Pill>
              {mappedEmailUpdate ? <Pill tone="blue">Email: Add if new</Pill> : null}
              {activeFields.targetConstituency ? (
                <Pill tone="blue">
                  Constituent code:{" "}
                  {constituencyAction === "add" ? "Add Additional" : "Replace Existing"}
                </Pill>
              ) : null}
              {educationRelationshipFieldsActive ? (
                <Pill tone="blue">Education: Add New Only</Pill>
              ) : null}
              {organizationRelationshipFieldsActive ? (
                <Pill tone="blue">Organization: Add Additional</Pill>
              ) : null}
              <Pill tone={rows.length ? "green" : "amber"}>
                {rows.length ? `${rows.length} rows parsed` : "Upload CSV rows"}
              </Pill>
              <Pill tone={missingHeaders.length === 0 ? "green" : "amber"}>
                {missingHeaders.length === 0
                  ? "All active headers present"
                  : `${missingHeaders.length} active header(s) not in CSV`}
              </Pill>
            </div>
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
                4. Upload CSV and review preview
              </h2>
              <p style={{ margin: "6px 0 0", color: "#6B7280" }}>
                Upload one CSV file. Active headers are matched automatically and each row is
                classified according to the selected file intent.
              </p>
            </div>
            <label
              htmlFor="constituency-import-file"
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
                backgroundColor: "white",
              }}
            >
              <Upload size={16} /> Choose CSV file
            </label>
            <input
              ref={fileInputRef}
              id="constituency-import-file"
              name="constituency-import-file"
              type="file"
              accept=".csv,text/csv"
              onInput={handleFileUpload}
              onChange={handleFileUpload}
              style={{
                position: "absolute",
                width: "1px",
                height: "1px",
                overflow: "hidden",
                clip: "rect(0 0 0 0)",
                clipPath: "inset(50%)",
                whiteSpace: "nowrap",
              }}
            />
          </div>

          <div
            style={{
              border: "1px solid #C7D2FE",
              borderRadius: "14px",
              padding: "14px",
              backgroundColor: sourceFilename ? "#F8FAFC" : "#FFFFFF",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "12px",
              flexWrap: "wrap",
            }}
          >
            <div>
              <div style={{ color: "#111827", fontWeight: 900 }}>
                {sourceFilename || "No CSV selected"}
              </div>
              <div style={{ marginTop: "4px", color: "#64748B", lineHeight: 1.4 }}>
                {sourceFilename
                  ? "Headers are matched automatically when the file is read."
                  : "Choose one CSV file to begin the preview."}
              </div>
            </div>
            {sourceFilename ? (
              <button
                type="button"
                onClick={clearUploadedCsv}
                style={{
                  border: "1px solid #D1D5DB",
                  borderRadius: "999px",
                  backgroundColor: "white",
                  color: "#374151",
                  padding: "8px 12px",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Clear file
              </button>
            ) : null}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center" }}>
            <Pill tone={rows.length ? "green" : "neutral"}>
              {rows.length ? `${rows.length} rows parsed` : "No rows parsed"}
            </Pill>
            {parseMessage ? <span style={{ color: "#6B7280" }}>{parseMessage}</span> : null}
            {fileReadStatus ? <span style={{ color: "#4338CA", fontWeight: 700 }}>{fileReadStatus}</span> : null}
          </div>
          {missingHeaders.length ? (
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
              Active fields not found in this CSV will be ignored for preview:{" "}
              {missingHeaders.join(", ")}
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
          {error ? (
            <div
              role="alert"
              style={{
                border: "1px solid #FECACA",
                borderRadius: "14px",
                backgroundColor: "#FEF2F2",
                color: "#991B1B",
                padding: "12px",
                fontWeight: 800,
                lineHeight: 1.45,
              }}
            >
              Preview could not be created: {error}
            </div>
          ) : null}
          {previewBlockers.length ? (
            <div
              style={{
                border: "1px solid #FDE68A",
                borderRadius: "14px",
                backgroundColor: "#FFFBEB",
                color: "#92400E",
                padding: "12px",
                fontWeight: 800,
                lineHeight: 1.45,
              }}
            >
              Preview needs: {previewBlockers.join(" ")}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => requestPreview()}
              disabled={previewing}
              style={{
                justifySelf: "start",
                border: "none",
                borderRadius: "14px",
                backgroundColor: previewing ? "#CBD5E1" : "#6D5DFB",
                color: "white",
                padding: "13px 18px",
                fontWeight: 900,
                fontSize: "15px",
                cursor: previewing ? "not-allowed" : "pointer",
              }}
            >
              {previewing ? "Creating preview..." : "Preview uploaded CSV"}
            </button>
          )}

          <div
            id="constituency-import-preview-results"
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
                    color: summaryToneColors[tone] || "#374151",
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

          {preview?.rows?.length ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center" }}>
              {contactDecisionsDirty ? (
                <button
                  type="button"
                  onClick={() => requestPreview()}
                  disabled={previewing}
                  style={{
                    border: "1px solid #C7D2FE",
                    borderRadius: "14px",
                    backgroundColor: previewing ? "#E5E7EB" : "#EEF2FF",
                    color: previewing ? "#64748B" : "#4338CA",
                    padding: "12px 16px",
                    fontWeight: 900,
                    cursor: previewing ? "not-allowed" : "pointer",
                  }}
                >
                  {previewing ? "Refreshing contact plan..." : "Refresh contact plan"}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => requestPreview({ saveRun: true })}
                disabled={savingRun || contactDecisionsDirty}
                style={{
                  border: "1px solid #A7F3D0",
                  borderRadius: "14px",
                  backgroundColor: savingRun || contactDecisionsDirty ? "#E5E7EB" : "#ECFDF5",
                  color: savingRun || contactDecisionsDirty ? "#64748B" : "#047857",
                  padding: "12px 16px",
                  fontWeight: 900,
                  cursor: savingRun || contactDecisionsDirty ? "not-allowed" : "pointer",
                }}
              >
                {savingRun
                  ? "Saving preview..."
                  : contactDecisionsDirty
                    ? "Refresh contact plan before saving"
                    : "Save preview run"}
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
            </div>
          ) : null}

          {contactDecisionsDirty ? (
            <div
              style={{
                border: "1px solid #C7D2FE",
                borderRadius: "14px",
                backgroundColor: "#EEF2FF",
                color: "#3730A3",
                padding: "12px",
                fontWeight: 800,
                lineHeight: 1.45,
              }}
            >
              Contact choices changed. Refresh the preview to rebuild the exact NXT write plan before saving this run.
            </div>
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
                Saved import run #{preview.savedRun.id}. {readySavedRows} ready confirmed update
                {readySavedRows === 1 ? "" : "s"} can be applied to NXT.
                {potentialNewRows
                  ? ` ${potentialNewRows} potential new record${potentialNewRows === 1 ? " requires" : "s require"} individual review and a separate one-record creation confirmation.`
                  : " No unreviewed potential new records remain."}
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
                const profileWrites = (row.writePlan || []).filter(
                  (write) => write.type === "constituent_profile",
                );
                const nameFormatWrites = (row.writePlan || []).filter(
                  (write) => write.type === "constituent_name_format",
                );
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
                            : row.intentDisposition?.key === "potential_new"
                              ? "No likely NXT match found"
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
                        {row.intentDisposition?.label ? (
                          <Pill tone={row.intentDisposition.key === "potential_new" ? "blue" : row.intentDisposition.key === "needs_resolution" || row.intentDisposition.key === "possible_duplicate" ? "amber" : "green"}>
                            {row.intentDisposition.label}
                          </Pill>
                        ) : null}
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

                    {profileWrites.length || nameFormatWrites.length ? (
                      <section
                        style={{
                          border: "1px solid #BFDBFE",
                          borderRadius: "12px",
                          backgroundColor: "#EFF6FF",
                          padding: "12px",
                          display: "grid",
                          gap: "10px",
                        }}
                      >
                        <div style={{ color: "#1D4ED8", fontWeight: 900 }}>
                          Individual and name-format review
                        </div>
                        {profileWrites.map((write, index) => (
                          <div
                            key={`profile-${index}`}
                            style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "8px" }}
                          >
                            {[
                              ["Title", write.current?.title, write.title],
                              ["Gender", write.current?.gender, write.gender],
                              ["Birth Date", write.current?.birthDate, write.birthDate],
                              ["Suffix", write.current?.suffix, write.suffix],
                            ]
                              .filter(([, , proposed]) => proposed)
                              .map(([label, current, proposed]) => (
                                <div key={label} style={{ border: "1px solid #BFDBFE", borderRadius: "10px", backgroundColor: "white", padding: "9px" }}>
                                  <div style={{ color: "#64748B", fontSize: "11px", fontWeight: 900, textTransform: "uppercase" }}>{label}</div>
                                  <div style={{ marginTop: "4px", color: "#475569", fontSize: "13px" }}>Current: {current || "Not set"}</div>
                                  <div style={{ marginTop: "3px", color: "#0F172A", fontWeight: 900 }}>CSV: {proposed}</div>
                                </div>
                              ))}
                          </div>
                        ))}
                        {nameFormatWrites.map((write, index) => (
                          <div
                            key={`name-format-${index}`}
                            style={{ border: "1px solid #BFDBFE", borderRadius: "10px", backgroundColor: "white", padding: "9px" }}
                          >
                            <div style={{ color: "#64748B", fontSize: "11px", fontWeight: 900, textTransform: "uppercase" }}>
                              Primary {write.kind === "salutation" ? "salutation" : "addressee"}
                            </div>
                            <div style={{ marginTop: "4px", color: "#475569", fontSize: "13px" }}>Current: {write.currentValue || "Not set"}</div>
                            <div style={{ marginTop: "3px", color: "#0F172A", fontWeight: 900 }}>Proposed: {write.value}</div>
                          </div>
                        ))}
                      </section>
                    ) : null}

                    <ContactReviewPanel
                      row={row}
                      decisions={contactDecisions}
                      onDecisionChange={updateContactDecision}
                    />

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
                    {row.intentDisposition?.message ? (
                      <div
                        style={{
                          border: "1px solid #BFDBFE",
                          borderRadius: "12px",
                          padding: "10px 12px",
                          color: "#1E3A8A",
                          backgroundColor: "#EFF6FF",
                          lineHeight: 1.45,
                        }}
                      >
                        {row.intentDisposition.message}
                      </div>
                    ) : null}
                    {row.createdBlackbaudConstituentId ? (
                      <div
                        style={{
                          border: "1px solid #86EFAC",
                          borderRadius: "12px",
                          padding: "10px 12px",
                          color: "#166534",
                          backgroundColor: "#F0FDF4",
                          fontWeight: 800,
                          lineHeight: 1.45,
                        }}
                      >
                        NXT individual record created
                        {row.createdBlackbaudLookupId
                          ? ` · Lookup ID ${row.createdBlackbaudLookupId}`
                          : ""}
                        . Review the staged writes, then use “Apply ready rows” to add them.
                      </div>
                    ) : null}
                    {row.intentDisposition?.key === "potential_new" ? (
                      preview?.savedRun ? (
                        <div
                          style={{
                            border: "1px solid #BFDBFE",
                            borderRadius: "12px",
                            backgroundColor: "#EFF6FF",
                            padding: "12px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "12px",
                            flexWrap: "wrap",
                          }}
                        >
                          <span style={{ color: "#1E3A8A", fontWeight: 800, lineHeight: 1.45 }}>
                            Create only after reviewing this unmatched individual. A final duplicate check will run immediately before NXT changes.
                          </span>
                          <button
                            type="button"
                            onClick={() => createReviewedNxtRecord(row)}
                            disabled={Boolean(creatingRowId)}
                            style={{
                              border: "1px solid #1D4ED8",
                              borderRadius: "999px",
                              backgroundColor: creatingRowId ? "#DBEAFE" : "#1D4ED8",
                              color: creatingRowId ? "#1E40AF" : "white",
                              padding: "9px 14px",
                              fontWeight: 900,
                              cursor: creatingRowId ? "not-allowed" : "pointer",
                            }}
                          >
                            {creatingRowId === String(row.id)
                              ? "Creating NXT record..."
                              : "Create reviewed NXT record"}
                          </button>
                        </div>
                      ) : (
                        <div style={{ color: "#1E3A8A", fontWeight: 800 }}>
                          Save this preview run before approving a new NXT constituent.
                        </div>
                      )
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
