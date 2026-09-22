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
  renderSocietyLetter,
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
} from "@/app/api/utils/societyLetterWorkflow";
import { letterError } from "@/utils/societyLetters";

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
    const batchId = new URL(request.url).searchParams.get("download");
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
      return new Response(letterArchive(items, state.templates), {
        headers: {
          ...headers,
          "Content-Type": "application/zip",
          "Content-Disposition": 'attachment; filename="society-letters.zip"',
        },
      });
    }
    return json(letterWorkspace(state, ctx.definitions, ctx.today));
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
    ];
    if (!actions.includes(body?.action) || !Number.isInteger(body.revision))
      throw letterError("Reload the workspace and choose an action.", 400);
    store = await acquireSocietyLetters(ctx.user.id, body.revision);
    const state = await readSocietyLetterState();
    let batchId;
    switch (body.action) {
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
        await saveLetterTemplate(state, body, ctx.today, store, ctx.user.id);
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
        await store.finishBatch(
          body.batchId,
          body.action === "mailed" ? "mailed" : "cancelled",
        );
        break;
      }
    }
    return json({
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
