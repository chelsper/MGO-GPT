import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import {
  buildBlackbaudActionPayload,
  buildBlackbaudActionMetadataPayload,
  createBlackbaudAction,
  findBlackbaudConstituentByEmail,
  getBlackbaudAction,
  getBlackbaudConstituentById,
  searchBlackbaudConstituents,
  updateBlackbaudAction,
} from "@/app/api/utils/blackbaud";
import { resolveActionFundraiserIds } from "@/app/api/utils/actionFundraisers";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import { syncPrimaryPendingAction } from "@/app/api/utils/pendingActions";

function formatActionUpdateNotes({
  notes,
  nextStep,
}) {
  const parts = [
    notes?.trim() || null,
    nextStep?.trim() ? `Next step: ${nextStep.trim()}` : null,
  ].filter(Boolean);

  return parts.join("\n\n");
}

function normalizeActionLabel(value) {
  const text = String(value || "").trim();
  return text || null;
}

function normalizeComparisonText(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function getBlackbaudActionId(payload) {
  return (
    payload?.id ||
    payload?.action_id ||
    payload?.constituent_action_id ||
    payload?.value?.id ||
    payload?.value?.action_id ||
    payload?.value?.constituent_action_id ||
    null
  );
}

function getBlackbaudActionConstituentId(payload) {
  return (
    payload?.constituent_id ||
    payload?.constituent?.id ||
    payload?.constituent?.constituent_id ||
    payload?.value?.constituent_id ||
    payload?.value?.constituent?.id ||
    payload?.value?.constituent?.constituent_id ||
    null
  );
}

function isBlackbaudRequestNotFulfilledError(message) {
  const text = String(message || "");
  return /404/i.test(text) && /RequestNotFulfilled|requested operation could not be fulfilled/i.test(text);
}

function buildMinimalBlackbaudActionPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return payload;
  }

  const minimalPayload = {
    constituent_id: payload.constituent_id,
    date: payload.date,
    category: payload.category,
    direction: payload.direction,
    summary: payload.summary,
    description: payload.description,
  };

  if (payload.opportunity_id) {
    minimalPayload.opportunity_id = payload.opportunity_id;
  }

  return minimalPayload;
}

function buildActionCreateFallbackVariants(payload) {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  return [
    {
      syncVariant: "fallback-core-action-payload",
      payload: buildMinimalBlackbaudActionPayload(payload),
    },
    {
      syncVariant: "fallback-core-action-payload-no-direction",
      payload: {
        constituent_id: payload.constituent_id,
        date: payload.date,
        category: payload.category,
        summary: payload.summary,
        description: payload.description,
        ...(payload.opportunity_id ? { opportunity_id: payload.opportunity_id } : {}),
      },
    },
    {
      syncVariant: "fallback-bare-action-payload",
      payload: {
        constituent_id: payload.constituent_id,
        date: payload.date,
        category: payload.category,
        summary: payload.summary,
        ...(payload.opportunity_id ? { opportunity_id: payload.opportunity_id } : {}),
      },
    },
  ];
}

function summarizeActionCreatePayload(payload) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  return {
    keys: Object.keys(payload).sort(),
    category: payload.category || null,
    date: payload.date || null,
    hasDescription: Boolean(payload.description),
    hasDirection: Boolean(payload.direction),
    hasSummary: Boolean(payload.summary),
  };
}

function formatActionCreateVariantDebug(attemptedCreateVariants, context = {}) {
  const attempts = Array.isArray(attemptedCreateVariants)
    ? attemptedCreateVariants.filter(Boolean)
    : [];
  const extras = [];

  if (attempts.length > 0) {
    const lastAttempt = attempts[attempts.length - 1];
    const keys = Array.isArray(lastAttempt?.payload?.keys)
      ? lastAttempt.payload.keys.join(",")
      : "";
    extras.push(`variant=${lastAttempt?.syncVariant || "unknown"}`);
    if (keys) {
      extras.push(`keys=${keys}`);
    }
  }

  if (context.constituentId) {
    extras.push(`constituent_id=${context.constituentId}`);
  }
  if (context.category) {
    extras.push(`category=${context.category}`);
  }
  if (context.date) {
    extras.push(`date=${context.date}`);
  }
  if (context.summaryLength != null) {
    extras.push(`summary_len=${context.summaryLength}`);
  }
  if (context.preflightStatus) {
    extras.push(`preflight=${context.preflightStatus}`);
  }
  if (context.preflightName) {
    extras.push(`preflight_name=${context.preflightName}`);
  }
  if (context.preflightLookupId) {
    extras.push(`preflight_lookup_id=${context.preflightLookupId}`);
  }

  if (extras.length === 0) {
    return "";
  }

  return ` [${extras.join(" | ")}]`;
}

