import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const ensureAppSchemaMock = vi.fn();
const getWorkspaceUserMock = vi.fn();
const sqlMock = vi.fn();
const blackbaudApiFetchMock = vi.fn();
const findBlackbaudConstituentByEmailMock = vi.fn();
const findBlackbaudConstituentByLookupIdMock = vi.fn();
const getBlackbaudConstituentByIdMock = vi.fn();
const isBlackbaudQuotaExceededErrorMock = vi.fn();
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
  findBlackbaudConstituentByEmail: findBlackbaudConstituentByEmailMock,
  findBlackbaudConstituentByLookupId: findBlackbaudConstituentByLookupIdMock,
  getBlackbaudConstituentById: getBlackbaudConstituentByIdMock,
  isBlackbaudQuotaExceededError: isBlackbaudQuotaExceededErrorMock,
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
    findBlackbaudConstituentByEmailMock.mockReset();
    findBlackbaudConstituentByLookupIdMock.mockReset();
    getBlackbaudConstituentByIdMock.mockReset();
    isBlackbaudQuotaExceededErrorMock.mockReset();
    searchBlackbaudConstituentsMock.mockReset();

    authMock.mockResolvedValue({ user: { email: "reviewer@example.com" } });
    ensureAppSchemaMock.mockResolvedValue();
    findBlackbaudConstituentByEmailMock.mockResolvedValue(null);
    isBlackbaudQuotaExceededErrorMock.mockReturnValue(false);
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

  it("requires explicit source-code review for a strong ID replacement", async () => {
    const { POST } = await import("./route.js");
    getBlackbaudConstituentByIdMock.mockResolvedValue({
      blackbaudConstituentId: "123",
      lookupId: "A123",
      name: "Jane Dolphin",
      email: "jane@example.com",
    });
    blackbaudApiFetchMock.mockResolvedValue({
      value: [
        {
          id: "student-code-1",
          description: "Student",
          date_from: "2020-08-15",
          date_to: "2024-05-04",
        },
        { id: "friend-code-1", description: "Friend" },
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
    expect(payload.summary.needsReview).toBe(1);
    expect(payload.rows[0].status).toBe("Needs Review");
    expect(payload.rows[0].matchMethod).toBe("NXT system ID");
    expect(payload.rows[0].currentCodes).toEqual(["Student", "Friend"]);
    expect(payload.rows[0].currentCodeDetails).toEqual([
      {
        id: "student-code-1",
        label: "Student",
        startDate: "2020-08-15",
        endDate: "2024-05-04",
      },
      { id: "friend-code-1", label: "Friend", startDate: "", endDate: "" },
    ]);
    expect(payload.rows[0].proposedCodes).toEqual([
      "Alumni - Bachelor's Degree",
      "Friend",
    ]);
    expect(payload.rows[0].writePlan).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "constituent_code",
          action: "replace",
          requiresReview: true,
          sourceCandidates: [
            {
              id: "student-code-1",
              label: "Student",
              startDate: "2020-08-15",
              endDate: "2024-05-04",
            },
          ],
        }),
      ]),
    );
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
      { id: null, label: "Student", startDate: "2020", endDate: "2024-05" },
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
    getBlackbaudConstituentByIdMock.mockResolvedValue({
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

  it("skips duplicate email writes and promotes an existing matching email when the CSV marks it primary", async () => {
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
      .mockResolvedValueOnce({ value: [] })
      .mockResolvedValueOnce({
        value: [
          { id: "email-primary", address: "csantor@ju.edu", type: "Preferred Email 1", primary: true },
          { id: "email-other", address: "jbender@ju.edu", type: "Preferred Email 2", primary: false },
        ],
      })
      .mockResolvedValueOnce({ value: [] })
      .mockResolvedValueOnce({ value: [] });

    const duplicateResponse = await POST(
      makeRequest({
        rows: [
          {
            "NXT Lookup ID": "440085",
            "Email Address": "jbender@ju.edu",
            "Email Type": "Preferred Email 2",
          },
        ],
        mappings: {
          lookupId: "NXT Lookup ID",
          email: "Email Address",
          emailType: "Email Type",
        },
        defaults: { updateEmailFields: true },
      }),
    );
    const duplicatePayload = await duplicateResponse.json();

    expect(duplicateResponse.status).toBe(200);
    expect(duplicatePayload.rows[0].status).toBe("Skipped");
    expect(duplicatePayload.rows[0].writePlan).toEqual([]);
    expect(duplicatePayload.rows[0].reasons).toContain(
      "Matching NXT email already exists, so no email write will be sent.",
    );

    const promoteResponse = await POST(
      makeRequest({
        rows: [
          {
            "NXT Lookup ID": "440085",
            "Email Address": "jbender@ju.edu",
            "Email Type": "Preferred Email 2",
            "Email Make Primary?": "Yes",
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
    const promotePayload = await promoteResponse.json();

    expect(promoteResponse.status).toBe(200);
    expect(promotePayload.rows[0].writePlan).toEqual([
      expect.objectContaining({
        type: "email_address",
        action: "set_primary",
        targetId: "email-other",
        existingPrimaryId: "email-primary",
        demoteExistingPrimary: true,
      }),
    ]);
  });

  it("skips duplicate phone writes and promotes an existing matching phone when the CSV marks it primary", async () => {
    const { POST } = await import("./route.js");
    findBlackbaudConstituentByLookupIdMock.mockResolvedValue({
      blackbaudConstituentId: "440085",
      lookupId: "440085",
      name: "Chelsea Jasper",
    });
    blackbaudApiFetchMock
      .mockResolvedValueOnce({ value: [] })
      .mockResolvedValueOnce({
        value: [
          { id: "phone-primary", number: "904-555-0100", type: "Home", primary: true },
          { id: "phone-mobile", number: "(904) 555-0199", type: "Mobile", primary: false },
        ],
      })
      .mockResolvedValueOnce({ value: [] })
      .mockResolvedValueOnce({ value: [] })
      .mockResolvedValueOnce({
        value: [
          { id: "phone-primary", number: "904-555-0100", type: "Home", primary: true },
          { id: "phone-mobile", number: "(904) 555-0199", type: "Mobile", primary: false },
        ],
      })
      .mockResolvedValueOnce({ value: [] });

    const duplicateResponse = await POST(
      makeRequest({
        rows: [
          {
            "NXT Lookup ID": "440085",
            "Phone Number": "9045550199",
            "Phone Type": "Mobile",
          },
        ],
        mappings: {
          lookupId: "NXT Lookup ID",
          phoneNumber: "Phone Number",
          phoneType: "Phone Type",
        },
        defaults: { updatePhoneFields: true },
      }),
    );
    const duplicatePayload = await duplicateResponse.json();

    expect(duplicateResponse.status).toBe(200);
    expect(duplicatePayload.rows[0].status).toBe("Skipped");
    expect(duplicatePayload.rows[0].writePlan).toEqual([]);
    expect(duplicatePayload.rows[0].reasons).toContain(
      "Matching NXT phone number already exists, so no phone write will be sent.",
    );

    const promoteResponse = await POST(
      makeRequest({
        rows: [
          {
            "NXT Lookup ID": "440085",
            "Phone Number": "9045550199",
            "Phone Type": "Mobile",
            "Phone Make Primary?": "Yes",
          },
        ],
        mappings: {
          lookupId: "NXT Lookup ID",
          phoneNumber: "Phone Number",
          phoneType: "Phone Type",
          phoneMakePrimary: "Phone Make Primary?",
        },
        defaults: { updatePhoneFields: true },
      }),
    );
    const promotePayload = await promoteResponse.json();

    expect(promoteResponse.status).toBe(200);
    expect(promotePayload.rows[0].writePlan).toEqual([
      expect.objectContaining({
        type: "phone",
        action: "set_primary",
        targetId: "phone-mobile",
        existingPrimaryId: "phone-primary",
        demoteExistingPrimary: true,
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

  it("defaults near-matching addresses to no action and defaults demoted primary addresses to Previous Address", async () => {
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
            address_lines: ["8983 Craven Rd."],
            city: "Jacksonville",
            state: "FL",
            postal_code: "32257-5050",
            type: "Home",
            primary: true,
          },
          {
            id: "address-old-primary",
            address_lines: ["PO Box 9334"],
            city: "Jacksonville",
            state: "FL",
            postal_code: "32208-0334",
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
            "Address Line 1": "8983 Craven Rd.",
            City: "Jacksonville",
            State: "FL",
            "Postal Code": "32257",
            "Address Type": "Home",
          },
          {
            "NXT Lookup ID": "440085",
            "Address Line 1": "15795 Baxter Creek Dr.",
            City: "Jacksonville",
            State: "FL",
            "Postal Code": "32218",
            "Address Type": "Home",
          },
        ],
        mappings: {
          lookupId: "NXT Lookup ID",
          addressLine1: "Address Line 1",
          city: "City",
          state: "State",
          postalCode: "Postal Code",
          addressType: "Address Type",
        },
        defaults: { updateAddressFields: true },
        contactDecisions: {
          2: {
            address: {
              0: {
                makePrimary: true,
              },
            },
          },
        },
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.rows[0].writePlan).toEqual([]);
    expect(payload.rows[1].writePlan).toEqual([
      expect.objectContaining({
        type: "address",
        action: "add",
        addressLine1: "15795 Baxter Creek Dr.",
        demotedPrimaryType: "Previous Address",
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

  it("requires an explicit source-row selection before updating an education relationship", async () => {
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

  it("pauses an import batch after a Blackbaud quota error instead of calling NXT for every row", async () => {
    const { POST } = await import("./route.js");
    const quotaError = new Error("Blackbaud call-volume quota is temporarily unavailable.");
    getBlackbaudConstituentByIdMock.mockRejectedValue(quotaError);
    isBlackbaudQuotaExceededErrorMock.mockImplementation((error) => error === quotaError);

    const response = await POST(
      makeRequest({
        rows: [
          { "NXT ID": "100", "Current Constituency": "Student", "New Constituency": "Alumni" },
          { "NXT ID": "101", "Current Constituency": "Student", "New Constituency": "Alumni" },
          { "NXT ID": "102", "Current Constituency": "Student", "New Constituency": "Alumni" },
          { "NXT ID": "103", "Current Constituency": "Student", "New Constituency": "Alumni" },
        ],
        mappings: {
          blackbaudConstituentId: "NXT ID",
          sourceConstituency: "Current Constituency",
          targetConstituency: "New Constituency",
        },
        defaults: { defaultAction: "replace" },
        appendRun: true,
        fastPreview: true,
        rowNumberOffset: 8,
        totalRowCount: 12,
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    // Two requests can start together, but remaining rows must be halted once
    // Blackbaud reports the subscription-level quota has been exhausted.
    expect(getBlackbaudConstituentByIdMock).toHaveBeenCalledTimes(2);
    expect(payload.rows.map((row) => row.rowNumber)).toEqual([9, 10, 11, 12]);
    expect(payload.rows.every((row) => row.status === "Needs Review")).toBe(true);
    expect(payload.rows.every((row) => row.nxtChecksPaused)).toBe(true);
    expect(payload.rows.every((row) => row.intentDisposition.key === "nxt_checks_paused")).toBe(true);
    expect(payload.rows.every((row) => row.writePlan.length === 0)).toBe(true);
    expect(payload.rows.every((row) => !row.reasons.join(" ").includes("was not found"))).toBe(true);
    expect(payload.rows[1].reasons.join(" ")).toContain(
      "no NXT record was checked",
    );
    expect(payload.warnings.join(" ")).toContain("call-volume quota is temporarily unavailable");
  });

  it("reuses a recent confirmed lookup-ID match for a fast preview", async () => {
    const { POST } = await import("./route.js");
    sqlMock.mockResolvedValueOnce([
      {
        match_key: "lookup:440085",
        payload: {
          method: "NXT lookup ID",
          confidence: 100,
          match: {
            blackbaudConstituentId: "440085",
            lookupId: "440085",
            name: "Chelsea Jasper",
            email: null,
          },
        },
      },
    ]);

    const response = await POST(
      makeRequest({
        rows: [{ "Lookup ID": "440085" }],
        mappings: { lookupId: "Lookup ID" },
        appendRun: true,
        fastPreview: true,
        totalRowCount: 1,
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(findBlackbaudConstituentByLookupIdMock).not.toHaveBeenCalled();
    expect(payload.rows[0]).toMatchObject({
      matchMethod: "NXT lookup ID",
      match: { blackbaudConstituentId: "440085", lookupId: "440085" },
    });
  });

  it("defers profile comparisons in a fast preview instead of treating unloaded NXT values as blank", async () => {
    const { POST } = await import("./route.js");
    sqlMock.mockResolvedValueOnce([
      {
        match_key: "id:543503",
        payload: {
          method: "NXT system ID",
          confidence: 100,
          match: {
            blackbaudConstituentId: "543503",
            lookupId: "543503",
            name: "Victoria E. Richards",
          },
        },
      },
    ]);

    const response = await POST(
      makeRequest({
        rows: [
          {
            "NXT ID": "543503",
            "First Name": "Victoria",
            "Last Name": "Richards",
          },
        ],
        mappings: {
          blackbaudConstituentId: "NXT ID",
          firstName: "First Name",
          lastName: "Last Name",
        },
        defaults: { updateNameFields: true },
        appendRun: true,
        fastPreview: true,
        totalRowCount: 1,
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.rows[0].deferredHydration).toMatchObject({ detail: true });
    expect(payload.rows[0].writePlan).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "profile_detail_review", deferredHydration: true }),
      ]),
    );
    expect(payload.rows[0].writePlan).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "constituent_name" }),
      ]),
    );
  });

  it("defers constituency replacement review in a fast preview instead of treating unloaded codes as missing", async () => {
    const { POST } = await import("./route.js");
    sqlMock.mockResolvedValueOnce([
      {
        match_key: "id:543503",
        payload: {
          method: "NXT system ID",
          confidence: 100,
          match: {
            blackbaudConstituentId: "543503",
            lookupId: "543503",
            name: "Victoria E. Richards",
          },
        },
      },
    ]);

    const response = await POST(
      makeRequest({
        rows: [
          {
            "NXT ID": "543503",
            "Current Constituency": "Student",
            "New Constituency": "Alumni - Bachelor's Degree",
            Action: "replace",
          },
        ],
        mappings,
        appendRun: true,
        fastPreview: true,
        totalRowCount: 1,
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.rows[0].deferredHydration).toMatchObject({ codes: true });
    expect(payload.rows[0].codesSnapshotLoaded).toBe(false);
    expect(payload.rows[0].currentCodeDetails).toEqual([]);
    expect(payload.rows[0].reasons.join(" ")).not.toContain("was not found on the NXT record");
    expect(payload.rows[0].writePlan).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "constituent_code_detail_review",
          deferredHydration: true,
        }),
      ]),
    );
  });

  it("keeps a hydrated profile snapshot when the saved review is refreshed", async () => {
    const { mergePriorReviewState } = await import("./route.js");
    const row = {
      status: "Needs Review",
      input: {
        individualProfileUpdate: { title: "Ms." },
      },
      deferredHydration: { detail: true },
      writePlan: [
        {
          type: "profile_detail_review",
          action: "load_current",
          requiresReview: true,
          deferredHydration: true,
          fieldDecisions: {},
        },
      ],
      reasons: ["Open this row to load the current NXT name and profile values before reviewing CSV changes."],
    };
    const priorSavedRow = {
      preview: {
        profileSnapshot: { type: "Individual", title: "Dr." },
        profileSnapshotLoaded: true,
      },
      requested_writes: [
        {
          type: "constituent_profile",
          action: "update",
          title: "Ms.",
          current: { title: "Dr." },
        },
      ],
      blackbaud_result: null,
    };

    const merged = mergePriorReviewState(row, priorSavedRow);

    expect(merged.status).toBe("Ready");
    expect(merged.deferredHydration).toBeNull();
    expect(merged.profileSnapshot).toEqual({ type: "Individual", title: "Dr." });
    expect(merged.profileSnapshotLoaded).toBe(true);
    expect(merged.writePlan).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "constituent_profile",
          title: "Ms.",
          current: expect.objectContaining({ title: "Dr." }),
        }),
      ]),
    );
    expect(merged.writePlan).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "profile_detail_review" })]),
    );
  });

  it("does not reuse an unmarked partial profile snapshot from an older saved review", async () => {
    const { mergePriorReviewState } = await import("./route.js");
    const row = {
      status: "Needs Review",
      input: { individualProfileUpdate: { title: "Ms." } },
      deferredHydration: { detail: true },
      writePlan: [
        {
          type: "profile_detail_review",
          action: "load_current",
          requiresReview: true,
          deferredHydration: true,
          fieldDecisions: {},
        },
      ],
      reasons: [],
    };

    const merged = mergePriorReviewState(row, {
      preview: { profileSnapshot: { title: "" } },
      requested_writes: [],
      blackbaud_result: null,
    });

    expect(merged.deferredHydration).toMatchObject({ detail: true });
    expect(merged.profileSnapshotLoaded).toBe(false);
    expect(merged.writePlan).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "profile_detail_review" })]),
    );
  });

  it("reuses a cached lookup alias for a fast preview", async () => {
    const { POST } = await import("./route.js");
    sqlMock.mockResolvedValueOnce([
      {
        match_key: "lookup:A123",
        payload: {
          method: "NXT lookup ID",
          confidence: 100,
          match: {
            blackbaudConstituentId: "123",
            lookupId: "A123",
            name: "Jane Dolphin",
          },
        },
      },
    ]);

    const response = await POST(
      makeRequest({
        rows: [{ "NXT ID": "123", "Lookup ID": "A123" }],
        mappings: { blackbaudConstituentId: "NXT ID", lookupId: "Lookup ID" },
        appendRun: true,
        fastPreview: true,
        totalRowCount: 1,
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(getBlackbaudConstituentByIdMock).not.toHaveBeenCalled();
    expect(findBlackbaudConstituentByLookupIdMock).not.toHaveBeenCalled();
    expect(payload.rows[0]).toMatchObject({
      matchMethod: "NXT lookup ID",
      match: { blackbaudConstituentId: "123", lookupId: "A123" },
    });
  });

  it("reuses a confirmed system ID when no lookup ID is available", async () => {
    const { POST } = await import("./route.js");
    sqlMock.mockResolvedValueOnce([
      {
        match_key: "id:123",
        payload: {
          method: "NXT system ID",
          confidence: 100,
          match: {
            blackbaudConstituentId: "123",
            lookupId: null,
            name: "Jane Dolphin",
          },
        },
      },
    ]);

    const response = await POST(
      makeRequest({
        rows: [{ "NXT ID": "123" }],
        mappings: { blackbaudConstituentId: "NXT ID" },
        appendRun: true,
        fastPreview: true,
        totalRowCount: 1,
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(getBlackbaudConstituentByIdMock).not.toHaveBeenCalled();
    expect(payload.rows[0].match).toEqual(
      expect.objectContaining({ blackbaudConstituentId: "123", lookupId: null }),
    );
  });

  it("discards partial contact review data when a later NXT request reports quota exhaustion", async () => {
    const { POST } = await import("./route.js");
    const quotaError = new Error(
      'Blackbaud call-volume quota is temporarily unavailable. Provider response: {"statusCode":403,"message":"Out of call volume quota. Quota will be replenished in 07:01:20."}',
    );
    getBlackbaudConstituentByIdMock.mockResolvedValue({
      blackbaudConstituentId: "100",
      lookupId: "100",
      name: "Taylor Test",
      email: "old@example.com",
    });
    blackbaudApiFetchMock.mockRejectedValue(quotaError);
    isBlackbaudQuotaExceededErrorMock.mockImplementation((error) => error === quotaError);

    const response = await POST(
      makeRequest({
        rows: [{ "NXT ID": "100", Email: "new@example.com" }],
        mappings: {
          blackbaudConstituentId: "NXT ID",
          email: "Email",
        },
        defaults: { updateEmailFields: true },
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(blackbaudApiFetchMock).toHaveBeenCalled();
    expect(payload.rows[0]).toMatchObject({
      nxtChecksPaused: true,
      match: null,
      currentCodes: [],
      currentCodeDetails: [],
      currentContacts: { emails: [], phones: [], addresses: [] },
      currentEducations: [],
      writePlan: [],
      intentDisposition: {
        key: "nxt_checks_paused",
        allowApply: false,
      },
    });
    expect(payload.rows[0].reasons).toHaveLength(1);
    expect(payload.rows[0].reasons.join(" ")).not.toContain('"statusCode"');
    expect(payload.rows[0].reasons.join(" ")).not.toContain("email address");
    expect(payload.warnings.join(" ")).not.toContain('"statusCode"');
  });

  it("reads existing profile values from a nested NXT constituent response", async () => {
    const { buildProfileDetailWrites, hasUsableProfileSnapshot } = await import("./route.js");
    const match = {
      raw: {
        id: "response-envelope-id",
        data: {
          constituent: {
            id: "543503",
            first: "Victoria",
            last: "Richards",
            preferred_name: "Victoria",
            title: "Ms.",
            gender: "Female",
          },
        },
      },
    };
    const input = {
      nameUpdate: {
        firstName: "Victoria",
        lastName: "Richards",
        preferredName: "Victoria",
      },
      individualProfileUpdate: {
        title: "Ms.",
        gender: "Female",
      },
    };

    expect(hasUsableProfileSnapshot(match)).toBe(true);
    expect(buildProfileDetailWrites(input, match)).toEqual([]);
  });

  it("rejects oversized persisted batches before making any NXT requests", async () => {
    const { POST } = await import("./route.js");
    const response = await POST(
      makeRequest({
        rows: Array.from({ length: 5 }, (_, index) => ({ "NXT ID": String(index + 1) })),
        mappings: { blackbaudConstituentId: "NXT ID" },
        appendRun: true,
        fastPreview: true,
        totalRowCount: 5,
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toContain("limited to 4 rows");
    expect(getBlackbaudConstituentByIdMock).not.toHaveBeenCalled();
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
