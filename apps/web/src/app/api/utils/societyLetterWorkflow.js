import { createHash, randomUUID } from "node:crypto";
import { advanceQueryList } from "./constituentQueryList";
import { getGivingSocietyConfigurationSignature } from "./givingSocietyDefinitions";
import { buildResendFromAddress } from "./sendSubmissionEmail";
import {
  renderSocietyLetter,
  validateLetterTemplate,
} from "./societyLetterDocuments";
import {
  LETTER_BATCH_LIMIT,
  letterError,
  letterHierarchy,
  letterPeriod,
  householdsFromQuery,
  letterDisposition,
  letterIssue,
  validateLetterSettings,
} from "@/utils/societyLetters";

const hash = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const letterSourceSignature = (state, definitions) =>
  hash([state.settings, getGivingSocietyConfigurationSignature(definitions)]);
export const emailDeliveryEnabled = () =>
  process.env.STEWARDSHIP_EMAIL_ENABLED === "true";
const activeTemplate = (state, key) =>
  Object.values(state.templates)
    .filter((t) => t.societyKey === key)
    .sort((a, b) => b.sequence - a.sequence)[0];

function sourceIssue(state, definitions, today) {
  if (!state.settings)
    return "Configure a household membership query before preparing letters.";
  const period = letterPeriod(state.settings, today);
  if (
    !state.snapshot ||
    state.snapshot.period.key !== period.key ||
    state.snapshot.signature !== letterSourceSignature(state, definitions)
  )
    return "Refresh the configured query for this period before preparing letters.";
  if (
    !Number.isFinite(Date.parse(state.snapshot.generatedAt)) ||
    Date.now() - Date.parse(state.snapshot.generatedAt) > 24 * 60 * 60 * 1000
  )
    return "Refresh household eligibility before preparing letters; this snapshot is more than 24 hours old.";
  return null;
}

export function letterWorkspace(state, definitions, today) {
  const hierarchy = letterHierarchy(definitions, state.settings);
  const issue = sourceIssue(state, definitions, today);
  const period = state.settings ? letterPeriod(state.settings, today) : null;
  const currentRows =
    period && state.snapshot?.period?.key === period.key
      ? state.snapshot.rows
      : [];
  return {
    revision: state.revision,
    settings: state.settings,
    today,
    emailEnabled: emailDeliveryEnabled(),
    definitions: definitions.filter((d) => d.active && d.basis === "annual"),
    period,
    templates: hierarchy.map((d) => {
      const t = activeTemplate(state, d.key);
      return {
        societyKey: d.key,
        societyName: d.name,
        ...(t
          ? {
              filename: t.filename,
              version: t.version,
              subject: t.subject,
              emailBody: t.emailBody,
              savedAt: t.savedAt,
            }
          : {}),
      };
    }),
    sourceIssue: issue,
    refreshedAt: state.snapshot?.generatedAt || null,
    job: state.job
      ? {
          id: state.job.id,
          status: state.job.status,
          message: state.job.message || "",
        }
      : null,
    rows: currentRows.map((row) => ({
      ...row,
      ...letterDisposition(row, state.history),
      issues: {
        email:
          issue ||
          letterIssue(row, "email", activeTemplate(state, row.societyKey)),
        post:
          issue ||
          letterIssue(row, "post", activeTemplate(state, row.societyKey)),
      },
    })),
    history: state.history,
  };
}

export function previewLetters(state, definitions, today, body) {
  const issue = sourceIssue(state, definitions, today);
  if (issue) throw letterError(issue);
  const selected = body.householdIds;
  if (
    !Array.isArray(selected) ||
    !selected.length ||
    selected.length > LETTER_BATCH_LIMIT ||
    new Set(selected).size !== selected.length
  )
    throw letterError(
      `Select 1-${LETTER_BATCH_LIMIT} distinct households per batch.`,
    );
  if (!["post", "email"].includes(body.channel))
    throw letterError("Choose a delivery method.");
  if (body.channel === "email" && !emailDeliveryEnabled())
    throw letterError(
      "Email delivery has not been enabled for this environment. You can prepare postal letters now.",
    );
  const rows = selected.map((householdId) => {
    const row = state.snapshot.rows.find((r) => r.householdId === householdId);
    if (!row || letterDisposition(row, state.history).status !== "ready")
      throw letterError(
        "A selected household is already covered or held. Reload the worklist.",
        409,
      );
    if (
      state.history.some(
        (item) =>
          item.status !== "cancelled" &&
          item.period.key === row.period.key &&
          item.hierarchySignature !==
            hash(
              letterHierarchy(definitions, state.settings).map((d) => [
                d.key,
                d.displayOrder,
              ]),
            ),
      )
    )
      throw letterError(
        "The society hierarchy changed after letters were prepared for this period. Review the prior hierarchy before preparing more letters.",
      );
    const template = activeTemplate(state, row.societyKey);
    const reason = letterIssue(row, body.channel, template);
    if (reason) throw letterError(`${row.name}: ${reason}`);
    const rendered = renderSocietyLetter(template, row, today);
    return {
      ...row,
      hierarchySignature: hash(
        letterHierarchy(definitions, state.settings).map((d) => [
          d.key,
          d.displayOrder,
        ]),
      ),
      templateVersion: template.version,
      templateFilename: template.filename,
      letterDate: today,
      subject: rendered.subject,
      coverMessage: rendered.text,
    };
  });
  // Same mailbox for different households is not silently treated as the same family.
  if (
    body.channel === "email" &&
    new Set(rows.map((r) => r.email.toLowerCase())).size !== rows.length
  )
    throw letterError(
      "Different households share an email address. Review them individually instead of sending this batch.",
    );
  return {
    rows,
    channel: body.channel,
    token: hash([state.revision, body.channel, rows]),
  };
}