async function repairProspectBlackbaudConstituentLink({
  userId,
  prospectId,
  constituentId,
  prospectName,
  prospectEmail,
  authUserId,
  origin,
}) {
  const exactEmailMatch = prospectEmail
    ? await findBlackbaudConstituentByEmail({
        userId,
        authUserId,
        origin,
        email: prospectEmail,
      }).catch(() => null)
    : null;

  if (exactEmailMatch?.blackbaudConstituentId) {
    const repairedId = String(exactEmailMatch.blackbaudConstituentId);
    await sql`
      UPDATE prospects
      SET blackbaud_constituent_id = ${repairedId}, updated_at = NOW()
      WHERE id = ${prospectId} AND user_id = ${userId}
    `;
    if (constituentId) {
      await sql`
        UPDATE constituents
        SET blackbaud_constituent_id = ${repairedId}, updated_at = NOW()
        WHERE id = ${constituentId} AND user_id = ${userId}
      `;
    }
    return {
      blackbaudConstituentId: repairedId,
      source: "exact-email",
      name: exactEmailMatch?.name || null,
      lookupId: exactEmailMatch?.lookupId || null,
    };
  }

  const normalizedProspectName = normalizeComparisonText(prospectName);
  if (!normalizedProspectName) {
    return null;
  }

  const matches = await searchBlackbaudConstituents({
    userId,
    authUserId,
    origin,
    query: prospectName,
  }).catch(() => []);

  const exactNameMatches = matches.filter(
    (candidate) => normalizeComparisonText(candidate?.name) === normalizedProspectName,
  );

  if (exactNameMatches.length !== 1) {
    return null;
  }

  const repairedId = String(exactNameMatches[0]?.blackbaudConstituentId || "").trim();
  if (!repairedId) {
    return null;
  }

  await sql`
    UPDATE prospects
    SET blackbaud_constituent_id = ${repairedId}, updated_at = NOW()
    WHERE id = ${prospectId} AND user_id = ${userId}
  `;
  if (constituentId) {
    await sql`
      UPDATE constituents
      SET blackbaud_constituent_id = ${repairedId}, updated_at = NOW()
      WHERE id = ${constituentId} AND user_id = ${userId}
    `;
  }

  return {
    blackbaudConstituentId: repairedId,
    source: "single-exact-name",
    name: exactNameMatches[0]?.name || null,
    lookupId: exactNameMatches[0]?.lookupId || null,
  };
}

