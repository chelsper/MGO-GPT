import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import { isReviewerRole } from "@/utils/workspaceRoles";
import { getOrganizationSettings } from "@/app/api/utils/organizationSettings";
import { listGivingSocietyConfigurations } from "@/app/api/utils/givingSocietyConfigurations";
import {
  ensureSocietyLetterSchema,
  readSocietyLetterState,
  acquireSocietyLetters,
} from "@/app/api/utils/societyLetterStore";
import {
  letterArchive,
  letterTemplateFile,
  renderSocietyLetter,
  validateLetterTemplate,
  inspectLetterTemplate,
  renderSocietyLetterSample,
} from "@/app/api/utils/societyLetterDocuments";
import {
  letterWorkspace,
  previewLetters,
  prepareLetterBatch,
  updateLetterSettings,
  saveLetterTemplate,
  refreshLetterSource,
  sendLetterBatch,
  verifyLetterEmail,
  updateLetterExclusion,
  updateLetterRecipient,
  previewLetterRecipient,
} from "@/app/api/utils/societyLetterWorkflow";
import { inspectLetterQueryFields } from "@/app/api/utils/societyLetterQueryFields";
import { letterAppealChoices } from "@/app/api/utils/societyLetterAppealChoices";
import {
  runLetterReadiness,
  saveReadinessPolicy,
} from "@/app/api/utils/societyLetterReadiness";
import { letterError, letterPeriod } from "@/utils/societyLetters";
import {
  previewFinalPostalLetter,
  finalizePostalLetter,
  syncLetterAppeals,
  assertLetterAppealsComplete,
} from "@/app/api/utils/societyLetterFinalization";
import {
  saveExclusionAppealPolicy,
  prepareExclusionAppeal,
  syncExclusionAppeal,
  verifyExclusionRemoval,
} from "@/app/api/utils/societyLetterExclusionAppeals";
import { postalPdfCapability } from "@/app/api/utils/societyLetterPdf";
import {
  startPostalDraft,
  preparePostalDocument,
  draftPostalDocument,
  reviewPostalDocument,
  approvePostalDraft,
  discardPostalDraft,
  updateLetterDates,
  continuePostalBatch,
  savedPostalDocument,
  postalBatchDownload,
} from "@/app/api/utils/societyLetterPostalBatches";

export const maxDuration = 120;
const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
const json = (value, status = 200) => Response.json(value, { status, headers });
const failure = (error) =>
  json(
    {
      error: error.status
        ? error.message
        : "The stewardship operation could not finish. Reload saved history before retrying; letters are never resent automatically.",
    },
    error.status || 500,
  );

async function context(request) {
  const session = await auth();
  if (!session?.user?.email) throw letterError("Please sign in.", 401);
  await ensureAppSchema();
  const { sessionUser } = await getWorkspaceUser(session, request);
  if (
    !sessionUser ||
    sessionUser.active === false ||
    !isReviewerRole(sessionUser.role)
  )
    throw letterError(
      "Stewardship is restricted to Advancement Services and admins.",
      403,
    );
  await ensureSocietyLetterSchema();
  const organization = await getOrganizationSettings();
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: organization.timeZone || "America/New_York",
  }).format(new Date());
  return {
    user: sessionUser,
    organization,
    today,
    definitions: await listGivingSocietyConfigurations(),
    origin: new URL(request.url).origin,
  };
}

