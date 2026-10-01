import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  workspace: vi.fn(),
  schema: vi.fn(),
  ownSchema: vi.fn(),
  read: vi.fn(),
  acquire: vi.fn(),
  view: vi.fn(),
  send: vi.fn(),
  prepare: vi.fn(),
  finish: vi.fn(),
  release: vi.fn(),
  exclusion: vi.fn(),
  recipient: vi.fn(),
  inspect: vi.fn(),
  appealChoices: vi.fn(),
  readiness: vi.fn(),
  readinessSettings: vi.fn(),
  exclusionSettings: vi.fn(),
  exclusionPlan: vi.fn(),
  exclusionSync: vi.fn(),
  exclusionRemoval: vi.fn(),
  validateTemplate: vi.fn(),
  inspectTemplate: vi.fn(),
  recipientPreview: vi.fn(),
  samplePreview: vi.fn(),
  definitions: vi.fn(),
  finalPreview: vi.fn(),
  finalize: vi.fn(),
  letterSync: vi.fn(),
  postalStart: vi.fn(),
  postalPrepare: vi.fn(),
  postalPreview: vi.fn(),
  postalReview: vi.fn(),
  postalApprove: vi.fn(),
  postalDiscard: vi.fn(),
  letterDates: vi.fn(),
  postalContinue: vi.fn(),
  postalDocument: vi.fn(),
}));
vi.mock("@/app/api/utils/societyLetterPostalBatches", () => ({
  startPostalDraft: mocks.postalStart,
  preparePostalDocument: mocks.postalPrepare,
  draftPostalDocument: mocks.postalPreview,
  reviewPostalDocument: mocks.postalReview,
  approvePostalDraft: mocks.postalApprove,
  discardPostalDraft: mocks.postalDiscard,
  updateLetterDates: mocks.letterDates,
  continuePostalBatch: mocks.postalContinue,
  savedPostalDocument: mocks.postalDocument,
  postalBatchDownload: vi.fn(),
}));
vi.mock(
  "@/app/api/utils/societyLetterFinalization",
  async (importOriginal) => ({
    ...(await importOriginal()),
    previewFinalPostalLetter: mocks.finalPreview,
    finalizePostalLetter: mocks.finalize,
    syncLetterAppeals: mocks.letterSync,
  }),
);
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: mocks.schema }));
vi.mock("@/app/api/utils/getWorkspaceUser", () => ({
  default: mocks.workspace,
}));
vi.mock("@/app/api/utils/organizationSettings", () => ({
  getOrganizationSettings: async () => ({ timeZone: "America/New_York" }),
}));
vi.mock("@/app/api/utils/givingSocietyConfigurations", () => ({
  listGivingSocietyConfigurations: mocks.definitions,
}));
vi.mock("@/app/api/utils/societyLetterStore", () => ({
  ensureSocietyLetterSchema: mocks.ownSchema,
  readSocietyLetterState: mocks.read,
  acquireSocietyLetters: mocks.acquire,
}));
vi.mock("@/app/api/utils/societyLetterWorkflow", () => ({
  letterWorkspace: mocks.view,
  previewLetters: vi.fn(),
  prepareLetterBatch: mocks.prepare,
  updateLetterSettings: vi.fn(),
  saveLetterTemplate: vi.fn(),
  refreshLetterSource: vi.fn(),
  sendLetterBatch: mocks.send,
  verifyLetterEmail: vi.fn(),
  updateLetterExclusion: mocks.exclusion,
  updateLetterRecipient: mocks.recipient,
  previewLetterRecipient: mocks.recipientPreview,
}));
vi.mock("@/app/api/utils/societyLetterQueryFields", () => ({
  inspectLetterQueryFields: mocks.inspect,
}));
vi.mock("@/app/api/utils/societyLetterAppealChoices", () => ({
  letterAppealChoices: mocks.appealChoices,
}));
vi.mock("@/app/api/utils/societyLetterReadiness", () => ({
  runLetterReadiness: mocks.readiness,
  saveReadinessPolicy: mocks.readinessSettings,
}));
vi.mock("@/app/api/utils/societyLetterExclusionAppeals", () => ({
  saveExclusionAppealPolicy: mocks.exclusionSettings,
  prepareExclusionAppeal: mocks.exclusionPlan,
  syncExclusionAppeal: mocks.exclusionSync,
  verifyExclusionRemoval: mocks.exclusionRemoval,
}));
vi.mock("@/app/api/utils/societyLetterDocuments", () => ({
  letterArchive: vi.fn(() => Buffer.from("zip")),
  renderSocietyLetter: vi.fn(),
  validateLetterTemplate: mocks.validateTemplate,
  inspectLetterTemplate: mocks.inspectTemplate,
  renderSocietyLetterSample: mocks.samplePreview,
}));
import { GET, POST } from "./route";
const url = "https://example.org/api/stewardship/society-letters";
const request = (body, headers = {}) =>
  new Request(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://example.org",
      ...headers,
    },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { email: "staff@example.org" } });
  mocks.definitions.mockResolvedValue([]);
  mocks.release.mockResolvedValue(undefined);
  mocks.workspace.mockResolvedValue({
    sessionUser: { id: 1, active: true, role: "advancement_services" },
    workspaceUser: { role: "mgo" },
  });
  mocks.read.mockResolvedValue({
    revision: 3,
    settings: null,
    templates: {},
    history: [],
  });
  mocks.view.mockReturnValue({ revision: 3, rows: [] });
  mocks.acquire.mockResolvedValue({
    release: mocks.release,
    finishBatch: mocks.finish,
  });
  mocks.exclusionRemoval.mockResolvedValue(undefined);
  mocks.validateTemplate.mockImplementation((template) => template);
});
describe("stewardship API authorization and delivery boundaries", () => {
  it.each([
    "preview_final_postal",
    "finalize_postal",
    "verify_letter_appeals",
    "continue_letter_appeals",
    "start_postal_draft",
    "prepare_postal_document",
    "preview_postal_document",
    "review_postal_document",
    "approve_postal_draft",
    "discard_postal_draft",
    "update_letter_dates",
    "continue_postal_batch",
  ])(
    "restricts %s to authorized reviewers and current revisions",
    async (action) => {
      mocks.workspace.mockResolvedValue({
        sessionUser: { id: 1, role: "mgo", active: true },
      });
      expect((await POST(request({ action, revision: 3 }))).status).toBe(403);
      mocks.workspace.mockResolvedValue({
        sessionUser: { id: 1, role: "admin", active: true },
      });
      expect((await POST(request({ action }))).status).toBe(400);
      expect(
        (
          await POST(
            request(
              { action, revision: 3 },
              { Origin: "https://other.example" },
            ),
          )
        ).status,
      ).toBe(403);
      mocks.acquire.mockRejectedValueOnce(
        Object.assign(new Error("Changed"), { status: 409 }),
      );
      expect((await POST(request({ action, revision: 3 }))).status).toBe(409);
      expect(mocks.finalize).not.toHaveBeenCalled();
      expect(mocks.letterSync).not.toHaveBeenCalled();
      expect(mocks.postalContinue).not.toHaveBeenCalled();
      expect(mocks.postalApprove).not.toHaveBeenCalled();
    },
  );
  it("keeps draft preparation, preview, approval, and NXT continuation separate", async () => {
    const steps = [
      ["start_postal_draft", mocks.postalStart],
      ["prepare_postal_document", mocks.postalPrepare],
      ["review_postal_document", mocks.postalReview],
      ["approve_postal_draft", mocks.postalApprove],
      ["discard_postal_draft", mocks.postalDiscard],
      ["update_letter_dates", mocks.letterDates],
    ];
    for (const [action, mock] of steps) {
      expect((await POST(request({ action, revision: 3 }))).status).toBe(200);
      expect(mock).toHaveBeenCalledOnce();
      expect(mocks.postalContinue).not.toHaveBeenCalled();
      expect(mocks.letterSync).not.toHaveBeenCalled();
      expect(mocks.send).not.toHaveBeenCalled();
    }
    mocks.postalPreview.mockResolvedValue({
      bytes: Buffer.from("%PDF-test"),
      mime: "application/pdf",
      filename: "society-letter.pdf",
    });
    const preview = await POST(
      request({ action: "preview_postal_document", revision: 3 }),
    );
    expect(preview.headers.get("content-type")).toBe("application/pdf");
    expect(preview.headers.get("cache-control")).toContain("no-store");
    expect(await preview.text()).toBe("%PDF-test");
    expect(mocks.postalContinue).not.toHaveBeenCalled();
    expect(
      (
        await POST(
          request({
            action: "continue_postal_batch",
            revision: 3,
            confirm: true,
          }),
        )
      ).status,
    ).toBe(200);
    expect(mocks.postalContinue).toHaveBeenCalledOnce();
  });
  it("returns a final confirmation without invoking the writer", async () => {
    mocks.finalPreview.mockReturnValue({
      token: "final",
      row: { members: ["10", "11"] },
    });
    const response = await POST(
      request({
        action: "preview_final_postal",
        revision: 3,
        householdId: "10",
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      finalPreview: { token: "final" },
    });
    expect(mocks.finalize).not.toHaveBeenCalled();
    expect(mocks.letterSync).not.toHaveBeenCalled();
    expect(mocks.release).toHaveBeenCalledTimes(1);
  });
  it("dispatches finalization and recovery separately from preview and email", async () => {
    mocks.finalize.mockResolvedValue("new-batch");
    const response = await POST(
      request({
        action: "finalize_postal",
        revision: 3,
        confirm: true,
        previewToken: "final",
        householdId: "10",
      }),
    );
    expect(await response.json()).toMatchObject({ batchId: "new-batch" });
    expect(mocks.finalize).toHaveBeenCalledTimes(1);
    expect(mocks.send).not.toHaveBeenCalled();
    await POST(
      request({
        action: "verify_letter_appeals",
        revision: 3,
        deliveryId: "one",
      }),
    );
    expect(mocks.letterSync.mock.calls[0][3]).toMatchObject({
      action: "verify_letter_appeals",
      deliveryId: "one",
    });
    expect(mocks.finalize).toHaveBeenCalledTimes(1);
  });
  it("blocks downloads, mailed status, and cancellation while member updates are incomplete", async () => {
    mocks.read.mockResolvedValue({
      history: [
        {
          id: "one",
          batchId: "batch",
          channel: "post",
          status: "prepared",
          letterAppeals: {
            status: "needs_review",
            members: [{ id: "10", status: "uncertain" }],
          },
        },
      ],
    });
    expect((await GET(new Request(`${url}?download=batch`))).status).toBe(409);
    expect(
      (await GET(new Request(`${url}?download=batch&deliveryId=one`))).status,
    ).toBe(409);
    expect(
      (
        await POST(
          request({
            action: "mailed",
            batchId: "batch",
            confirm: true,
            revision: 3,
          }),
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await POST(
          request({
            action: "cancel",
            batchId: "batch",
            confirm: true,
            revision: 3,
          }),
        )
      ).status,
    ).toBe(409);
    expect(mocks.finish).not.toHaveBeenCalled();
  });
  it("downloads the exact approved PDF only after every household receipt is verified", async () => {
    const item = {
      id: "one",
      batchId: "batch",
      channel: "post",
      status: "prepared",
      postalDocument: { id: "document" },
      letterAppeals: {
        status: "pending",
        members: [
          { id: "10", status: "verified" },
          { id: "11", status: "pending" },
        ],
      },
    };
    mocks.read.mockResolvedValue({
      revision: 3,
      templates: {},
      history: [item],
    });
    expect(
      (await GET(new Request(`${url}?download=batch&deliveryId=one`))).status,
    ).toBe(409);
    expect(mocks.postalDocument).not.toHaveBeenCalled();
    item.letterAppeals.status = "complete";
    item.letterAppeals.members[1].status = "verified";
    mocks.postalDocument.mockResolvedValue({
      bytes: Buffer.from("frozen PDF"),
      mime: "application/pdf",
      filename: "society-letter.pdf",
    });
    const response = await GET(
      new Request(`${url}?download=batch&deliveryId=one`),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(await response.text()).toBe("frozen PDF");
    expect(mocks.postalDocument).toHaveBeenCalledExactlyOnceWith(
      item.postalDocument,
    );
    expect(mocks.letterSync).not.toHaveBeenCalled();
  });
  it.each(["admin", "advancement_services"])(
    "lets %s load choices without a revision, state read, or mutation lease",
    async (role) => {
      mocks.workspace.mockResolvedValue({
        sessionUser: { id: 1, role, active: true },
      });
      mocks.appealChoices.mockResolvedValue({
        appeals: [{ lookupId: "OOD", description: "OOD Letter" }],
        omittedCount: 0,
      });
      const response = await POST(
        request({
          action: "inspect_appeals",
          revision: -1,
          url: "https://untrusted.example",
        }),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(await response.json()).toMatchObject({
        appeals: [{ lookupId: "OOD", description: "OOD Letter" }],
      });
      expect(mocks.appealChoices).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          user: { id: 1, role, active: true },
          origin: "https://example.org",
        }),
      );
      expect(mocks.read).not.toHaveBeenCalled();
      expect(mocks.acquire).not.toHaveBeenCalled();
      expect(mocks.send).not.toHaveBeenCalled();
      expect(mocks.exclusionSync).not.toHaveBeenCalled();
    },
  );
  it.each(["anonymous", "mgo", "inactive", "cross-origin", "oversize"])(
    "blocks %s appeal lookup before NXT reads",
    async (kind) => {
      if (kind === "anonymous") mocks.auth.mockResolvedValue(null);
      if (kind === "mgo")
        mocks.workspace.mockResolvedValue({
          sessionUser: { id: 1, role: "mgo", active: true },
        });
      if (kind === "inactive")
        mocks.workspace.mockResolvedValue({
          sessionUser: { id: 1, role: "admin", active: false },
        });
      const response = await POST(
        request(
          {
            action: "inspect_appeals",
            ...(kind === "oversize" ? { extra: "x".repeat(1500001) } : {}),
          },
          kind === "cross-origin"
            ? { Origin: "https://untrusted.example" }
            : {},
        ),
      );
      expect(response.status).toBe(
        kind === "anonymous" ? 401 : kind === "oversize" ? 413 : 403,
      );
      expect(mocks.appealChoices).not.toHaveBeenCalled();
      expect(mocks.acquire).not.toHaveBeenCalled();
    },
  );
  it("renders a fictional setup sample without acquiring a write lease, refreshing queries, or sending letters", async () => {
    const version = "a".repeat(64);
    const template = { societyKey: "ood", version, sequence: 1 };
    mocks.definitions.mockResolvedValue([
      {
        key: "ood",
        name: "Order of the Dolphin",
        active: true,
        basis: "annual",
      },
    ]);
    mocks.read.mockResolvedValue({
      templates: { [version]: template },
      settings: { periodBasis: "calendar_year" },
    });
    mocks.samplePreview.mockReturnValue({
      document: Buffer.from("fictional sample"),
    });
    const response = await POST(
      request({
        action: "preview_template_sample",
        templateVersion: version,
        recipientConstituentId: "not-used",
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("fictional sample");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.samplePreview).toHaveBeenCalledWith(
      template,
      "Order of the Dolphin",
      expect.objectContaining({
        start: expect.any(String),
        end: expect.any(String),
      }),
      expect.any(String),
    );
    expect(mocks.acquire).not.toHaveBeenCalled();
    expect(mocks.recipientPreview).not.toHaveBeenCalled();
    expect(mocks.inspect).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it.each([
    "anonymous",
    "mgo",
    "cross-origin",
    "missing",
    "inactive",
    "replaced",
  ])("rejects %s sample previews", async (kind) => {
    const version = "a".repeat(64);
    const template = { societyKey: "ood", version, sequence: 1 };
    mocks.definitions.mockResolvedValue([
      {
        key: "ood",
        name: "Order of the Dolphin",
        active: kind !== "inactive",
        basis: "annual",
      },
    ]);
    mocks.read.mockResolvedValue({
      templates:
        kind === "missing"
          ? {}
          : {
              [version]: template,
              ...(kind === "replaced"
                ? {
                    newer: {
                      ...template,
                      version: "b".repeat(64),
                      sequence: 2,
                    },
                  }
                : {}),
            },
    });
    if (kind === "anonymous") mocks.auth.mockResolvedValue(null);
    if (kind === "mgo")
      mocks.workspace.mockResolvedValue({
        sessionUser: { active: true, role: "mgo" },
      });
    const response = await POST(
      request(
        { action: "preview_template_sample", templateVersion: version },
        kind === "cross-origin" ? { Origin: "https://other.example.org" } : {},
      ),
    );
    expect(response.status).toBe(
      kind === "anonymous"
        ? 401
        : ["mgo", "cross-origin"].includes(kind)
          ? 403
          : kind === "replaced"
            ? 409
            : 404,
    );
    expect(mocks.samplePreview).not.toHaveBeenCalled();
    expect(mocks.acquire).not.toHaveBeenCalled();
  });
  it("inspects a saved Word template without taking a mutation lease or calling NXT", async () => {
    const version = "a".repeat(64);
    mocks.read.mockResolvedValueOnce({
      templates: { [version]: { content: "saved Word bytes" } },
    });
    mocks.inspectTemplate.mockReturnValueOnce({
      fields: [{ name: "City", suggestedField: "city" }],
    });
    const response = await POST(
      request({ action: "inspect_template", templateVersion: version }),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).fields[0].name).toBe("City");
    expect(mocks.inspectTemplate).toHaveBeenCalledWith("saved Word bytes");
    expect(mocks.acquire).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.inspect).not.toHaveBeenCalled();
  });
  it.each(["anonymous", "mgo", "cross-origin"])(
    "blocks %s Word inspection",
    async (kind) => {
      if (kind === "anonymous") mocks.auth.mockResolvedValueOnce(null);
      if (kind === "mgo")
        mocks.workspace.mockResolvedValueOnce({
          sessionUser: { active: true, role: "mgo" },
        });
      const response = await POST(
        request(
          { action: "inspect_template", content: "anything" },
          kind === "cross-origin"
            ? { Origin: "https://other.example.org" }
            : {},
        ),
      );
      expect(response.status).toBe(kind === "anonymous" ? 401 : 403);
      expect(mocks.inspectTemplate).not.toHaveBeenCalled();
    },
  );
  it("renders a recipient draft without a revision, mutation lease, NXT work, or delivery", async () => {
    mocks.recipientPreview.mockReturnValueOnce({
      document: Buffer.from("personalized draft"),
    });
    const body = {
      action: "preview_recipient_document",
      householdId: "10",
      reviewToken: "current",
    };
    const response = await POST(request(body));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("personalized draft");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("cross-origin-resource-policy")).toBe(
      "same-origin",
    );
    expect(mocks.recipientPreview).toHaveBeenCalledWith(
      await mocks.read.mock.results[0].value,
      [],
      expect.any(String),
      body,
    );
    for (const action of [
      mocks.acquire,
      mocks.recipient,
      mocks.prepare,
      mocks.send,
      mocks.finish,
      mocks.exclusionSync,
      mocks.readiness,
    ])
      expect(action).not.toHaveBeenCalled();
  });
  it.each(["anonymous", "mgo", "cross-origin"])(
    "blocks %s draft requests before reading donor data",
    async (kind) => {
      if (kind === "anonymous") mocks.auth.mockResolvedValueOnce(null);
      if (kind === "mgo")
        mocks.workspace.mockResolvedValueOnce({
          sessionUser: { active: true, role: "mgo" },
        });
      const response = await POST(
        request(
          { action: "preview_recipient_document" },
          kind === "cross-origin"
            ? { Origin: "https://other.example.org" }
            : {},
        ),
      );
      expect(response.status).toBe(kind === "anonymous" ? 401 : 403);
      expect(mocks.read).not.toHaveBeenCalled();
      expect(mocks.recipientPreview).not.toHaveBeenCalled();
    },
  );
  it("returns stale draft conflicts without changing the workspace", async () => {
    mocks.recipientPreview.mockImplementationOnce(() => {
      throw Object.assign(new Error("Recipient changed"), { status: 409 });
    });
    const response = await POST(
      request({ action: "preview_recipient_document" }),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Recipient changed" });
    expect(mocks.acquire).not.toHaveBeenCalled();
  });
  it("downloads the exact saved template without taking a lease or creating any letter", async () => {
    const version = "a".repeat(64);
    const template = {
      filename: "saved-letter.docx",
      content: Buffer.from("saved Word bytes").toString("base64"),
    };
    mocks.read.mockResolvedValue({ templates: { [version]: template } });
    const response = await GET(
      new Request(`${url}?templateVersion=${version}`),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="saved-letter.docx"',
    );
    expect(response.headers.get("content-type")).toContain(
      "wordprocessingml.document",
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("cross-origin-resource-policy")).toBe(
      "same-origin",
    );
    expect(await response.text()).toBe("saved Word bytes");
    expect(mocks.validateTemplate).toHaveBeenCalledWith(template);
    expect(mocks.acquire).not.toHaveBeenCalled();
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.finish).not.toHaveBeenCalled();
    expect(mocks.exclusionSync).not.toHaveBeenCalled();
  });
  it.each(["", "constructor", "__proto__", "unknown", "b".repeat(64)])(
    "does not serve missing or invalid template version %s",
    async (version) => {
      const response = await GET(
        new Request(`${url}?templateVersion=${version}`),
      );
      expect(response.status).toBe(404);
      expect(mocks.validateTemplate).not.toHaveBeenCalled();
      expect(mocks.acquire).not.toHaveBeenCalled();
    },
  );
  it("refuses a stored template that no longer passes archive safety checks", async () => {
    const version = "a".repeat(64);
    mocks.read.mockResolvedValue({
      templates: { [version]: { content: "unsafe" } },
    });
    mocks.validateTemplate.mockImplementationOnce(() => {
      throw Object.assign(new Error("Unsafe template"), { status: 422 });
    });
    const response = await GET(
      new Request(`${url}?templateVersion=${version}`),
    );
    expect(response.status).toBe(422);
    expect(response.headers.get("content-disposition")).toBeNull();
    expect(mocks.acquire).not.toHaveBeenCalled();
  });
  it.each([null, "mgo", "executive", "inactive"])(
    "protects saved template bytes from %s access",
    async (role) => {
      if (!role) mocks.auth.mockResolvedValue(null);
      else
        mocks.workspace.mockResolvedValue({
          sessionUser: { id: 1, role, active: role !== "inactive" },
        });
      const response = await GET(
        new Request(`${url}?templateVersion=${"a".repeat(64)}`),
      );
      expect(response.status).toBe(role ? 403 : 401);
      expect(mocks.read).not.toHaveBeenCalled();
    },
  );
  it("persists the local exclusion before starting NXT write-back", async () => {
    const plan = { appeal: { id: "773" } };
    const item = { id: "x", nxt: plan };
    mocks.exclusionPlan.mockReturnValue(plan);
    mocks.exclusion.mockResolvedValueOnce(item);
    const response = await POST(
      request({ action: "exclude_recipient", revision: 3, confirmNxt: true }),
    );
    expect(response.status).toBe(200);
    expect(mocks.exclusion.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.exclusionSync.mock.invocationCallOrder[0],
    );
    expect(mocks.exclusion.mock.calls[0][6]).toEqual(plan);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.prepare).not.toHaveBeenCalled();
  });
  it("does not run NXT if saving the local exclusion fails", async () => {
    mocks.exclusionPlan.mockReturnValue({});
    mocks.exclusion.mockRejectedValueOnce(
      Object.assign(new Error("conflict"), { status: 409 }),
    );
    expect(
      (
        await POST(
          request({
            action: "exclude_recipient",
            revision: 3,
            confirmNxt: true,
          }),
        )
      ).status,
    ).toBe(409);
    expect(mocks.exclusionSync).not.toHaveBeenCalled();
  });
  it("requires confirmation for continuing NXT writes but not read-only verification", async () => {
    expect(
      (await POST(request({ action: "sync_exclusion_appeal", revision: 3 })))
        .status,
    ).toBe(422);
    expect(mocks.exclusionSync).not.toHaveBeenCalled();
    expect(
      (await POST(request({ action: "verify_exclusion_appeal", revision: 3 })))
        .status,
    ).toBe(200);
    expect(mocks.exclusionSync.mock.calls[0][5]).toBe(true);
  });
  it("blocks local restoration while NXT exclusion remains", async () => {
    mocks.exclusionRemoval.mockRejectedValueOnce(
      Object.assign(new Error("Remove in NXT first"), { status: 422 }),
    );
    expect(
      (
        await POST(
          request({
            action: "restore_recipient",
            revision: 3,
            exclusionId: "x",
          }),
        )
      ).status,
    ).toBe(422);
    expect(mocks.exclusion).not.toHaveBeenCalled();
  });
  it.each([
    "check_readiness",
    "resume_readiness",
    "cancel_readiness",
    "readiness_settings",
  ])("locks %s without preparing or sending", async (action) => {
    expect((await POST(request({ action, revision: 3 }))).status).toBe(200);
    expect(mocks.acquire).toHaveBeenCalledWith(1, 3);
    expect(
      action === "readiness_settings"
        ? mocks.readinessSettings
        : mocks.readiness,
    ).toHaveBeenCalledOnce();
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.finish).not.toHaveBeenCalled();
    expect(mocks.release).toHaveBeenCalledOnce();
  });
  it("inspects fields explicitly without acquiring a mutation lease or preparing letters", async () => {
    mocks.inspect.mockResolvedValue({ queryId: "31043", fields: ["ID"] });
    const response = await POST(
      request({ action: "inspect_query", queryId: "31043" }),
    );
    expect(response.status).toBe(200);
    expect(mocks.inspect).toHaveBeenCalledOnce();
    expect(mocks.acquire).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.prepare).not.toHaveBeenCalled();
  });
  it.each(["exclude_recipient", "restore_recipient"])(
    "serializes %s using the reviewer and revision lock",
    async (action) => {
      expect((await POST(request({ action, revision: 3 }))).status).toBe(200);
      expect(mocks.acquire).toHaveBeenCalledWith(1, 3);
      expect(mocks.exclusion).toHaveBeenCalledOnce();
      expect(mocks.release).toHaveBeenCalledOnce();
      expect(mocks.send).not.toHaveBeenCalled();
    },
  );
  it.each([
    "exclude_recipient",
    "restore_recipient",
    "inspect_query",
    "save_recipient",
    "check_readiness",
    "resume_readiness",
    "cancel_readiness",
    "readiness_settings",
    "exclusion_appeal_settings",
    "sync_exclusion_appeal",
    "verify_exclusion_appeal",
  ])("denies non-reviewer %s", async (action) => {
    mocks.workspace.mockResolvedValue({
      sessionUser: { id: 1, active: true, role: "mgo" },
    });
    expect((await POST(request({ action, revision: 3 }))).status).toBe(403);
    expect(mocks.exclusion).not.toHaveBeenCalled();
    expect(mocks.inspect).not.toHaveBeenCalled();
    expect(mocks.recipient).not.toHaveBeenCalled();
  });
  it("serializes recipient choices without preparing or sending letters", async () => {
    const response = await POST(
      request({ action: "save_recipient", revision: 3 }),
    );
    expect(response.status).toBe(200);
    expect(mocks.acquire).toHaveBeenCalledWith(1, 3);
    expect(mocks.recipient).toHaveBeenCalledOnce();
    expect(mocks.recipient.mock.calls[0][5]).toBe(1);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.release).toHaveBeenCalledOnce();
  });
  it("rejects stale revisions before saving recipient choices", async () => {
    mocks.acquire.mockRejectedValueOnce(
      Object.assign(new Error("Changed; reload"), { status: 409 }),
    );
    expect(
      (await POST(request({ action: "save_recipient", revision: 2 }))).status,
    ).toBe(409);
    expect(mocks.recipient).not.toHaveBeenCalled();
  });
  it("requires authentication before any database work", async () => {
    mocks.auth.mockResolvedValue(null);
    expect((await GET(new Request(url))).status).toBe(401);
    expect(mocks.schema).not.toHaveBeenCalled();
  });
  it.each(["mgo", "executive"])(
    "denies %s regardless of an impersonated reviewer workspace",
    async (role) => {
      mocks.workspace.mockResolvedValue({
        sessionUser: { id: 1, active: true, role },
        workspaceUser: { role: "admin" },
      });
      expect((await GET(new Request(url))).status).toBe(403);
      expect(mocks.read).not.toHaveBeenCalled();
      expect(mocks.ownSchema).not.toHaveBeenCalled();
    },
  );
  it("denies inactive users", async () => {
    mocks.workspace.mockResolvedValue({
      sessionUser: { id: 1, active: false, role: "admin" },
    });
    expect((await GET(new Request(url))).status).toBe(403);
  });
  it("reads private saved state without preparing or sending letters", async () => {
    const response = await GET(new Request(url));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({
      reviewerId: "1",
      revision: 3,
    });
    expect(mocks.acquire).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("rejects cross-site mutations before authentication", async () => {
    expect(
      (
        await POST(
          request(
            { action: "send", revision: 3 },
            { Origin: "https://bad.example.org" },
          ),
        )
      ).status,
    ).toBe(403);
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(
      (
        await POST(
          request(
            { action: "send", revision: 3 },
            { "sec-fetch-site": "cross-site" },
          ),
        )
      ).status,
    ).toBe(403);
  });
  it("fails closed when another request owns the lease", async () => {
    mocks.acquire.mockRejectedValueOnce(
      Object.assign(new Error("Changed; reload"), { status: 409 }),
    );
    expect((await POST(request({ action: "send", revision: 3 }))).status).toBe(
      409,
    );
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("keeps preparation separate from email transport", async () => {
    mocks.prepare.mockResolvedValue("batch");
    const response = await POST(request({ action: "prepare", revision: 3 }));
    expect(response.status).toBe(200);
    expect(mocks.prepare).toHaveBeenCalledOnce();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.release).toHaveBeenCalledOnce();
  });
  it("marks only confirmed postal batches mailed with one atomic operation", async () => {
    mocks.read.mockResolvedValue({
      revision: 3,
      templates: {},
      history: [{ batchId: "batch", channel: "post", status: "prepared" }],
    });
    expect(
      (await POST(request({ action: "mailed", revision: 3, batchId: "batch" })))
        .status,
    ).toBe(422);
    expect(mocks.finish).not.toHaveBeenCalled();
    expect(
      (
        await POST(
          request({
            action: "mailed",
            revision: 3,
            batchId: "batch",
            confirm: true,
          }),
        )
      ).status,
    ).toBe(200);
    expect(mocks.finish).toHaveBeenCalledWith("batch", "mailed");
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("does not permit uncertain emails to be cancelled and made sendable again", async () => {
    mocks.read.mockResolvedValue({
      history: [{ batchId: "batch", channel: "email", status: "needs_review" }],
    });
    expect(
      (
        await POST(
          request({
            action: "cancel",
            revision: 3,
            batchId: "batch",
            confirm: true,
          }),
        )
      ).status,
    ).toBe(422);
    expect(mocks.finish).not.toHaveBeenCalled();
  });
  it("does not mark a downloaded postal archive as mailed", async () => {
    mocks.read.mockResolvedValue({
      templates: {},
      history: [{ batchId: "batch", channel: "post", status: "prepared" }],
    });
    const response = await GET(new Request(`${url}?download=batch`));
    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(mocks.finish).not.toHaveBeenCalled();
    expect(mocks.acquire).not.toHaveBeenCalled();
  });
});
