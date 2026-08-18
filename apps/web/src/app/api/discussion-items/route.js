import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";

function normalizeNumericId(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function resolveLocalConstituentId(rawConstituentId) {
  const normalizedConstituentId = normalizeNumericId(rawConstituentId);
  if (normalizedConstituentId) {
    const localMatch = await sql`
      SELECT id
      FROM constituents
      WHERE id = ${normalizedConstituentId}
      LIMIT 1
    `;
    if (localMatch.length > 0) {
      return Number(localMatch[0].id);
    }
  }

  const blackbaudConstituentId = String(rawConstituentId || "").trim();
  if (!blackbaudConstituentId) {
    return null;
  }

  const blackbaudMatch = await sql`
    SELECT id
    FROM constituents
    WHERE blackbaud_constituent_id = ${blackbaudConstituentId}
    LIMIT 1
  `;
  return blackbaudMatch.length > 0 ? Number(blackbaudMatch[0].id) : null;
}

export async function GET(request) {
  try {
    await ensureAppSchema();

    const session = await auth();
    if (!session || !session.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspaceUser: user } = await getWorkspaceUser(session, request);
    if (!user) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const prospectId = searchParams.get("prospectId");
    const status = searchParams.get("status") || "Open";

    const rows = await sql`
      SELECT
        di.*,
        p.prospect_name,
        c.name AS constituent_name,
        assigned_user.name AS assigned_user_name,
        creator.name AS created_by_name,
        po.title AS opportunity_title
      FROM discussion_items di
      LEFT JOIN prospects p ON p.id = di.prospect_id
      LEFT JOIN constituents c ON c.id = di.constituent_id
      LEFT JOIN prospect_opportunities po ON po.id = di.prospect_opportunity_id
      LEFT JOIN users assigned_user ON assigned_user.id = di.assigned_user_id
      LEFT JOIN users creator ON creator.id = di.created_by
      WHERE (
          di.owner_user_id = ${user.id}
          OR di.assigned_user_id = ${user.id}
          OR EXISTS (
            SELECT 1
            FROM discussion_item_participants dip_visible
            WHERE dip_visible.discussion_item_id = di.id
              AND dip_visible.user_id = ${user.id}
          )
        )
        AND (${prospectId || null}::BIGINT IS NULL OR di.prospect_id = ${prospectId || null})
        AND (${status || null}::TEXT IS NULL OR di.status = ${status || null})
      ORDER BY
        CASE
          WHEN di.due_date IS NOT NULL AND di.due_date < CURRENT_DATE THEN 0
          WHEN di.due_date IS NOT NULL THEN 1
          ELSE 2
        END,
        di.due_date ASC NULLS LAST,
        di.updated_at DESC
    `;

    const discussionIds = rows.map((row) => row.id);
    const participants = discussionIds.length
      ? await sql`
          SELECT
            dip.discussion_item_id,
            dip.user_id,
            u.name,
            u.email
          FROM discussion_item_participants dip
          JOIN users u ON u.id = dip.user_id
          WHERE dip.discussion_item_id = ANY(${discussionIds})
          ORDER BY LOWER(u.name) ASC, LOWER(u.email) ASC
        `
      : [];

    const participantsByDiscussionId = participants.reduce((accumulator, participant) => {
      const key = String(participant.discussion_item_id);
      if (!accumulator[key]) {
        accumulator[key] = [];
      }
      accumulator[key].push({
        user_id: participant.user_id,
        name: participant.name,
        email: participant.email,
      });
      return accumulator;
    }, {});

    return Response.json(
      rows.map((row) => ({
        ...row,
        tagged_users: participantsByDiscussionId[String(row.id)] || [],
      })),
    );
  } catch (error) {
    console.error("Error fetching discussion items:", error);
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to fetch discussion items",
      },
      { status: 500 },
    );
  }
}

export async function POST(request) {
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

    const body = await request.json();
    const {
      prospectId,
      constituentId,
      prospectOpportunityId,
      initiativeName,
      subject,
      body: discussionBody,
      dueDate,
      assignedUserId,
      taggedUserIds,
    } = body || {};

    if (!subject?.trim()) {
      return Response.json({ error: "Subject is required" }, { status: 400 });
    }

    let resolvedProspectId = normalizeNumericId(prospectId);
    let resolvedConstituentId = null;

    if (resolvedProspectId) {
      const prospect = await sql`
        SELECT id, constituent_id
        FROM prospects
        WHERE id = ${resolvedProspectId}
          AND user_id = ${user.id}
        LIMIT 1
      `;
      if (prospect.length === 0) {
        return Response.json({ error: "Prospect not found" }, { status: 404 });
      }
      resolvedConstituentId = normalizeNumericId(prospect[0]?.constituent_id);
    }

    if (!resolvedConstituentId && constituentId != null) {
      resolvedConstituentId = await resolveLocalConstituentId(constituentId);
    }

    const result = await sql`
      INSERT INTO discussion_items (
        owner_user_id,
        created_by,
        assigned_user_id,
        prospect_id,
        constituent_id,
        prospect_opportunity_id,
        initiative_name,
        subject,
        body,
        due_date,
        status,
        created_at,
        updated_at
      )
      VALUES (
        ${user.id},
        ${sessionUser?.id || user.id},
        ${assignedUserId || null},
        ${resolvedProspectId || null},
        ${resolvedConstituentId},
        ${prospectOpportunityId || null},
        ${initiativeName?.trim() || null},
        ${subject.trim()},
        ${discussionBody?.trim() || null},
        ${dueDate || null},
        'Open',
        NOW(),
        NOW()
      )
      RETURNING *
    `;

    const discussionItem = result[0];
    const uniqueTaggedUserIds = Array.from(
      new Set(
        (Array.isArray(taggedUserIds) ? taggedUserIds : [])
          .map((value) => Number(value))
          .filter((value) => Number.isInteger(value) && value > 0),
      ),
    );

    if (uniqueTaggedUserIds.length) {
      const placeholders = uniqueTaggedUserIds
        .map((_, index) => `($1, $${index + 2})`)
        .join(", ");
      await sql(
        `INSERT INTO discussion_item_participants (discussion_item_id, user_id)
         VALUES ${placeholders}
         ON CONFLICT (discussion_item_id, user_id) DO NOTHING`,
        [discussionItem.id, ...uniqueTaggedUserIds],
      );
    }

    const taggedUsers = uniqueTaggedUserIds.length
      ? await sql`
          SELECT id AS user_id, name, email
          FROM users
          WHERE id = ANY(${uniqueTaggedUserIds})
          ORDER BY LOWER(name) ASC, LOWER(email) ASC
        `
      : [];

    return Response.json(
      {
        ...discussionItem,
        tagged_users: taggedUsers,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error creating discussion item:", error);
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to create discussion item",
      },
      { status: 500 },
    );
  }
}