export async function GET(request) {
  try {
    const ctx = await context(request);
    const state = await readSocietyLetterState();
    const params = new URL(request.url).searchParams;
    if (params.has("templateVersion")) {
      const version = params.get("templateVersion");
      const template = /^[a-f0-9]{64}$/.test(version || "")
        ? state.templates[version]
        : null;
      if (!template)
        throw letterError(
          "Saved letter template not found. Reload the template list.",
          404,
        );
      // Revalidate archive safety before serving a stored document to the browser.
      const validated = validateLetterTemplate(template);
      return new Response(letterTemplateFile(validated), {
        headers: {
          ...headers,
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": `attachment; filename="${validated.filename}"`,
          "Cross-Origin-Resource-Policy": "same-origin",
        },
      });
    }
    const batchId = params.get("download");
    if (batchId) {
      const items = state.history.filter(
        (item) =>
          item.batchId === batchId &&
          item.channel === "post" &&
          item.status !== "cancelled",
      );
      if (!items.length)
        throw letterError("Prepared postal batch not found.", 404);
      const deliveryId = new URL(request.url).searchParams.get("deliveryId");
      if (deliveryId) {
        const item = items.find((item) => item.id === deliveryId);
        if (!item) throw letterError("Prepared letter not found.", 404);
        assertLetterAppealsComplete([item]);
        if (item.postalDocument) {
          const document = await savedPostalDocument(item.postalDocument);
          return new Response(document.bytes, {
            headers: {
              ...headers,
              "Content-Type": document.mime,
              "Content-Disposition": `attachment; filename="${document.filename}"`,
            },
          });
        }
        return new Response(
          renderSocietyLetter(
            state.templates[item.templateVersion],
            item,
            item.letterDate,
          ).document,
          {
            headers: {
              ...headers,
              "Content-Type":
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              "Content-Disposition":
                'attachment; filename="society-letter.docx"',
            },
          },
        );
      }
      assertLetterAppealsComplete(items);
      return new Response(
        items.every((item) => item.postalDocument)
          ? await postalBatchDownload(items)
          : letterArchive(items, state.templates),
        {
          headers: {
            ...headers,
            "Content-Type": "application/zip",
            "Content-Disposition": 'attachment; filename="society-letters.zip"',
          },
        },
      );
    }
    return json({
      ...letterWorkspace(state, ctx.definitions, ctx.today),
      postalPdf: postalPdfCapability(),
      reviewerId: String(ctx.user.id),
    });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request) {
  let store;
  try {
    if (
      (request.headers.get("origin") &&
        request.headers.get("origin") !== new URL(request.url).origin) ||
      request.headers.get("sec-fetch-site") === "cross-site"
    )
      throw letterError("Invalid request origin.", 403);
    const ctx = await context(request);
    const raw = await request.text();
    if (raw.length > 1500000)
      throw letterError("The template request is too large.", 413);
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      throw letterError("Invalid stewardship request.", 400);
    }
    if (body?.action === "inspect_query")
      return json(await inspectLetterQueryFields(body, ctx));
    if (body?.action === "inspect_appeals")
      return json(await letterAppealChoices(ctx));
    if (body?.action === "preview_template_sample") {
      const state = await readSocietyLetterState();
      const template = /^[a-f0-9]{64}$/.test(body.templateVersion || "")
        ? state.templates[body.templateVersion]
        : null;
      const society = ctx.definitions.find(
        (item) =>
          item.key === template?.societyKey &&
          item.active &&
          item.basis === "annual",
      );
      if (!template || !society)
        throw letterError(
          "Saved annual society letter not found. Reload setup.",
          404,
        );
      const latest = Object.values(state.templates)
        .filter((item) => item.societyKey === society.key)
        .sort((a, b) => b.sequence - a.sequence)[0];
      if (latest.version !== template.version)
        throw letterError(
          "This letter was replaced. Reload setup to preview the current version.",
          409,
        );
      const period = letterPeriod(
        state.settings || { periodBasis: "calendar_year" },
        ctx.today,
      );
      const rendered = renderSocietyLetterSample(
        template,
        society.name,
        period,
        ctx.today,
      );
      return new Response(rendered.document, {
        headers: {
          ...headers,
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition":
            'attachment; filename="society-letter-sample.docx"',
          "Cross-Origin-Resource-Policy": "same-origin",
        },
      });
    }
    if (body?.action === "inspect_template") {
      let content = body.content;
      if (body.templateVersion) {
        if (content)
          throw letterError(
            "Choose a saved template or a new Word file, not both.",
          );
        const state = await readSocietyLetterState();
        const template = /^[a-f0-9]{64}$/.test(body.templateVersion)
          ? state.templates[body.templateVersion]
          : null;
        if (!template)
          throw letterError(
            "Saved letter template not found. Reload the template list.",
            404,
          );
        content = template.content;
      }
      if (typeof content !== "string")
        throw letterError("Choose a Word template first.");
      return json(inspectLetterTemplate(content));
    }
    if (body?.action === "preview_recipient_document") {
      const state = await readSocietyLetterState();
      const rendered = previewLetterRecipient(
        state,
        ctx.definitions,
        ctx.today,
        body,
      );
      return new Response(rendered.document, {
        headers: {
          ...headers,
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition":
            'attachment; filename="society-letter-draft.docx"',
          "Cross-Origin-Resource-Policy": "same-origin",
        },
      });
    }
    const actions = [
      "settings",
      "template",
      "refresh",
      "resume",
      "restart",
      "preview",
      "preview_document",
      "prepare",
      "send",
      "mailed",
      "cancel",
      "verify",
      "exclude_recipient",
      "restore_recipient",
      "save_recipient",
      "readiness_settings",
      "check_readiness",
      "resume_readiness",
      "cancel_readiness",
      "exclusion_appeal_settings",
      "sync_exclusion_appeal",
      "verify_exclusion_appeal",
      "preview_final_postal",
      "preview_final_postal_document",
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
    ];
    if (!actions.includes(body?.action) || !Number.isInteger(body.revision))
      throw letterError("Reload the workspace and choose an action.", 400);
    store = await acquireSocietyLetters(ctx.user.id, body.revision);
    const state = await readSocietyLetterState();
    let batchId;
    switch (body.action) {
      case "update_letter_dates":
        await updateLetterDates(
          state,
          ctx.definitions,
          ctx.today,
          body,
          store,
          ctx,
        );
        break;
      case "start_postal_draft":
        await startPostalDraft(
          state,
          ctx.definitions,
          ctx.today,
          body,
          store,
          ctx,
        );
        break;
      case "prepare_postal_document":
        await preparePostalDocument(
          state,
          ctx.definitions,
          ctx.today,
          body,
          store,
        );
        break;
      case "preview_postal_document": {
        const document = await draftPostalDocument(
          state,
          ctx.definitions,
          ctx.today,
          body,
        );
        return new Response(document.bytes, {
          headers: {
            ...headers,
            "Content-Type": document.mime,
            "Content-Disposition": `attachment; filename="${document.filename}"`,
            "Cross-Origin-Resource-Policy": "same-origin",
          },
        });
      }
      case "review_postal_document":
        await reviewPostalDocument(
          state,
          ctx.definitions,
          ctx.today,
          body,
          store,
          ctx,
        );
        break;
      case "approve_postal_draft":
        batchId = await approvePostalDraft(
          state,
          ctx.definitions,
          ctx.today,
          body,
          store,
          ctx,
        );
        break;
      case "discard_postal_draft":
        await discardPostalDraft(state, body, store);
        break;
      case "continue_postal_batch":
        await continuePostalBatch(
          state,
          ctx.definitions,
          ctx.today,
          body,
          store,
          ctx,
        );
        break;
      case "preview_final_postal":
        return json({
          finalPreview: previewFinalPostalLetter(
            state,
            ctx.definitions,
            ctx.today,
            body,
          ),
        });
      case "preview_final_postal_document": {
        const preview = previewFinalPostalLetter(
          state,
          ctx.definitions,
          ctx.today,
          body,
        );
        if (preview.token !== body.previewToken)
          throw letterError(
            "Letter details changed. Reload the final confirmation.",
            409,
          );
        const rendered = renderSocietyLetter(
          state.templates[preview.row.templateVersion],
          preview.row,
          ctx.today,
        );
        return new Response(rendered.document, {
          headers: {
            ...headers,
            "Content-Type":
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "Content-Disposition":
              'attachment; filename="society-letter-draft.docx"',
            "Cross-Origin-Resource-Policy": "same-origin",
          },
        });
      }
      case "finalize_postal":
        batchId = await finalizePostalLetter(
          state,
          ctx.definitions,
          ctx.today,
          body,
          store,
          ctx,
        );
        break;
      case "verify_letter_appeals":
      case "continue_letter_appeals":
        if (body.action === "continue_letter_appeals") {
          const item = state.history.find((i) => i.id === body.deliveryId);
          if (item?.postalDocument)
            await savedPostalDocument(item.postalDocument);
        }
        await syncLetterAppeals(
          state,
          ctx.definitions,
          ctx.today,
          body,
          store,
          ctx,
        );
        break;
      case "exclusion_appeal_settings":
        await saveExclusionAppealPolicy(
          state,
          ctx.definitions,
          ctx.today,
          body,
          store,
          ctx,
        );
        break;
      case "sync_exclusion_appeal":
      case "verify_exclusion_appeal": {
        if (body.action === "sync_exclusion_appeal" && body.confirmNxt !== true)
          throw letterError(
            "Confirm applying the exclusion appeal to remaining household members.",
          );
        const item = (state.exclusions || []).find(
          (e) => e.id === body.exclusionId && !e.restoredAt,
        );
        await syncExclusionAppeal(
          state,
          item,
          store,
          ctx,
          undefined,
          body.action === "verify_exclusion_appeal",
        );
        break;
      }
      case "readiness_settings":
        await saveReadinessPolicy(
          state,
          ctx.definitions,
          ctx.today,
          body,
          store,
          ctx,
        );
        break;
      case "check_readiness":
      case "resume_readiness":
      case "cancel_readiness":
        await runLetterReadiness(
          state,
          ctx.definitions,
          ctx.today,
          body,
          store,
          ctx,
        );
        break;
      case "save_recipient":
        await updateLetterRecipient(
          state,
          ctx.definitions,
          ctx.today,
          body,
          store,
          ctx.user.id,
        );
        break;
      case "exclude_recipient":
      case "restore_recipient": {
        if (body.action === "restore_recipient") {
          const item = (state.exclusions || []).find(
            (e) => e.id === body.exclusionId && !e.restoredAt,
          );
          await verifyExclusionRemoval(item, ctx);
        }
        // Once configured, an exclusion cannot silently omit its NXT write-back.
        const shouldRecord =
          body.action === "exclude_recipient" &&
          (body.confirmNxt === true || !!state.readiness?.exclusionPolicy);
        const nxt = shouldRecord
          ? prepareExclusionAppeal(state, ctx.definitions, ctx.today, body)
          : null;
        const item = await updateLetterExclusion(
          state,
          ctx.definitions,
          ctx.today,
          body,
          store,
          ctx.user.id,
          nxt,
        );
        if (nxt) await syncExclusionAppeal(state, item, store, ctx);
        break;
      }
      case "settings":
        await updateLetterSettings(
          state,
          ctx.definitions,
          ctx.today,
          body,
          store,
          ctx.user.id,
        );
        break;
      case "template":
        await saveLetterTemplate(
          state,
          body,
          ctx.today,
          store,
          ctx.user.id,
          ctx.definitions,
        );
        break;
      case "refresh":
      case "resume":
      case "restart":
        await refreshLetterSource(
          state,
          ctx.definitions,
          ctx.today,
          body,
          store,
          ctx,
        );
        break;
      case "preview":
        return json({
          preview: previewLetters(state, ctx.definitions, ctx.today, body),
        });
      case "preview_document": {
        const preview = previewLetters(state, ctx.definitions, ctx.today, {
          ...body,
          householdIds: [body.householdId],
        });
        const row = preview.rows[0];
        const rendered = renderSocietyLetter(
          state.templates[row.templateVersion],
          row,
          row.letterDate,
        );
        return new Response(rendered.document, {
          headers: {
            ...headers,
            "Content-Type":
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "Content-Disposition":
              'attachment; filename="society-letter-preview.docx"',
          },
        });
      }
      case "prepare":
        batchId = await prepareLetterBatch(
          state,
          ctx.definitions,
          ctx.today,
          body,
          store,
          ctx.user.id,
        );
        break;
      case "send":
        await sendLetterBatch(state, body, store, ctx.organization);
        break;
      case "verify":
        await verifyLetterEmail(state, body, store);
        break;
      case "mailed":
      case "cancel": {
        if (body.confirm !== true)
          throw letterError("Confirm this batch action first.");
        const items = state.history.filter(
          (item) => item.batchId === body.batchId,
        );
        if (
          !items.some((item) =>
            ["prepared", "pending_email"].includes(item.status),
          )
        )
          throw letterError(
            "There are no unsent letters to change. Submitted or uncertain emails cannot be cancelled.",
          );
        if (
          body.action === "mailed" &&
          items.some((item) => item.channel !== "post")
        )
          throw letterError("Only postal batches can be marked mailed.");
        if (body.action === "mailed") assertLetterAppealsComplete(items);
        if (
          body.action === "cancel" &&
          items.some((item) => item.letterAppeals)
        )
          throw letterError(
            "This letter has reserved NXT appeal updates and cannot be released automatically. Verify its history first; no NXT history is deleted.",
            409,
          );
        await store.finishBatch(
          body.batchId,
          body.action === "mailed" ? "mailed" : "cancelled",
        );
        break;
      }
    }
    return json({
      reviewerId: String(ctx.user.id),
      postalPdf: postalPdfCapability(),
      ...letterWorkspace(
        await readSocietyLetterState(),
        ctx.definitions,
        ctx.today,
      ),
      ...(batchId ? { batchId } : {}),
    });
  } catch (error) {
    return failure(error);
  } finally {
    if (store) await store.release().catch(() => {});
  }
}