export async function updateLetterSettings(
  state,
  definitions,
  today,
  body,
  store,
  userId,
) {
  const settings = validateLetterSettings(body.settings, definitions, today);
  const proposedPeriod = letterPeriod(settings, today);
  // Do not redefine an in-use period or reorder its hierarchy to bypass history.
  if (
    state.settings &&
    state.history.some(
      (item) =>
        item.status !== "cancelled" &&
        item.period.start <= proposedPeriod.end &&
        item.period.end >= proposedPeriod.start,
    ) &&
    JSON.stringify([
      settings.periodBasis,
      settings.fiscalYearStartMonth,
      settings.startDate,
      settings.endDate,
      settings.societyKeys,
    ]) !==
      JSON.stringify([
        state.settings.periodBasis,
        state.settings.fiscalYearStartMonth,
        state.settings.startDate,
        state.settings.endDate,
        state.settings.societyKeys,
      ])
  )
    throw letterError(
      "This period overlaps existing letters. Period or hierarchy changes need a reviewed migration. Choose a non-overlapping new period, or keep the current period and correct the query mapping.",
    );
  state.settings = settings;
  state.job = null;
  state.settings.confirmedBy = userId;
  await store.save(state);
}

export async function saveLetterTemplate(state, body, today, store, userId) {
  if (!state.settings?.societyKeys.includes(body.societyKey))
    throw letterError("Choose a configured society.");
  const template = validateLetterTemplate(body.template);
  const version = hash([body.societyKey, template.version]);
  if (!state.templates[version]) {
    if (Object.keys(state.templates).length >= 100)
      throw letterError(
        "Template history needs archiving before another version can be added.",
      );
    state.templates[version] = {
      ...template,
      version,
      societyKey: body.societyKey,
      savedAt: today,
      savedBy: userId,
      sequence:
        Math.max(0, ...Object.values(state.templates).map((t) => t.sequence)) +
        1,
    };
  } else
    state.templates[version].sequence =
      Math.max(...Object.values(state.templates).map((t) => t.sequence)) + 1;
  await store.save(state);
}

export async function refreshLetterSource(
  state,
  definitions,
  today,
  body,
  store,
  context,
) {
  if (!state.settings)
    throw letterError("Configure the household query first.");
  const signature = letterSourceSignature(state, definitions);
  const period = letterPeriod(state.settings, today);
  if (["refresh", "restart"].includes(body.action)) {
    if (body.action === "restart" && body.confirm !== true)
      throw letterError("Confirm the query restart first.");
    if (body.action === "refresh" && state.job?.status === "running")
      throw letterError(
        "A query is already running. Resume it or explicitly restart the unfinished query.",
        409,
      );
    state.job = {
      id: randomUUID(),
      status: "starting",
      stage: "members",
      signature,
      period,
      profileOffset: 0,
      ownerId: context.user.id,
    };
    await store.save(state);
  } else {
    if (
      !state.job ||
      body.jobId !== state.job.id ||
      state.job.signature !== signature ||
      state.job.period.key !== period.key ||
      state.job.ownerId !== context.user.id
    )
      throw letterError(
        "The query context changed. Restart the refresh with your connected account.",
        409,
      );
    if (state.job.status !== "running")
      throw letterError(
        "Restart this unfinished query; its submission could not be confirmed.",
        409,
      );
  }
  try {
    const { job, snapshot } = await advanceQueryList({
      job: state.job,
      user: context.user,
      origin: context.origin,
      source: {
        source: "query",
        queryId: state.settings.queryId,
        leadFundraiser: { enabled: false },
      },
    });
    state.job = job;
    if (snapshot) {
      const rows = householdsFromQuery(
        snapshot,
        state.settings,
        letterHierarchy(definitions, state.settings),
        period,
      );
      state.snapshot = {
        rows,
        signature,
        period,
        generatedAt: snapshot.generatedAt,
      };
      state.job = {
        id: job.id,
        status: "complete",
        message: `${rows.length} households checked.`,
      };
    } else state.job.status = "running";
    await store.save(state);
  } catch (error) {
    state.job = {
      ...state.job,
      status: "needs_review",
      message: error.status
        ? error.message
        : "The household query could not finish. Saved letters and prior results are unchanged. Check the query and connection, then restart.",
    };
    await store.save(state);
  }
}

