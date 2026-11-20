import {
  buildBlackbaudActionPayload,
  buildBlackbaudActionMetadataPayload,
  blackbaudApiFetch,
} from "./blackbaud";
import { guardedNxtCreate, createFingerprint } from "./nxtCreateReceipt";
import { resolveActionFundraiserIds } from "./actionFundraisers";
import { listError } from "./listConfigurations";
import { OUTREACH_OUTCOMES } from "@/utils/projectOutreach";
import { projectConstituentId } from "@/utils/projectProspecting";

export function outreachActionPayload(event, user, fundraisers) {
  const r = event.result;
  const notes = [
    `Project: ${r.projectTitle}`,
    `Outreach reference: JU-PO-${event.id}`,
    `Outcome: ${OUTREACH_OUTCOMES[r.outcome]}`,
    r.notes,
    r.nextDate
      ? `Follow-up due in Project Outreach: ${r.nextDate}. No separate planned NXT action was created.`
      : "Project outreach marked complete.",
    `Recorded by ${user.name || user.email}`,
  ].join("\n");
  return {
    ...buildBlackbaudActionPayload({
      blackbaudConstituentId: event.constituent_id,
      actionDate: r.actionDate,
      actionCategory: r.outcome === "contact_issue" ? "Task" : "Phone Call",
      summary: `${r.projectTitle}: ${OUTREACH_OUTCOMES[r.outcome]}`.slice(
        0,
        255,
      ),
      actionNotes: notes,
      authorName: user.name || user.email,
      fundraiserIds: fundraisers,
    }),
    ...buildBlackbaudActionMetadataPayload({
      actionDate: r.actionDate,
      interactionType: r.interactionType,
      fundraiserIds: fundraisers,
    }),
  };
}
export function outreachActionMatches(record, expected, actionId) {
  const r =
    record?.value && !Array.isArray(record.value) ? record.value : record;
  const text = (value) =>
    typeof value === "string" ? value.replace(/\r\n/g, "\n") : null;
  const fundraisers = Array.isArray(r?.fundraisers)
    ? r.fundraisers
        .map((f) =>
          String(typeof f === "object" ? f?.id || f?.fundraiser_id || "" : f),
        )
        .sort()
    : [];
  return (
    String(r?.id || r?.action_id || "") === actionId &&
    String(r?.constituent_id || "") === expected.constituent_id &&
    r.completed === true &&
    r.type === expected.type &&
    r.direction === expected.direction &&
    r.category === expected.category &&
    String(r.date || "").slice(0, 10) === expected.date.slice(0, 10) &&
    String(r.completed_date || "").slice(0, 10) ===
      expected.completed_date.slice(0, 10) &&
    r.summary === expected.summary &&
    text(r.description) === text(expected.description) &&
    JSON.stringify(fundraisers) ===
      JSON.stringify([...expected.fundraisers].sort())
  );
}

