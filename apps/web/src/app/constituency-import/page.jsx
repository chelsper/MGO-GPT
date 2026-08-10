"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import { ArrowLeft, Check, Copy, FileText, Upload } from "lucide-react";
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
    key: "ethnicity",
    header: "Ethnicity",
    label: "Ethnicity",
    group: "Individual profile fields",
    description: "Optional NXT ethnicity value. The CSV value is reviewed against the current record before import.",
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
    key: "addressValidFrom",
    header: "Address Valid From",
    label: "Address Valid From",
    group: "Address fields",
    description: "Optional date this address becomes valid, in MM/DD/YY, MM/DD/YYYY, or YYYY-MM-DD format.",
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
    description:
      "Optional start date for the new code. When replacing, the selected current code and its dates are removed; leave this blank to create the new code without a start date.",
  },
  {
    key: "endDate",
    header: "New Constituent Code End Date",
    label: "New Constituent Code End Date",
    group: "Constituent code fields",
    description:
      "Optional end date for the new code. When replacing, it applies only to the newly created code.",
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
    key: "educationMinor",
    header: "Education Minor",
    label: "Education Minor",
    group: "Education relationship fields",
    description: "Minor or secondary academic area, when available.",
  },
  {
    key: "educationSchoolType",
    header: "Education School Type",
    label: "Education School Type",
    group: "Education relationship fields",
    description: "Active NXT School type table entry, when available.",
  },
  {
    key: "educationCampus",
    header: "Education Campus",
    label: "Education Campus",
    group: "Education relationship fields",
    description: "Campus name, when available.",
  },
  {
    key: "educationFraternitySorority",
    header: "Education Fraternity/Sorority",
    label: "Education Fraternity/Sorority",
    group: "Education relationship fields",
    description: "Fraternity or sorority affiliation, when available.",
  },
  {
    key: "educationGpa",
    header: "Education GPA",
    label: "Education GPA",
    group: "Education relationship fields",
    description: "Numeric GPA, when available.",
  },
  {
    key: "educationClassYear",
    header: "Education Class Year",
    label: "Education Class Year",
    group: "Education relationship fields",
    description: "Graduation or class year, when available.",
  },
  {
    key: "educationStatus",
    header: "Education Status",
    label: "Education Status",
    group: "Education relationship fields",
    description: "Active NXT education status table entry, when available.",
  },
  {
    key: "educationDateGraduated",
    header: "Education Date Graduated",
    label: "Education Date Graduated",
    group: "Education relationship fields",
    description: "Use MM/DD/YY, MM/DD/YYYY, or YYYY-MM-DD. This can be blank.",
  },
  {
    key: "educationDateEntered",
    header: "Education Date Entered",
    label: "Education Date Entered",
    group: "Education relationship fields",
    description: "Use MM/DD/YY, MM/DD/YYYY, or YYYY-MM-DD. This can be blank.",
  },
  {
    key: "educationDateLeft",
    header: "Education Date Left",
    label: "Education Date Left",
    group: "Education relationship fields",
    description: "Use MM/DD/YY, MM/DD/YYYY, or YYYY-MM-DD. This can be blank.",
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

const INDIVIDUAL_PROFILE_FIELD_KEYS = ["title", "gender", "ethnicity", "birthDate", "suffix"];
const NAME_FORMAT_FIELD_KEYS = ["addressee", "salutation"];
const EMAIL_FIELD_KEYS = ["email", "email2"];
const PHONE_FIELD_KEYS = ["phoneNumber", "phone2Number"];
const ADDRESS_FIELD_KEYS = ["addressType", "addressValidFrom", "addressLine1", "addressLine2", "city", "state", "postalCode", "country"];

function getDetectedHeaders(headerSet, fieldKeys) {
  return fieldKeys
    .map((key) => FIELD_BY_KEY[key]?.header)
    .filter((header) => headerSet.has(header));
}

const DEFAULT_ACTIVE_FIELDS = {
  blackbaudConstituentId: false,
  lookupId: false,
  firstName: false,
  lastName: false,
  preferredName: false,
  title: false,
  gender: false,
  ethnicity: false,
  birthDate: false,
  suffix: false,
  addressee: false,
  salutation: false,
  email: false,
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
  addressValidFrom: false,
  addressLine1: false,
  addressLine2: false,
  city: false,
  state: false,
  postalCode: false,
  country: false,
  addressMakePrimary: false,
  sourceConstituency: false,
  targetConstituency: false,
  startDate: false,
  endDate: false,
  educationInstitution: false,
  educationDegree: false,
  educationMajor: false,
  educationMinor: false,
  educationSchoolType: false,
  educationCampus: false,
  educationFraternitySorority: false,
  educationGpa: false,
  educationClassYear: false,
  educationStatus: false,
  educationDateGraduated: false,
  educationDateEntered: false,
  educationDateLeft: false,
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
  "Individual profile fields": "Optional title, gender, ethnicity, birth date, and suffix values for individual constituents.",
  "Addressee and salutation fields": "Optionally import custom primary NXT formats or build consistent values for an entire file.",
  "Email fields": "Email columns, including the optional primary flag.",
  "Phone fields": "Phone columns, including the optional primary flag.",
  "Address fields": "Address columns, including type, valid-from date, and the optional primary flag.",
  "Constituent code fields": "Constituent-code add/replace options and optional dates.",
  "Education relationship fields": "Education columns can add additional NXT education relationships or, after selecting one exact source row during review, update an existing relationship.",
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
    description: "Requires Current Constituent Code so the import review can identify what would be replaced.",
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
      "The import review separates confirmed updates, potential new records, and rows needing resolution.",
  },
];

