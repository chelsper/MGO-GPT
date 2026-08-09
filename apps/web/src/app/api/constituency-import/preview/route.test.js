import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const ensureAppSchemaMock = vi.fn();
const getWorkspaceUserMock = vi.fn();
const sqlMock = vi.fn();
const blackbaudApiFetchMock = vi.fn();
const findBlackbaudConstituentByLookupIdMock = vi.fn();
const getBlackbaudConstituentByIdMock = vi.fn();
const searchBlackbaudConstituentsMock = vi.fn();

vi.mock("@/auth", () => ({
  auth: authMock,
}));

vi.mock("@/app/api/utils/ensureAppSchema", () => ({
  default: ensureAppSchemaMock,
}));

vi.mock("@/app/api/utils/getWorkspaceUser", () => ({
  default: getWorkspaceUserMock,
}));

vi.mock("@/app/api/utils/sql", () => ({
  default: sqlMock,
}));

vi.mock("@/app/api/utils/blackbaud", () => ({
  blackbaudApiFetch: blackbaudApiFetchMock,
  findBlackbaudConstituentByLookupId: findBlackbaudConstituentByLookupIdMock,
  getBlackbaudConstituentById: getBlackbaudConstituentByIdMock,
  searchBlackbaudConstituents: searchBlackbaudConstituentsMock,
}));

