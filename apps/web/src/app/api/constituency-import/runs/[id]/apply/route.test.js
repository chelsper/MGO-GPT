import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const ensureAppSchemaMock = vi.fn();
const getWorkspaceUserMock = vi.fn();
const sqlMock = vi.fn();
const blackbaudApiFetchMock = vi.fn();

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
}));

function makeRequest(search = "", body) {
  return new Request(`https://example.com/api/constituency-import/runs/42/apply${search}`, {
    method: "POST",
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
}

function makeRun(overrides = {}) {
  return {
    id: "42",
    status: "previewed",
    warnings: [],
    summary: {},
    row_count: 1,
    ready_count: 1,
    needs_review_count: 0,
    conflict_count: 0,
    skipped_count: 0,
    applied_count: 0,
    failed_count: 0,
    ...overrides,
  };
}

describe("constituency import run apply route", () => {
  beforeEach(() => {
    authMock.mockReset();
    ensureAppSchemaMock.mockReset();
    getWorkspaceUserMock.mockReset();
    sqlMock.mockReset();
    blackbaudApiFetchMock.mockReset();

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
    });
  });

  it("rejects an empty controlled batch before any NXT or database write", async () => {
    const { POST } = await import("./route.js");

    const response = await POST(makeRequest("", { rowIds: [] }), { params: { id: "42" } });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Select at least one Ready row before applying changes to NXT.");
    expect(sqlMock).not.toHaveBeenCalled();
    expect(blackbaudApiFetchMock).not.toHaveBeenCalled();
  });

  it("rejects stale selected rows before any NXT write and returns the refreshed run", async () => {
    const { POST } = await import("./route.js");
    const currentRow = {
      id: "9",
      run_id: "42",
      row_number: 1,
      status: "Applied",
      requested_writes: [],
      preview: { rowNumber: 1, writePlan: [] },
    };

    sqlMock
      .mockResolvedValueOnce([makeRun({ ready_count: 0, applied_count: 1, status: "applied" })])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeRun({ ready_count: 0, applied_count: 1, status: "applied" })])
      .mockResolvedValueOnce([currentRow]);

    const response = await POST(makeRequest("", { rowIds: ["9"] }), { params: { id: "42" } });
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toContain("no longer Ready");
    expect(payload.savedRun.status).toBe("applied");
    expect(payload.rows).toHaveLength(1);
    expect(blackbaudApiFetchMock).not.toHaveBeenCalled();
  });

  it("applies additive constituent-code rows to NXT", async () => {
    const { POST } = await import("./route.js");
    const write = {
      type: "constituent_code",
      action: "add",
      targetConstituency: "Alumni - Graduate Degree",
      startDate: "2026-08-01",
    };
    const row = {
      id: "9",
      run_id: "42",
      row_number: 1,
      status: "Ready",
      matched_blackbaud_constituent_id: "123",
      target_constituency: "Alumni - Graduate Degree",
      requested_writes: [write],
      preview: {
        rowNumber: 1,
        input: { constituentName: "Jane Dolphin" },
        match: { blackbaudConstituentId: "123" },
        writePlan: [write],
      },
    };

    sqlMock
      .mockResolvedValueOnce([makeRun()])
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ...row, status: "Applied" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeRun({ status: "applied", applied_count: 1, ready_count: 0 })])
      .mockResolvedValueOnce([{ ...row, status: "Applied", applied_at: "2026-08-06T12:00:00Z" }]);
    blackbaudApiFetchMock
      .mockResolvedValueOnce({ value: [] })
      .mockResolvedValueOnce({ id: "cc-1" });

    const response = await POST(makeRequest("", { rowIds: ["9"] }), { params: { id: "42" } });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(sqlMock.mock.calls[1][0].join(" ")).toContain("id = ANY");
    expect(sqlMock.mock.calls[1][2]).toEqual(["9"]);
    expect(blackbaudApiFetchMock).toHaveBeenNthCalledWith(
      1,
      "/constituent/v1/constituents/123/constituentcodes",
      {
        userId: 7,
        authUserId: 7,
        origin: "https://example.com",
      },
    );
    expect(blackbaudApiFetchMock).toHaveBeenNthCalledWith(2, "/constituent/v1/constituentcodes", {
      userId: 7,
      authUserId: 7,
      origin: "https://example.com",
      method: "POST",
      body: {
        constituent_id: "123",
        description: "Alumni - Graduate Degree",
        date_from: "2026-08-01",
      },
    });
    expect(payload.applySummary.applied).toBe(1);
    expect(payload.savedRun.appliedCount).toBe(1);
  });

  it("applies a staged preferred-name correction without clearing other name fields", async () => {
    const { POST } = await import("./route.js");
    const write = {
      type: "constituent_name",
      action: "update",
      recordType: "Individual",
      firstName: "",
      lastName: "",
      preferredName: "Chels",
      blankValuePolicy: "leave_unchanged",
    };
    const row = {
      id: "14",
      run_id: "42",
      row_number: 1,
      status: "Ready",
      matched_blackbaud_constituent_id: "123",
      requested_writes: [write],
      preview: {
        rowNumber: 1,
        input: { constituentName: "Chelsea Jasper" },
        match: { blackbaudConstituentId: "123" },
        writePlan: [write],
      },
    };

    sqlMock
      .mockResolvedValueOnce([makeRun()])
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ...row, status: "Applied" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeRun({ status: "applied", applied_count: 1, ready_count: 0 })])
      .mockResolvedValueOnce([{ ...row, status: "Applied", applied_at: "2026-08-07T12:00:00Z" }]);
    blackbaudApiFetchMock.mockResolvedValueOnce({ id: "123", preferred_name: "Chels" });

    const response = await POST(makeRequest(), { params: { id: "42" } });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(blackbaudApiFetchMock).toHaveBeenCalledWith(
      "/constituent/v1/constituents/123",
      {
        userId: 7,
        authUserId: 7,
        origin: "https://example.com",
        method: "PATCH",
        body: { preferred_name: "Chels" },
      },
    );
    expect(payload.applySummary.applied).toBe(1);
  });

  it("applies selected individual profile fields with a structured NXT birth date", async () => {
    const { POST } = await import("./route.js");
    const write = {
      type: "constituent_profile",
      action: "update",
      recordType: "Individual",
      title: "Dr.",
      gender: "Female",
      ethnicity: "Hispanic or Latino",
      birthDate: "07/23/80",
      suffix: "Ph.D.",
    };
    const row = {
      id: "20",
      run_id: "42",
      row_number: 1,
      status: "Ready",
      matched_blackbaud_constituent_id: "123",
      requested_writes: [write],
      preview: { input: {}, match: { blackbaudConstituentId: "123" }, writePlan: [write] },
    };

    sqlMock
      .mockResolvedValueOnce([makeRun()])
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ...row, status: "Applied" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeRun({ status: "applied", applied_count: 1, ready_count: 0 })])
      .mockResolvedValueOnce([{ ...row, status: "Applied", applied_at: "2026-08-07T12:00:00Z" }]);
    blackbaudApiFetchMock.mockResolvedValueOnce({ id: "123" });

    const response = await POST(makeRequest(), { params: { id: "42" } });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(blackbaudApiFetchMock).toHaveBeenCalledWith(
      "/constituent/v1/constituents/123",
      {
        userId: 7,
        authUserId: 7,
        origin: "https://example.com",
        method: "PATCH",
        body: {
          title: "Dr.",
          gender: "Female",
          ethnicity: "Hispanic or Latino",
          suffix: "Ph.D.",
          birthdate: { y: 1980, m: 7, d: 23 },
        },
      },
    );
    expect(payload.applySummary.applied).toBe(1);
  });

  it("updates a staged custom primary NXT addressee", async () => {
    const { POST } = await import("./route.js");
    const write = {
      type: "constituent_name_format",
      action: "update_primary",
      kind: "addressee",
      targetId: "name-format-1",
      value: "Dr. Jane Dolphin",
    };
    const row = {
      id: "21",
      run_id: "42",
      row_number: 1,
      status: "Ready",
      matched_blackbaud_constituent_id: "123",
      requested_writes: [write],
      preview: { input: {}, match: { blackbaudConstituentId: "123" }, writePlan: [write] },
    };

    sqlMock
      .mockResolvedValueOnce([makeRun()])
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ...row, status: "Applied" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeRun({ status: "applied", applied_count: 1, ready_count: 0 })])
      .mockResolvedValueOnce([{ ...row, status: "Applied", applied_at: "2026-08-07T12:00:00Z" }]);
    blackbaudApiFetchMock.mockResolvedValueOnce({ id: "name-format-1" });

    const response = await POST(makeRequest(), { params: { id: "42" } });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(blackbaudApiFetchMock).toHaveBeenCalledWith(
      "/constituent/v1/primarynameformats/name-format-1",
      {
        userId: 7,
        authUserId: 7,
        origin: "https://example.com",
        method: "PATCH",
        body: {
          custom_format: true,
          formatted_name: "Dr. Jane Dolphin",
        },
      },
    );
    expect(payload.applySummary.applied).toBe(1);
  });

  it("adds a new email address after checking NXT for duplicates", async () => {
    const { POST } = await import("./route.js");
    const write = {
      type: "email_address",
      action: "add_if_new",
      address: "chelsea.updated@example.com",
      emailType: "Preferred Email 1",
      makePrimary: true,
    };
    const row = {
      id: "15",
      run_id: "42",
      row_number: 1,
      status: "Ready",
      matched_blackbaud_constituent_id: "123",
      requested_writes: [write],
      preview: {
        rowNumber: 1,
        input: { constituentName: "Chelsea Jasper" },
        match: { blackbaudConstituentId: "123" },
        writePlan: [write],
      },
    };

    sqlMock
      .mockResolvedValueOnce([makeRun()])
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ...row, status: "Applied" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeRun({ status: "applied", applied_count: 1, ready_count: 0 })])
      .mockResolvedValueOnce([{ ...row, status: "Applied", applied_at: "2026-08-07T12:00:00Z" }]);
    blackbaudApiFetchMock
      .mockResolvedValueOnce({ value: [{ id: "old-email", address: "prior@example.com" }] })
      .mockResolvedValueOnce({ id: "new-email" });

    const response = await POST(makeRequest(), { params: { id: "42" } });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(blackbaudApiFetchMock).toHaveBeenNthCalledWith(
      1,
      "/constituent/v1/constituents/123/emailaddresses",
      {
        userId: 7,
        authUserId: 7,
        origin: "https://example.com",
      },
    );
    expect(blackbaudApiFetchMock).toHaveBeenNthCalledWith(2, "/constituent/v1/emailaddresses", {
      userId: 7,
      authUserId: 7,
      origin: "https://example.com",
      method: "POST",
      body: {
        constituent_id: "123",
        address: "chelsea.updated@example.com",
        type: "Preferred Email 1",
        primary: true,
      },
    });
    expect(payload.applySummary.applied).toBe(1);
  });

  it("replaces a selected NXT email without changing its type or primary setting", async () => {
    const { POST } = await import("./route.js");
    const write = {
      type: "email_address",
      action: "replace",
      targetId: "email-primary",
      address: "chelsea.new@example.com",
      preserveExistingSettings: true,
    };
    const row = {
      id: "17",
      run_id: "42",
      row_number: 1,
      status: "Ready",
      matched_blackbaud_constituent_id: "123",
      requested_writes: [write],
      preview: { input: {}, match: { blackbaudConstituentId: "123" }, writePlan: [write] },
    };

    sqlMock
      .mockResolvedValueOnce([makeRun()])
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ...row, status: "Applied" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeRun({ status: "applied", applied_count: 1, ready_count: 0 })])
      .mockResolvedValueOnce([{ ...row, status: "Applied", applied_at: "2026-08-07T12:00:00Z" }]);
    blackbaudApiFetchMock
      .mockResolvedValueOnce({
        value: [
          { id: "email-primary", address: "csantor@ju.edu", type: "Preferred Email 1", primary: true },
        ],
      })
      .mockResolvedValueOnce({ id: "email-primary", address: "chelsea.new@example.com" });

    const response = await POST(makeRequest(), { params: { id: "42" } });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(blackbaudApiFetchMock).toHaveBeenNthCalledWith(
      2,
      "/constituent/v1/emailaddresses/email-primary",
      {
        userId: 7,
        authUserId: 7,
        origin: "https://example.com",
        method: "PATCH",
        body: { address: "chelsea.new@example.com" },
      },
    );
    expect(payload.applySummary.applied).toBe(1);
  });

  it("adds a phone as an additional NXT contact", async () => {
    const { POST } = await import("./route.js");
    const write = {
      type: "phone",
      action: "add",
      number: "904-555-0199",
      phoneType: "Mobile",
      makePrimary: false,
    };
    const row = {
      id: "18",
      run_id: "42",
      row_number: 1,
      status: "Ready",
      matched_blackbaud_constituent_id: "123",
      requested_writes: [write],
      preview: { input: {}, match: { blackbaudConstituentId: "123" }, writePlan: [write] },
    };

    sqlMock
      .mockResolvedValueOnce([makeRun()])
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ...row, status: "Applied" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeRun({ status: "applied", applied_count: 1, ready_count: 0 })])
      .mockResolvedValueOnce([{ ...row, status: "Applied", applied_at: "2026-08-07T12:00:00Z" }]);
    blackbaudApiFetchMock
      .mockResolvedValueOnce({ value: [{ id: "phone-old", number: "904-555-0100", type: "Home", primary: true }] })
      .mockResolvedValueOnce({ id: "phone-new" });

    const response = await POST(makeRequest(), { params: { id: "42" } });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(blackbaudApiFetchMock).toHaveBeenNthCalledWith(2, "/constituent/v1/phones", {
      userId: 7,
      authUserId: 7,
      origin: "https://example.com",
      method: "POST",
      body: {
        constituent_id: "123",
        number: "904-555-0199",
        type: "Mobile",
        primary: false,
      },
    });
    expect(payload.applySummary.applied).toBe(1);
  });

  it("replaces a selected NXT address without overwriting its type or primary setting", async () => {
    const { POST } = await import("./route.js");
    const write = {
      type: "address",
      action: "replace",
      targetId: "address-home",
      addressLine1: "2800 University Blvd N",
      addressLine2: "",
      city: "Jacksonville",
      state: "FL",
      postalCode: "32211",
      country: "United States",
      validFrom: "07/01/2026",
      preserveExistingSettings: true,
    };
    const row = {
      id: "19",
      run_id: "42",
      row_number: 1,
      status: "Ready",
      matched_blackbaud_constituent_id: "123",
      requested_writes: [write],
      preview: { input: {}, match: { blackbaudConstituentId: "123" }, writePlan: [write] },
    };

    sqlMock
      .mockResolvedValueOnce([makeRun()])
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ...row, status: "Applied" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeRun({ status: "applied", applied_count: 1, ready_count: 0 })])
      .mockResolvedValueOnce([{ ...row, status: "Applied", applied_at: "2026-08-07T12:00:00Z" }]);
    blackbaudApiFetchMock
      .mockResolvedValueOnce({
        value: [
          {
            id: "address-home",
            address_lines: ["10 Elm St."],
            type: "Home",
            primary: true,
          },
        ],
      })
      .mockResolvedValueOnce({ id: "address-home" });

    const response = await POST(makeRequest(), { params: { id: "42" } });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(blackbaudApiFetchMock).toHaveBeenNthCalledWith(
      2,
      "/constituent/v1/addresses/address-home",
      {
        userId: 7,
        authUserId: 7,
        origin: "https://example.com",
        method: "PATCH",
        body: {
          address_lines: ["2800 University Blvd N"],
          city: "Jacksonville",
          state: "FL",
          postal_code: "32211",
          country: "United States",
          valid_from: "2026-07-01",
        },
      },
    );
    expect(payload.applySummary.applied).toBe(1);
  });

  it("does not add a duplicate email address", async () => {
    const { POST } = await import("./route.js");
    const write = {
      type: "email_address",
      action: "add_if_new",
      address: "existing@example.com",
      emailType: "Home",
      makePrimary: false,
    };
    const row = {
      id: "16",
      run_id: "42",
      row_number: 1,
      status: "Ready",
      matched_blackbaud_constituent_id: "123",
      requested_writes: [write],
      preview: { input: {}, match: { blackbaudConstituentId: "123" }, writePlan: [write] },
    };

    sqlMock
      .mockResolvedValueOnce([makeRun()])
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ...row, status: "Applied" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeRun({ status: "applied", applied_count: 1, ready_count: 0 })])
      .mockResolvedValueOnce([{ ...row, status: "Applied", applied_at: "2026-08-07T12:00:00Z" }]);
    blackbaudApiFetchMock.mockResolvedValueOnce({
      value: [{ id: "existing-email", address: "Existing@Example.com", primary: false }],
    });

    const response = await POST(makeRequest(), { params: { id: "42" } });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(blackbaudApiFetchMock).toHaveBeenCalledTimes(1);
    expect(payload.applySummary.applied).toBe(1);
  });

  it("promotes a selected existing email to primary without changing its value", async () => {
    const { POST } = await import("./route.js");
    const write = {
      type: "email_address",
      action: "set_primary",
      targetId: "email-preferred-2",
      existingPrimaryId: "email-preferred-1",
      demoteExistingPrimary: true,
      demotedPrimaryType: "Preferred Email 1",
    };
    const row = {
      id: "25",
      run_id: "42",
      row_number: 1,
      status: "Ready",
      matched_blackbaud_constituent_id: "123",
      requested_writes: [write],
      preview: { input: {}, match: { blackbaudConstituentId: "123" }, writePlan: [write] },
    };

    sqlMock
      .mockResolvedValueOnce([makeRun()])
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ...row, status: "Applied" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeRun({ status: "applied", applied_count: 1, ready_count: 0 })])
      .mockResolvedValueOnce([{ ...row, status: "Applied", applied_at: "2026-08-09T12:00:00Z" }]);
    blackbaudApiFetchMock
      .mockResolvedValueOnce({
        value: [
          { id: "email-preferred-1", address: "current@example.com", primary: true },
          { id: "email-preferred-2", address: "new-primary@example.com", primary: false },
        ],
      })
      .mockResolvedValueOnce({ id: "email-preferred-1" })
      .mockResolvedValueOnce({ id: "email-preferred-2" });

    const response = await POST(makeRequest(), { params: { id: "42" } });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(blackbaudApiFetchMock).toHaveBeenNthCalledWith(
      2,
      "/constituent/v1/emailaddresses/email-preferred-1",
      {
        userId: 7,
        authUserId: 7,
        origin: "https://example.com",
        method: "PATCH",
        body: { primary: false, type: "Preferred Email 1" },
      },
    );
    expect(blackbaudApiFetchMock).toHaveBeenNthCalledWith(
      3,
      "/constituent/v1/emailaddresses/email-preferred-2",
      {
        userId: 7,
        authUserId: 7,
        origin: "https://example.com",
        method: "PATCH",
        body: { primary: true },
      },
    );
    expect(payload.applySummary.applied).toBe(1);
  });

  it("promotes a selected existing phone to primary without changing its number", async () => {
    const { POST } = await import("./route.js");
    const write = {
      type: "phone",
      action: "set_primary",
      targetId: "phone-mobile",
      existingPrimaryId: "phone-home",
      demoteExistingPrimary: true,
    };
    const row = {
      id: "26",
      run_id: "42",
      row_number: 1,
      status: "Ready",
      matched_blackbaud_constituent_id: "123",
      requested_writes: [write],
      preview: { input: {}, match: { blackbaudConstituentId: "123" }, writePlan: [write] },
    };

    sqlMock
      .mockResolvedValueOnce([makeRun()])
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ...row, status: "Applied" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeRun({ status: "applied", applied_count: 1, ready_count: 0 })])
      .mockResolvedValueOnce([{ ...row, status: "Applied", applied_at: "2026-08-09T12:00:00Z" }]);
    blackbaudApiFetchMock
      .mockResolvedValueOnce({
        value: [
          { id: "phone-home", number: "904-555-0100", primary: true },
          { id: "phone-mobile", number: "904-555-0199", primary: false },
        ],
      })
      .mockResolvedValueOnce({ id: "phone-home" })
      .mockResolvedValueOnce({ id: "phone-mobile" });

    const response = await POST(makeRequest(), { params: { id: "42" } });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(blackbaudApiFetchMock).toHaveBeenNthCalledWith(2, "/constituent/v1/phones/phone-home", {
      userId: 7,
      authUserId: 7,
      origin: "https://example.com",
      method: "PATCH",
      body: { primary: false },
    });
    expect(blackbaudApiFetchMock).toHaveBeenNthCalledWith(3, "/constituent/v1/phones/phone-mobile", {
      userId: 7,
      authUserId: 7,
      origin: "https://example.com",
      method: "PATCH",
      body: { primary: true },
    });
    expect(payload.applySummary.applied).toBe(1);
  });

  it("marks a selected address Previous Address only after the new address is added", async () => {
    const { POST } = await import("./route.js");
    const addWrite = {
      type: "address",
      action: "add",
      addressLine1: "2800 University Blvd N",
      city: "Jacksonville",
      state: "FL",
      postalCode: "32211",
      country: "United States",
      addressType: "Home",
      makePrimary: true,
    };
    const previousWrite = {
      type: "address",
      action: "mark_previous",
      targetId: "address-old",
      addressType: "Previous Address",
      validTo: "2026-08-08",
      requiresSuccessfulAddressAdd: true,
    };
    const row = {
      id: "27",
      run_id: "42",
      row_number: 1,
      status: "Ready",
      matched_blackbaud_constituent_id: "123",
      requested_writes: [addWrite, previousWrite],
      preview: {
        input: {},
        match: { blackbaudConstituentId: "123" },
        writePlan: [addWrite, previousWrite],
      },
    };

    sqlMock
      .mockResolvedValueOnce([makeRun()])
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ...row, status: "Applied" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeRun({ status: "applied", applied_count: 1, ready_count: 0 })])
      .mockResolvedValueOnce([{ ...row, status: "Applied", applied_at: "2026-08-09T12:00:00Z" }]);
    blackbaudApiFetchMock
      .mockResolvedValueOnce({
        value: [{ id: "address-old", address_lines: ["10 Elm St."], primary: true, type: "Home" }],
      })
      .mockResolvedValueOnce({ id: "address-new" })
      .mockResolvedValueOnce({
        value: [{ id: "address-old", address_lines: ["10 Elm St."], primary: false, type: "Home" }],
      })
      .mockResolvedValueOnce({ id: "address-old" });

    const response = await POST(makeRequest(), { params: { id: "42" } });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(blackbaudApiFetchMock).toHaveBeenNthCalledWith(2, "/constituent/v1/addresses", {
      userId: 7,
      authUserId: 7,
      origin: "https://example.com",
      method: "POST",
      body: {
        constituent_id: "123",
        address_lines: ["2800 University Blvd N"],
        city: "Jacksonville",
        state: "FL",
        postal_code: "32211",
        country: "United States",
        type: "Home",
        primary: true,
      },
    });
    expect(blackbaudApiFetchMock).toHaveBeenNthCalledWith(4, "/constituent/v1/addresses/address-old", {
      userId: 7,
      authUserId: 7,
      origin: "https://example.com",
      method: "PATCH",
      body: { type: "Previous Address", valid_to: "2026-08-08" },
    });
    expect(payload.applySummary.applied).toBe(1);
  });

  it("leaves the selected prior address unchanged when the new address cannot be added", async () => {
    const { POST } = await import("./route.js");
    const addWrite = {
      type: "address",
      action: "add",
      addressLine1: "2800 University Blvd N",
      city: "Jacksonville",
      state: "FL",
      postalCode: "32211",
      country: "United States",
      addressType: "Home",
      makePrimary: false,
    };
    const previousWrite = {
      type: "address",
      action: "mark_previous",
      targetId: "address-old",
      addressType: "Previous Address",
      validTo: "2026-08-08",
      requiresSuccessfulAddressAdd: true,
    };
    const savedResult = {
      results: [
        {
          status: "failed",
          type: "address",
          action: "add",
          writeIndex: 0,
          message: "NXT rejected the new address",
        },
        {
          status: "manual_required",
          type: "address",
          action: "mark_previous",
          writeIndex: 1,
          message: "The new address was not added, so the selected prior address was left unchanged.",
        },
      ],
    };
    const row = {
      id: "28",
      run_id: "42",
      row_number: 1,
      status: "Ready",
      matched_blackbaud_constituent_id: "123",
      requested_writes: [addWrite, previousWrite],
      preview: {
        input: {},
        match: { blackbaudConstituentId: "123" },
        writePlan: [addWrite, previousWrite],
      },
    };

    sqlMock
      .mockResolvedValueOnce([makeRun()])
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ...row, status: "Failed", blackbaud_result: savedResult }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeRun({ status: "failed", failed_count: 1, ready_count: 0 })])
      .mockResolvedValueOnce([{ ...row, status: "Failed", applied_at: null, blackbaud_result: savedResult }]);
    blackbaudApiFetchMock
      .mockResolvedValueOnce({
        value: [{ id: "address-old", address_lines: ["10 Elm St."], primary: true, type: "Home" }],
      })
      .mockRejectedValueOnce(new Error("NXT rejected the new address"));

    const response = await POST(makeRequest(), { params: { id: "42" } });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(blackbaudApiFetchMock).toHaveBeenCalledTimes(2);
    expect(payload.rows[0].blackbaudResult.results).toEqual(savedResult.results);
  });

  it("applies replace rows by end-dating the source code and adding the target code", async () => {
    const { POST } = await import("./route.js");
    const write = {
      type: "constituent_code",
      action: "replace",
      sourceConstituency: "Student",
      targetConstituency: "Alumni - Bachelor's Degree",
      startDate: "2026-08-01",
      endDate: "2026-07-31",
    };
    const row = {
      id: "11",
      run_id: "42",
      row_number: 1,
      status: "Ready",
      matched_blackbaud_constituent_id: "123",
      source_constituency: "Student",
      target_constituency: "Alumni - Bachelor's Degree",
      start_date: "2026-08-01",
      end_date: "2026-07-31",
      requested_writes: [write],
      preview: {
        rowNumber: 1,
        input: { constituentName: "Jane Dolphin" },
        match: { blackbaudConstituentId: "123" },
        writePlan: [write],
      },
    };

    sqlMock
      .mockResolvedValueOnce([makeRun()])
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ...row, status: "Applied" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeRun({ status: "applied", applied_count: 1, ready_count: 0 })])
      .mockResolvedValueOnce([{ ...row, status: "Applied", applied_at: "2026-08-06T12:00:00Z" }]);
    blackbaudApiFetchMock
      .mockResolvedValueOnce({ value: [{ id: "student-code-1", description: "Student" }] })
      .mockResolvedValueOnce({ id: "student-code-1" })
      .mockResolvedValueOnce({ id: "alumni-code-1" });

    const response = await POST(makeRequest(), { params: { id: "42" } });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(blackbaudApiFetchMock).toHaveBeenNthCalledWith(
      2,
      "/constituent/v1/constituentcodes/student-code-1",
      {
        userId: 7,
        authUserId: 7,
        origin: "https://example.com",
        method: "PATCH",
        body: { date_to: "2026-07-31" },
      },
    );
    expect(blackbaudApiFetchMock).toHaveBeenNthCalledWith(3, "/constituent/v1/constituentcodes", {
      userId: 7,
      authUserId: 7,
      origin: "https://example.com",
      method: "POST",
      body: {
        constituent_id: "123",
        description: "Alumni - Bachelor's Degree",
        date_from: "2026-08-01",
      },
    });
    expect(payload.applySummary.applied).toBe(1);
  });

  it("requires an end date before applying replace rows", async () => {
    const { POST } = await import("./route.js");
    const write = {
      type: "constituent_code",
      action: "replace",
      sourceConstituency: "Student",
      targetConstituency: "Alumni - Bachelor's Degree",
    };
    const row = {
      id: "12",
      run_id: "42",
      row_number: 1,
      status: "Ready",
      matched_blackbaud_constituent_id: "123",
      source_constituency: "Student",
      target_constituency: "Alumni - Bachelor's Degree",
      requested_writes: [write],
      preview: {
        rowNumber: 1,
        input: { constituentName: "Jane Dolphin" },
        match: { blackbaudConstituentId: "123" },
        writePlan: [write],
      },
    };

    sqlMock
      .mockResolvedValueOnce([makeRun()])
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ...row, status: "Needs Review" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        makeRun({ status: "partially_applied", ready_count: 0, needs_review_count: 1 }),
      ])
      .mockResolvedValueOnce([{ ...row, status: "Needs Review" }]);

    const response = await POST(makeRequest(), { params: { id: "42" } });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(blackbaudApiFetchMock).not.toHaveBeenCalled();
    expect(payload.applySummary.manualRequired).toBe(1);
  });

  it("keeps replace rows in manual review when the target code already exists with an end date", async () => {
    const { POST } = await import("./route.js");
    const write = {
      type: "constituent_code",
      action: "replace",
      sourceConstituency: "Student",
      targetConstituency: "Alumni - Bachelor's Degree",
      startDate: "2026-08-01",
      endDate: "2026-07-31",
    };
    const row = {
      id: "13",
      run_id: "42",
      row_number: 1,
      status: "Ready",
      matched_blackbaud_constituent_id: "123",
      source_constituency: "Student",
      target_constituency: "Alumni - Bachelor's Degree",
      start_date: "2026-08-01",
      end_date: "2026-07-31",
      requested_writes: [write],
      preview: {
        rowNumber: 1,
        input: { constituentName: "Jane Dolphin" },
        match: { blackbaudConstituentId: "123" },
        writePlan: [write],
      },
    };

    sqlMock
      .mockResolvedValueOnce([makeRun()])
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ...row, status: "Needs Review" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        makeRun({ status: "partially_applied", ready_count: 0, needs_review_count: 1 }),
      ])
      .mockResolvedValueOnce([{ ...row, status: "Needs Review" }]);
    blackbaudApiFetchMock.mockResolvedValueOnce({
      value: [
        { id: "student-code-1", description: "Student" },
        {
          id: "alumni-code-1",
          description: "Alumni - Bachelor's Degree",
          date_to: "2020-05-01",
        },
      ],
    });

    const response = await POST(makeRequest(), { params: { id: "42" } });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(blackbaudApiFetchMock).toHaveBeenCalledTimes(1);
    expect(payload.applySummary.manualRequired).toBe(1);
  });

  it("adds a new education relationship after rechecking NXT for duplicates", async () => {
    const { POST } = await import("./route.js");
    const write = {
      type: "education_relationship",
      action: "add",
      recordType: "Individual",
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
    };
    const row = {
      id: "10",
      run_id: "42",
      row_number: 1,
      status: "Ready",
      matched_blackbaud_constituent_id: "123",
      requested_writes: [write],
      preview: {
        rowNumber: 1,
        input: { constituentName: "Jane Dolphin" },
        match: { blackbaudConstituentId: "123" },
        writePlan: [write],
      },
    };

    sqlMock
      .mockResolvedValueOnce([makeRun()])
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ...row, status: "Applied" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeRun({ status: "applied", applied_count: 1, ready_count: 0 })])
      .mockResolvedValueOnce([{ ...row, status: "Applied", applied_at: "2026-08-07T12:00:00Z" }]);
    blackbaudApiFetchMock
      .mockResolvedValueOnce({ value: [] })
      .mockResolvedValueOnce({ id: "education-1" });

    const response = await POST(makeRequest(), { params: { id: "42" } });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(blackbaudApiFetchMock).toHaveBeenNthCalledWith(
      1,
      "/constituent/v1/constituents/123/educations",
      {
        userId: 7,
        authUserId: 7,
        origin: "https://example.com",
      },
    );
    expect(blackbaudApiFetchMock).toHaveBeenNthCalledWith(2, "/constituent/v1/educations", {
      userId: 7,
      authUserId: 7,
      origin: "https://example.com",
      method: "POST",
      body: {
        constituent_id: "123",
        school: "Jacksonville University",
        degree: "Bachelor of Science",
        majors: ["Nursing"],
        minors: ["Psychology"],
        type: "University",
        campus: "Main Campus",
        social_organization: "Alpha Delta Pi",
        gpa: 3.8,
        class_of: 2026,
        status: "Graduated",
        date_graduated: { y: 2026, m: 5, d: 1 },
        date_entered: { y: 2022, m: 8, d: 15 },
        date_left: { y: 2026, m: 5, d: 1 },
        primary: true,
      },
    });
    expect(payload.applySummary.applied).toBe(1);
  });

  it("does not duplicate a matching education relationship", async () => {
    const { POST } = await import("./route.js");
    const write = {
      type: "education_relationship",
      action: "add",
      recordType: "Individual",
      institution: "Jacksonville University",
      degree: "Bachelor of Science",
      major: "Nursing",
      classYear: "2026",
    };
    const row = {
      id: "10",
      run_id: "42",
      row_number: 1,
      status: "Ready",
      matched_blackbaud_constituent_id: "123",
      requested_writes: [write],
      preview: {
        rowNumber: 1,
        input: { constituentName: "Jane Dolphin" },
        match: { blackbaudConstituentId: "123" },
        writePlan: [write],
      },
    };

    sqlMock
      .mockResolvedValueOnce([makeRun()])
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ...row, status: "Applied" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeRun({ status: "applied", applied_count: 1, ready_count: 0 })])
      .mockResolvedValueOnce([{ ...row, status: "Applied", applied_at: "2026-08-07T12:00:00Z" }]);
    blackbaudApiFetchMock.mockResolvedValueOnce({
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

    const response = await POST(makeRequest(), { params: { id: "42" } });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(blackbaudApiFetchMock).toHaveBeenCalledTimes(1);
    expect(payload.applySummary.applied).toBe(1);
  });

  it("adds an organization relationship only for an exact existing NXT organization", async () => {
    const { POST } = await import("./route.js");
    const write = {
      type: "organization_relationship",
      action: "add",
      recordType: "Individual",
      name: "Dolphin Health System",
      relationshipType: "Employee",
      title: "Nurse",
      startDate: "2026-08-01",
      endDate: "2026-12-31",
      makePrimary: "Yes",
    };
    const row = {
      id: "11",
      run_id: "42",
      row_number: 1,
      status: "Ready",
      matched_blackbaud_constituent_id: "123",
      requested_writes: [write],
      preview: {
        rowNumber: 1,
        input: { constituentName: "Jane Dolphin" },
        match: { blackbaudConstituentId: "123" },
        writePlan: [write],
      },
    };

    sqlMock
      .mockResolvedValueOnce([makeRun()])
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ...row, status: "Applied" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeRun({ status: "applied", applied_count: 1, ready_count: 0 })])
      .mockResolvedValueOnce([{ ...row, status: "Applied", applied_at: "2026-08-07T12:00:00Z" }]);
    blackbaudApiFetchMock
      .mockResolvedValueOnce({ value: [] })
      .mockResolvedValueOnce({
        value: [{ id: "456", name: "Dolphin Health System", type: "Organization" }],
      })
      .mockResolvedValueOnce({ id: "relationship-1" });

    const response = await POST(makeRequest(), { params: { id: "42" } });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(blackbaudApiFetchMock).toHaveBeenNthCalledWith(
      1,
      "/constituent/v1/constituents/123/relationships",
      {
        userId: 7,
        authUserId: 7,
        origin: "https://example.com",
      },
    );
    expect(blackbaudApiFetchMock).toHaveBeenNthCalledWith(
      2,
      "/constituent/v1/constituents/search",
      {
        userId: 7,
        authUserId: 7,
        origin: "https://example.com",
        searchParams: { search_text: "Dolphin Health System", limit: 10 },
      },
    );
    expect(blackbaudApiFetchMock).toHaveBeenNthCalledWith(3, "/constituent/v1/relationships", {
      userId: 7,
      authUserId: 7,
      origin: "https://example.com",
      method: "POST",
      body: {
        constituent_id: "123",
        relation_id: "456",
        type: "Employee",
        position: "Nurse",
        start: "2026-08-01",
        end: "2026-12-31",
        is_primary_business: true,
      },
    });
    expect(payload.applySummary.applied).toBe(1);
  });

  it("does not duplicate an organization relationship that is already linked", async () => {
    const { POST } = await import("./route.js");
    const write = {
      type: "organization_relationship",
      action: "add",
      recordType: "Individual",
      name: "Dolphin Health System",
    };
    const row = {
      id: "12",
      run_id: "42",
      row_number: 1,
      status: "Ready",
      matched_blackbaud_constituent_id: "123",
      requested_writes: [write],
      preview: {
        rowNumber: 1,
        input: { constituentName: "Jane Dolphin" },
        match: { blackbaudConstituentId: "123" },
        writePlan: [write],
      },
    };

    sqlMock
      .mockResolvedValueOnce([makeRun()])
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ...row, status: "Applied" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeRun({ status: "applied", applied_count: 1, ready_count: 0 })])
      .mockResolvedValueOnce([{ ...row, status: "Applied", applied_at: "2026-08-07T12:00:00Z" }]);
    blackbaudApiFetchMock
      .mockResolvedValueOnce({
        value: [{ relation_id: "456", name: "Dolphin Health System" }],
      })
      .mockResolvedValueOnce({
        value: [{ id: "456", name: "Dolphin Health System", type: "Organization" }],
      });

    const response = await POST(makeRequest(), { params: { id: "42" } });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(blackbaudApiFetchMock).toHaveBeenCalledTimes(2);
    expect(payload.applySummary.applied).toBe(1);
  });

  it("verifies sparse exact search results are organizations before adding a relationship", async () => {
    const { POST } = await import("./route.js");
    const write = {
      type: "organization_relationship",
      action: "add",
      recordType: "Individual constituent",
      name: "Dolphin Health System",
    };
    const row = {
      id: "15",
      run_id: "42",
      row_number: 1,
      status: "Ready",
      matched_blackbaud_constituent_id: "123",
      requested_writes: [write],
      preview: {
        rowNumber: 1,
        input: { constituentName: "Jane Dolphin" },
        match: { blackbaudConstituentId: "123" },
        writePlan: [write],
      },
    };

    sqlMock
      .mockResolvedValueOnce([makeRun()])
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ...row, status: "Applied" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeRun({ status: "applied", applied_count: 1, ready_count: 0 })])
      .mockResolvedValueOnce([{ ...row, status: "Applied", applied_at: "2026-08-07T12:00:00Z" }]);
    blackbaudApiFetchMock
      .mockResolvedValueOnce({ value: [] })
      .mockResolvedValueOnce({
        value: [{ id: "456", name: "Dolphin Health System" }],
      })
      .mockResolvedValueOnce({ id: "456", type: "Organization", name: "Dolphin Health System" })
      .mockResolvedValueOnce({ id: "relationship-1" });

    const response = await POST(makeRequest(), { params: { id: "42" } });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(blackbaudApiFetchMock).toHaveBeenNthCalledWith(
      3,
      "/constituent/v1/constituents/456",
      {
        userId: 7,
        authUserId: 7,
        origin: "https://example.com",
      },
    );
    expect(blackbaudApiFetchMock).toHaveBeenNthCalledWith(4, "/constituent/v1/relationships", {
      userId: 7,
      authUserId: 7,
      origin: "https://example.com",
      method: "POST",
      body: { constituent_id: "123", relation_id: "456" },
    });
    expect(payload.applySummary.applied).toBe(1);
  });

  it("keeps ambiguous organization matches in review without creating a relationship", async () => {
    const { POST } = await import("./route.js");
    const write = {
      type: "organization_relationship",
      action: "add",
      recordType: "Individual",
      name: "Dolphin Health System",
    };
    const row = {
      id: "13",
      run_id: "42",
      row_number: 1,
      status: "Ready",
      matched_blackbaud_constituent_id: "123",
      requested_writes: [write],
      preview: {
        rowNumber: 1,
        input: { constituentName: "Jane Dolphin" },
        match: { blackbaudConstituentId: "123" },
        writePlan: [write],
      },
    };

    sqlMock
      .mockResolvedValueOnce([makeRun()])
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ...row, status: "Needs Review" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        makeRun({ status: "partially_applied", ready_count: 0, needs_review_count: 1 }),
      ])
      .mockResolvedValueOnce([{ ...row, status: "Needs Review" }]);
    blackbaudApiFetchMock
      .mockResolvedValueOnce({ value: [] })
      .mockResolvedValueOnce({
        value: [
          { id: "456", name: "Dolphin Health System", type: "Organization" },
          { id: "789", name: "Dolphin Health System", type: "Organization" },
        ],
      });

    const response = await POST(makeRequest(), { params: { id: "42" } });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(blackbaudApiFetchMock).toHaveBeenCalledTimes(2);
    expect(payload.applySummary.manualRequired).toBe(1);
    expect(payload.savedRun.needsReviewCount).toBe(1);
  });

  it("updates the reviewed existing education row", async () => {
    const { POST } = await import("./route.js");
    const write = {
      type: "education_relationship",
      action: "update",
      recordType: "Individual",
      targetEducationId: "education-1",
      institution: "Jacksonville University",
      degree: "Bachelor of Science",
    };
    const row = {
      id: "10",
      run_id: "42",
      row_number: 1,
      status: "Ready",
      matched_blackbaud_constituent_id: "123",
      requested_writes: [write],
      preview: {
        rowNumber: 1,
        input: { constituentName: "Jane Dolphin" },
        match: { blackbaudConstituentId: "123" },
        writePlan: [write],
      },
    };

    sqlMock
      .mockResolvedValueOnce([makeRun()])
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ...row, status: "Applied" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        makeRun({ status: "applied", ready_count: 0, applied_count: 1 }),
      ])
      .mockResolvedValueOnce([{ ...row, status: "Applied" }]);
    blackbaudApiFetchMock
      .mockResolvedValueOnce({
        value: [{ id: "education-1", school: "Jacksonville University" }],
      })
      .mockResolvedValueOnce({ id: "education-1" });

    const response = await POST(makeRequest(), { params: { id: "42" } });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(blackbaudApiFetchMock).toHaveBeenNthCalledWith(
      1,
      "/constituent/v1/constituents/123/educations",
      expect.objectContaining({ userId: 7, authUserId: 7 }),
    );
    expect(blackbaudApiFetchMock).toHaveBeenNthCalledWith(
      2,
      "/constituent/v1/educations/education-1",
      expect.objectContaining({
        method: "PATCH",
        body: { school: "Jacksonville University", degree: "Bachelor of Science" },
      }),
    );
    expect(payload.applySummary.applied).toBe(1);
  });

  it("records a partial NXT failure without discarding an earlier successful write", async () => {
    const { POST } = await import("./route.js");
    const nameWrite = {
      type: "constituent_name",
      action: "update",
      recordType: "Individual",
      preferredName: "Janie",
    };
    const profileWrite = {
      type: "constituent_profile",
      action: "update",
      recordType: "Individual",
      title: "Dr.",
    };
    const savedResult = {
      results: [
        {
          status: "applied",
          type: "constituent_name",
          action: "update",
          writeIndex: 0,
          message: "Updated NXT preferred name.",
        },
        {
          status: "failed",
          type: "constituent_profile",
          action: "update",
          writeIndex: 1,
          message: "Blackbaud 500 Internal Server Error",
        },
      ],
    };
    const row = {
      id: "30",
      run_id: "42",
      row_number: 1,
      status: "Ready",
      matched_blackbaud_constituent_id: "123",
      requested_writes: [nameWrite, profileWrite],
      preview: {
        input: { constituentName: "Jane Dolphin" },
        match: { blackbaudConstituentId: "123" },
        writePlan: [nameWrite, profileWrite],
      },
    };

    sqlMock
      .mockResolvedValueOnce([makeRun()])
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ...row, status: "Failed", blackbaud_result: savedResult }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeRun({ status: "partially_applied", failed_count: 1 })])
      .mockResolvedValueOnce([{ ...row, status: "Failed", blackbaud_result: savedResult }]);
    blackbaudApiFetchMock
      .mockResolvedValueOnce({ id: "123", preferred_name: "Janie" })
      .mockRejectedValueOnce(new Error("Blackbaud 500 Internal Server Error"));

    const response = await POST(makeRequest(), { params: { id: "42" } });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(blackbaudApiFetchMock).toHaveBeenCalledTimes(2);
    expect(payload.applySummary.applied).toBe(1);
    expect(payload.applySummary.failed).toBe(1);
    expect(payload.rows[0].blackbaudResult.results).toEqual(savedResult.results);
  });

  it("retries only the staged NXT write that previously failed", async () => {
    const { POST } = await import("./route.js");
    const nameWrite = {
      type: "constituent_name",
      action: "update",
      recordType: "Individual",
      preferredName: "Janie",
    };
    const profileWrite = {
      type: "constituent_profile",
      action: "update",
      recordType: "Individual",
      title: "Dr.",
    };
    const priorResult = {
      results: [
        {
          status: "applied",
          type: "constituent_name",
          action: "update",
          writeIndex: 0,
          message: "Updated NXT preferred name.",
        },
        {
          status: "failed",
          type: "constituent_profile",
          action: "update",
          writeIndex: 1,
          message: "Blackbaud 500 Internal Server Error",
        },
      ],
    };
    const retriedResult = {
      results: [
        {
          status: "applied",
          type: "constituent_profile",
          action: "update",
          writeIndex: 1,
          message: "Updated NXT title.",
        },
      ],
      attempts: [
        { ...priorResult, retryFailedOnly: false },
        {
          retryFailedOnly: true,
          results: [
            {
              status: "applied",
              type: "constituent_profile",
              action: "update",
              writeIndex: 1,
              message: "Updated NXT title.",
            },
          ],
        },
      ],
    };
    const row = {
      id: "30",
      run_id: "42",
      row_number: 1,
      status: "Failed",
      matched_blackbaud_constituent_id: "123",
      blackbaud_result: priorResult,
      requested_writes: [nameWrite, profileWrite],
      preview: {
        input: { constituentName: "Jane Dolphin" },
        match: { blackbaudConstituentId: "123" },
        writePlan: [nameWrite, profileWrite],
      },
    };

    sqlMock
      .mockResolvedValueOnce([makeRun({ failed_count: 1 })])
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ...row, status: "Applied", blackbaud_result: retriedResult }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeRun({ status: "applied", applied_count: 1, failed_count: 0 })])
      .mockResolvedValueOnce([{ ...row, status: "Applied", blackbaud_result: retriedResult }]);
    blackbaudApiFetchMock.mockResolvedValueOnce({ id: "123", title: "Dr." });

    const response = await POST(makeRequest("?retryRowId=30"), { params: { id: "42" } });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(blackbaudApiFetchMock).toHaveBeenCalledTimes(1);
    expect(blackbaudApiFetchMock).toHaveBeenCalledWith(
      "/constituent/v1/constituents/123",
      {
        userId: 7,
        authUserId: 7,
        origin: "https://example.com",
        method: "PATCH",
        body: { title: "Dr." },
      },
    );
    expect(payload.applySummary.applied).toBe(1);
    expect(payload.applySummary.failed).toBe(0);
    expect(payload.rows[0].blackbaudResult.results).toEqual(retriedResult.results);
  });
});