const EDUCATION_RELATIONSHIP_ACTIONS = [
  {
    value: "add",
    label: "Add Additional Relationship",
    description:
      "Create an additional NXT education relationship. Existing education rows are never changed, and matching entries are skipped.",
  },
  {
    value: "review-update",
    label: "Update Existing Relationship",
    description:
      "Choose the exact current NXT education row to update during review. Nothing is matched or changed automatically.",
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
      case "addressValidFrom":
        return "2026-01-15";
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
      case "educationMinor":
        return "Psychology";
      case "educationSchoolType":
        return "University";
      case "educationCampus":
        return "Main Campus";
      case "educationFraternitySorority":
        return "Alpha Delta Pi";
      case "educationGpa":
        return "3.8";
      case "educationClassYear":
        return "2026";
      case "educationStatus":
        return "Graduated";
      case "educationDateGraduated":
        return "05/01/2026";
      case "educationDateEntered":
        return "08/15/2022";
      case "educationDateLeft":
        return "";
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
      case "addressValidFrom":
        return "2026-01-15";
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
      case "educationMinor":
        return "Finance";
      case "educationSchoolType":
        return "University";
      case "educationCampus":
        return "Downtown Campus";
      case "educationFraternitySorority":
        return "";
      case "educationGpa":
        return "3.6";
      case "educationClassYear":
        return "2026";
      case "educationStatus":
        return "Graduated";
      case "educationDateGraduated":
        return "05/01/2026";
      case "educationDateEntered":
        return "08/15/2024";
      case "educationDateLeft":
        return "";
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

function getDateText(value) {
  if (!value) return "";
  if (typeof value !== "object") return String(value).trim();

  const datedValue =
    value.date ||
    value.value ||
    value.date_value ||
    value.formatted_value ||
    value.formatted ||
    value.iso ||
    value.text;
  if (datedValue && datedValue !== value) return getDateText(datedValue);

  const year = Number(value.y ?? value.year);
  const month = Number(value.m ?? value.month);
  const day = Number(value.d ?? value.day);
  if (year && month && day) {
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  if (year && month) return `${year}-${String(month).padStart(2, "0")}`;
  if (year) return String(year);

  return "";
}

function formatBirthDateForDisplay(value) {
  const text = getDateText(value);
  const isoMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}/${year}`;
  }
  return text;
}

function formatWritePlanItem(write) {
  if (!write || typeof write !== "object") return "";

  if (write.type === "constituent_code") {
    const action = write.action === "replace" ? "Replace" : "Add";
    const from = write.sourceConstituency ? `${write.sourceConstituency} to ` : "";
    const reviewState =
      write.action === "replace"
        ? write.sourceCodeId
          ? " (selected current NXT row)"
          : " (select current NXT row)"
        : "";
    const dates = [
      write.startDate && `start ${formatBirthDateForDisplay(write.startDate)}`,
      write.endDate && `end ${formatBirthDateForDisplay(write.endDate)}`,
    ]
      .filter(Boolean)
      .join(", ");
    return `${action} constituent code: ${from}${write.targetConstituency || "unspecified"}${reviewState}${dates ? ` (${dates})` : ""}`;
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
      write.birthDate && `birth date to ${formatBirthDateForDisplay(write.birthDate)}`,
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
        : write.action === "update"
          ? "Update reviewed education relationship"
          : write.action === "review_existing"
            ? "Education relationship needs review"
            : "Add education relationship";
    const details = [
      write.institution,
      write.degree,
      write.major,
      write.minor && `Minor ${write.minor}`,
      write.schoolType && `Type ${write.schoolType}`,
      write.campus,
      write.fraternitySorority,
      write.gpa && `GPA ${write.gpa}`,
      write.classYear && `Class ${write.classYear}`,
      write.status,
      write.dateGraduated && `Graduated ${write.dateGraduated}`,
      write.dateEntered && `Entered ${write.dateEntered}`,
      write.dateLeft && `Left ${write.dateLeft}`,
    ]
      .filter(Boolean)
      .join(" / ");
    const target = write.targetEducationId ? ` (NXT education ID ${write.targetEducationId})` : "";
    return `${action}${target}: ${details || "details supplied in row"}`;
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
  if (result.status === "failed") {
    return `NXT write failed: ${result.message || "No error detail was returned."}`;
  }
  return result.message || result.status || "Apply result recorded.";
}

function renderApplyAudit(result) {
  const attempts = Array.isArray(result?.attempts)
    ? result.attempts
    : Array.isArray(result?.results)
      ? [{ retryFailedOnly: false, results: result.results }]
      : [];
  if (!attempts.length) return "Not applied";

  return attempts
    .map((attempt, index) => {
      const outcomes = Array.isArray(attempt?.results)
        ? attempt.results.map(formatApplyResultItem).filter(Boolean).join(" | ")
        : "No result details recorded";
      return `Attempt ${index + 1}${attempt?.retryFailedOnly ? " (failed-write retry)" : ""}: ${outcomes}`;
    })
    .join(" || ");
}

function renderReconciliationAudit(result) {
  const attempts = Array.isArray(result?.reconciliation?.attempts)
    ? result.reconciliation.attempts
    : Array.isArray(result?.reconciliation?.results)
      ? [result.reconciliation]
      : [];
  if (!attempts.length) return "Not verified";

  return attempts
    .map((attempt, index) => {
      const outcomes = Array.isArray(attempt?.results)
        ? attempt.results
            .map((item) => `${item?.status === "confirmed" ? "Confirmed" : "Review"}: ${item?.message || item?.type || "NXT check"}`)
            .join(" | ")
        : "No verification details recorded";
      return `Check ${index + 1}: ${outcomes}`;
    })
    .join(" || ");
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

function getContactSectionDecision(decisions, rowNumber, kind) {
  return decisions?.[String(rowNumber)]?.[kind]?.__section || {};
}

function getPreviewFieldDecision(decisions, rowNumber, writeType, field) {
  return decisions?.[String(rowNumber)]?.[writeType]?.[field] || {};
}

function formatConstituencyDate(value) {
  return value ? formatBirthDateForDisplay(value) || getDateText(value) || "Not set" : "Not set";
}

function getDisplayText(value) {
  if (value === null || value === undefined) return "";
  if (typeof value !== "object") return String(value).trim();

  return (
    getDateText(value) ||
    getDisplayText(
      value.name ||
        value.description ||
        value.label ||
        value.value ||
        value.text ||
        value.formatted_value ||
        value.formatted,
    )
  );
}

function getContactValue(contact, kind) {
  if (kind === "email") return contact?.address || "";
  if (kind === "phone") return contact?.number || "";
  const address = [contact?.addressLine1, contact?.addressLine2, contact?.city, contact?.state, contact?.postalCode]
    .filter(Boolean)
    .join(", ");
  const dates = [
    contact?.validFrom ? `Valid from ${formatBirthDateForDisplay(contact.validFrom)}` : "",
    contact?.validTo ? `Valid through ${formatBirthDateForDisplay(contact.validTo)}` : "",
  ].filter(Boolean);
  return dates.length ? `${address}${address ? " · " : ""}${dates.join(" · ")}` : address;
}

function getIncomingContactValue(contact, kind) {
  if (kind === "email") return contact?.address || "";
  if (kind === "phone") return contact?.number || "";
  const address = [contact?.addressLine1, contact?.addressLine2, contact?.city, contact?.state, contact?.postalCode]
    .filter(Boolean)
    .join(", ");
  return contact?.validFrom
    ? `${address}${address ? " · " : ""}Valid from ${formatBirthDateForDisplay(contact.validFrom)}`
    : address;
}

function ContactReviewPanel({ row, decisions, onDecisionChange, onSectionDecisionChange }) {
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
        const sectionDecision = getContactSectionDecision(decisions, row.rowNumber, section.kind);
        const hasIncomingPrimary = ["email", "phone"].includes(section.kind) && section.values.some((value, index) => {
          const decision = getContactDecision(decisions, row.rowNumber, section.kind, index);
          const mode = decision.mode === "replace" ? "replace" : decision.mode === "skip" ? "skip" : "add";
          const makePrimary = decision.makePrimary === undefined
            ? index === defaultPrimaryIndex
            : decision.makePrimary === true;
          return mode === "add" && makePrimary;
        });
        const hasIncomingAddress = section.kind === "address" && section.values.some((value, index) => {
          const decision = getContactDecision(decisions, row.rowNumber, section.kind, index);
          return decision.mode !== "replace" && decision.mode !== "skip";
        });
        const selectedExistingPrimary = section.contacts.find(
          (contact) => contact.id === sectionDecision.existingPrimaryTargetId,
        );

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

            {["email", "phone"].includes(section.kind) && section.contacts.length > 1 ? (
              hasIncomingPrimary ? (
                <div style={{ color: "#166534", fontSize: "14px", lineHeight: 1.4 }}>
                  A CSV value is selected as primary below. Clear that selection before choosing an existing NXT {section.kind === "email" ? "email address" : "phone number"} as primary.
                </div>
              ) : (
                <div style={{ display: "grid", gap: "8px", border: "1px solid #BBF7D0", borderRadius: "12px", backgroundColor: "#F7FEF9", padding: "11px" }}>
                  <label style={{ display: "grid", gap: "5px", color: "#374151", fontWeight: 800 }}>
                    Primary {section.kind === "email" ? "email address" : "phone number"}
                    <select
                      name={`existing-primary-${row.rowNumber}-${section.kind}`}
                      value={sectionDecision.existingPrimaryTargetId || ""}
                      onChange={(event) =>
                        onSectionDecisionChange(row.rowNumber, section.kind, {
                          existingPrimaryTargetId: event.target.value,
                        })
                      }
                      style={{ border: "1px solid #86EFAC", borderRadius: "9px", backgroundColor: "white", padding: "9px 10px", color: "#111827" }}
                    >
                      <option value="">Keep {primary ? `${getContactValue(primary, section.kind)} as primary` : "the current primary setting"}</option>
                      {section.contacts.filter((contact) => !contact.primary).map((contact) => (
                        <option key={contact.id} value={contact.id}>
                          Make {getContactValue(contact, section.kind)} primary{contact.type ? ` (${contact.type})` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  {selectedExistingPrimary && primary ? (
                    <>
                      <div style={{ color: "#166534", fontSize: "14px", lineHeight: 1.4 }}>
                        {getContactValue(selectedExistingPrimary, section.kind)} will become primary. {getContactValue(primary, section.kind)} will remain on the record as non-primary.
                      </div>
                      <label style={{ display: "grid", gap: "4px", color: "#166534", fontSize: "14px" }}>
                        Change the former primary's type (optional)
                        <select
                          name={`existing-primary-demoted-type-${row.rowNumber}-${section.kind}`}
                          value={sectionDecision.demotedPrimaryType || ""}
                          onChange={(event) =>
                            onSectionDecisionChange(row.rowNumber, section.kind, {
                              demotedPrimaryType: event.target.value,
                            })
                          }
                          style={{ border: "1px solid #86EFAC", borderRadius: "8px", backgroundColor: "white", padding: "8px 9px", color: "#111827" }}
                        >
                          <option value="">Keep {primary.type || "the current type"}</option>
                          {typeOptions.map((type) => <option key={type} value={type}>{type}</option>)}
                        </select>
                      </label>
                    </>
                  ) : null}
                </div>
              )
            ) : null}

            {section.kind === "address" && hasIncomingAddress && section.contacts.length ? (
              <div style={{ display: "grid", gap: "8px", border: "1px solid #BBF7D0", borderRadius: "12px", backgroundColor: "#F7FEF9", padding: "11px" }}>
                <div style={{ color: "#374151", fontWeight: 800 }}>Close a prior address (optional)</div>
                <div style={{ color: "#166534", fontSize: "14px", lineHeight: 1.4 }}>
                  After the new address is added, you can change one current NXT address to Previous Address and set its end date. If the new address is not added, the prior address will not be changed.
                </div>
                <label style={{ display: "grid", gap: "5px", color: "#374151", fontWeight: 800 }}>
                  Mark which current NXT address as Previous Address?
                  <select
                    name={`previous-address-${row.rowNumber}`}
                    value={sectionDecision.previousAddressTargetId || ""}
                    onChange={(event) =>
                      onSectionDecisionChange(row.rowNumber, "address", {
                        previousAddressTargetId: event.target.value,
                      })
                    }
                    style={{ border: "1px solid #86EFAC", borderRadius: "9px", backgroundColor: "white", padding: "9px 10px", color: "#111827" }}
                  >
                    <option value="">Do not change any current address</option>
                    {section.contacts.map((contact) => (
                      <option key={contact.id} value={contact.id}>
                        {getContactValue(contact, "address")}{contact.type ? ` (${contact.type})` : ""}{contact.primary ? " - Primary" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                {sectionDecision.previousAddressTargetId ? (
                  <label style={{ display: "grid", gap: "5px", color: "#374151", fontWeight: 800 }}>
                    Previous Address end date
                    <input
                      type="date"
                      name={`previous-address-end-date-${row.rowNumber}`}
                      value={sectionDecision.previousAddressEndDate || ""}
                      onChange={(event) =>
                        onSectionDecisionChange(row.rowNumber, "address", {
                          previousAddressEndDate: event.target.value,
                        })
                      }
                      style={{ border: "1px solid #86EFAC", borderRadius: "9px", backgroundColor: "white", padding: "9px 10px", color: "#111827" }}
                    />
                  </label>
                ) : null}
              </div>
            ) : null}

            {!section.values.length ? (
              <div style={{ color: "#6B7280", fontSize: "14px", lineHeight: 1.4 }}>
                No CSV {section.kind === "email" ? "email address" : section.kind === "phone" ? "phone number" : "address"} is selected for import.
              </div>
            ) : null}

            {section.values.map((incoming, index) => {
              const decision = getContactDecision(decisions, row.rowNumber, section.kind, index);
              const mode = decision.mode === "replace" ? "replace" : decision.mode === "skip" ? "skip" : "add";
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
                      <option value="skip">Take no action (leave NXT unchanged)</option>
                    </select>
                  </label>

                  {mode === "skip" ? (
                    <div style={{ color: "#166534", fontSize: "14px", lineHeight: 1.4 }}>
                      This CSV value will be ignored. No {section.kind === "email" ? "email address" : section.kind === "phone" ? "phone number" : "address"} write will be sent to NXT.
                    </div>
                  ) : mode === "replace" ? (
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

function FieldReviewCard({
  rowNumber,
  writeType,
  field,
  label,
  current,
  proposed,
  decisions,
  onDecisionChange,
}) {
  const decision = getPreviewFieldDecision(decisions, rowNumber, writeType, field);
  const mode = decision.mode === "skip" ? "skip" : "apply";
  const currentText = getDisplayText(current);
  const proposedText = getDisplayText(proposed);

  return (
    <div
      style={{
        border: "1px solid #BFDBFE",
        borderRadius: "10px",
        backgroundColor: "white",
        padding: "9px",
        display: "grid",
        gap: "7px",
      }}
    >
      <div style={{ color: "#64748B", fontSize: "11px", fontWeight: 900, textTransform: "uppercase" }}>{label}</div>
      <div style={{ color: "#475569", fontSize: "13px" }}>Current: {currentText || "Not set"}</div>
      <div style={{ color: "#0F172A", fontWeight: 900 }}>CSV: {proposedText || "Not set"}</div>
      <div style={{ display: "grid", gap: "6px", color: "#334155", fontSize: "13px", fontWeight: 800 }}>
        <span>Choose a review action</span>
        <div role="group" aria-label={`Review ${label}`} style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          <button
            type="button"
            aria-pressed={mode === "apply"}
            onClick={() => onDecisionChange(rowNumber, writeType, field, { mode: "apply" })}
            style={{
              border: "1px solid #2563EB",
              borderRadius: "999px",
              backgroundColor: mode === "apply" ? "#2563EB" : "white",
              color: mode === "apply" ? "white" : "#1D4ED8",
              padding: "8px 11px",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            Use CSV value
          </button>
          <button
            type="button"
            aria-pressed={mode === "skip"}
            onClick={() => onDecisionChange(rowNumber, writeType, field, { mode: "skip" })}
            style={{
              border: "1px solid #94A3B8",
              borderRadius: "999px",
              backgroundColor: mode === "skip" ? "#E2E8F0" : "white",
              color: "#334155",
              padding: "8px 11px",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            Keep NXT value
          </button>
        </div>
      </div>
      {mode === "skip" ? (
        <div style={{ color: "#1D4ED8", fontSize: "12px", lineHeight: 1.35 }}>
          This value will not be included in the NXT write plan.
        </div>
      ) : null}
    </div>
  );
}

function EducationTargetReviewPanel({
  row,
  candidates,
  selectedCandidateId,
  loading,
  saving,
  onLoadCandidates,
  onCandidateChange,
  onSelectCandidate,
}) {
  const pendingWrite = (row.writePlan || []).find(
    (item) =>
      item?.type === "education_relationship" && item?.action === "review_existing",
  );
  const confirmedWrite = (row.writePlan || []).find(
    (item) =>
      item?.type === "education_relationship" &&
      item?.action === "update" &&
      item?.reviewSelection?.selectedAt,
  );
  const write = pendingWrite || confirmedWrite;
  if (!write) return null;

  const csvDetails = [
    write.institution,
    write.degree,
    write.major,
    write.classYear && `Class of ${write.classYear}`,
    write.status,
  ]
    .filter(Boolean)
    .join(" · ");
  const hasLoadedCandidates = Array.isArray(candidates);

  if (confirmedWrite) {
    const source = confirmedWrite.existingEducation || {};
    const sourceDetails = [
      source.school,
      source.degrees?.length ? source.degrees.join(", ") : "",
      source.majors?.length ? `Major: ${source.majors.join(", ")}` : "",
      source.classYear ? `Class of ${source.classYear}` : "",
      source.status,
    ]
      .filter(Boolean)
      .join(" · ");
    return (
      <section
        style={{
          border: "1px solid #86EFAC",
          borderRadius: "14px",
          backgroundColor: "#F0FDF4",
          padding: "14px",
          display: "grid",
          gap: "8px",
        }}
      >
        <div style={{ color: "#166534", fontSize: "12px", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Education update confirmed
        </div>
        <div style={{ color: "#166534", lineHeight: 1.45 }}>
          This CSV will update the selected current NXT education relationship when this record is sent to NXT. Other education rows will not change.
        </div>
        <div style={{ color: "#14532D", fontSize: "14px", fontWeight: 800 }}>
          Source row: {sourceDetails || `NXT education ID ${confirmedWrite.targetEducationId}`}
        </div>
        <div style={{ color: "#166534", fontSize: "12px", fontWeight: 800 }}>
          NXT education ID {confirmedWrite.targetEducationId}
        </div>
      </section>
    );
  }

  return (
    <section
      style={{
        border: "1px solid #FCD34D",
        borderRadius: "14px",
        backgroundColor: "#FFFBEB",
        padding: "14px",
        display: "grid",
        gap: "12px",
      }}
    >
      <div>
        <div style={{ color: "#92400E", fontSize: "12px", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Education update review
        </div>
        <p style={{ margin: "5px 0 0", color: "#92400E", lineHeight: 1.45 }}>
          Choose the exact current NXT education row to update. Choosing a row records the
          decision in this import run; it does not write to NXT until you send this record.
          Every other education relationship remains unchanged.
        </p>
      </div>

      <div
        style={{
          border: "1px solid #FDE68A",
          borderRadius: "10px",
          backgroundColor: "white",
          padding: "10px",
        }}
      >
        <div style={{ color: "#92400E", fontSize: "11px", fontWeight: 900, textTransform: "uppercase" }}>
          CSV education change
        </div>
        <div style={{ marginTop: "5px", color: "#111827", fontWeight: 800 }}>
          {csvDetails || "Education details supplied in this CSV row"}
        </div>
      </div>

      {!hasLoadedCandidates ? (
        <button
          type="button"
          onClick={() => onLoadCandidates(row)}
          disabled={loading || saving}
          style={{
            width: "fit-content",
            border: "1px solid #B45309",
            borderRadius: "999px",
            backgroundColor: loading ? "#FEF3C7" : "#B45309",
            color: loading ? "#92400E" : "white",
            padding: "9px 14px",
            fontWeight: 900,
            cursor: loading || saving ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Loading current NXT rows..." : "Review current NXT education rows"}
        </button>
      ) : candidates.length ? (
        <div style={{ display: "grid", gap: "9px" }}>
          <div style={{ color: "#78350F", fontSize: "14px", fontWeight: 800 }}>
            Select the current NXT education row to update
          </div>
          {candidates.map((candidate) => {
            const isSelected = String(selectedCandidateId || "") === String(candidate.id);
            const details = [
              candidate.degrees?.join(", "),
              candidate.majors?.length ? `Major: ${candidate.majors.join(", ")}` : "",
              candidate.classYear ? `Class of ${candidate.classYear}` : "",
              candidate.status,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <div
                key={candidate.id}
                style={{
                  border: "1px solid #FDE68A",
                  borderRadius: "11px",
                  backgroundColor: "white",
                  padding: "11px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "12px",
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <div style={{ color: "#111827", fontWeight: 900 }}>
                    {candidate.school || "Education row"}
                  </div>
                  <div style={{ marginTop: "3px", color: "#6B7280", fontSize: "14px" }}>
                    {details || "No additional education details found"}
                  </div>
                  <div style={{ marginTop: "4px", color: "#92400E", fontSize: "12px", fontWeight: 800 }}>
                    NXT education ID {candidate.id}
                  </div>
                </div>
                <button
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => onCandidateChange(row, candidate.id)}
                  disabled={saving || loading}
                  style={{
                    border: "1px solid #B45309",
                    borderRadius: "999px",
                    backgroundColor: isSelected ? "#B45309" : saving ? "#FEF3C7" : "white",
                    color: isSelected ? "white" : "#92400E",
                    padding: "8px 12px",
                    fontWeight: 900,
                    cursor: saving || loading ? "not-allowed" : "pointer",
                  }}
                >
                  {isSelected ? "Selected NXT row" : "Select this NXT row"}
                </button>
              </div>
            );
          })}
          <div
            style={{
              borderTop: "1px solid #FDE68A",
              marginTop: "3px",
              paddingTop: "12px",
              display: "grid",
              gap: "7px",
              justifyItems: "start",
            }}
          >
            <button
              type="button"
              onClick={() => onSelectCandidate(row, selectedCandidateId)}
              disabled={!selectedCandidateId || saving || loading}
              style={{
                border: "1px solid #92400E",
                borderRadius: "999px",
                backgroundColor:
                  selectedCandidateId && !saving && !loading ? "#92400E" : "#FEF3C7",
                color: selectedCandidateId && !saving && !loading ? "white" : "#92400E",
                padding: "9px 14px",
                fontWeight: 900,
                cursor:
                  selectedCandidateId && !saving && !loading ? "pointer" : "not-allowed",
              }}
            >
              {saving ? "Confirming selected row..." : "Confirm selected NXT education row"}
            </button>
            <div style={{ color: "#92400E", fontSize: "12px", fontWeight: 700 }}>
              Confirming records this source row in the import audit. It does not write to NXT until
              you send this record.
            </div>
          </div>
        </div>
      ) : (
        <div style={{ color: "#92400E", fontWeight: 800 }}>
          This constituent has no current NXT education relationships. Refresh the import review or
          change this import to Add Additional Relationship.
        </div>
      )}
    </section>
  );
}

function ConstituencyReplaceReviewPanel({
  row,
  candidates,
  loading,
  saving,
  onLoadCandidates,
  onSelectCandidate,
}) {
  const write = (row.writePlan || []).find(
    (item) => item?.type === "constituent_code" && item?.action === "replace",
  );
  if (!write) return null;

  const formatCodeDate = (value) => formatBirthDateForDisplay(value) || "Not set";
  const selectedSourceCode = write.selectedSourceCode;
  const hasLoadedCandidates = Array.isArray(candidates);
  const targetDetails = [
    write.targetConstituency || "New constituent code",
    `Start: ${formatCodeDate(write.startDate)}`,
    `End: ${formatCodeDate(write.endDate)}`,
  ];

  if (write.sourceCodeId && selectedSourceCode) {
    return (
      <section
        style={{
          border: "1px solid #86EFAC",
          borderRadius: "14px",
          backgroundColor: "#F0FDF4",
          padding: "14px",
          display: "grid",
          gap: "11px",
        }}
      >
        <div>
          <div style={{ color: "#166534", fontSize: "12px", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Constituency replacement confirmed
          </div>
          <p style={{ margin: "5px 0 0", color: "#166534", lineHeight: 1.45 }}>
            Sending this record to NXT will remove only the selected current code below, including
            its start and end dates. It will then create the new code using the CSV dates. Every
            other NXT constituency remains unchanged.
          </p>
        </div>
        <div
          style={{
            border: "1px solid #BBF7D0",
            borderRadius: "10px",
            backgroundColor: "white",
            padding: "10px",
            display: "grid",
            gap: "5px",
          }}
        >
          <div style={{ color: "#166534", fontSize: "11px", fontWeight: 900, textTransform: "uppercase" }}>
            Current NXT code to remove
          </div>
          <div style={{ color: "#111827", fontWeight: 900 }}>
            {selectedSourceCode.label || write.sourceConstituency}
          </div>
          <div style={{ color: "#4B5563", fontSize: "14px" }}>
            Start: {formatCodeDate(selectedSourceCode.startDate)} · End: {formatCodeDate(selectedSourceCode.endDate)}
          </div>
          <div style={{ color: "#166534", fontSize: "12px", fontWeight: 800 }}>
            NXT constituent-code ID {selectedSourceCode.id || write.sourceCodeId}
          </div>
        </div>
        <div
          style={{
            border: "1px solid #BBF7D0",
            borderRadius: "10px",
            backgroundColor: "white",
            padding: "10px",
          }}
        >
          <div style={{ color: "#166534", fontSize: "11px", fontWeight: 900, textTransform: "uppercase" }}>
            New NXT code to create
          </div>
          <div style={{ marginTop: "5px", color: "#111827", fontWeight: 900 }}>
            {targetDetails.join(" · ")}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      style={{
        border: "1px solid #FCD34D",
        borderRadius: "14px",
        backgroundColor: "#FFFBEB",
        padding: "14px",
        display: "grid",
        gap: "12px",
      }}
    >
      <div>
        <div style={{ color: "#92400E", fontSize: "12px", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Constituency replacement review
        </div>
        <p style={{ margin: "5px 0 0", color: "#92400E", lineHeight: 1.45 }}>
          Choose exactly which current NXT code row to remove. The selected row and its dates will
          be deleted, then the new code below will be created using the CSV dates. Other
          constituencies will not change.
        </p>
      </div>
      <div
        style={{
          border: "1px solid #FDE68A",
          borderRadius: "10px",
          backgroundColor: "white",
          padding: "10px",
        }}
      >
        <div style={{ color: "#92400E", fontSize: "11px", fontWeight: 900, textTransform: "uppercase" }}>
          New NXT code from CSV
        </div>
        <div style={{ marginTop: "5px", color: "#111827", fontWeight: 900 }}>
          {targetDetails.join(" · ")}
        </div>
      </div>

      {!hasLoadedCandidates ? (
        <button
          type="button"
          onClick={() => onLoadCandidates(row)}
          disabled={loading || saving}
          style={{
            width: "fit-content",
            border: "1px solid #B45309",
            borderRadius: "999px",
            backgroundColor: loading ? "#FEF3C7" : "#B45309",
            color: loading ? "#92400E" : "white",
            padding: "9px 14px",
            fontWeight: 900,
            cursor: loading || saving ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Loading current NXT code rows..." : `Review current ${write.sourceConstituency} code rows`}
        </button>
      ) : candidates.length ? (
        <div style={{ display: "grid", gap: "9px" }}>
          <div style={{ color: "#78350F", fontSize: "14px", fontWeight: 800 }}>
            Current NXT code candidates
          </div>
          {candidates.map((candidate) => (
            <div
              key={candidate.id}
              style={{
                border: "1px solid #FDE68A",
                borderRadius: "11px",
                backgroundColor: "white",
                padding: "11px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
                flexWrap: "wrap",
              }}
            >
              <div>
                <div style={{ color: "#111827", fontWeight: 900 }}>{candidate.label}</div>
                <div style={{ marginTop: "3px", color: "#6B7280", fontSize: "14px" }}>
                  Start: {formatCodeDate(candidate.startDate)} · End: {formatCodeDate(candidate.endDate)}
                </div>
                <div style={{ marginTop: "4px", color: "#92400E", fontSize: "12px", fontWeight: 800 }}>
                  NXT constituent-code ID {candidate.id}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onSelectCandidate(row, candidate.id)}
                disabled={saving || loading}
                style={{
                  border: "1px solid #B45309",
                  borderRadius: "999px",
                  backgroundColor: saving ? "#FEF3C7" : "white",
                  color: "#92400E",
                  padding: "8px 12px",
                  fontWeight: 900,
                  cursor: saving || loading ? "not-allowed" : "pointer",
                }}
              >
                {saving ? "Saving selection..." : "Use this NXT code"}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ color: "#92400E", fontWeight: 800 }}>
          No current NXT {write.sourceConstituency} code rows remain. Refresh the import preview before continuing.
        </div>
      )}
    </section>
  );
}

function getEducationClassYearReviewWrite(row) {
  return (row?.writePlan || []).find(
    (item) =>
      item?.type === "education_relationship" &&
      item?.requiresReview &&
      /Education Class Year must .*digits before it can be imported\./i.test(
        String(item?.validationMessage || ""),
      ),
  );
}

function EducationClassYearReviewPanel({
  row,
  draftValue,
  saving,
  onDraftChange,
  onSave,
}) {
  const write = getEducationClassYearReviewWrite(row);
  if (!write) return null;

  const validClassYear = /^\d{2}(\d{2})?$/.test(String(draftValue || "").trim());

  return (
    <section
      style={{
        border: "1px solid #FCD34D",
        borderRadius: "14px",
        backgroundColor: "#FFFBEB",
        padding: "14px",
        display: "grid",
        gap: "11px",
      }}
    >
      <div>
        <div style={{ color: "#92400E", fontSize: "12px", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Education class year review
        </div>
        <p style={{ margin: "5px 0 0", color: "#92400E", lineHeight: 1.45 }}>
          Your NXT configuration accepts both two- and four-digit class years. Confirm the CSV value
          below to clear this older review warning. This records the review decision only; it does
          not write to NXT until you send the record.
        </p>
      </div>

      <label style={{ display: "grid", gap: "6px", color: "#78350F", fontWeight: 900 }}>
        Confirm class year
        <input
          name={`education-class-year-${row.id}`}
          value={draftValue}
          inputMode="numeric"
          pattern="[0-9]{2}([0-9]{2})?"
          minLength={2}
          maxLength={4}
          placeholder="26 or 2026"
          onChange={(event) => onDraftChange(row, event.target.value)}
          disabled={saving}
          style={{
            maxWidth: "220px",
            border: "1px solid #F59E0B",
            borderRadius: "8px",
            backgroundColor: "white",
            padding: "9px 10px",
            color: "#111827",
            fontWeight: 800,
          }}
        />
      </label>

      <button
        type="button"
        onClick={() => onSave(row, draftValue)}
        disabled={saving || !validClassYear}
        style={{
          width: "fit-content",
          border: "1px solid #B45309",
          borderRadius: "999px",
          backgroundColor: saving || !validClassYear ? "#FEF3C7" : "#B45309",
          color: saving || !validClassYear ? "#92400E" : "white",
          padding: "9px 14px",
          fontWeight: 900,
          cursor: saving || !validClassYear ? "not-allowed" : "pointer",
        }}
      >
        {saving ? "Saving review..." : "Save review and unlock NXT send"}
      </button>
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

function CopyableHeaderCode({ children }) {
  const [copied, setCopied] = useState(false);

  async function copyHeader() {
    const text = String(children);

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
      }

      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // The header remains selectable if clipboard access is unavailable.
    }
  }

  return (
    <button
      type="button"
      onClick={copyHeader}
      aria-label={`Copy CSV header: ${children}`}
      title={`Copy ${children}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        border: "none",
        borderRadius: "8px",
        padding: 0,
        backgroundColor: "transparent",
        color: "inherit",
        cursor: "copy",
        userSelect: "text",
      }}
    >
      <HeaderCode>{children}</HeaderCode>
      <span
        aria-live="polite"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "3px",
          color: copied ? "#047857" : "#4F46E5",
          fontSize: "12px",
          fontWeight: 900,
          whiteSpace: "nowrap",
        }}
      >
        {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
        {copied ? "Copied" : "Copy"}
      </span>
    </button>
  );
}

