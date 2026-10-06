export const IMPORT_FIELDS = [
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
    description:
      "Strong match key commonly visible on the NXT constituent profile. For a reviewed new record with no match, the value is assigned as the new NXT lookup ID after the final duplicate check.",
    recommended: true,
  },
  {
    key: "externalConstituentId",
    header: "External Constituent ID",
    label: "External Constituent ID",
    group: "Match fields",
    description:
      "An identifier from another system. It is retained in the import audit only and is never used as an NXT ID or written to NXT.",
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

export const FIELD_BY_KEY = IMPORT_FIELDS.reduce((acc, field) => {
  acc[field.key] = field;
  return acc;
}, {});

const IMPORT_HEADER_ALIASES = {
  externalConstituentId: [
    "External Constituent ID",
    "Source Constituent ID",
    "Source Constituent ID #",
    "Constituent ID",
    "Constituent ID #",
    "Legacy Constituent ID",
    "Legacy ID",
  ],
};

function normalizeImportHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

export function getUploadedHeaderForField(fieldKey, availableHeaders) {
  const field = FIELD_BY_KEY[fieldKey];
  if (!field) return "";

  const headerByNormalizedValue = new Map(
    (Array.isArray(availableHeaders) ? availableHeaders : [])
      .map((header) => [normalizeImportHeader(header), String(header || "").trim()])
      .filter(([normalizedHeader, header]) => normalizedHeader && header),
  );
  const candidates = [field.header, ...(IMPORT_HEADER_ALIASES[fieldKey] || [])];
  for (const candidate of candidates) {
    const matchedHeader = headerByNormalizedValue.get(normalizeImportHeader(candidate));
    if (matchedHeader) return matchedHeader;
  }
  return "";
}