function makeRequest(body) {
  return new Request("https://example.com/api/constituency-import/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const mappings = {
  constituentName: "Name",
  firstName: "First Name",
  lastName: "Last Name",
  preferredName: "Preferred Name",
  blackbaudConstituentId: "NXT ID",
  lookupId: "Lookup ID",
  email: "Email",
  sourceConstituency: "Current Constituency",
  targetConstituency: "New Constituency",
  action: "Action",
};

describe("constituency import preview route", () => {
  beforeEach(() => {
    authMock.mockReset();
    ensureAppSchemaMock.mockReset();
    getWorkspaceUserMock.mockReset();
    sqlMock.mockReset();
    blackbaudApiFetchMock.mockReset();
    findBlackbaudConstituentByLookupIdMock.mockReset();
    getBlackbaudConstituentByIdMock.mockReset();
    searchBlackbaudConstituentsMock.mockReset();

    authMock.mockResolvedValue({ user: { email: "reviewer@example.com" } });
    ensureAppSchemaMock.mockResolvedValue();
    getWorkspaceUserMock.mockResolvedValue({
      sessionUser: {
        id: 7,
        name: "Reviewer",
        email: "reviewer@example.com",
        role: "reviewer",
      },
      workspaceUser: {
        id: 7,
        name: "Reviewer",
        email: "reviewer@example.com",
        role: "reviewer",
      },
      isActing: false,
    });
  });

  it("blocks non-reviewers", async () => {
    const { POST } = await import("./route.js");
    getWorkspaceUserMock.mockResolvedValue({
      sessionUser: { id: 12, email: "mgo@example.com", role: "mgo" },
      workspaceUser: { id: 12, email: "mgo@example.com", role: "mgo" },
      isActing: false,
    });

    const response = await POST(
      makeRequest({
        rows: [{ Name: "Jane Dolphin" }],
        mappings,
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toContain("Advancement Services");
    expect(getBlackbaudConstituentByIdMock).not.toHaveBeenCalled();
  });

  it("allows an Advancement Services admin who is viewing an MGO workspace", async () => {
    const { POST } = await import("./route.js");
    getWorkspaceUserMock.mockResolvedValue({
      sessionUser: { id: 7, email: "reviewer@example.com", role: "admin" },
      workspaceUser: { id: 12, email: "mgo@example.com", role: "mgo" },
      isActing: true,
    });
    findBlackbaudConstituentByLookupIdMock.mockResolvedValue({
      blackbaudConstituentId: "440085",
      lookupId: "440085",
      name: "Chelsea Jasper",
    });

    const response = await POST(
      makeRequest({
        rows: [{ "Lookup ID": "440085" }],
        mappings: { lookupId: "Lookup ID" },
      }),
    );

    expect(response.status).toBe(200);
    expect(findBlackbaudConstituentByLookupIdMock).toHaveBeenCalledWith(
      expect.objectContaining({ lookupId: "440085", userId: 7, authUserId: 7 }),
    );
  });

  it("previews a strong ID replacement as ready", async () => {
    const { POST } = await import("./route.js");
    getBlackbaudConstituentByIdMock.mockResolvedValue({
      blackbaudConstituentId: "123",
      lookupId: "A123",
      name: "Jane Dolphin",
      email: "jane@example.com",
    });
    blackbaudApiFetchMock.mockResolvedValue({
      value: [
        { description: "Student", date_from: "2020-08-15", date_to: "2024-05-04" },
        { description: "Friend" },
      ],
    });

    const response = await POST(
      makeRequest({
        rows: [
          {
            Name: "Jane Dolphin",
            "NXT ID": "123",
            "Current Constituency": "Student",
            "New Constituency": "Alumni - Bachelor's Degree",
            Action: "replace",
          },
        ],
        mappings,
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.summary.ready).toBe(1);
    expect(payload.rows[0].status).toBe("Ready");
    expect(payload.rows[0].matchMethod).toBe("NXT system ID");
    expect(payload.rows[0].currentCodes).toEqual(["Student", "Friend"]);
    expect(payload.rows[0].currentCodeDetails).toEqual([
      { label: "Student", startDate: "2020-08-15", endDate: "2024-05-04" },
      { label: "Friend", startDate: "", endDate: "" },
    ]);
    expect(payload.rows[0].proposedCodes).toEqual([
      "Alumni - Bachelor's Degree",
      "Friend",
    ]);
  });

  it("serializes partial NXT constituency dates for the preview", async () => {
    const { POST } = await import("./route.js");
    getBlackbaudConstituentByIdMock.mockResolvedValue({
      blackbaudConstituentId: "123",
      lookupId: "A123",
      name: "Jane Dolphin",
    });
    blackbaudApiFetchMock.mockResolvedValue({
      value: [{ description: "Student", date_from: { y: 2020 }, date_to: { y: 2024, m: 5 } }],
    });

    const response = await POST(
      makeRequest({
        rows: [{ "NXT ID": "123", "Current Constituency": "Student", "New Constituency": "Alumni - Bachelor's Degree" }],
        mappings,
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.rows[0].currentCodeDetails).toEqual([
      { label: "Student", startDate: "2020", endDate: "2024-05" },
    ]);
  });

  it("previews the minimal uploaded CSV headers used by the import screen", async () => {
    const { POST } = await import("./route.js");
    findBlackbaudConstituentByLookupIdMock.mockResolvedValue({
      blackbaudConstituentId: "440085",
      lookupId: "440085",
      name: "Chelsea Jasper",
    });
    blackbaudApiFetchMock.mockResolvedValue({
      value: [{ description: "Friend" }],
    });

    const response = await POST(
      makeRequest({
        rows: [
          {
            "NXT Lookup ID": "440085",
            "Preferred Name": "Chels",
            "New Constituent Code": "Student",
            "New Constituent Code End Date": "2030",
          },
        ],
        mappings: {
          lookupId: "NXT Lookup ID",
          preferredName: "Preferred Name",
          targetConstituency: "New Constituent Code",
          endDate: "New Constituent Code End Date",
        },
        defaults: { defaultAction: "add", useHierarchy: true },
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.rows[0].input.lookupId).toBe("440085");
    expect(payload.rows[0].input.targetConstituency).toBe("Student");
    expect(payload.rows[0].status).toBe("Ready");
  });

  it("stages a preferred-name correction only when name updates are explicitly enabled", async () => {
    const { POST } = await import("./route.js");
    findBlackbaudConstituentByLookupIdMock.mockResolvedValue({
      blackbaudConstituentId: "440085",
      lookupId: "440085",
      name: "Chelsea C. Jasper",
      raw: {
        type: "Individual",
        first: "Chelsea",
        last: "Jasper",
        preferred_name: "Chelsea",
      },
    });

    const response = await POST(
      makeRequest({
        rows: [
          {
            "NXT Lookup ID": "440085",
            "Preferred Name": "Chels",
          },
        ],
        mappings: {
          lookupId: "NXT Lookup ID",
          preferredName: "Preferred Name",
        },
        defaults: { updateNameFields: true },
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.rows[0].status).toBe("Ready");
    expect(payload.rows[0].writePlan).toEqual([
      expect.objectContaining({
        type: "constituent_name",
        action: "update",
        recordType: "Individual",
        preferredName: "Chels",
        blankValuePolicy: "leave_unchanged",
      }),
    ]);
    expect(payload.rows[0].writePlan[0].firstName).toBe("");
    expect(payload.rows[0].writePlan[0].lastName).toBe("");
  });

  it("stages individual profile changes without treating blank cells as clears", async () => {
    const { POST } = await import("./route.js");
    getBlackbaudConstituentByIdMock.mockResolvedValue({
      blackbaudConstituentId: "123",
      lookupId: "A123",
      name: "Jane Dolphin",
      raw: {
        type: "Individual",
        title: "Ms.",
        gender: "Female",
        ethnicity: "Not Hispanic or Latino",
        suffix: "",
        birthdate: { y: 1980, m: 7, d: 23 },
      },
    });

    const response = await POST(
      makeRequest({
        rows: [
          {
            "NXT ID": "123",
            Title: "Dr.",
            Gender: "Female",
            Ethnicity: "Hispanic or Latino",
            "Birth Date": "07/23/80",
            Suffix: "Ph.D.",
          },
        ],
        mappings: {
          blackbaudConstituentId: "NXT ID",
          title: "Title",
          gender: "Gender",
          ethnicity: "Ethnicity",
          birthDate: "Birth Date",
          suffix: "Suffix",
        },
        defaults: { updateIndividualProfileFields: true },
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.rows[0].status).toBe("Ready");
    expect(payload.rows[0].writePlan).toEqual([
      expect.objectContaining({
        type: "constituent_profile",
        action: "update",
        title: "Dr.",
        gender: "",
        ethnicity: "Hispanic or Latino",
        birthDate: "",
        suffix: "Ph.D.",
        current: expect.objectContaining({ title: "Ms.", gender: "Female", ethnicity: "Not Hispanic or Latino" }),
      }),
    ]);
  });

  it("normalizes MM/DD/YY birth dates before staging the individual update", async () => {
    const { POST } = await import("./route.js");
    getBlackbaudConstituentByIdMock.mockResolvedValue({
      blackbaudConstituentId: "123",
      lookupId: "A123",
      name: "Jane Dolphin",
      raw: { type: "Individual", first: "Jane", last: "Dolphin" },
    });

    const response = await POST(
      makeRequest({
        rows: [{ "NXT ID": "123", "Birth Date": "07/23/80" }],
        mappings: { blackbaudConstituentId: "NXT ID", birthDate: "Birth Date" },
        defaults: { updateIndividualProfileFields: true },
      }),
    );
    const payload = await response.json();

    expect(payload.rows[0].writePlan).toEqual([
      expect.objectContaining({ type: "constituent_profile", birthDate: "1980-07-23" }),
    ]);
  });

  it("stages custom primary name formats from the file-wide builder", async () => {
    const { POST } = await import("./route.js");
    getBlackbaudConstituentByIdMock.mockResolvedValue({
      blackbaudConstituentId: "123",
      lookupId: "A123",
      name: "Jane Dolphin",
      raw: { type: "Individual", first: "Jane", last: "Dolphin", preferred_name: "Jane" },
    });
    blackbaudApiFetchMock.mockResolvedValue({
      primary_addressee: { id: "addressee-1", formatted_name: "Jane Dolphin" },
      primary_salutation: { id: "salutation-1", formatted_name: "Dear Jane" },
    });

    const response = await POST(
      makeRequest({
        rows: [{ "NXT ID": "123", "First Name": "Jane", "Last Name": "Dolphin", Title: "Dr." }],
        mappings: {
          blackbaudConstituentId: "NXT ID",
          firstName: "First Name",
          lastName: "Last Name",
          title: "Title",
        },
        defaults: {
          updateNameFormatFields: true,
          buildNameFormats: true,
          addresseeFormat: "title-preferred-last-suffix",
          salutationFormat: "title-last",
        },
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.rows[0].status).toBe("Ready");
    expect(blackbaudApiFetchMock).toHaveBeenCalledWith(
      "/constituent/v1/constituents/123/nameformats/summary",
      { userId: 7, authUserId: 7, origin: "https://example.com" },
    );
    expect(payload.rows[0].writePlan).toContainEqual(
      expect.objectContaining({
        type: "constituent_name_format",
        kind: "addressee",
        targetId: "addressee-1",
        currentValue: "Jane Dolphin",
        value: "Dr. Jane Dolphin",
      }),
    );
    expect(payload.rows[0].writePlan).toContainEqual(
      expect.objectContaining({
        type: "constituent_name_format",
        kind: "salutation",
        targetId: "salutation-1",
        currentValue: "Dear Jane",
        value: "Dr. Dolphin",
      }),
    );
  });

  it("treats an explicitly selected email address as an import change", async () => {
    const { POST } = await import("./route.js");
    findBlackbaudConstituentByLookupIdMock.mockResolvedValue({
      blackbaudConstituentId: "440085",
      lookupId: "440085",
      name: "Chelsea Jasper",
    });

    const response = await POST(
      makeRequest({
        rows: [
          {
            "NXT Lookup ID": "440085",
            "Email Address": "chelsea.updated@example.com",
            "Email Type": "Preferred Email 1",
            "Email Make Primary?": "TRUE",
          },
        ],
        mappings: {
          lookupId: "NXT Lookup ID",
          email: "Email Address",
          emailType: "Email Type",
          emailMakePrimary: "Email Make Primary?",
        },
        defaults: { updateEmailFields: true },
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.rows[0].status).toBe("Ready");
    expect(payload.rows[0].writePlan).toEqual([
      expect.objectContaining({
        type: "email_address",
        action: "add",
        address: "chelsea.updated@example.com",
        emailType: "Preferred Email 1",
        makePrimary: true,
      }),
    ]);
  });

  it("shows current NXT contact values and stages an explicitly selected email replacement", async () => {
    const { POST } = await import("./route.js");
    findBlackbaudConstituentByLookupIdMock.mockResolvedValue({
      blackbaudConstituentId: "440085",
      lookupId: "440085",
      name: "Chelsea Jasper",
    });
    blackbaudApiFetchMock
      .mockResolvedValueOnce({
        value: [
          { id: "email-primary", address: "csantor@ju.edu", type: "Preferred Email 1", primary: true },
          { id: "email-other", address: "jbender@ju.edu", type: "Preferred Email 2", primary: false },
        ],
      })
      .mockResolvedValueOnce({ value: [{ id: "phone-1", number: "904-555-0100", type: "Mobile", primary: true }] })
      .mockResolvedValueOnce({ value: [{ id: "address-1", address_lines: ["10 Elm St."], type: "Home", primary: true }] });

    const response = await POST(
      makeRequest({
        rows: [
          {
            "NXT Lookup ID": "440085",
            "Email Address": "chelsea.new@ju.edu",
            "Email Type": "Preferred Email 1",
          },
        ],
        mappings: {
          lookupId: "NXT Lookup ID",
          email: "Email Address",
          emailType: "Email Type",
        },
        defaults: { updateEmailFields: true },
        contactDecisions: {
          1: {
            email: {
              0: { mode: "replace", targetId: "email-primary" },
            },
          },
        },
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.rows[0].currentContacts).toEqual({
      emails: [
        { id: "email-primary", address: "csantor@ju.edu", type: "Preferred Email 1", primary: true },
        { id: "email-other", address: "jbender@ju.edu", type: "Preferred Email 2", primary: false },
      ],
      phones: [{ id: "phone-1", number: "904-555-0100", type: "Mobile", primary: true }],
      addresses: [{
        id: "address-1",
        type: "Home",
        addressLine1: "10 Elm St.",
        addressLine2: "",
        city: "",
        state: "",
        postalCode: "",
        country: "",
        primary: true,
      }],
    });
    expect(payload.rows[0].writePlan).toEqual([
      expect.objectContaining({
        type: "email_address",
        action: "replace",
        targetId: "email-primary",
        address: "chelsea.new@ju.edu",
        preserveExistingSettings: true,
        makePrimary: false,
      }),
    ]);
  });

  it("omits a contact write when the reviewer selects take no action", async () => {
    const { POST } = await import("./route.js");
    findBlackbaudConstituentByLookupIdMock.mockResolvedValue({
      blackbaudConstituentId: "440085",
      lookupId: "440085",
      name: "Chelsea Jasper",
    });
    blackbaudApiFetchMock
      .mockResolvedValueOnce({ value: [] })
      .mockResolvedValueOnce({ value: [] })
      .mockResolvedValueOnce({ value: [] });

    const response = await POST(
      makeRequest({
        rows: [
          {
            "NXT Lookup ID": "440085",
            "Email Address": "chelsea.updated@example.com",
            "Email Type": "Preferred Email 1",
          },
        ],
        mappings: {
          lookupId: "NXT Lookup ID",
          email: "Email Address",
          emailType: "Email Type",
        },
        defaults: { updateEmailFields: true },
        contactDecisions: {
          1: {
            email: {
              0: { mode: "skip" },
            },
          },
        },
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.rows[0].status).toBe("Skipped");
    expect(payload.rows[0].writePlan).toEqual([]);
  });

  it("stages an explicit existing email primary change without changing the email value", async () => {
    const { POST } = await import("./route.js");
    findBlackbaudConstituentByLookupIdMock.mockResolvedValue({
      blackbaudConstituentId: "440085",
      lookupId: "440085",
      name: "Chelsea Jasper",
    });
    blackbaudApiFetchMock
      .mockResolvedValueOnce({
        value: [
          { id: "email-primary", address: "csantor@ju.edu", type: "Preferred Email 1", primary: true },
          { id: "email-other", address: "jbender@ju.edu", type: "Preferred Email 2", primary: false },
        ],
      })
      .mockResolvedValueOnce({ value: [] })
      .mockResolvedValueOnce({ value: [] });

    const response = await POST(
      makeRequest({
        rows: [{ "NXT Lookup ID": "440085" }],
        mappings: { lookupId: "NXT Lookup ID" },
        defaults: { updateEmailFields: true },
        contactDecisions: {
          1: {
            email: {
              __section: {
                existingPrimaryTargetId: "email-other",
                demotedPrimaryType: "Former email",
              },
            },
          },
        },
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.rows[0].writePlan).toEqual([
      expect.objectContaining({
        type: "email_address",
        action: "set_primary",
        targetId: "email-other",
        existingPrimaryId: "email-primary",
        demoteExistingPrimary: true,
        demotedPrimaryType: "Former email",
      }),
    ]);
  });

  it("stages a prior-address transition only after an address add is selected", async () => {
    const { POST } = await import("./route.js");
    findBlackbaudConstituentByLookupIdMock.mockResolvedValue({
      blackbaudConstituentId: "440085",
      lookupId: "440085",
      name: "Chelsea Jasper",
    });
    blackbaudApiFetchMock
      .mockResolvedValueOnce({ value: [] })
      .mockResolvedValueOnce({ value: [] })
      .mockResolvedValueOnce({
        value: [
          {
            id: "address-home",
            address_lines: ["10 Elm St."],
            city: "Jacksonville",
            state: "FL",
            postal_code: "32211",
            type: "Home",
            primary: true,
          },
        ],
      });

    const response = await POST(
      makeRequest({
        rows: [
          {
            "NXT Lookup ID": "440085",
            "Address Line 1": "2800 University Blvd N",
            "Address Type": "Business",
          },
        ],
        mappings: {
          lookupId: "NXT Lookup ID",
          addressLine1: "Address Line 1",
          addressType: "Address Type",
        },
        defaults: { updateAddressFields: true },
        contactDecisions: {
          1: {
            address: {
              __section: {
                previousAddressTargetId: "address-home",
                previousAddressEndDate: "08/08/2026",
              },
            },
          },
        },
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.rows[0].writePlan).toEqual([
      expect.objectContaining({ type: "address", action: "add", addressLine1: "2800 University Blvd N" }),
      expect.objectContaining({
        type: "address",
        action: "mark_previous",
        targetId: "address-home",
        addressType: "Previous Address",
        validTo: "2026-08-08",
        requiresSuccessfulAddressAdd: true,
      }),
    ]);
  });

  it("omits an individual text update when the reviewer selects take no action", async () => {
    const { POST } = await import("./route.js");
    getBlackbaudConstituentByIdMock.mockResolvedValue({
      blackbaudConstituentId: "123",
      lookupId: "A123",
      name: "Jane Dolphin",
      raw: { type: "Individual", title: "Ms." },
    });

    const response = await POST(
      makeRequest({
        rows: [{ "NXT ID": "123", Title: "Dr." }],
        mappings: { blackbaudConstituentId: "NXT ID", title: "Title" },
        defaults: { updateIndividualProfileFields: true },
        fieldDecisions: {
          1: {
            constituent_profile: {
              title: { mode: "skip" },
            },
          },
        },
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.rows[0].status).toBe("Skipped");
    expect(payload.rows[0].writePlan).toEqual([]);
  });

  it("holds ID-less name and address matches for review", async () => {
    const { POST } = await import("./route.js");
    searchBlackbaudConstituentsMock.mockResolvedValue([
      {
        blackbaudConstituentId: "221",
        lookupId: "C221",
        name: "Autumn Leaves",
        email: "prior@example.com",
        address: "100 River Street\nJacksonville, FL 32202",
      },
    ]);

    const response = await POST(
      makeRequest({
        rows: [
          {
            "First Name": "Autumn",
            "Last Name": "Leaves",
            "Address Line 1": "100 River Street",
            "Email Address": "autumn.updated@example.com",
            "Email Type": "Home",
          },
        ],
        mappings: {
          firstName: "First Name",
          lastName: "Last Name",
          addressLine1: "Address Line 1",
          email: "Email Address",
          emailType: "Email Type",
        },
        defaults: { updateEmailFields: true },
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.rows[0].status).toBe("Needs Review");
    expect(payload.rows[0].matchMethod).toBe("name search");
    expect(payload.rows[0].confidence).toBe(60);
    expect(payload.rows[0].writePlan[0]).toEqual(
      expect.objectContaining({ type: "email_address", address: "autumn.updated@example.com" }),
    );
  });

  it("places graduate alumni after bachelor alumni", async () => {
    const { POST } = await import("./route.js");
    getBlackbaudConstituentByIdMock.mockResolvedValue({
      blackbaudConstituentId: "234",
      lookupId: "A234",
      name: "Sam Dolphin",
    });
    blackbaudApiFetchMock.mockResolvedValue({
      value: [{ description: "Alumni - Bachelor's Degree" }],
    });

    const response = await POST(
      makeRequest({
        rows: [
          {
            Name: "Sam Dolphin",
            "NXT ID": "234",
            "New Constituency": "Alumni - Graduate Degree",
            Action: "add",
          },
        ],
        mappings,
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.rows[0].status).toBe("Ready");
    expect(payload.rows[0].proposedCodes).toEqual([
      "Alumni - Bachelor's Degree",
      "Alumni - Graduate Degree",
    ]);
  });

  it("can add a constituency without applying hierarchy order", async () => {
    const { POST } = await import("./route.js");
    getBlackbaudConstituentByIdMock.mockResolvedValue({
      blackbaudConstituentId: "235",
      lookupId: "A235",
      name: "Jordan Dolphin",
    });
    blackbaudApiFetchMock.mockResolvedValue({
      value: [{ description: "Friend" }],
    });

    const response = await POST(
      makeRequest({
        rows: [
          {
            Name: "Jordan Dolphin",
            "NXT ID": "235",
            "New Constituency": "Alumni - Bachelor's Degree",
          },
        ],
        mappings: {
          constituentName: "Name",
          blackbaudConstituentId: "NXT ID",
          targetConstituency: "New Constituency",
        },
        defaults: { defaultAction: "add", useHierarchy: false },
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.rows[0].status).toBe("Ready");
    expect(payload.rows[0].proposedCodes).toEqual([
      "Friend",
      "Alumni - Bachelor's Degree",
    ]);
    expect(payload.rows[0].reasons.join(" ")).toContain("without re-sorting");
  });

  it("keeps email and name matches in review", async () => {
    const { POST } = await import("./route.js");
    searchBlackbaudConstituentsMock.mockResolvedValue([
      {
        blackbaudConstituentId: "345",
        lookupId: "A345",
        name: "Taylor Dolphin",
        email: "taylor@example.com",
      },
    ]);
    blackbaudApiFetchMock.mockResolvedValue({
      value: [{ description: "Student" }],
    });

    const response = await POST(
      makeRequest({
        rows: [
          {
            Name: "Taylor Dolphin",
            Email: "taylor@example.com",
            "Current Constituency": "Student",
            "New Constituency": "Alumni - Bachelor's Degree",
            Action: "replace",
          },
        ],
        mappings: {
          ...mappings,
          blackbaudConstituentId: "",
          lookupId: "",
        },
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.summary.needsReview).toBe(1);
    expect(payload.rows[0].status).toBe("Needs Review");
    expect(payload.rows[0].matchStatus).toBe("needs_review");
    expect(payload.rows[0].reasons.join(" ")).toContain("human review");
  });

  it("derives the preview name from first, last, and preferred name fields", async () => {
    const { POST } = await import("./route.js");
    findBlackbaudConstituentByLookupIdMock.mockResolvedValue({
      blackbaudConstituentId: "456",
      lookupId: "A456",
      name: "Elizabeth Dolphin",
      email: "elizabeth@example.com",
    });
    blackbaudApiFetchMock.mockResolvedValue({
      value: [{ description: "Friend" }],
    });

    const response = await POST(
      makeRequest({
        rows: [
          {
            "First Name": "Elizabeth",
            "Preferred Name": "Liz",
            "Last Name": "Dolphin",
            "Lookup ID": "A456",
            "New Constituency": "Alumni - Bachelor's Degree",
          },
        ],
        mappings: {
          firstName: "First Name",
          preferredName: "Preferred Name",
          lastName: "Last Name",
          lookupId: "Lookup ID",
          targetConstituency: "New Constituency",
        },
        defaults: { defaultAction: "add" },
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.rows[0].input.constituentName).toBe("Liz Dolphin");
    expect(payload.rows[0].input.firstName).toBe("Elizabeth");
    expect(payload.rows[0].input.preferredName).toBe("Liz");
    expect(payload.rows[0].status).toBe("Ready");
    expect(payload.rows[0].proposedCodes).toEqual([
      "Alumni - Bachelor's Degree",
      "Friend",
    ]);
  });

  it("stages education and organization relationship writes", async () => {
    const { POST } = await import("./route.js");
    getBlackbaudConstituentByIdMock.mockResolvedValue({
      blackbaudConstituentId: "789",
      lookupId: "A789",
      name: "Student Dolphin",
      raw: { type: "Individual" },
    });
    blackbaudApiFetchMock.mockResolvedValue({ value: [] });

    const response = await POST(
      makeRequest({
        rows: [
          {
            Name: "Student Dolphin",
            "NXT ID": "789",
            "Education Institution": "Jacksonville University",
            "Education Degree": "Bachelor of Science",
            "Education Major": "Nursing",
            "Education Minor": "Psychology",
            "Education School Type": "University",
            "Education Campus": "Main Campus",
            "Education Fraternity/Sorority": "Alpha Delta Pi",
            "Education GPA": "3.8",
            "Education Class Year": "2026",
            "Education Status": "Graduated",
            "Education Date Graduated": "05/01/2026",
            "Education Date Entered": "08/15/2022",
            "Education Date Left": "05/01/2026",
            "Education Relationship Make Primary?": "Yes",
            "Organization Name": "Dolphin Health System",
            "Organization Relationship Type": "Employee",
            "Organization Title": "Nurse",
          },
        ],
        mappings: {
          constituentName: "Name",
          blackbaudConstituentId: "NXT ID",
          educationInstitution: "Education Institution",
          educationDegree: "Education Degree",
          educationMajor: "Education Major",
          educationMinor: "Education Minor",
          educationSchoolType: "Education School Type",
          educationCampus: "Education Campus",
          educationFraternitySorority: "Education Fraternity/Sorority",
          educationGpa: "Education GPA",
          educationClassYear: "Education Class Year",
          educationStatus: "Education Status",
          educationDateGraduated: "Education Date Graduated",
          educationDateEntered: "Education Date Entered",
          educationDateLeft: "Education Date Left",
          educationRelationshipMakePrimary: "Education Relationship Make Primary?",
          organizationName: "Organization Name",
          organizationRelationshipType: "Organization Relationship Type",
          organizationTitle: "Organization Title",
        },
        defaults: { educationRelationshipAction: "add" },
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.rows[0].status).toBe("Ready");
    expect(payload.rows[0].input.educationRelationship).toMatchObject({
      action: "add",
      duplicatePolicy: "skip_if_matching",
      institution: "Jacksonville University",
      degree: "Bachelor of Science",
      major: "Nursing",
      minor: "Psychology",
      schoolType: "University",
      campus: "Main Campus",
      fraternitySorority: "Alpha Delta Pi",
      gpa: "3.8",
      classYear: "2026",
      status: "Graduated",
      dateGraduated: "05/01/2026",
      dateEntered: "08/15/2022",
      dateLeft: "05/01/2026",
      makePrimary: "Yes",
    });
    expect(payload.rows[0].input.organizationRelationship).toMatchObject({
      action: "add",
      duplicatePolicy: "add_additional",
      name: "Dolphin Health System",
      relationshipType: "Employee",
      title: "Nurse",
    });
    expect(payload.rows[0].writePlan).toEqual([
      expect.objectContaining({
        type: "education_relationship",
        action: "add",
        duplicatePolicy: "skip_if_matching",
        recordType: "Individual",
      }),
      expect.objectContaining({
        type: "organization_relationship",
        action: "add",
        duplicatePolicy: "skip_if_existing_organization",
        recordType: "Individual",
      }),
    ]);
    expect(payload.rows[0].reasons.join(" ")).toContain(
      "Existing education records are never replaced or end-dated",
    );
    expect(payload.rows[0].reasons.join(" ")).toContain(
      "single exact existing NXT organization",
    );
    expect(blackbaudApiFetchMock).toHaveBeenCalledWith(
      "/constituent/v1/constituents/789/educations",
      expect.objectContaining({ userId: 7, authUserId: 7 }),
    );
  });

  it("skips a matching education relationship during preview", async () => {
    const { POST } = await import("./route.js");
    getBlackbaudConstituentByIdMock.mockResolvedValue({
      blackbaudConstituentId: "789",
      lookupId: "A789",
      name: "Student Dolphin",
      raw: { type: "Individual" },
    });
    blackbaudApiFetchMock.mockResolvedValue({
      value: [
        {
          id: "education-1",
          school: "Jacksonville University",
          degree: "Bachelor of Science",
          majors: ["Nursing"],
          class_of: 2026,
        },
      ],
    });

    const response = await POST(
      makeRequest({
        rows: [
          {
            "NXT ID": "789",
            "Education Institution": "Jacksonville University",
            "Education Degree": "Bachelor of Science",
            "Education Major": "Nursing",
            "Education Class Year": "2026",
          },
        ],
        mappings: {
          blackbaudConstituentId: "NXT ID",
          educationInstitution: "Education Institution",
          educationDegree: "Education Degree",
          educationMajor: "Education Major",
          educationClassYear: "Education Class Year",
        },
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.rows[0].status).toBe("Ready");
    expect(payload.rows[0].writePlan).toEqual([
      expect.objectContaining({
        type: "education_relationship",
        action: "skip_existing",
        existingEducation: expect.objectContaining({ id: "education-1" }),
      }),
    ]);
  });

  it("stages a uniquely matched education row for review and update", async () => {
    const { POST } = await import("./route.js");
    getBlackbaudConstituentByIdMock.mockResolvedValue({
      blackbaudConstituentId: "789",
      lookupId: "A789",
      name: "Student Dolphin",
      raw: { type: "Individual" },
    });
    blackbaudApiFetchMock.mockResolvedValue({
      value: [
        {
          id: "education-1",
          school: "Jacksonville University",
          degree: "Bachelor of Science",
          majors: ["Nursing"],
          class_of: 2026,
          status: "Student",
        },
      ],
    });

    const response = await POST(
      makeRequest({
        rows: [
          {
            "NXT ID": "789",
            "Education Institution": "Jacksonville University",
            "Education Degree": "Bachelor of Science",
            "Education Major": "Nursing",
            "Education Class Year": "2026",
            "Education Status": "Graduated",
          },
        ],
        mappings: {
          blackbaudConstituentId: "NXT ID",
          educationInstitution: "Education Institution",
          educationDegree: "Education Degree",
          educationMajor: "Education Major",
          educationClassYear: "Education Class Year",
          educationStatus: "Education Status",
        },
        defaults: { educationRelationshipAction: "review-update" },
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.rows[0].status).toBe("Ready");
    expect(payload.rows[0].writePlan).toEqual([
      expect.objectContaining({
        type: "education_relationship",
        action: "update",
        targetEducationId: "education-1",
        existingEducation: expect.objectContaining({ status: "Student" }),
      }),
    ]);
  });

  it("keeps ambiguous education updates in review without choosing an NXT row", async () => {
    const { POST } = await import("./route.js");
    getBlackbaudConstituentByIdMock.mockResolvedValue({
      blackbaudConstituentId: "789",
      lookupId: "A789",
      name: "Student Dolphin",
      raw: { type: "Individual" },
    });
    blackbaudApiFetchMock.mockResolvedValue({
      value: [
        { id: "education-1", school: "Jacksonville University" },
        { id: "education-2", school: "Jacksonville University" },
      ],
    });

    const response = await POST(
      makeRequest({
        rows: [
          {
            "NXT ID": "789",
            "Education Institution": "Jacksonville University",
            "Education Status": "Graduated",
          },
        ],
        mappings: {
          blackbaudConstituentId: "NXT ID",
          educationInstitution: "Education Institution",
          educationStatus: "Education Status",
        },
        defaults: { educationRelationshipAction: "review-update" },
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.rows[0].status).toBe("Needs Review");
    expect(payload.rows[0].writePlan).toEqual([
      expect.objectContaining({
        type: "education_relationship",
        action: "review_existing",
        requiresReview: true,
      }),
    ]);
    expect(payload.rows[0].writePlan[0].targetEducationId).toBeUndefined();
  });

  it("saves preview runs and row-level preview results when requested", async () => {
    const { POST } = await import("./route.js");
    getBlackbaudConstituentByIdMock.mockResolvedValue({
      blackbaudConstituentId: "567",
      lookupId: "A567",
      name: "Morgan Dolphin",
    });
    blackbaudApiFetchMock.mockResolvedValue({
      value: [{ description: "Friend" }],
    });
    sqlMock
      .mockResolvedValueOnce([
        {
          id: "42",
          status: "previewed",
          source_filename: "alumni-import.csv",
          row_count: 1,
          ready_count: 1,
          needs_review_count: 0,
          conflict_count: 0,
          skipped_count: 0,
          applied_count: 0,
          failed_count: 0,
          created_at: "2026-08-06T14:00:00.000Z",
          updated_at: "2026-08-06T14:00:00.000Z",
          applied_at: null,
        },
      ])
      .mockResolvedValueOnce([{ id: "9", row_number: 1 }]);

    const response = await POST(
      makeRequest({
        rows: [
          {
            Name: "Morgan Dolphin",
            "NXT ID": "567",
            "New Constituency": "Alumni - Graduate Degree",
          },
        ],
        mappings: {
          constituentName: "Name",
          blackbaudConstituentId: "NXT ID",
          targetConstituency: "New Constituency",
        },
        defaults: { defaultAction: "add" },
        sourceFilename: "alumni-import.csv",
        saveRun: true,
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.savedRun.id).toBe("42");
    expect(payload.savedRun.sourceFilename).toBe("alumni-import.csv");
    expect(payload.rows[0].id).toBe("9");
    expect(payload.rows[0].runId).toBe("42");
    expect(payload.summary.ready).toBe(1);
    expect(sqlMock).toHaveBeenCalledTimes(2);
  });

  it("keeps an unmatched new-record row in controlled review", async () => {
    const { POST } = await import("./route.js");
    searchBlackbaudConstituentsMock.mockResolvedValue([]);

    const response = await POST(
      makeRequest({
        rows: [
          {
            "First Name": "Avery",
            "Last Name": "Newcomer",
            "New Constituency": "Friend",
          },
        ],
        mappings: {
          firstName: "First Name",
          lastName: "Last Name",
          targetConstituency: "New Constituency",
        },
        defaults: { defaultAction: "add", importIntent: "new" },
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.rows[0].status).toBe("Needs Review");
    expect(payload.rows[0].intentDisposition).toMatchObject({
      key: "potential_new",
      allowApply: false,
    });
    expect(payload.summary.ready).toBe(0);
    expect(payload.summary.potentialNew).toBe(1);
  });

  it("holds an exact NXT match for duplicate review in a new-record file", async () => {
    const { POST } = await import("./route.js");
    findBlackbaudConstituentByLookupIdMock.mockResolvedValue({
      blackbaudConstituentId: "440085",
      lookupId: "440085",
      name: "Chelsea Jasper",
    });
    blackbaudApiFetchMock.mockResolvedValue({ value: [] });

    const response = await POST(
      makeRequest({
        rows: [
          {
            "NXT Lookup ID": "440085",
            "First Name": "Chelsea",
            "Last Name": "Jasper",
            "New Constituency": "Friend",
          },
        ],
        mappings: {
          lookupId: "NXT Lookup ID",
          firstName: "First Name",
          lastName: "Last Name",
          targetConstituency: "New Constituency",
        },
        defaults: { defaultAction: "add", importIntent: "new" },
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.rows[0].status).toBe("Needs Review");
    expect(payload.rows[0].intentDisposition).toMatchObject({
      key: "possible_duplicate",
      allowApply: false,
    });
    expect(payload.summary.ready).toBe(0);
    expect(payload.summary.needsResolution).toBe(1);
  });

  it("separates confirmed updates from potential new records in a mixed file", async () => {
    const { POST } = await import("./route.js");
    findBlackbaudConstituentByLookupIdMock.mockResolvedValue({
      blackbaudConstituentId: "440085",
      lookupId: "440085",
      name: "Chelsea Jasper",
    });
    searchBlackbaudConstituentsMock.mockResolvedValue([]);
    blackbaudApiFetchMock.mockResolvedValue({ value: [] });

    const response = await POST(
      makeRequest({
        rows: [
          {
            "NXT Lookup ID": "440085",
            "First Name": "Chelsea",
            "Last Name": "Jasper",
            "New Constituency": "Friend",
          },
          {
            "First Name": "Avery",
            "Last Name": "Newcomer",
            "New Constituency": "Friend",
          },
        ],
        mappings: {
          lookupId: "NXT Lookup ID",
          firstName: "First Name",
          lastName: "Last Name",
          targetConstituency: "New Constituency",
        },
        defaults: { defaultAction: "add", importIntent: "mixed" },
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.rows[0].status).toBe("Ready");
    expect(payload.rows[0].intentDisposition.key).toBe("ready_update");
    expect(payload.rows[1].status).toBe("Needs Review");
    expect(payload.rows[1].intentDisposition.key).toBe("potential_new");
    expect(payload.summary.ready).toBe(1);
    expect(payload.summary.potentialNew).toBe(1);
  });
});