export async function submitOutreachAction(
  context,
  store,
  eventId,
  { verify = false, actionId: suppliedId } = {},
) {
  let event = await store.event(context, eventId);
  if (event.state === "confirmed")
    return { state: "confirmed", actionId: event.action_id };
  const api = {
    userId: context.user.id,
    authUserId: context.user.id,
    origin: context.origin,
    maxRetries: 0,
    timeoutMs: 12000,
  };
  if (verify) {
    if (event.state === "draft" || !event.payload)
      throw listError("This outcome has not been submitted to NXT.");
    if (
      event.state === "processing" &&
      Date.now() - Date.parse(event.updated_at) < 5 * 60 * 1000
    )
      throw listError(
        "The submission may still be running. Reload saved status in a few minutes; do not submit it again.",
        409,
      );
    const receipt = await store.receipt(event);
    if (!receipt)
      throw listError(
        "No durable NXT submission receipt was found. Ask an administrator to review; do not submit a replacement.",
        409,
      );
    const actionId = projectConstituentId(
      String(event.action_id || receipt.remote_id || suppliedId || ""),
    );
    if (!actionId || (suppliedId && suppliedId !== actionId))
      throw listError(
        "Enter the existing action system record ID. Verification never creates an action.",
      );
    const record = await blackbaudApiFetch(
      `/constituent/v1/actions/${actionId}`,
      { ...api, method: "GET" },
    );
    if (!outreachActionMatches(record, event.payload, actionId))
      throw listError(
        "The existing NXT action does not match this saved outcome. Review it in NXT; nothing was resent or changed.",
        409,
      );
    await store.confirm(context, event, actionId, receipt);
    return { state: "confirmed", actionId };
  }
  if (event.state !== "draft")
    return { state: event.state, actionId: event.action_id };
  // Only preflight reads precede the durable local claim. The outcome is already saved.
  const profile = await blackbaudApiFetch(
    `/constituent/v1/constituents/${event.constituent_id}`,
    { ...api, method: "GET" },
  );
  if (String(profile?.id || "") !== event.constituent_id)
    throw listError(
      "NXT could not confirm this constituent. The outcome is saved; no action was submitted.",
      409,
    );
  const fundraiserIds = await resolveActionFundraiserIds({
    currentUser: context.user,
    primaryFundraiserUser: context.user,
    requirePrimaryFundraiser: true,
    origin: context.origin,
    apiUserId: context.user.id,
  });
  const payload = outreachActionPayload(event, context.user, fundraiserIds);
  // The existing NXT workflow applies action type with PATCH after creation.
  // Keep the full intended record in the receipt for exact later verification.
  const { type: _actionType, ...createPayload } = payload;
  await store.claim(context, event, payload);
  event = { ...event, payload };
  let receipt;
  try {
    const created = await guardedNxtCreate({
      ownerUserId: context.user.id,
      enteredByUserId: context.user.id,
      kind: "action",
      source: "project-outreach",
      requestData: { eventId: event.id },
      payload,
      onReceipt: (value) => {
        receipt = value;
      },
      create: () =>
        blackbaudApiFetch("/constituent/v1/actions", {
          ...api,
          method: "POST",
          body: createPayload,
        }),
    });
    const actionId = String(created.id);
    await store.checkpoint(event.id, receipt);
    const record = await blackbaudApiFetch(
      `/constituent/v1/actions/${actionId}`,
      { ...api, method: "GET" },
    );
    const current =
      record?.value && !Array.isArray(record.value) ? record.value : record;
    if (
      String(current?.id || "") !== actionId ||
      String(current?.constituent_id || "") !== event.constituent_id
    )
      throw new Error("Action identity unconfirmed");
    await blackbaudApiFetch(`/constituent/v1/actions/${actionId}`, {
      ...api,
      method: "PATCH",
      body: buildBlackbaudActionMetadataPayload({
        actionDate: event.result.actionDate,
        interactionType: event.result.interactionType,
        fundraiserIds,
      }),
    });
    const checked = await blackbaudApiFetch(
      `/constituent/v1/actions/${actionId}`,
      { ...api, method: "GET" },
    );
    if (!outreachActionMatches(checked, payload, actionId))
      throw new Error("Action fields unconfirmed");
    await store.confirm(context, event, actionId, receipt);
    return { state: "confirmed", actionId };
  } catch (error) {
    if (!receipt && error?.writeReceipt) {
      if (
        createFingerprint(error.writeReceipt.payload) ===
        createFingerprint(payload)
      )
        receipt = error.writeReceipt;
      else {
        try {
          await store.unclaimUnsent(context, event);
          return {
            state: "draft",
            message:
              "Outcome saved; no action was submitted for it. Resolve your earlier saved NXT submission for this constituent first, then submit this same saved outcome.",
          };
        } catch {
          /* Keep the conservative hold if a safe reopening cannot be proven. */
        }
      }
    }
    if (receipt) await store.checkpoint(event.id, receipt).catch(() => {});
    await store.hold(event.id).catch(() => {});
    return {
      state: "review",
      message:
        "Your outcome is saved. The NXT action may already exist; reload status, then verify the existing action. Do not resubmit it.",
    };
  }
}