const NXT_TABLE_SUGGESTION_FIELDS = new Set([
  "educationDegree",
  "educationSchoolType",
  "educationStatus",
  "educationMajor",
  "educationMinor",
]);

function CsvRowEditor({
  rowNumber,
  draft,
  fields,
  suggestions,
  loadingFieldKey,
  onChange,
  onFindSuggestions,
  onUseSuggestion,
  onSave,
  onCancel,
  saving,
}) {
  return (
    <section
      style={{
        border: "1px solid #A5B4FC",
        borderRadius: "12px",
        backgroundColor: "#F5F3FF",
        padding: "14px",
        display: "grid",
        gap: "12px",
      }}
    >
      <div>
        <div style={{ color: "#4338CA", fontWeight: 900 }}>Edit CSV values for this import review</div>
        <div style={{ marginTop: "4px", color: "#5B21B6", fontSize: "14px", lineHeight: 1.45 }}>
          Changes stay local to this import session. Save them to refresh this import review against NXT before any import run is saved.
        </div>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "12px",
        }}
      >
        {fields.map((field) => {
          const suggestionState = suggestions[field.key];
          const isTableField = NXT_TABLE_SUGGESTION_FIELDS.has(field.key);
          return (
            <div key={field.key} style={{ display: "grid", gap: "6px" }}>
              <label htmlFor={`import-row-${rowNumber}-${field.key}`} style={{ color: "#312E81", fontSize: "13px", fontWeight: 900 }}>
                {field.label}
              </label>
              <input
                id={`import-row-${rowNumber}-${field.key}`}
                name={`import-row-${rowNumber}-${field.key}`}
                value={draft[field.header] || ""}
                onChange={(event) => onChange(field.header, event.target.value)}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  border: "1px solid #C7D2FE",
                  borderRadius: "9px",
                  backgroundColor: "white",
                  padding: "9px 10px",
                  color: "#111827",
                }}
              />
              {isTableField ? (
                <div style={{ display: "grid", gap: "6px" }}>
                  <button
                    type="button"
                    onClick={() => onFindSuggestions(field)}
                    disabled={loadingFieldKey === field.key || !(draft[field.header] || "").trim()}
                    style={{
                      justifySelf: "start",
                      border: "1px solid #818CF8",
                      borderRadius: "999px",
                      backgroundColor: "white",
                      color: "#4338CA",
                      padding: "6px 9px",
                      fontSize: "12px",
                      fontWeight: 900,
                      cursor: loadingFieldKey === field.key ? "not-allowed" : "pointer",
                    }}
                  >
                    {loadingFieldKey === field.key ? "Checking NXT..." : "Find NXT matches"}
                  </button>
                  {suggestionState?.error ? (
                    <div style={{ color: "#B91C1C", fontSize: "12px", lineHeight: 1.4 }}>
                      {suggestionState.error}
                    </div>
                  ) : null}
                  {suggestionState?.message ? (
                    <div style={{ color: "#5B21B6", fontSize: "12px", lineHeight: 1.4 }}>
                      {suggestionState.message}
                    </div>
                  ) : null}
                  {suggestionState?.suggestions?.length ? (
                    <div style={{ display: "grid", gap: "5px" }}>
                      {suggestionState.suggestions.map((suggestion) => (
                        <button
                          key={suggestion.value}
                          type="button"
                          onClick={() => onUseSuggestion(field.header, suggestion.value)}
                          style={{
                            border: "1px solid #C7D2FE",
                            borderRadius: "8px",
                            backgroundColor: "#EEF2FF",
                            color: "#312E81",
                            padding: "7px 8px",
                            textAlign: "left",
                            cursor: "pointer",
                            fontWeight: 800,
                          }}
                        >
                          Use {suggestion.value}
                          {suggestion.exact ? " (exact match)" : ` (${suggestion.confidence}% match)`}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          style={{
            border: "1px solid #4338CA",
            borderRadius: "999px",
            backgroundColor: saving ? "#C7D2FE" : "#4F46E5",
            color: "white",
            padding: "9px 14px",
            fontWeight: 900,
            cursor: saving ? "not-allowed" : "pointer",
          }}
        >
          {saving ? "Refreshing import review..." : "Save changes and refresh review"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          style={{
            border: "1px solid #C7D2FE",
            borderRadius: "999px",
            backgroundColor: "white",
            color: "#4338CA",
            padding: "9px 14px",
            fontWeight: 900,
            cursor: saving ? "not-allowed" : "pointer",
          }}
        >
          Cancel edits
        </button>
      </div>
    </section>
  );
}

function isUnresolvedImportRow(row) {
  return row?.status !== "Applied" && row?.status !== "Skipped";
}

function getRowReviewRequirements(row) {
  const reasons = [
    ...(Array.isArray(row?.reasons) ? row.reasons : []),
    ...((row?.writePlan || [])
      .filter((write) => write?.requiresReview)
      .map((write) => write.validationMessage || formatWritePlanItem(write))),
  ]
    .map((reason) => String(reason || "").trim())
    .filter(Boolean);

  return [...new Set(reasons)];
}

function getRowReviewTargetKey(requirements) {
  const requirementText = requirements.join(" ").toLowerCase();
  if (requirementText.includes("constituent-code row")) return "constituency-target";
  if (requirementText.includes("education class year")) return "education-class-year";
  if (requirementText.includes("education")) return "education-target";
  if (/email|phone|address/.test(requirementText)) return "contact-review";
  if (/first name|last name|preferred name|title|gender|ethnicity|birth date|suffix|addressee|salutation/.test(requirementText)) {
    return "profile-review";
  }
  return "review-summary";
}

function getReviewQueueRows(rows) {
  return Array.isArray(rows) ? rows.filter(isUnresolvedImportRow) : [];
}

function getImportRowLabel(row) {
  return (
    row?.input?.constituentName ||
    row?.match?.name ||
    row?.input?.lookupId ||
    row?.input?.blackbaudConstituentId ||
    "this constituent"
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
  const [useHierarchy, setUseHierarchy] = useState(false);
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
  const [fieldDecisions, setFieldDecisions] = useState({});
  const [fieldDecisionsDirty, setFieldDecisionsDirty] = useState(false);
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
  const [directSendingRowNumber, setDirectSendingRowNumber] = useState(null);
  const [selectedApplyRowIds, setSelectedApplyRowIds] = useState([]);
  const [showBatchTools, setShowBatchTools] = useState(false);
  const [reviewMode, setReviewMode] = useState(true);
  const [focusedRowId, setFocusedRowId] = useState("");
  const [reconcilingRun, setReconcilingRun] = useState(false);
  const [creatingRowId, setCreatingRowId] = useState("");
  const [retryingRowId, setRetryingRowId] = useState("");
  const [skippingRowId, setSkippingRowId] = useState("");
  const [editingPreviewRowNumber, setEditingPreviewRowNumber] = useState(null);
  const [editingRowDraft, setEditingRowDraft] = useState({});
  const [tableSuggestions, setTableSuggestions] = useState({});
  const [loadingSuggestionFieldKey, setLoadingSuggestionFieldKey] = useState("");
  const [educationCandidatesByRowId, setEducationCandidatesByRowId] = useState({});
  const [selectedEducationCandidateByRowId, setSelectedEducationCandidateByRowId] = useState({});
  const [loadingEducationCandidateRowId, setLoadingEducationCandidateRowId] = useState("");
  const [savingEducationTargetRowId, setSavingEducationTargetRowId] = useState("");
  const [constituencyCandidatesByRowId, setConstituencyCandidatesByRowId] = useState({});
  const [loadingConstituencyCandidateRowId, setLoadingConstituencyCandidateRowId] = useState("");
  const [savingConstituencyTargetRowId, setSavingConstituencyTargetRowId] = useState("");
  const [educationClassYearDrafts, setEducationClassYearDrafts] = useState({});
  const [savingEducationClassYearRowId, setSavingEducationClassYearRowId] = useState("");

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
      activeFields.educationMinor ||
      activeFields.educationSchoolType ||
      activeFields.educationCampus ||
      activeFields.educationFraternitySorority ||
      activeFields.educationGpa ||
      activeFields.educationClassYear ||
      activeFields.educationStatus ||
      activeFields.educationDateGraduated ||
      activeFields.educationDateEntered ||
      activeFields.educationDateLeft,
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
    activeFields.title || activeFields.gender || activeFields.ethnicity || activeFields.birthDate || activeFields.suffix,
  );
  const emailFieldsActive = Boolean(activeFields.email || activeFields.email2);
  const phoneFieldsActive = Boolean(activeFields.phoneNumber || activeFields.phone2Number);
  const addressFieldsActive = Boolean(
    activeFields.addressType || activeFields.addressValidFrom || activeFields.addressLine1,
  );
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
        hasUploadedHeader("ethnicity") ||
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
      hasUploadedHeader("educationMinor") ||
      hasUploadedHeader("educationSchoolType") ||
      hasUploadedHeader("educationCampus") ||
      hasUploadedHeader("educationFraternitySorority") ||
      hasUploadedHeader("educationGpa") ||
      hasUploadedHeader("educationClassYear") ||
      hasUploadedHeader("educationStatus") ||
      hasUploadedHeader("educationDateGraduated") ||
      hasUploadedHeader("educationDateEntered") ||
      hasUploadedHeader("educationDateLeft") ||
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
  const readyApplyRows =
    preview?.savedRun && Array.isArray(preview?.rows)
      ? preview.rows.filter((row) => row.status === "Ready" && !row.appliedAt)
      : [];
  const readySavedRows = readyApplyRows.length;
  const selectedApplyRows = readyApplyRows.filter((row) =>
    selectedApplyRowIds.includes(String(row.id)),
  );
  const selectedApplyWriteCount = selectedApplyRows.reduce(
    (count, row) => count + (Array.isArray(row.writePlan) ? row.writePlan.length : 0),
    0,
  );
  const appliedReconciliationRows =
    preview?.savedRun && Array.isArray(preview?.rows)
      ? preview.rows.filter((row) => row.status === "Applied" && row.appliedAt)
      : [];
  const unverifiedReconciliationRows = appliedReconciliationRows.filter(
    (row) => !row.blackbaudResult?.reconciliation?.verifiedAt,
  );
  const potentialNewRows =
    preview?.savedRun && Array.isArray(preview?.rows)
      ? preview.rows.filter(
          (row) =>
            row.intentDisposition?.key === "potential_new" &&
            !row.createdBlackbaudConstituentId,
        ).length
      : 0;
  const importRows = Array.isArray(preview?.rows) ? preview.rows : [];
  const reviewQueueRows = preview?.savedRun ? getReviewQueueRows(importRows) : [];
  const reviewNavigationRows = reviewQueueRows.length ? reviewQueueRows : importRows;
  const rowsNeedingAttention = reviewQueueRows.filter((row) => row.status !== "Ready").length;
  const progressReviewRows = preview?.savedRun
    ? reviewQueueRows
    : importRows.filter(isUnresolvedImportRow);
  const progressRowsNeedingAttention = progressReviewRows.filter(
    (row) => row.status !== "Ready",
  ).length;
  const verifiedReconciliationRows = appliedReconciliationRows.filter(
    (row) => row.blackbaudResult?.reconciliation?.verifiedAt,
  );
  const focusedReviewRow =
    reviewNavigationRows.find((row) => String(row.id) === String(focusedRowId)) ||
    reviewNavigationRows[0] ||
    null;
  const focusedReviewRowIndex = focusedReviewRow
    ? reviewNavigationRows.findIndex((row) => String(row.id) === String(focusedReviewRow.id))
    : -1;
  const visiblePreviewRows =
    preview?.savedRun && reviewMode && focusedReviewRow ? [focusedReviewRow] : importRows;
  const readyProgressRows = preview?.savedRun
    ? readySavedRows
    : Number(preview?.summary?.ready || 0);
  const nextProgressRow =
    progressReviewRows.find((row) => row.status !== "Ready") ||
    readyApplyRows[0] ||
    reviewNavigationRows[0] ||
    null;

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
    const detectedIndividualProfileHeaders = getDetectedHeaders(
      parsedHeaderSet,
      INDIVIDUAL_PROFILE_FIELD_KEYS,
    );
    const detectedNameFormatHeaders = getDetectedHeaders(parsedHeaderSet, NAME_FORMAT_FIELD_KEYS);
    const detectedEmailHeaders = getDetectedHeaders(parsedHeaderSet, EMAIL_FIELD_KEYS);
    const detectedPhoneHeaders = getDetectedHeaders(parsedHeaderSet, PHONE_FIELD_KEYS);
    const detectedAddressHeaders = getDetectedHeaders(parsedHeaderSet, ADDRESS_FIELD_KEYS);
    const hasDirectNxtIdentifier = Boolean(
      FIELD_BY_KEY.blackbaudConstituentId &&
        parsedHeaderSet.has(FIELD_BY_KEY.blackbaudConstituentId.header),
    ) || Boolean(FIELD_BY_KEY.lookupId && parsedHeaderSet.has(FIELD_BY_KEY.lookupId.header));
    const detectedOperations = [];
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
    // These fields are unambiguous profile changes, unlike first and last name, which may only
    // be present to match a record. Selecting the review operation lets the user preview them.
    if (detectedIndividualProfileHeaders.length) {
      setUpdateIndividualProfileFields(true);
      detectedOperations.push("individual profile updates");
    }
    if (detectedNameFormatHeaders.length) {
      setUpdateNameFormatFields(true);
      detectedOperations.push("addressee and salutation updates");
    }
    // Email, phone, and address can be used to find a record. Only select their update
    // operations automatically when the same CSV has a direct NXT identifier.
    if (hasDirectNxtIdentifier && detectedEmailHeaders.length) {
      setUpdateEmailFields(true);
      detectedOperations.push("email updates");
    }
    if (hasDirectNxtIdentifier && detectedPhoneHeaders.length) {
      setUpdatePhoneFields(true);
      detectedOperations.push("phone updates");
    }
    if (hasDirectNxtIdentifier && detectedAddressHeaders.length) {
      setUpdateAddressFields(true);
      detectedOperations.push("address updates");
    }
    if (hasDirectNxtIdentifier && parsedHeaderSet.has(FIELD_BY_KEY.preferredName.header)) {
      setUpdateNameFields(true);
      detectedOperations.push("preferred-name updates");
    }
    setPreview(null);
    setSaveMessage("");
    if (parsed.errors.length > 0) {
      setParseMessage(`Parsed ${parsed.rows.length} rows with ${parsed.errors.length} CSV warning(s).`);
    } else {
      setParseMessage(
        parsed.rows.length
          ? detectedOperations.length
            ? `Parsed ${parsed.rows.length} rows. Auto-selected ${detectedOperations.join(", ")} from the CSV headers.`
            : `Parsed ${parsed.rows.length} rows.`
          : "",
      );
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
      setUseHierarchy(false);
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

  function updateContactSectionDecision(rowNumber, kind, change) {
    setContactDecisions((current) => {
      const rowKey = String(rowNumber);
      const rowDecisions = current[rowKey] || {};
      const kindDecisions = rowDecisions[kind] || {};
      return {
        ...current,
        [rowKey]: {
          ...rowDecisions,
          [kind]: {
            ...kindDecisions,
            __section: {
              ...(kindDecisions.__section || {}),
              ...change,
            },
          },
        },
      };
    });
    setContactDecisionsDirty(true);
    setSaveMessage("");
  }

  function updateFieldDecision(rowNumber, writeType, field, change) {
    setFieldDecisions((current) => {
      const rowKey = String(rowNumber);
      return {
        ...current,
        [rowKey]: {
          ...(current[rowKey] || {}),
          [writeType]: {
            ...(current[rowKey]?.[writeType] || {}),
            [field]: {
              ...(current[rowKey]?.[writeType]?.[field] || {}),
              ...change,
            },
          },
        },
      };
    });
    setFieldDecisionsDirty(true);
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
    setFocusedRowId("");
    setReviewMode(false);
    setEditingPreviewRowNumber(null);
    setEditingRowDraft({});
    setTableSuggestions({});
    setEducationClassYearDrafts({});
    setLoadingSuggestionFieldKey("");
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
      setUseHierarchy(false);
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
    setSelectedApplyRowIds([]);
    setFocusedRowId("");
    setEditingPreviewRowNumber(null);
    setEditingRowDraft({});
    setTableSuggestions({});
    setEducationClassYearDrafts({});
    setLoadingSuggestionFieldKey("");
    setShowBatchTools(false);
    setReviewMode(true);
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
        throw new Error(payload?.error || "Failed to load saved import runs");
      }
      setSavedRuns(Array.isArray(payload?.runs) ? payload.runs : []);
    } catch (savedRunError) {
      setError(
        savedRunError instanceof Error
          ? savedRunError.message
          : "Failed to load saved import runs",
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
        throw new Error(payload?.error || "Failed to load saved import run");
      }
      setPreview(payload);
      setSelectedApplyRowIds([]);
      setFocusedRowId(String(getReviewQueueRows(payload?.rows)[0]?.id || payload?.rows?.[0]?.id || ""));
      setReviewMode(true);
      setEditingPreviewRowNumber(null);
      setEditingRowDraft({});
      setTableSuggestions({});
      setEducationCandidatesByRowId({});
      setSelectedEducationCandidateByRowId({});
      setConstituencyCandidatesByRowId({});
      setEducationClassYearDrafts({});
      setSaveMessage(`Loaded saved import run #${payload?.savedRun?.id || runId}.`);
      return payload;
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Failed to load saved import run",
      );
      return null;
    } finally {
      setLoadingRunId("");
    }
  }

  function toggleApplyRow(rowId) {
    const normalizedRowId = String(rowId);
    setSelectedApplyRowIds((current) =>
      current.includes(normalizedRowId)
        ? current.filter((candidate) => candidate !== normalizedRowId)
        : [...current, normalizedRowId],
    );
  }

  function selectAllReadyRows() {
    setSelectedApplyRowIds(readyApplyRows.map((row) => String(row.id)));
  }

  function focusImportRowState(row) {
    if (!row?.id) return;
    preloadRequiredReviewChoices(row);
    setFocusedRowId(String(row.id));
    setReviewMode(true);
    window.setTimeout(() => {
      document
        .getElementById("constituency-import-current-row")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }

  function focusImportRow(rowId) {
    if (!rowId) return;
    const row = (preview?.rows || []).find((candidate) => String(candidate.id) === String(rowId));
    focusImportRowState(row);
  }

  function preloadRequiredReviewChoices(row, runIdOverride = null) {
    if (!row?.id) return;
    const writePlan = Array.isArray(row.writePlan) ? row.writePlan : [];
    if (
      !Array.isArray(educationCandidatesByRowId[String(row.id)]) &&
      writePlan.some(
        (item) =>
          item?.type === "education_relationship" && item?.action === "review_existing",
      )
    ) {
      void loadEducationCandidates(row, runIdOverride);
    }
    if (
      !Array.isArray(constituencyCandidatesByRowId[String(row.id)]) &&
      writePlan.some(
        (item) => item?.type === "constituent_code" && item?.action === "replace",
      )
    ) {
      void loadConstituencyCandidates(row, runIdOverride);
    }
  }

  function focusRowReviewTarget(row, targetKey, runIdOverride = null) {
    if (!row?.id || !targetKey) return;
    if (
      targetKey === "education-target" &&
      !Array.isArray(educationCandidatesByRowId[String(row?.id)])
    ) {
      void loadEducationCandidates(row, runIdOverride);
    }
    if (
      targetKey === "constituency-target" &&
      !Array.isArray(constituencyCandidatesByRowId[String(row?.id)])
    ) {
      void loadConstituencyCandidates(row, runIdOverride);
    }
    const targetId = `constituency-import-row-${row.id}-${targetKey}`;
    window.setTimeout(() => {
      document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);
  }

  function findSavedRow(savedPayload, sourceRow) {
    return (savedPayload?.rows || []).find(
      (candidate) => Number(candidate?.rowNumber) === Number(sourceRow?.rowNumber),
    );
  }

  function openRemainingRequiredReview(row, runIdOverride = null) {
    if (!row?.id) return;
    preloadRequiredReviewChoices(row, runIdOverride);
    const targetKey = getRowReviewTargetKey(getRowReviewRequirements(row));
    if (targetKey) {
      focusRowReviewTarget(row, targetKey, runIdOverride);
    }
  }

  async function startRequiredReview(row, requestedTargetKey = "") {
    if (!row || savingRun || previewing) return;

    if (preview?.savedRun?.id) {
      focusImportRow(row.id);
      openRemainingRequiredReview(row);
      return;
    }

    const savedPayload = await requestPreview({ saveRun: true, scrollToResults: false });
    const savedRunId = savedPayload?.savedRun?.id;
    const savedRow = findSavedRow(savedPayload, row);
    if (!savedRunId || !savedRow?.id) {
      setError(
        "The review run could not be saved. Please try again before selecting the NXT rows to update.",
      );
      return;
    }

    setFocusedRowId(String(savedRow.id));
    setReviewMode(true);
    const targetKey = getRowReviewTargetKey(getRowReviewRequirements(savedRow)) || requestedTargetKey;
    preloadRequiredReviewChoices(savedRow, savedRunId);
    focusRowReviewTarget(savedRow, targetKey, savedRunId);
    setSaveMessage(
      `Saved import run #${savedRunId}. No NXT records were changed. Complete the required NXT row selections below before sending this record.`,
    );
  }

  function navigateImportRows(direction) {
    if (!reviewNavigationRows.length) return;
    const currentIndex = Math.max(0, focusedReviewRowIndex);
    const targetIndex =
      (currentIndex + direction + reviewNavigationRows.length) % reviewNavigationRows.length;
    focusImportRow(reviewNavigationRows[targetIndex]?.id);
  }

  function focusNextUnresolvedRow(rowsToReview, currentRowId) {
    const allRows = Array.isArray(rowsToReview) ? rowsToReview : [];
    const currentIndex = allRows.findIndex((row) => String(row.id) === String(currentRowId));
    for (let offset = 1; offset <= allRows.length; offset += 1) {
      const candidate = allRows[(Math.max(currentIndex, -1) + offset) % allRows.length];
      if (candidate && isUnresolvedImportRow(candidate)) {
        focusImportRowState(candidate);
        return;
      }
    }
    focusImportRowState(allRows[currentIndex] || allRows[0]);
  }

  function beginPreviewRowEdit(row) {
    if (preview?.savedRun) {
      setError("Saved import runs are immutable. Upload the CSV again to make a corrected import review while keeping this run as the audit record.");
      return;
    }
    const rowNumber = Number(row?.rowNumber);
    const sourceRow = Number.isInteger(rowNumber) ? rows[rowNumber - 1] : null;
    if (!sourceRow) {
      setError("This CSV row is no longer available to edit. Upload the file again and create a new import review.");
      return;
    }
    setError("");
    setSaveMessage("");
    setEditingPreviewRowNumber(rowNumber);
    setEditingRowDraft({ ...sourceRow });
    setTableSuggestions({});
  }

  function cancelPreviewRowEdit() {
    setEditingPreviewRowNumber(null);
    setEditingRowDraft({});
    setTableSuggestions({});
    setLoadingSuggestionFieldKey("");
  }

  function updatePreviewRowDraft(header, value) {
    setEditingRowDraft((current) => ({ ...current, [header]: value }));
    setTableSuggestions((current) => {
      const next = { ...current };
      const mappedField = selectedFields.find((field) => field.header === header);
      if (mappedField) delete next[mappedField.key];
      return next;
    });
  }

  async function findNxtTableSuggestions(field) {
    const value = String(editingRowDraft[field.header] || "").trim();
    if (!value) return;
    setLoadingSuggestionFieldKey(field.key);
    setTableSuggestions((current) => ({ ...current, [field.key]: null }));
    try {
      const response = await fetch("/api/constituency-import/table-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fieldKey: field.key, value }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Could not load NXT table suggestions.");
      }
      setTableSuggestions((current) => ({ ...current, [field.key]: payload }));
    } catch (suggestionError) {
      setTableSuggestions((current) => ({
        ...current,
        [field.key]: {
          suggestions: [],
          error:
            suggestionError instanceof Error
              ? suggestionError.message
              : "Could not load NXT table suggestions.",
        },
      }));
    } finally {
      setLoadingSuggestionFieldKey("");
    }
  }

  async function savePreviewRowEdits() {
    const rowNumber = Number(editingPreviewRowNumber);
    if (!Number.isInteger(rowNumber) || rowNumber < 1 || previewing) return;
    const nextRows = rows.map((row, index) =>
      index === rowNumber - 1 ? { ...editingRowDraft } : row,
    );
    setRows(nextRows);
    await requestPreview({
      rowsOverride: nextRows,
      successMessage: `Updated row ${rowNumber} and refreshed the import review against current NXT data. Review the new staged writes before saving an import run.`,
    });
  }

  async function applyRowsToNxt(
    rowsToApply,
    { singleRecord = false, runIdOverride = null, skipConfirmation = false } = {},
  ) {
    const runId = runIdOverride || preview?.savedRun?.id;
    if (!runId || applyingRun || !rowsToApply.length) return;

    const writeCount = rowsToApply.reduce(
      (count, row) => count + (Array.isArray(row.writePlan) ? row.writePlan.length : 0),
      0,
    );
    const displayName = getImportRowLabel(rowsToApply[0]);
    const message = singleRecord
      ? `Send ${displayName} to Raiser's Edge NXT now? This will apply ${writeCount} staged NXT write${writeCount === 1 ? "" : "s"}. The write result and audit trail will stay in import run #${runId}.`
      : `Import ${rowsToApply.length} selected row${rowsToApply.length === 1 ? "" : "s"} and ${writeCount} staged NXT write${writeCount === 1 ? "" : "s"} to Raiser's Edge NXT now? This may update constituent codes, add-only education and organization relationships, selected individual fields, custom primary addressees/salutations, and reviewed contact information. Contact replacements preserve the selected NXT type and primary setting. Replacing a constituent code removes only the reviewed current NXT code row, including its dates, then creates the new code with the CSV dates; all other codes remain unchanged. End-date rows require an end date. Organization relationships require one exact existing NXT organization; ambiguous or missing matches stay in review.`;

    if (!skipConfirmation) {
      const shouldApply = window.confirm(message);
      if (!shouldApply) return;
    }

    setApplyingRun(true);
    setError("");
    setSaveMessage("");
    try {
      const response = await fetch(`/api/constituency-import/runs/${encodeURIComponent(runId)}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rowIds: rowsToApply.map((row) => String(row.id)) }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        if (payload?.savedRun) {
          setPreview(payload);
          setSelectedApplyRowIds([]);
        }
        throw new Error(
          payload?.error || payload?.applySummary?.message || "Failed to apply saved import run",
        );
      }

      const applied = Number(payload?.applySummary?.applied || 0);
      const manualRequired = Number(payload?.applySummary?.manualRequired || 0);
      const failed = Number(payload?.applySummary?.failed || 0);
      const fullyApplied =
        applied > 0 &&
        manualRequired === 0 &&
        failed === 0 &&
        payload?.savedRun?.status === "applied";
      const singleRecordApplied =
        singleRecord && applied > 0 && manualRequired === 0 && failed === 0;

      setPreview(payload);
      setSelectedApplyRowIds([]);
      if (singleRecordApplied) {
        focusNextUnresolvedRow(payload?.rows, rowsToApply[0]?.id);
      }
      setSaveMessage(
        singleRecordApplied
          ? `${displayName} was updated in Raiser's Edge NXT. Its write result and audit trail remain in import run #${runId}.`
          : fullyApplied
          ? `Import complete. ${applied} row${applied === 1 ? " was" : "s were"} updated in Raiser's Edge NXT. You can optionally verify the imported rows against current NXT data.`
          : payload?.applySummary?.message || `Applied import run #${runId}.`,
      );
      fetchSavedRuns();
    } catch (applyError) {
      setError(
        applyError instanceof Error ? applyError.message : "Failed to apply saved import run",
      );
    } finally {
      setApplyingRun(false);
    }
  }

  async function applySavedRun() {
    await applyRowsToNxt(selectedApplyRows);
  }

  async function applySingleRow(row) {
    if (row?.status !== "Ready" || row?.appliedAt) return;
    await applyRowsToNxt([row], { singleRecord: true });
  }

  async function confirmAndSendPreviewRow(row) {
    if (
      !row ||
      preview?.savedRun ||
      row.status !== "Ready" ||
      !Array.isArray(row.writePlan) ||
      !row.writePlan.length ||
      contactDecisionsDirty ||
      fieldDecisionsDirty ||
      savingRun ||
      applyingRun ||
      directSendingRowNumber
    ) {
      return;
    }

    const displayName = getImportRowLabel(row);
    const writeCount = row.writePlan.length;
    const shouldSend = window.confirm(
      `Confirm the reviewed changes and send ${displayName} to Raiser's Edge NXT now? This will save an audit record for the full CSV, then apply only this row's ${writeCount} staged NXT write${writeCount === 1 ? "" : "s"}. All other rows will remain available for later review or batch import.`,
    );
    if (!shouldSend) return;

    setDirectSendingRowNumber(Number(row.rowNumber));
    try {
      const savedPayload = await requestPreview({ saveRun: true, scrollToResults: false });
      const savedRow = savedPayload?.rows?.find(
        (candidate) => Number(candidate?.rowNumber) === Number(row.rowNumber),
      );
      const savedRunId = savedPayload?.savedRun?.id;

      if (!savedRunId || !savedRow) {
        setError(
          "The review was saved, but the selected row could not be found in the saved run. Reopen the run and review it before sending to NXT.",
        );
        return;
      }
      if (savedRow.status !== "Ready" || savedRow.appliedAt) {
        setError(
          `${displayName} was saved in import run #${savedRunId}, but it still needs the highlighted review before it can be sent to NXT. No NXT changes were made.`,
        );
        return;
      }

      await applyRowsToNxt([savedRow], {
        singleRecord: true,
        runIdOverride: savedRunId,
        skipConfirmation: true,
      });
    } finally {
      setDirectSendingRowNumber(null);
    }
  }

  async function loadEducationCandidates(row, runIdOverride = null) {
    const runId = runIdOverride || preview?.savedRun?.id;
    if (!runId || !row?.id || loadingEducationCandidateRowId || savingEducationTargetRowId) return;

    setLoadingEducationCandidateRowId(String(row.id));
    setError("");
    try {
      const response = await fetch(
        `/api/constituency-import/runs/${encodeURIComponent(runId)}/rows/${encodeURIComponent(row.id)}/education-target`,
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Could not load current NXT education rows.");
      }
      setEducationCandidatesByRowId((current) => ({
        ...current,
        [String(row.id)]: Array.isArray(payload?.candidates) ? payload.candidates : [],
      }));
      setSelectedEducationCandidateByRowId((current) => ({
        ...current,
        [String(row.id)]: "",
      }));
    } catch (candidateError) {
      setError(
        candidateError instanceof Error
          ? candidateError.message
          : "Could not load current NXT education rows.",
      );
    } finally {
      setLoadingEducationCandidateRowId("");
    }
  }

  async function selectEducationTarget(row, educationId) {
    const runId = preview?.savedRun?.id;
    if (!runId || !row?.id || !educationId || savingEducationTargetRowId) return;

    setSavingEducationTargetRowId(String(row.id));
    setError("");
    setSaveMessage("");
    try {
      const response = await fetch(
        `/api/constituency-import/runs/${encodeURIComponent(runId)}/rows/${encodeURIComponent(row.id)}/education-target`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ educationId }),
        },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Could not save the NXT education-row selection.");
      }

      setEducationCandidatesByRowId({});
      const savedPayload = await loadSavedRun(runId);
      const savedRow = findSavedRow(savedPayload, row);
      if (savedRow) openRemainingRequiredReview(savedRow, runId);
      setSaveMessage(
        payload?.message ||
          "Saved the NXT education-row selection. Continue with any remaining required review below.",
      );
      fetchSavedRuns();
    } catch (selectionError) {
      setError(
        selectionError instanceof Error
          ? selectionError.message
          : "Could not save the NXT education-row selection.",
      );
    } finally {
      setSavingEducationTargetRowId("");
    }
  }

  function chooseEducationCandidate(row, educationId) {
    if (!row?.id || !educationId) return;
    setSelectedEducationCandidateByRowId((current) => ({
      ...current,
      [String(row.id)]: String(educationId),
    }));
  }

  async function loadConstituencyCandidates(row, runIdOverride = null) {
    const runId = runIdOverride || preview?.savedRun?.id;
    if (
      !runId ||
      !row?.id ||
      loadingConstituencyCandidateRowId ||
      savingConstituencyTargetRowId
    ) {
      return;
    }

    setLoadingConstituencyCandidateRowId(String(row.id));
    setError("");
    try {
      const response = await fetch(
        `/api/constituency-import/runs/${encodeURIComponent(runId)}/rows/${encodeURIComponent(row.id)}/constituency-target`,
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Could not load current NXT constituent-code rows.");
      }
      setConstituencyCandidatesByRowId((current) => ({
        ...current,
        [String(row.id)]: Array.isArray(payload?.candidates) ? payload.candidates : [],
      }));
    } catch (candidateError) {
      setError(
        candidateError instanceof Error
          ? candidateError.message
          : "Could not load current NXT constituent-code rows.",
      );
    } finally {
      setLoadingConstituencyCandidateRowId("");
    }
  }

  async function selectConstituencyTarget(row, constituentCodeId) {
    const runId = preview?.savedRun?.id;
    if (!runId || !row?.id || !constituentCodeId || savingConstituencyTargetRowId) return;

    setSavingConstituencyTargetRowId(String(row.id));
    setError("");
    setSaveMessage("");
    try {
      const response = await fetch(
        `/api/constituency-import/runs/${encodeURIComponent(runId)}/rows/${encodeURIComponent(row.id)}/constituency-target`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ constituentCodeId }),
        },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Could not save the NXT constituent-code selection.");
      }

      setConstituencyCandidatesByRowId({});
      const savedPayload = await loadSavedRun(runId);
      const savedRow = findSavedRow(savedPayload, row);
      if (savedRow) openRemainingRequiredReview(savedRow, runId);
      setSaveMessage(
        payload?.message ||
          "Saved the current NXT constituent-code selection. Continue with any remaining required review below.",
      );
      fetchSavedRuns();
    } catch (selectionError) {
      setError(
        selectionError instanceof Error
          ? selectionError.message
          : "Could not save the NXT constituent-code selection.",
      );
    } finally {
      setSavingConstituencyTargetRowId("");
    }
  }

  function updateEducationClassYearDraft(row, value) {
    if (!row?.id) return;
    setEducationClassYearDrafts((current) => ({
      ...current,
      [String(row.id)]: String(value || ""),
    }));
  }

  async function saveEducationClassYear(row, classYear) {
    const runId = preview?.savedRun?.id;
    const normalizedClassYear = String(classYear || "").trim();
    if (
      !runId ||
      !row?.id ||
      !/^\d{2}(\d{2})?$/.test(normalizedClassYear) ||
      savingEducationClassYearRowId
    ) {
      return;
    }

    setSavingEducationClassYearRowId(String(row.id));
    setError("");
    setSaveMessage("");
    try {
      const response = await fetch(
        `/api/constituency-import/runs/${encodeURIComponent(runId)}/rows/${encodeURIComponent(row.id)}/education-class-year`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ classYear: normalizedClassYear }),
        },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Could not save the Education Class Year review.");
      }

      setEducationClassYearDrafts((current) => {
        const next = { ...current };
        delete next[String(row.id)];
        return next;
      });
      await loadSavedRun(runId);
      setSaveMessage(payload?.message || "Saved the Education Class Year review.");
      fetchSavedRuns();
    } catch (classYearError) {
      setError(
        classYearError instanceof Error
          ? classYearError.message
          : "Could not save the Education Class Year review.",
      );
    } finally {
      setSavingEducationClassYearRowId("");
    }
  }

  async function reconcileRows(rowsToVerify, { singleRecord = false } = {}) {
    const runId = preview?.savedRun?.id;
    if (!runId || reconcilingRun || !rowsToVerify.length) return;

    const shouldVerify = window.confirm(
      singleRecord
        ? `Verify ${getImportRowLabel(rowsToVerify[0])} against current Raiser's Edge NXT data? This only reads NXT and records the result in import run #${runId}; it will not make any NXT changes.`
        : `Verify ${rowsToVerify.length} imported row${rowsToVerify.length === 1 ? "" : "s"} against current Raiser's Edge NXT data? This only reads NXT and records a JUMGOGPT verification audit; it will not write or change any constituent record.`,
    );
    if (!shouldVerify) return;

    setReconcilingRun(true);
    setError("");
    setSaveMessage("");
    try {
      const response = await fetch(`/api/constituency-import/runs/${encodeURIComponent(runId)}/reconcile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rowIds: rowsToVerify.map((row) => String(row.id)) }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to verify the import run in NXT");
      }

      const reconciliations = new Map(
        (payload?.rows || []).map((row) => [String(row.id), row.reconciliation]),
      );
      setPreview((current) =>
        current
          ? {
              ...current,
              rows: current.rows.map((row) => {
                const reconciliation = reconciliations.get(String(row.id));
                return reconciliation
                  ? {
                      ...row,
                      blackbaudResult: {
                        ...(row.blackbaudResult || {}),
                        reconciliation,
                      },
                    }
                  : row;
              }),
            }
          : current,
      );
      setSaveMessage(
        singleRecord
          ? `${getImportRowLabel(rowsToVerify[0])} was checked against current NXT data. The verification audit remains in import run #${runId}.`
          : payload?.reconciliationSummary?.message || "NXT verification completed.",
      );
    } catch (reconciliationError) {
      setError(
        reconciliationError instanceof Error
          ? reconciliationError.message
          : "Failed to verify the import run in NXT",
      );
    } finally {
      setReconcilingRun(false);
    }
  }

  async function reconcileAppliedRows() {
    await reconcileRows(unverifiedReconciliationRows);
  }

  async function reconcileSingleRow(row) {
    if (!row?.appliedAt || row?.blackbaudResult?.reconciliation?.verifiedAt) return;
    await reconcileRows([row], { singleRecord: true });
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

  async function retryFailedWrites(row) {
    const runId = preview?.savedRun?.id;
    if (!runId || !row?.id || retryingRowId) return;

    const failedWrites = Array.isArray(row.blackbaudResult?.results)
      ? row.blackbaudResult.results.filter(
          (result) => result?.status === "failed" && Number.isInteger(result?.writeIndex),
        )
      : [];
    if (!failedWrites.length) {
      setError(
        "This failed row does not have a write-level retry record. Refresh the source row and compare it with NXT before applying it again.",
      );
      return;
    }

    const displayName = row.input?.constituentName || "this constituent";
    const confirmed = window.confirm(
      `Retry ${failedWrites.length} failed NXT write${failedWrites.length === 1 ? "" : "s"} for ${displayName}? Writes that previously succeeded will not be run again.`,
    );
    if (!confirmed) return;

    setRetryingRowId(String(row.id));
    setError("");
    setSaveMessage("");
    try {
      const response = await fetch(
        `/api/constituency-import/runs/${encodeURIComponent(runId)}/apply?retryRowId=${encodeURIComponent(row.id)}`,
        { method: "POST" },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.applySummary?.message || payload?.error || "Failed to retry the NXT write");
      }
      setPreview(payload);
      setSaveMessage(payload?.applySummary?.message || `Retried failed writes for ${displayName}.`);
      fetchSavedRuns();
    } catch (retryError) {
      await loadSavedRun(runId);
      setError(retryError instanceof Error ? retryError.message : "Failed to retry the NXT write");
    } finally {
      setRetryingRowId("");
    }
  }

  async function updateImportRowSkipState(row, action) {
    if (!row || skippingRowId || savingRun || previewing) return;

    const isRestore = action === "restore";
    const displayName = row.input?.constituentName || "this record";
    const approved = window.confirm(
      isRestore
        ? `Restore ${displayName} to this import review? No Raiser's Edge NXT data will be changed.`
        : `Skip ${displayName} from this import run? No Raiser's Edge NXT data will be changed or deleted. You can restore the row later from this import run.`,
    );
    if (!approved) return;

    setSkippingRowId(String(row.id || row.rowNumber));
    setError("");
    setSaveMessage("");
    let previewBeforeSkip = null;
    let savedRowForFocus = null;

    try {
      let runId = preview?.savedRun?.id;
      let savedRow = row;
      if (!runId) {
        const savedPayload = await requestPreview({ saveRun: true, scrollToResults: false });
        runId = savedPayload?.savedRun?.id;
        savedRow = findSavedRow(savedPayload, row);
      }

      if (!runId || !savedRow?.id) {
        throw new Error("The import run could not be saved. Please try again before skipping this record.");
      }

      const savedRowId = String(savedRow.id);
      savedRowForFocus = savedRow;
      previewBeforeSkip = !isRestore && preview?.savedRun?.id ? preview : null;
      let nextUnresolvedRow = null;

      if (previewBeforeSkip) {
        const rowsAfterSkip = previewBeforeSkip.rows.map((candidate) =>
          String(candidate.id) === savedRowId ? { ...candidate, status: "Skipped" } : candidate,
        );
        const skippedIndex = rowsAfterSkip.findIndex((candidate) => String(candidate.id) === savedRowId);
        nextUnresolvedRow = rowsAfterSkip.find(
          (candidate, index) => index > skippedIndex && isUnresolvedImportRow(candidate),
        ) || rowsAfterSkip.find(isUnresolvedImportRow);

        setPreview({ ...previewBeforeSkip, rows: rowsAfterSkip });
        setSelectedApplyRowIds((current) => current.filter((id) => id !== savedRowId));
        if (nextUnresolvedRow) {
          focusImportRowState(nextUnresolvedRow);
        } else {
          setFocusedRowId("");
        }
      }

      const response = await fetch(
        `/api/constituency-import/runs/${encodeURIComponent(runId)}/rows/${encodeURIComponent(savedRow.id)}/skip`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: isRestore ? "restore" : "skip" }),
        },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to update the import row");
      }

      if (previewBeforeSkip) {
        // Reconcile counts and audit data after the next record is already visible.
        void loadSavedRun(runId);
      } else {
        const refreshedPayload = await loadSavedRun(runId);
        if (!refreshedPayload) {
          throw new Error("The row was updated, but the import run could not be refreshed.");
        }
        if (!isRestore) {
          focusNextUnresolvedRow(refreshedPayload.rows, savedRow.id);
        } else {
          focusImportRow(savedRow.id);
        }
      }
      setSaveMessage(payload?.message || "Updated this import row.");
      fetchSavedRuns();
    } catch (skipError) {
      if (previewBeforeSkip) {
        setPreview(previewBeforeSkip);
        focusImportRow(savedRowForFocus?.id);
      }
      setError(skipError instanceof Error ? skipError.message : "Failed to update the import row");
    } finally {
      setSkippingRowId("");
    }
  }

  async function requestPreview({
    saveRun = false,
    rowsOverride = null,
    successMessage = "",
    scrollToResults = true,
  } = {}) {
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
          rows: rowsOverride || rows,
          mappings,
          defaults: {
            importIntent,
            defaultAction: constituencyAction,
            educationRelationshipAction,
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
          fieldDecisions,
          sourceFilename,
          saveRun,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to review constituency import");
      }
      setPreview(payload);
      setSelectedApplyRowIds([]);
      setFocusedRowId(String(getReviewQueueRows(payload?.rows)[0]?.id || payload?.rows?.[0]?.id || ""));
      setReviewMode(Boolean(payload?.savedRun));
      setShowBatchTools(false);
      setContactDecisionsDirty(false);
      setFieldDecisionsDirty(false);
      setEditingPreviewRowNumber(null);
      setEditingRowDraft({});
      setTableSuggestions({});
      if (scrollToResults) {
        window.setTimeout(() => {
          document
            .getElementById("constituency-import-preview-results")
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 0);
      }
      if (saveRun && payload?.savedRun?.id) {
        setSaveMessage(`Saved import run #${payload.savedRun.id}. No NXT records were changed.`);
        fetchSavedRuns();
      } else if (successMessage) {
        setSaveMessage(successMessage);
      }
      return payload;
    } catch (previewError) {
      setError(
        previewError instanceof Error
          ? previewError.message
          : "Failed to review constituency import",
      );
      return null;
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
        ethnicity: row.input?.ethnicity || "",
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
        applyAudit: renderApplyAudit(row.blackbaudResult),
        reconciliationAudit: renderReconciliationAudit(row.blackbaudResult),
        appliedAt: row.appliedAt || "",
        applyError: row.blackbaudError || "",
        reasons: (row.reasons || []).join(" | "),
      })),
    );
    downloadCsv(csv, `${importIntent}-constituency-import-review.csv`);
  }

  if (loading || loadingProfile) {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "#6B7280" }}>
        Loading import review...
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
              This import tool is intentionally limited to Advancement Services and workspace
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
                Constituency Import
              </h1>
              <p style={{ margin: "6px 0 0", color: "#6B7280" }}>
                Classify each CSV row, check NXT matches, and review proposed changes before they are sent to NXT.
              </p>
            </div>
          </div>
          <Pill tone={preview?.savedRun ? "green" : "blue"}>
            {preview?.savedRun ? "Import run ready for NXT actions" : "Import review: no NXT writes"}
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
          NXT before it can be updated. Potential new records remain in controlled review. Import
          review never writes to NXT; only an explicit Confirm and send to NXT action updates a
          confirmed record.
        </section>

        <section
          style={{
            backgroundColor: "white",
            border: "1px solid #E5E7EB",
            borderRadius: "20px",
            padding: "20px",
            marginBottom: "18px",
            display: "grid",
            gap: "16px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
            <div>
              <h2 style={{ margin: 0, fontSize: "22px", color: "#111827" }}>
                1. Upload CSV
              </h2>
              <p style={{ margin: "6px 0 0", color: "#6B7280", lineHeight: 1.5 }}>
                Start with the file. JUMGOGPT automatically maps recognized headers, then you can
                confirm its purpose and adjust the selected fields.
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
                  ? "Headers were mapped automatically. Review the highlighted fields below before checking the import."
                  : "Choose one CSV file to begin the import review."}
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
              2. What does this file contain?
            </h2>
            <p style={{ margin: "6px 0 0", color: "#6B7280", lineHeight: 1.5 }}>
              This determines how the import review classifies each row. A missing NXT match never
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
                  3. Choose import fields
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
                            <div
                              style={{
                                border: active ? "2px solid #6D5DFB" : "1px solid #E5E7EB",
                                borderRadius: "14px",
                                backgroundColor: active ? "#F5F3FF" : "white",
                              }}
                            >
                              <button
                                type="button"
                                onClick={() => toggleField(field.key)}
                                style={{
                                  width: "100%",
                                  display: "grid",
                                  gridTemplateColumns: "auto 1fr",
                                  gap: "12px",
                                  padding: "13px 13px 6px",
                                  textAlign: "left",
                                  border: "none",
                                  backgroundColor: "transparent",
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
                              <div style={{ padding: "0 13px 13px 47px" }}>
                                CSV header: <CopyableHeaderCode>{field.header}</CopyableHeaderCode>
                              </div>
                            </div>
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
                                        When enabled, the import review places the new code according to
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
                                    Code field so the import review can identify the code to replace.
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
                              {educationRelationshipAction === "review-update"
                                ? "For each matched constituent, choose the exact current NXT education row that this CSV should update. No row is matched or changed automatically."
                                : "This import creates an additional education relationship only. It never edits or end-dates an existing NXT education row, and it safely skips an identical education relationship."}
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
                                Compare title, gender, ethnicity, birth date, and suffix against the current
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
                                  <option value="title-last">Title + last name</option>
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
                                Without one, the import review can propose a match from name, email, and
                                address evidence, but it stays in review until a person confirms it.
                                Each import review will show the current NXT email addresses beside the
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
                                The import review compares each CSV phone number with current NXT phone
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
                                The import review compares the CSV address with current NXT addresses.
                                Adding preserves current address values; replacing keeps the
                                selected NXT address type and primary setting. Address Valid From
                                is included when supplied.
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
                  Active CSV headers
                </h2>
                <p style={{ margin: "6px 0 0", color: "#6B7280", lineHeight: 1.5 }}>
                  These active fields are expected in the uploaded CSV. Extra columns are ignored
                  in the import review, and missing optional active headers are ignored.
                </p>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {expectedHeaders.map((header) => (
                  <CopyableHeaderCode key={header}>{header}</CopyableHeaderCode>
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
                Import review checklist
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
              {mappedIndividualProfileUpdate ? (
                <Pill tone="blue">Individual profile: Review and update</Pill>
              ) : null}
              {activeFields.targetConstituency ? (
                <Pill tone="blue">
                  Constituent code:{" "}
                  {constituencyAction === "add" ? "Add Additional" : "Replace Existing"}
                </Pill>
              ) : null}
              {educationRelationshipFieldsActive ? (
                <Pill tone="blue">
                  Education: {educationRelationshipAction === "review-update" ? "Update Existing" : "Add Additional"}
                </Pill>
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
                  Saved import runs
                </h3>
                <p style={{ margin: "4px 0 0", color: "#6B7280", lineHeight: 1.4 }}>
                  Reopen a prior import review without rechecking NXT.
                </p>
              </div>
              {loadingSavedRuns ? (
                <span style={{ color: "#6B7280" }}>Loading saved import runs...</span>
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
                        Run #{run.id} · {run.sourceFilename || "CSV import"}
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
                <span style={{ color: "#6B7280" }}>No saved import runs yet.</span>
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
                4. Review import
              </h2>
              <p style={{ margin: "6px 0 0", color: "#6B7280" }}>
                Confirm the auto-mapped fields and review the validation checklist. This checks
                {` ${sourceFilename || "the uploaded CSV"} `}against NXT but does not write to NXT.
              </p>
            </div>
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
              Active fields not found in this CSV will be ignored for this import review:{" "}
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
              Extra CSV headers will be ignored in this import review: {extraHeaders.join(", ")}
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
              Import review could not be created: {error}
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
              Import review needs: {previewBlockers.join(" ")}
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
              {previewing ? "Checking import..." : "Review uploaded CSV"}
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
            <section
              aria-label="Import progress"
              style={{
                position: "sticky",
                top: "12px",
                zIndex: 20,
                border: "1px solid #C7D2FE",
                borderRadius: "16px",
                backgroundColor: "#F8FAFF",
                boxShadow: "0 10px 26px rgba(30, 64, 175, 0.12)",
                padding: "14px",
                display: "grid",
                gap: "12px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: "12px", flexWrap: "wrap" }}>
                <div style={{ display: "grid", gap: "3px" }}>
                  <div style={{ color: "#1E3A8A", fontSize: "14px", fontWeight: 900 }}>
                    Import progress
                  </div>
                  <div style={{ color: "#475569", fontSize: "13px", lineHeight: 1.4 }}>
                    {preview?.savedRun
                      ? `Import run #${preview.savedRun.id}. Confirm a record only after its review choices are correct.`
                      : "This is a draft import review. Nothing has been written to Raiser's Edge NXT."}
                  </div>
                </div>
                {focusedReviewRow ? (
                  <div style={{ color: "#3730A3", fontSize: "13px", fontWeight: 900 }}>
                    Current: {focusedReviewRowIndex + 1} of {reviewNavigationRows.length}
                  </div>
                ) : null}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(118px, 1fr))", gap: "8px" }}>
                {[
                  ["Needs action", progressRowsNeedingAttention, "#92400E", "#FFFBEB"],
                  ["Ready", readyProgressRows, "#047857", "#ECFDF5"],
                  ["Imported", appliedReconciliationRows.length, "#1D4ED8", "#EFF6FF"],
                  ["Verified", verifiedReconciliationRows.length, "#4338CA", "#EEF2FF"],
                ].map(([label, value, color, backgroundColor]) => (
                  <div
                    key={label}
                    style={{
                      border: `1px solid ${color}33`,
                      borderRadius: "10px",
                      backgroundColor,
                      color,
                      padding: "8px 10px",
                    }}
                  >
                    <div style={{ fontSize: "11px", fontWeight: 900, textTransform: "uppercase" }}>{label}</div>
                    <div style={{ marginTop: "2px", fontSize: "20px", fontWeight: 900 }}>{value}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                {preview?.savedRun ? (
                  <button
                    type="button"
                    onClick={() => focusImportRow(nextProgressRow?.id)}
                    disabled={!nextProgressRow}
                    style={{
                      border: "1px solid #1D4ED8",
                      borderRadius: "999px",
                      backgroundColor: nextProgressRow ? "#1D4ED8" : "#DBEAFE",
                      color: nextProgressRow ? "white" : "#1E40AF",
                      padding: "9px 14px",
                      fontWeight: 900,
                      cursor: nextProgressRow ? "pointer" : "not-allowed",
                    }}
                  >
                    {progressRowsNeedingAttention
                      ? "Review required record"
                      : readyProgressRows
                        ? "Open next ready record"
                        : "Open import records"}
                  </button>
                ) : null}
                {preview?.savedRun ? (
                  <button
                    type="button"
                    onClick={() => setReviewMode((current) => !current)}
                    style={{
                      border: "1px solid #C7D2FE",
                      borderRadius: "999px",
                      backgroundColor: "white",
                      color: "#4338CA",
                      padding: "9px 14px",
                      fontWeight: 900,
                      cursor: "pointer",
                    }}
                  >
                    {reviewMode ? "Show all records" : "Review one record"}
                  </button>
                ) : null}
                <span style={{ color: "#64748B", fontSize: "12px", lineHeight: 1.35 }}>
                  {preview?.savedRun
                    ? "No NXT changes are made until you use Confirm and send to NXT."
                    : "Review the draft below, then use Confirm and send to NXT or save the run for batch work."}
                </span>
              </div>
            </section>
          ) : null}

          {preview?.rows?.length ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center" }}>
              {contactDecisionsDirty || fieldDecisionsDirty ? (
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
                  {previewing ? "Refreshing review plan..." : "Refresh review plan"}
                </button>
              ) : null}
              {!preview?.savedRun ? (
                <button
                  type="button"
                  onClick={() => requestPreview({ saveRun: true })}
                  disabled={savingRun || contactDecisionsDirty || fieldDecisionsDirty}
                  style={{
                    border: "1px solid #A7F3D0",
                    borderRadius: "14px",
                    backgroundColor: savingRun || contactDecisionsDirty || fieldDecisionsDirty ? "#E5E7EB" : "#ECFDF5",
                    color: savingRun || contactDecisionsDirty || fieldDecisionsDirty ? "#64748B" : "#047857",
                    padding: "12px 16px",
                    fontWeight: 900,
                    cursor: savingRun || contactDecisionsDirty || fieldDecisionsDirty ? "not-allowed" : "pointer",
                  }}
                >
                  {savingRun
                    ? "Saving batch review..."
                    : contactDecisionsDirty || fieldDecisionsDirty
                      ? "Refresh review plan before batch save"
                      : "Save review for batch"}
                </button>
              ) : null}
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
                <FileText size={16} /> Export import review CSV
              </button>
            </div>
          ) : null}

          {contactDecisionsDirty || fieldDecisionsDirty ? (
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
              Review choices changed. Refresh the import review to rebuild the exact NXT write plan before saving this run.
            </div>
          ) : null}

          {preview?.rows?.length && !preview?.savedRun ? (
            <div
              style={{
                border: "1px solid #C7D2FE",
                borderRadius: "14px",
                backgroundColor: "#EEF2FF",
                color: "#312E81",
                padding: "12px",
                display: "grid",
                gap: "5px",
                lineHeight: 1.45,
              }}
            >
              <strong>Choose how to continue</strong>
              <span>
                Review a ready row below, then use <strong>Confirm and send to NXT</strong> to save the audit run and update that one record now. Use <strong>Save review for batch</strong> only when you want to confirm several rows first and send them together later. Saving alone never changes NXT.
              </span>
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
              <div style={{ display: "grid", gap: "12px", width: "100%" }}>
                <div>
                  <div style={{ color: "#065F46", fontSize: "13px", fontWeight: 900 }}>
                    Import run #{preview.savedRun.id}
                  </div>
                  <div style={{ marginTop: "4px" }}>
                    {readySavedRows
                      ? `${readySavedRows} reviewed update${readySavedRows === 1 ? " is" : "s are"} ready to send to Raiser's Edge NXT. Open a record below to send it now, or use batch actions to send several together.`
                      : appliedReconciliationRows.length
                        ? `All reviewed updates from this run have been imported to Raiser's Edge NXT.`
                        : rowsNeedingAttention
                          ? `${rowsNeedingAttention} record${rowsNeedingAttention === 1 ? " needs" : "s need"} attention before anything can be sent to NXT. Open the highlighted record below to resolve the required review.`
                          : "No reviewed updates are ready to send from this run."}
                    {potentialNewRows
                      ? ` ${potentialNewRows} potential new record${potentialNewRows === 1 ? " requires" : "s require"} separate individual review below.`
                      : ""}
                  </div>
                </div>

                {reviewNavigationRows.length ? (
                  <section
                    style={{
                      borderTop: "1px solid #A7F3D0",
                      paddingTop: "10px",
                      display: "grid",
                      gap: "8px",
                    }}
                  >
                    <div style={{ color: "#1D4ED8", fontSize: "13px", fontWeight: 900 }}>
                      Review one record at a time
                    </div>
                    <div style={{ color: "#1E3A8A", fontSize: "14px" }}>
                      {reviewQueueRows.length
                        ? `Record ${focusedReviewRowIndex + 1} of ${reviewNavigationRows.length} needs your review or action.`
                        : `All rows are applied or skipped. Browse the ${reviewNavigationRows.length} recorded row${reviewNavigationRows.length === 1 ? "" : "s"} in this batch.`}
                    </div>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={() => navigateImportRows(-1)}
                        disabled={reviewNavigationRows.length < 2}
                        style={{
                          border: "1px solid #93C5FD",
                          borderRadius: "999px",
                          backgroundColor: "white",
                          color: "#1D4ED8",
                          padding: "9px 14px",
                          fontWeight: 900,
                          cursor: reviewNavigationRows.length < 2 ? "not-allowed" : "pointer",
                        }}
                      >
                        Previous record
                      </button>
                      <button
                        type="button"
                        onClick={() => navigateImportRows(1)}
                        disabled={reviewNavigationRows.length < 2}
                        style={{
                          border: "1px solid #1D4ED8",
                          borderRadius: "999px",
                          backgroundColor: reviewNavigationRows.length < 2 ? "#DBEAFE" : "#1D4ED8",
                          color: reviewNavigationRows.length < 2 ? "#1E40AF" : "white",
                          padding: "9px 14px",
                          fontWeight: 900,
                          cursor: reviewNavigationRows.length < 2 ? "not-allowed" : "pointer",
                        }}
                      >
                        Next record
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (reviewMode) {
                            setReviewMode(false);
                            return;
                          }
                          focusImportRow(focusedReviewRow?.id);
                        }}
                        style={{
                          border: "1px solid #C7D2FE",
                          borderRadius: "999px",
                          backgroundColor: "white",
                          color: "#4338CA",
                          padding: "9px 14px",
                          fontWeight: 900,
                          cursor: "pointer",
                        }}
                      >
                        {reviewMode ? "Show all batch rows" : "Resume one-record review"}
                      </button>
                    </div>
                  </section>
                ) : null}

                {readySavedRows ? (
                  <section
                    style={{
                      borderTop: "1px solid #A7F3D0",
                      paddingTop: "10px",
                      display: "grid",
                      gap: "8px",
                    }}
                  >
                    <div style={{ color: "#065F46", fontSize: "13px", fontWeight: 900 }}>
                      Optional batch action
                    </div>
                    <div style={{ color: "#047857", fontSize: "14px" }}>
                      Review and apply the current record below by default. Use batch actions only when every selected row is ready to send.
                    </div>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={() => setShowBatchTools((current) => !current)}
                        style={{
                          border: "1px solid #6EE7B7",
                          borderRadius: "999px",
                          backgroundColor: "white",
                          color: "#047857",
                          padding: "9px 14px",
                          fontWeight: 900,
                          cursor: "pointer",
                        }}
                      >
                        {showBatchTools ? "Hide batch tools" : "Use batch actions"}
                      </button>
                    </div>
                    {showBatchTools ? (
                      <div style={{ display: "grid", gap: "8px", paddingTop: "4px" }}>
                        <div style={{ color: "#047857", fontSize: "14px" }}>
                          {selectedApplyRows.length
                            ? `${selectedApplyRows.length} row${selectedApplyRows.length === 1 ? "" : "s"} selected · ${selectedApplyWriteCount} staged NXT write${selectedApplyWriteCount === 1 ? "" : "s"}.`
                            : "Select individual rows below, or select every ready row."}
                        </div>
                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                          <button
                            type="button"
                            onClick={selectAllReadyRows}
                            disabled={applyingRun}
                            style={{
                              border: "1px solid #6EE7B7",
                              borderRadius: "999px",
                              backgroundColor: "white",
                              color: "#047857",
                              padding: "9px 14px",
                              fontWeight: 900,
                              cursor: applyingRun ? "not-allowed" : "pointer",
                            }}
                          >
                            Select all ready
                          </button>
                          {selectedApplyRows.length ? (
                        <button
                          type="button"
                          onClick={() => setSelectedApplyRowIds([])}
                          disabled={applyingRun}
                          style={{
                            border: "1px solid #A7F3D0",
                            borderRadius: "999px",
                            backgroundColor: "white",
                            color: "#047857",
                            padding: "9px 14px",
                            fontWeight: 900,
                            cursor: applyingRun ? "not-allowed" : "pointer",
                          }}
                        >
                          Clear selection
                        </button>
                          ) : null}
                          <button
                        type="button"
                        onClick={applySavedRun}
                        disabled={!selectedApplyRows.length || applyingRun}
                        style={{
                          border: "1px solid #047857",
                          borderRadius: "999px",
                          backgroundColor: !selectedApplyRows.length || applyingRun ? "#D1FAE5" : "#047857",
                          color: !selectedApplyRows.length || applyingRun ? "#047857" : "white",
                          padding: "9px 14px",
                          fontWeight: 900,
                          cursor: !selectedApplyRows.length || applyingRun ? "not-allowed" : "pointer",
                        }}
                      >
                        {applyingRun
                          ? "Importing to NXT..."
                          : `Import ${selectedApplyRows.length || "selected"} row${selectedApplyRows.length === 1 ? "" : "s"} to NXT`}
                      </button>
                        </div>
                      </div>
                    ) : null}
                  </section>
                ) : null}

                {appliedReconciliationRows.length ? (
                  <section
                    style={{
                      borderTop: "1px solid #A7F3D0",
                      paddingTop: "10px",
                      display: "grid",
                      gap: "8px",
                    }}
                  >
                    <div style={{ color: "#075985", fontSize: "13px", fontWeight: 900 }}>
                      {unverifiedReconciliationRows.length
                        ? "Optional: Verify the import"
                        : "NXT verification complete"}
                    </div>
                    <div style={{ color: "#0C4A6E", fontSize: "14px" }}>
                      {unverifiedReconciliationRows.length
                        ? `Re-read ${unverifiedReconciliationRows.length} imported row${unverifiedReconciliationRows.length === 1 ? "" : "s"} in NXT. This records a verification audit but makes no changes.`
                        : `${appliedReconciliationRows.length} imported row${appliedReconciliationRows.length === 1 ? " has" : "s have"} been checked against current NXT data.`}
                    </div>
                    {unverifiedReconciliationRows.length ? (
                      <div>
                        <button
                          type="button"
                          onClick={reconcileAppliedRows}
                          disabled={reconcilingRun}
                          style={{
                            border: "1px solid #0369A1",
                            borderRadius: "999px",
                            backgroundColor: reconcilingRun ? "#E0F2FE" : "#0369A1",
                            color: reconcilingRun ? "#0369A1" : "white",
                            padding: "9px 14px",
                            fontWeight: 900,
                            cursor: reconcilingRun ? "not-allowed" : "pointer",
                          }}
                        >
                          {reconcilingRun
                            ? "Verifying NXT..."
                            : `Verify ${unverifiedReconciliationRows.length} imported row${unverifiedReconciliationRows.length === 1 ? "" : "s"}`}
                        </button>
                      </div>
                    ) : null}
                  </section>
                ) : null}
              </div>
            </div>
          ) : null}

          {preview?.rows?.length ? (
            <div style={{ display: "grid", gap: "12px" }}>
              {visiblePreviewRows.map((row) => {
                const colors = statusTone(row.status);
                const nameWrites = (row.writePlan || []).filter(
                  (write) => write.type === "constituent_name",
                );
                const profileWrites = (row.writePlan || []).filter(
                  (write) => write.type === "constituent_profile",
                );
                const nameFormatWrites = (row.writePlan || []).filter(
                  (write) => write.type === "constituent_name_format",
                );
                const failedWriteResults = Array.isArray(row.blackbaudResult?.results)
                  ? row.blackbaudResult.results.filter(
                      (result) =>
                        result?.status === "failed" && Number.isInteger(result?.writeIndex),
                    )
                  : [];
                const hasUnselectedConstituencyReplacement = (row.writePlan || []).some(
                  (write) =>
                    write?.type === "constituent_code" &&
                    write?.action === "replace" &&
                    !write?.sourceCodeId,
                );
                const canApplyRow = Boolean(
                  preview?.savedRun &&
                    row.status === "Ready" &&
                    !row.appliedAt &&
                    !hasUnselectedConstituencyReplacement,
                );
                const canDirectSendPreviewRow = Boolean(
                  !preview?.savedRun &&
                    row.status === "Ready" &&
                    !row.appliedAt &&
                    Array.isArray(row.writePlan) &&
                    row.writePlan.length &&
                    !contactDecisionsDirty &&
                    !fieldDecisionsDirty &&
                    !editingPreviewRowNumber,
                );
                const needsFreshPreview = Boolean(
                  !preview?.savedRun && (contactDecisionsDirty || fieldDecisionsDirty),
                );
                const reviewRequirements = getRowReviewRequirements(row);
                const reviewTargetKey = getRowReviewTargetKey(reviewRequirements);
                const reviewTargetId = `constituency-import-row-${row.id}-${reviewTargetKey}`;
                const canVerifyRow = Boolean(
                  preview?.savedRun &&
                    row.status === "Applied" &&
                    row.appliedAt &&
                    !row.blackbaudResult?.reconciliation?.verifiedAt,
                );
                const isSkippedRow = row.status === "Skipped";
                const isManuallySkipped = Boolean(
                  isSkippedRow && row.blackbaudResult?.type === "import_row_skipped",
                );
                const canSkipRow = ["Ready", "Needs Review", "Conflict"].includes(row.status);
                const isSkippingThisRow =
                  skippingRowId === String(row.id || row.rowNumber);
                const rowReadyToSend = canApplyRow || canDirectSendPreviewRow;
                const rowNeedsReviewAction = !rowReadyToSend && !canVerifyRow && !isSkippedRow;
                const applyRowSelected = selectedApplyRowIds.includes(String(row.id));
                const isFocusedRow = String(row.id) === String(focusedReviewRow?.id);
                const isEditingThisRow =
                  !preview?.savedRun && Number(editingPreviewRowNumber) === Number(row.rowNumber);
                const editableFields = selectedFields.filter((field) => headers.includes(field.header));
                return (
                  <article
                    key={row.rowNumber}
                    id={isFocusedRow ? "constituency-import-current-row" : undefined}
                    style={{
                      border: `${isFocusedRow ? "2px" : "1px"} solid ${isFocusedRow ? "#818CF8" : colors.border}`,
                      borderLeft: `6px solid ${colors.fg}`,
                      borderRadius: "16px",
                      padding: "16px",
                      display: "grid",
                      gap: "12px",
                    }}
                  >
                    <div
                      id={`constituency-import-row-${row.id}-review-summary`}
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
                        {!preview?.savedRun && !isEditingThisRow ? (
                          <button
                            type="button"
                            onClick={() => beginPreviewRowEdit(row)}
                            disabled={previewing || Boolean(editingPreviewRowNumber)}
                            style={{
                              border: "1px solid #818CF8",
                              borderRadius: "999px",
                              backgroundColor: "white",
                              color: "#4338CA",
                              padding: "6px 10px",
                              fontSize: "12px",
                              fontWeight: 900,
                              cursor: previewing || editingPreviewRowNumber ? "not-allowed" : "pointer",
                            }}
                          >
                            Edit CSV values
                          </button>
                        ) : null}
                        {canApplyRow && showBatchTools ? (
                          <label
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "7px",
                              border: `1px solid ${applyRowSelected ? "#047857" : "#A7F3D0"}`,
                              borderRadius: "999px",
                              backgroundColor: applyRowSelected ? "#ECFDF5" : "white",
                              color: "#065F46",
                              padding: "6px 10px",
                              fontSize: "12px",
                              fontWeight: 900,
                              cursor: applyingRun ? "not-allowed" : "pointer",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={applyRowSelected}
                              disabled={applyingRun}
                              onChange={() => toggleApplyRow(row.id)}
                            />
                            Include in NXT batch
                          </label>
                        ) : null}
                      </div>
                    </div>

                    {isEditingThisRow ? (
                      <CsvRowEditor
                        rowNumber={row.rowNumber}
                        draft={editingRowDraft}
                        fields={editableFields}
                        suggestions={tableSuggestions}
                        loadingFieldKey={loadingSuggestionFieldKey}
                        onChange={updatePreviewRowDraft}
                        onFindSuggestions={findNxtTableSuggestions}
                        onUseSuggestion={updatePreviewRowDraft}
                        onSave={savePreviewRowEdits}
                        onCancel={cancelPreviewRowEdit}
                        saving={previewing}
                      />
                    ) : null}

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
                          {row.currentCodeDetails?.length ? (
                            <div style={{ display: "grid", gap: "6px" }}>
                              {row.currentCodeDetails.map((code, index) => (
                                <div key={`${code.label}-${index}`} style={{ lineHeight: 1.35 }}>
                                  <strong>{code.label}</strong>
                                  <div style={{ color: "#64748B", fontSize: "13px" }}>
                                    Start: {formatConstituencyDate(code.startDate)} · End: {code.endDate ? formatConstituencyDate(code.endDate) : "Active"}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            renderList(row.currentCodes)
                          )}
                        </div>
                      </div>
                      <div>
                        <div style={{ color: "#6B7280", fontSize: "12px", fontWeight: 900, textTransform: "uppercase" }}>
                          Proposed change
                        </div>
                        <div style={{ marginTop: "6px", color: "#111827" }}>
                          {renderList(row.proposedCodes)}
                        </div>
                      </div>
                    </div>

                    {nameWrites.length || profileWrites.length || nameFormatWrites.length ? (
                      <section
                        id={`constituency-import-row-${row.id}-profile-review`}
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
                          Name, profile, and format review
                        </div>
                        {nameWrites.map((write, index) => (
                          <div
                            key={`name-${index}`}
                            style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "8px" }}
                          >
                            {[
                              ["firstName", "First Name", write.current?.firstName, write.firstName],
                              ["lastName", "Last Name", write.current?.lastName, write.lastName],
                              ["preferredName", "Preferred Name", write.current?.preferredName, write.preferredName],
                            ]
                              .filter(([, , , proposed]) => proposed)
                              .map(([field, label, current, proposed]) => (
                                <FieldReviewCard
                                  key={field}
                                  rowNumber={row.rowNumber}
                                  writeType="constituent_name"
                                  field={field}
                                  label={label}
                                  current={current}
                                  proposed={proposed}
                                  decisions={fieldDecisions}
                                  onDecisionChange={updateFieldDecision}
                                />
                              ))}
                          </div>
                        ))}
                        {profileWrites.map((write, index) => (
                          <div
                            key={`profile-${index}`}
                            style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "8px" }}
                          >
                            {[
                              ["title", "Title", write.current?.title, write.title],
                              ["gender", "Gender", write.current?.gender, write.gender],
                              ["ethnicity", "Ethnicity", write.current?.ethnicity, write.ethnicity],
                              ["birthDate", "Birth Date", write.current?.birthDate, write.birthDate],
                              ["suffix", "Suffix", write.current?.suffix, write.suffix],
                            ]
                              .filter(([, , , proposed]) => proposed)
                              .map(([field, label, current, proposed]) => {
                                const displayCurrent =
                                  field === "birthDate"
                                    ? formatBirthDateForDisplay(current)
                                    : current;
                                const displayProposed =
                                  field === "birthDate"
                                    ? formatBirthDateForDisplay(proposed)
                                    : proposed;
                                return (
                                  <FieldReviewCard
                                    key={field}
                                    rowNumber={row.rowNumber}
                                    writeType="constituent_profile"
                                    field={field}
                                    label={label}
                                    current={displayCurrent}
                                    proposed={displayProposed}
                                    decisions={fieldDecisions}
                                    onDecisionChange={updateFieldDecision}
                                  />
                                );
                              })}
                          </div>
                        ))}
                        {nameFormatWrites.map((write, index) => (
                          <FieldReviewCard
                            key={`name-format-${index}`}
                            rowNumber={row.rowNumber}
                            writeType="constituent_name_format"
                            field={write.kind}
                            label={`Primary ${write.kind === "salutation" ? "salutation" : "addressee"}`}
                            current={write.currentValue}
                            proposed={write.value}
                            decisions={fieldDecisions}
                            onDecisionChange={updateFieldDecision}
                          />
                        ))}
                      </section>
                    ) : null}

                    <div id={`constituency-import-row-${row.id}-contact-review`}>
                      <ContactReviewPanel
                        row={row}
                        decisions={contactDecisions}
                        onDecisionChange={updateContactDecision}
                        onSectionDecisionChange={updateContactSectionDecision}
                      />
                    </div>

                    {preview?.savedRun ? (
                      <div id={`constituency-import-row-${row.id}-education-class-year`}>
                        <EducationClassYearReviewPanel
                          row={row}
                          draftValue={
                            educationClassYearDrafts[String(row.id)] ??
                            String(getEducationClassYearReviewWrite(row)?.classYear || "")
                          }
                          saving={savingEducationClassYearRowId === String(row.id)}
                          onDraftChange={updateEducationClassYearDraft}
                          onSave={saveEducationClassYear}
                        />
                      </div>
                    ) : null}

                    {preview?.savedRun ? (
                      <div id={`constituency-import-row-${row.id}-education-target`}>
                        <EducationTargetReviewPanel
                          row={row}
                          candidates={educationCandidatesByRowId[String(row.id)]}
                          selectedCandidateId={selectedEducationCandidateByRowId[String(row.id)]}
                          loading={loadingEducationCandidateRowId === String(row.id)}
                          saving={savingEducationTargetRowId === String(row.id)}
                          onLoadCandidates={loadEducationCandidates}
                          onCandidateChange={chooseEducationCandidate}
                          onSelectCandidate={selectEducationTarget}
                        />
                      </div>
                    ) : null}

                    {preview?.savedRun ? (
                      <div id={`constituency-import-row-${row.id}-constituency-target`}>
                        <ConstituencyReplaceReviewPanel
                          row={row}
                          candidates={constituencyCandidatesByRowId[String(row.id)]}
                          loading={loadingConstituencyCandidateRowId === String(row.id)}
                          saving={savingConstituencyTargetRowId === String(row.id)}
                          onLoadCandidates={loadConstituencyCandidates}
                          onSelectCandidate={selectConstituencyTarget}
                        />
                      </div>
                    ) : null}

                    {row.writePlan?.length ? (
                      <div
                        id={`constituency-import-row-${row.id}-staged-writes`}
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

                    {!isEditingThisRow ? (
                      <section
                        style={{
                          border: `1px solid ${
                            rowReadyToSend
                              ? "#6EE7B7"
                              : canVerifyRow
                                ? "#7DD3FC"
                                : isSkippedRow
                                  ? "#CBD5E1"
                                : row.status === "Failed"
                                  ? "#FCA5A5"
                                  : "#FCD34D"
                          }`,
                          borderRadius: "12px",
                          backgroundColor: rowReadyToSend
                            ? "#F0FDF4"
                            : canVerifyRow
                              ? "#F0F9FF"
                              : isSkippedRow
                                ? "#F8FAFC"
                              : row.status === "Failed"
                                ? "#FFF7ED"
                                : "#FFFBEB",
                          padding: "12px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "12px",
                          flexWrap: "wrap",
                        }}
                      >
                        <div
                          style={{
                            display: "grid",
                            gap: "5px",
                            color: rowReadyToSend
                              ? "#166534"
                              : canVerifyRow
                                ? "#075985"
                                : isSkippedRow
                                  ? "#475569"
                                : row.status === "Failed"
                                  ? "#9A3412"
                                  : "#92400E",
                          }}
                        >
                          <strong>
                            {rowReadyToSend
                              ? "Review complete: ready to send"
                              : canVerifyRow
                                ? "NXT update complete"
                                : isSkippedRow
                                  ? "Skipped from this import run"
                                : row.status === "Failed"
                                  ? "NXT write needs attention"
                                  : needsFreshPreview
                                    ? "Review choices changed"
                                    : "Action required before this record can be sent"}
                          </strong>
                          <span style={{ fontSize: "14px", lineHeight: 1.4 }}>
                            {rowReadyToSend
                              ? preview?.savedRun
                                ? `Send only this record to NXT. Its outcome stays in import run #${preview.savedRun.id}.`
                                : "Confirming saves the audit run, then sends only this reviewed record to NXT."
                              : canVerifyRow
                                ? "The NXT write is recorded in this import run. Recheck this record only if you want an immediate verification result."
                                : isSkippedRow
                                  ? isManuallySkipped
                                    ? "No Raiser's Edge NXT data was changed. Restore this record if you want to review or import it later."
                                    : "This row has no staged NXT changes and was skipped during import review."
                                : row.status === "Failed"
                                  ? "Review the failed-write result below before retrying the affected NXT changes."
                                  : needsFreshPreview
                                    ? "Refresh the review plan after changing a contact or profile decision, then confirm the refreshed row."
                                    : "Resolve the required review below before sending this record to NXT."}
                          </span>
                          {rowNeedsReviewAction &&
                          row.status !== "Failed" &&
                          reviewRequirements.length ? (
                            <span style={{ fontSize: "13px", lineHeight: 1.4 }}>
                              {reviewRequirements.slice(0, 3).join(" ")}
                            </span>
                          ) : null}
                        </div>
                        {rowReadyToSend ? (
                          <button
                            type="button"
                            onClick={() =>
                              preview?.savedRun
                                ? applySingleRow(row)
                                : confirmAndSendPreviewRow(row)
                            }
                            disabled={Boolean(directSendingRowNumber) || savingRun || applyingRun}
                            style={{
                              border: "1px solid #047857",
                              borderRadius: "999px",
                              backgroundColor:
                                directSendingRowNumber || savingRun || applyingRun
                                  ? "#D1FAE5"
                                  : "#047857",
                              color:
                                directSendingRowNumber || savingRun || applyingRun
                                  ? "#047857"
                                  : "white",
                              padding: "9px 14px",
                              fontWeight: 900,
                              cursor:
                                directSendingRowNumber || savingRun || applyingRun
                                  ? "not-allowed"
                                  : "pointer",
                            }}
                          >
                            {Number(directSendingRowNumber) === Number(row.rowNumber)
                              ? "Saving review and sending..."
                              : applyingRun
                                ? "Sending to NXT..."
                                : "Confirm and send to NXT"}
                          </button>
                        ) : canVerifyRow ? (
                          <button
                            type="button"
                            onClick={() => reconcileSingleRow(row)}
                            disabled={reconcilingRun}
                            style={{
                              border: "1px solid #0369A1",
                              borderRadius: "999px",
                              backgroundColor: reconcilingRun ? "#E0F2FE" : "#0369A1",
                              color: reconcilingRun ? "#075985" : "white",
                              padding: "9px 14px",
                              fontWeight: 900,
                              cursor: reconcilingRun ? "not-allowed" : "pointer",
                            }}
                          >
                            {reconcilingRun ? "Verifying NXT..." : "Verify this record in NXT"}
                          </button>
                        ) : needsFreshPreview ? (
                          <button
                            type="button"
                            onClick={requestPreview}
                            disabled={previewing}
                            style={{
                              border: "1px solid #B45309",
                              borderRadius: "999px",
                              backgroundColor: previewing ? "#FEF3C7" : "#B45309",
                              color: previewing ? "#92400E" : "white",
                              padding: "9px 14px",
                              fontWeight: 900,
                              cursor: previewing ? "not-allowed" : "pointer",
                            }}
                          >
                            {previewing ? "Refreshing review plan..." : "Refresh review plan"}
                          </button>
                        ) : rowNeedsReviewAction && row.status !== "Failed" ? (
                          <button
                            type="button"
                            aria-controls={reviewTargetId}
                            onClick={() => startRequiredReview(row, reviewTargetKey)}
                            disabled={savingRun || previewing}
                            style={{
                              border: "1px solid #B45309",
                              borderRadius: "999px",
                              backgroundColor: savingRun || previewing ? "#FEF3C7" : "white",
                              color: "#92400E",
                              padding: "9px 14px",
                              fontWeight: 900,
                              cursor: savingRun || previewing ? "not-allowed" : "pointer",
                            }}
                          >
                            {savingRun
                              ? "Saving review..."
                              : preview?.savedRun
                                ? "Open required review"
                                : "Save review and choose NXT records"}
                          </button>
                        ) : null}
                        {canSkipRow || isManuallySkipped ? (
                          <button
                            type="button"
                            onClick={() =>
                              updateImportRowSkipState(
                                row,
                                isManuallySkipped ? "restore" : "skip",
                              )
                            }
                            disabled={Boolean(skippingRowId) || savingRun || previewing}
                            style={{
                              border: `1px solid ${isManuallySkipped ? "#2563EB" : "#64748B"}`,
                              borderRadius: "999px",
                              backgroundColor:
                                isSkippingThisRow
                                  ? "#E2E8F0"
                                  : isManuallySkipped
                                    ? "white"
                                    : "#475569",
                              color: isSkippingThisRow
                                ? "#475569"
                                : isManuallySkipped
                                  ? "#1D4ED8"
                                  : "white",
                              padding: "9px 14px",
                              fontWeight: 900,
                              cursor:
                                skippingRowId || savingRun || previewing
                                  ? "not-allowed"
                                  : "pointer",
                            }}
                          >
                            {isSkippingThisRow
                              ? isManuallySkipped
                                ? "Restoring record..."
                                : "Skipping record..."
                              : isManuallySkipped
                                ? "Restore record"
                                : preview?.savedRun
                                  ? "Skip record"
                                  : "Save and skip record"}
                          </button>
                        ) : null}
                      </section>
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
                    ) : null}
                    {Array.isArray(row.blackbaudResult?.results) &&
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
                            style={{
                              color: result.status === "failed" ? "#991B1B" : "#0C4A6E",
                              fontWeight: 800,
                              lineHeight: 1.4,
                            }}
                          >
                            {formatApplyResultItem(result)}
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {Array.isArray(row.blackbaudResult?.reconciliation?.results) &&
                    row.blackbaudResult.reconciliation.results.length ? (
                      <div
                        style={{
                          border: "1px solid #7DD3FC",
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
                          NXT verification{row.blackbaudResult.reconciliation.verifiedAt ? ` · ${formatDateTime(row.blackbaudResult.reconciliation.verifiedAt)}` : ""}
                        </div>
                        {row.blackbaudResult.reconciliation.results.map((result, resultIndex) => (
                          <div
                            key={`${result.type || "verification"}-${resultIndex}`}
                            style={{
                              color: result.status === "confirmed" ? "#166534" : "#92400E",
                              fontWeight: 800,
                              lineHeight: 1.4,
                            }}
                          >
                            {result.status === "confirmed" ? "Confirmed" : "Needs review"}: {result.message}
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {row.status === "Failed" ? (
                      <div
                        style={{
                          border: "1px solid #FCA5A5",
                          borderRadius: "12px",
                          backgroundColor: "#FFF7ED",
                          padding: "12px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "12px",
                          flexWrap: "wrap",
                        }}
                      >
                        <span style={{ color: "#9A3412", fontWeight: 800, lineHeight: 1.45 }}>
                          {failedWriteResults.length
                            ? `${failedWriteResults.length} staged NXT write${failedWriteResults.length === 1 ? "" : "s"} failed. Successful writes will not be repeated.`
                            : "This failed before JUMGOGPT could safely identify a single write to retry. Refresh this row before trying again."}
                        </span>
                        {failedWriteResults.length ? (
                          <button
                            type="button"
                            onClick={() => retryFailedWrites(row)}
                            disabled={Boolean(retryingRowId)}
                            style={{
                              border: "1px solid #C2410C",
                              borderRadius: "999px",
                              backgroundColor: retryingRowId ? "#FFEDD5" : "#C2410C",
                              color: retryingRowId ? "#9A3412" : "white",
                              padding: "9px 14px",
                              fontWeight: 900,
                              cursor: retryingRowId ? "not-allowed" : "pointer",
                            }}
                          >
                            {retryingRowId === String(row.id)
                              ? "Retrying failed write..."
                              : "Retry failed NXT write"}
                          </button>
                        ) : null}
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
                        . Review the staged writes, then use “Apply this record to NXT” above to add them.
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
                          Save this import run before approving a new NXT constituent.
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
              Import review results will appear here after you upload matching headers and review the import.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