export async function POST(request, { params }) {
  try {
    await ensureAppSchema();

    const session = await auth();
    if (!session || !session.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { sessionUser, workspaceUser: user } = await getWorkspaceUser(session, request);
    if (!user) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }
    const actionSolicitorUser = sessionUser || user;
    const authUserId = sessionUser?.id || user.id;

    const prospectId = params.id;
    const body = await request.json();
    const {
      actionDate,
      actionCategory,
      interactionType,
      summary,
      notes,
      nextStep,
      nextActionDueDate,
      linkedOpportunityId,
      additionalFundraiserUserId,
    } = body || {};

    if (!actionDate) {
      return Response.json({ error: "Action date is required" }, { status: 400 });
    }

    if (!summary?.trim() && !notes?.trim()) {
      return Response.json(
        { error: "Add a short action summary or notes." },
        { status: 400 },
      );
    }

    const prospectRows = await sql`
      SELECT
        p.*,
        c.blackbaud_constituent_id AS linked_blackbaud_constituent_id
      FROM prospects p
      LEFT JOIN constituents c ON c.id = p.constituent_id
      WHERE p.id = ${prospectId} AND p.user_id = ${user.id}
      LIMIT 1
    `;

    const prospect = prospectRows[0] || null;
    if (!prospect) {
      return Response.json({ error: "Prospect not found" }, { status: 404 });
    }

    let linkedOpportunity = null;
    if (linkedOpportunityId) {
      const opportunityRows = await sql`
        SELECT po.*
        FROM prospect_opportunities po
        INNER JOIN prospects p ON p.id = po.prospect_id
        WHERE po.id = ${linkedOpportunityId} AND p.user_id = ${user.id}
        LIMIT 1
      `;
      linkedOpportunity = opportunityRows[0] || null;
    }

    let blackbaudAction = null;
    let linkedBlackbaudConstituentId =
      prospect.linked_blackbaud_constituent_id ||
      prospect.blackbaud_constituent_id ||
      null;

    if (linkedBlackbaudConstituentId) {
      const origin = new URL(request.url).origin;
      const completedDate = new Date().toISOString().split("T")[0];
      const attemptedCreateVariants = [];
      let createPreflightContext = null;
      const fundraiserIds = await resolveActionFundraiserIds({
        currentUser: actionSolicitorUser,
        primaryFundraiserUser: actionSolicitorUser,
        additionalFundraiserUserId,
        origin,
        apiUserId: user.id,
      });
      const fullPayload = buildBlackbaudActionPayload({
        blackbaudConstituentId: linkedBlackbaudConstituentId,
        actionDate,
        completedDate,
        actionCategory,
        summary,
        actionNotes: notes,
        nextStep,
        authorName: actionSolicitorUser.name,
        opportunityId: linkedOpportunity?.blackbaud_opportunity_id || undefined,
        fundraiserIds: fundraiserIds.length > 0 ? fundraiserIds : undefined,
      });
      attemptedCreateVariants.push({
        syncVariant: "initial-full-action-payload",
        payload: summarizeActionCreatePayload(fullPayload),
      });

      createPreflightContext = {
        constituentId: String(linkedBlackbaudConstituentId),
        category: fullPayload?.category || null,
        date: fullPayload?.date || null,
        summaryLength: String(fullPayload?.summary || "").length,
        preflightStatus: "not-run",
        preflightName: null,
        preflightLookupId: null,
      };

      try {
        const preflightConstituent = await getBlackbaudConstituentById({
          userId: user.id,
          authUserId,
          origin,
          constituentId: linkedBlackbaudConstituentId,
        });
        createPreflightContext = {
          ...createPreflightContext,
          preflightStatus: preflightConstituent ? "read-ok" : "read-empty",
          preflightName: preflightConstituent?.name || null,
          preflightLookupId: preflightConstituent?.lookupId || null,
        };
      } catch (preflightError) {
        const repairedConstituent = await repairProspectBlackbaudConstituentLink({
          userId: user.id,
          prospectId,
          constituentId: prospect.constituent_id || null,
          prospectName: prospect.prospect_name || null,
          prospectEmail: prospect.email || null,
          authUserId,
          origin,
        }).catch(() => null);

        if (repairedConstituent?.blackbaudConstituentId) {
          linkedBlackbaudConstituentId = repairedConstituent.blackbaudConstituentId;
          const repairedPayload = buildBlackbaudActionPayload({
            blackbaudConstituentId: linkedBlackbaudConstituentId,
            actionDate,
            completedDate,
            actionCategory,
            summary,
            actionNotes: notes,
            nextStep,
            authorName: actionSolicitorUser.name,
            opportunityId: linkedOpportunity?.blackbaud_opportunity_id || undefined,
            fundraiserIds: fundraiserIds.length > 0 ? fundraiserIds : undefined,
          });
          attemptedCreateVariants[0] = {
            syncVariant: "initial-full-action-payload",
            payload: summarizeActionCreatePayload(repairedPayload),
          };
          fullPayload.constituent_id = repairedPayload.constituent_id;
          createPreflightContext = {
            ...createPreflightContext,
            constituentId: repairedPayload.constituent_id,
            category: repairedPayload?.category || createPreflightContext.category,
            date: repairedPayload?.date || createPreflightContext.date,
            summaryLength: String(repairedPayload?.summary || "").length,
            preflightStatus: `repaired:${repairedConstituent.source}`,
            preflightName: repairedConstituent.name || null,
            preflightLookupId: repairedConstituent.lookupId || null,
          };
        } else {
        createPreflightContext = {
          ...createPreflightContext,
          preflightStatus:
            preflightError instanceof Error
              ? `read-failed:${preflightError.message}`
              : "read-failed",
        };
        }
      }

      blackbaudAction = await createBlackbaudAction({
        userId: user.id,
        authUserId,
        origin,
        payload: fullPayload,
      }).catch((error) => ({
        error: error instanceof Error ? error.message : "Failed to sync action to Blackbaud",
        syncVariant: "initial-full-action-payload",
      }));

      if (blackbaudAction?.error && isBlackbaudRequestNotFulfilledError(blackbaudAction.error)) {
        const fallbackVariants = buildActionCreateFallbackVariants(fullPayload);
        for (const variant of fallbackVariants) {
          attemptedCreateVariants.push({
            syncVariant: variant.syncVariant,
            payload: summarizeActionCreatePayload(variant.payload),
          });
          blackbaudAction = await createBlackbaudAction({
            userId: user.id,
            authUserId,
            origin,
            payload: variant.payload,
          })
            .then((payload) => ({
              ...payload,
              syncVariant: variant.syncVariant,
            }))
            .catch((error) => ({
              error:
                error instanceof Error
                  ? error.message
                  : "Failed to sync action to Blackbaud",
              syncVariant: variant.syncVariant,
            }));

          if (!blackbaudAction?.error) {
            break;
          }
        }
      }

      const createdActionId = getBlackbaudActionId(blackbaudAction);

      if (!blackbaudAction?.error && !createdActionId) {
        blackbaudAction = {
          ...blackbaudAction,
          error: "Blackbaud action sync returned no action id",
        };
      }

      if (!blackbaudAction?.error && createdActionId) {
        try {
          const verifiedAction = await getBlackbaudAction({
            userId: user.id,
            authUserId,
            origin,
            actionId: createdActionId,
          });
          const verifiedConstituentId = getBlackbaudActionConstituentId(verifiedAction);
          if (
            verifiedConstituentId &&
            String(verifiedConstituentId) !== String(linkedBlackbaudConstituentId)
          ) {
            blackbaudAction = {
              ...blackbaudAction,
              error: `NXT created the action on constituent ${verifiedConstituentId}, expected ${linkedBlackbaudConstituentId}`,
            };
          } else {
            blackbaudAction = {
              ...blackbaudAction,
              verifiedActionId: String(createdActionId),
              verifiedConstituentId:
                verifiedConstituentId != null
                  ? String(verifiedConstituentId)
                  : null,
            };

            try {
              await updateBlackbaudAction({
                userId: user.id,
                authUserId,
                origin,
                actionId: createdActionId,
                payload: buildBlackbaudActionMetadataPayload({
                  actionDate,
                  completedDate,
                  interactionType,
                  fundraiserIds: fundraiserIds.length > 0 ? fundraiserIds : undefined,
                  opportunityId: linkedOpportunity?.blackbaud_opportunity_id || undefined,
                }),
              });
            } catch (metadataError) {
              blackbaudAction = {
                ...blackbaudAction,
                syncWarning:
                  metadataError instanceof Error
                    ? metadataError.message
                    : "Created in NXT, but action type/status could not be updated",
              };
            }
          }
        } catch (verificationError) {
          blackbaudAction = {
            ...blackbaudAction,
            error:
              verificationError instanceof Error
                ? `NXT action create could not be verified: ${verificationError.message}`
                : "NXT action create could not be verified",
          };
        }
      }

      if (blackbaudAction) {
        blackbaudAction = {
          ...blackbaudAction,
          attemptedCreateVariants,
        };

        if (blackbaudAction.error) {
          blackbaudAction = {
            ...blackbaudAction,
            error: `${blackbaudAction.error}${formatActionCreateVariantDebug(
              attemptedCreateVariants,
              createPreflightContext,
            )}`,
          };
        }
      }

    }

    const updateNotes = formatActionUpdateNotes({
      notes,
      nextStep,
    });

    const updateRows = await sql`
      INSERT INTO prospect_updates (
        prospect_id,
        update_date,
        update_notes,
        update_title,
        action_category,
        action_type,
        blackbaud_action_id,
        blackbaud_sync_variant,
        blackbaud_sync_warning
      )
      VALUES (
        ${prospectId},
        ${actionDate},
        ${updateNotes},
        ${normalizeActionLabel(summary) || "Action logged"},
        ${normalizeActionLabel(actionCategory)},
        ${normalizeActionLabel(interactionType)},
        ${getBlackbaudActionId(blackbaudAction) ? String(getBlackbaudActionId(blackbaudAction)) : null},
        ${blackbaudAction?.syncVariant || null},
        ${blackbaudAction?.syncWarning || null}
      )
      RETURNING *
    `;
    const savedUpdate = updateRows[0] || null;

    const nextActionText = nextStep?.trim() || null;
    await sql`
      UPDATE prospects
      SET
        next_action_text = ${nextActionText},
        next_action_due_date = ${nextActionText ? nextActionDueDate || null : null},
        next_action_completed_at = ${nextActionText ? null : prospect.next_action_completed_at},
        updated_at = NOW()
      WHERE id = ${prospectId}
    `;

    await syncPrimaryPendingAction({
      ownerUserId: user.id,
      prospectId: Number(prospectId),
      constituentId: prospect.constituent_id || null,
      prospectOpportunityId: linkedOpportunity?.id || null,
      title: nextActionText,
      dueDate: nextActionText ? nextActionDueDate || null : null,
      completedAt: nextActionText ? null : prospect.next_action_completed_at,
    });

    return Response.json(
      {
        update: savedUpdate,
        blackbaudAction,
        prospect_id: Number(prospectId),
        constituent_id: prospect.constituent_id || null,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error creating prospect action:", error);
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to create prospect action",
      },
      { status: 500 },
    );
  }
}
