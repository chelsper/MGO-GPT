import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import {
  replaceDiscussionConstituentLinks,
  resolveDiscussionConstituents,
} from "@/app/api/utils/discussionConstituents";

export async function PATCH(request, { params }) {
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

    const discussionId = params.id;
    const body = await request.json();
    const {
      subject,
      body: discussionBody,
      dueDate,
      status,
      assignedUserId,
      initiativeName,
      taggedUserIds,
      linkedConstituents,
    } = body || {};

    const existing = await sql`
      SELECT id, prospect_id
      FROM discussion_items
      WHERE id = ${discussionId}
        AND (
          owner_user_id = ${user.id}
          OR assigned_user_id = ${user.id}
          OR EXISTS (
            SELECT 1
            FROM discussion_item_participants dip_visible
            WHERE dip_visible.discussion_item_id = discussion_items.id
              AND dip_visible.user_id = ${user.id}
          )
        )
      LIMIT 1
    `;

    if (existing.length === 0) {
      return Response.json({ error: "Discussion item not found" }, { status: 404 });
    }

    const resolvedLinkedConstituents =
      linkedConstituents === undefined
        ? null
        : await resolveDiscussionConstituents(user.id, linkedConstituents);

    const updates = [];
    const values = [];
    let paramCount = 0;

    const assign = (column, value) => {
      paramCount += 1;
      updates.push(`${column} = $${paramCount}`);
      values.push(value);
    };

    if (subject !== undefined) assign("subject", subject?.trim() || null);
    if (discussionBody !== undefined) assign("body", discussionBody?.trim() || null);
    if (dueDate !== undefined) assign("due_date", dueDate || null);
    if (status !== undefined) assign("status", status || "Open");
    if (assignedUserId !== undefined) assign("assigned_user_id", assignedUserId || null);
    if (initiativeName !== undefined) assign("initiative_name", initiativeName?.trim() || null);
    if (resolvedLinkedConstituents && !existing[0].prospect_id) {
      assign("constituent_id", resolvedLinkedConstituents[0]?.constituentId || null);
    }

    assign("updated_at", new Date().toISOString());

    paramCount += 1;
    values.push(discussionId);
    paramCount += 1;
    values.push(user.id);

    const result = await sql(
      `UPDATE discussion_items
       SET ${updates.join(", ")}
       WHERE id = $${paramCount - 1}
         AND (
           owner_user_id = $${paramCount}
           OR assigned_user_id = $${paramCount}
           OR EXISTS (
             SELECT 1
             FROM discussion_item_participants dip_visible
             WHERE dip_visible.discussion_item_id = discussion_items.id
               AND dip_visible.user_id = $${paramCount}
           )
         )
       RETURNING *`,
      values,
    );

    if (taggedUserIds !== undefined) {
      const uniqueTaggedUserIds = Array.from(
        new Set(
          (Array.isArray(taggedUserIds) ? taggedUserIds : [])
            .map((value) => Number(value))
            .filter((value) => Number.isInteger(value) && value > 0),
        ),
      );

      await sql`
        DELETE FROM discussion_item_participants
        WHERE discussion_item_id = ${discussionId}
      `;

      if (uniqueTaggedUserIds.length) {
        const placeholders = uniqueTaggedUserIds
          .map((_, index) => `($1, $${index + 2})`)
          .join(", ");
        await sql(
          `INSERT INTO discussion_item_participants (discussion_item_id, user_id)
           VALUES ${placeholders}
           ON CONFLICT (discussion_item_id, user_id) DO NOTHING`,
          [discussionId, ...uniqueTaggedUserIds],
        );
      }
    }

    if (resolvedLinkedConstituents) {
      await replaceDiscussionConstituentLinks(
        discussionId,
        resolvedLinkedConstituents,
      );
    }

    const taggedUsers = await sql`
      SELECT u.id AS user_id, u.name, u.email
      FROM discussion_item_participants dip
      JOIN users u ON u.id = dip.user_id
      WHERE dip.discussion_item_id = ${discussionId}
      ORDER BY LOWER(u.name) ASC, LOWER(u.email) ASC
    `;
    const linkedConstituentRows = await sql`
      SELECT
        c.id AS constituent_id,
        c.blackbaud_constituent_id,
        c.name
      FROM discussion_item_constituents dic
      JOIN constituents c ON c.id = dic.constituent_id
      WHERE dic.discussion_item_id = ${discussionId}
      ORDER BY dic.sort_order, dic.created_at
    `;

    return Response.json({
      ...result[0],
      tagged_users: taggedUsers,
      linked_constituents: linkedConstituentRows.map((constituent) => ({
        constituent_id: constituent.constituent_id,
        blackbaudConstituentId: constituent.blackbaud_constituent_id,
        name: constituent.name,
      })),
    });
  } catch (error) {
    console.error("Error updating discussion item:", error);
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to update discussion item",
      },
      { status: 500 },
    );
  }
}