export async function prepareLetterBatch(
  state,
  definitions,
  today,
  body,
  store,
  userId,
) {
  const preview = previewLetters(state, definitions, today, body);
  if (body.confirm !== true || preview.token !== body.previewToken)
    throw letterError(
      "Review the current recipients and templates, then confirm this batch.",
      409,
    );
  const batchId = randomUUID();
  const items = preview.rows.map((row) => ({
    ...row,
    id: randomUUID(),
    batchId,
    channel: preview.channel,
    status: preview.channel === "post" ? "prepared" : "pending_email",
    preparedAt: new Date().toISOString(),
    preparedBy: userId,
  }));
  await store.reserve(items);
  return batchId;
}

export async function sendLetterBatch(
  state,
  body,
  store,
  organization,
  fetcher = fetch,
) {
  if (body.confirm !== true)
    throw letterError("Confirm the queued email batch before sending.");
  if (!emailDeliveryEnabled() || !process.env.RESEND_API_KEY)
    throw letterError("Email delivery is not enabled in this environment.");
  const from = buildResendFromAddress(
    organization.notificationSenderName,
    process.env.RESEND_FROM_EMAIL,
  );
  if (!process.env.RESEND_FROM_EMAIL || /@resend\.dev/i.test(from))
    throw letterError(
      "Configure a verified organization email sender before sending letters.",
    );
  const items = state.history
    .filter(
      (item) =>
        item.batchId === body.batchId && item.status === "pending_email",
    )
    .slice(0, 3);
  if (!items.length) return;
  for (const item of items) {
    if (
      !Number.isFinite(Date.parse(item.preparedAt)) ||
      Date.now() - Date.parse(item.preparedAt) > 24 * 60 * 60 * 1000
    )
      throw letterError(
        "Queued recipients are more than 24 hours old or have an invalid preparation date. Cancel the unsent letters, refresh membership, and review a new batch.",
      );
    const template = state.templates[item.templateVersion];
    if (!template)
      throw letterError(
        "Saved template version is unavailable; no further letters were sent.",
      );
    const rendered = renderSocietyLetter(template, item, item.letterDate);
    await store.transition(item, "pending_email", "sending");
    // Persist before the external call. A timeout or lost response is never retried
    // automatically, even after the provider's idempotency window expires.
    let result;
    try {
      const response = await fetcher("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `society-letter:${item.id}`,
        },
        body: JSON.stringify({
          from,
          to: [item.email],
          subject: rendered.subject,
          text: rendered.text,
          tags: [{ name: "society_letter_id", value: item.id }],
          attachments: [
            {
              filename: "society-letter.docx",
              content: rendered.document.toString("base64"),
            },
          ],
        }),
        signal: AbortSignal.timeout(15000),
      });
      const payload = await response.json();
      result =
        response.ok && typeof payload.id === "string" ? payload.id : null;
    } catch {
      result = null;
    }
    await store.transition(
      item,
      "sending",
      result ? "emailed" : "needs_review",
      result,
    );
    if (!result) break;
  }
}

export async function verifyLetterEmail(state, body, store, fetcher = fetch) {
  const item = state.history.find((item) => item.id === body.deliveryId);
  const providerId = item?.providerId || String(body.providerId || "");
  if (
    item?.channel !== "email" ||
    !/^[0-9a-f-]{36}$/i.test(providerId) ||
    !["emailed", "needs_review", "sending"].includes(item.status)
  )
    throw letterError(
      "Provide the matching email ID from the sender's email log. This only verifies an existing message; it never sends another letter.",
    );
  const response = await fetcher(
    `https://api.resend.com/emails/${encodeURIComponent(providerId)}`,
    {
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!response.ok)
    throw letterError(
      "Email status could not be checked. The letter remains protected against duplicate sending.",
    );
  const result = await response.json();
  if (
    result.id !== providerId ||
    result.to?.length !== 1 ||
    result.to[0].toLowerCase() !== item.email.toLowerCase() ||
    !result.tags?.some(
      (tag) => tag.name === "society_letter_id" && tag.value === item.id,
    )
  )
    throw letterError("The delivery receipt could not be matched safely.");
  if (result.last_event === "delivered")
    await store.transition(item, item.status, "delivered", providerId);
  else if (["sent", "queued"].includes(result.last_event))
    await store.transition(item, item.status, "emailed", providerId);
  else if (
    ["bounced", "failed", "suppressed", "complained"].includes(
      result.last_event,
    )
  )
    await store.transition(item, item.status, "needs_review", providerId);
}
