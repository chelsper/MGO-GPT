import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getOrCreateUser from "@/app/api/utils/getOrCreateUser";
import {
  assertAssignableRole,
  getBootstrapAdminEmail,
  getBootstrapAdminEmails,
  normalizeEmail,
} from "@/app/api/utils/invitations";
import {
  canManageWorkspaceRole,
  canUseMgoWorkspaceRole,
  normalizeWorkspaceRole,
  normalizeWorkspaceRoles,
  serializeWorkspaceRoles,
} from "@/utils/workspaceRoles";

async function resetPortfolioSeedState(userId) {
  await sql`
    UPDATE users
    SET
      blackbaud_portfolio_seeded_at = NULL,
      blackbaud_portfolio_seed_attempted_at = NULL,
      blackbaud_portfolio_seed_error = NULL,
      blackbaud_portfolio_cache = NULL,
      blackbaud_portfolio_cache_key = NULL,
      blackbaud_portfolio_cached_at = NULL,
      updated_at = NOW()
    WHERE id = ${userId}
  `;
}

async function requireAdminSession() {
  await ensureAppSchema();

  const session = await auth();
  if (!session || !session.user?.email) {
    return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const user = await getOrCreateUser(session, "admin");
  if (!canManageWorkspaceRole(user.role)) {
    return {
      error: Response.json(
        { error: "Forbidden — workspace administrators only" },
        { status: 403 },
      ),
    };
  }

  return { user };
}

export async function GET() {
  try {
    const { user, error } = await requireAdminSession();
    if (error) return error;

    await sql`
      UPDATE user_invitations inv
      SET accepted_at = NOW(), updated_at = NOW()
      FROM users existing_user
      WHERE LOWER(existing_user.email) = LOWER(inv.email)
        AND inv.accepted_at IS NULL
        AND inv.revoked_at IS NULL
    `;

    const [users, invitations] = await Promise.all([
      sql`
        SELECT
          users.id,
          users.name,
          users.email,
          users.role,
          users.active,
          users.deactivated_at,
          users.blackbaud_constituent_id,
          users.blackbaud_lookup_id,
          users.blackbaud_portfolio_seeded_at,
          users.blackbaud_portfolio_seed_attempted_at,
          users.blackbaud_portfolio_seed_error,
          users.created_at,
          users.updated_at,
          bb_connection.scope AS blackbaud_connection_scope,
          bb_connection.expires_at AS blackbaud_connection_expires_at,
          bb_connection.connected_at AS blackbaud_connected_at,
          bb_connection.updated_at AS blackbaud_connection_updated_at,
          bb_connection.access_token IS NOT NULL AS blackbaud_connected,
          bb_connection.refresh_token IS NOT NULL AS blackbaud_refresh_available
        FROM users
        LEFT JOIN blackbaud_connections bb_connection
          ON bb_connection.user_id = users.id
        ORDER BY
          CASE WHEN users.email = ${getBootstrapAdminEmail() || ""} THEN 0 ELSE 1 END,
          LOWER(users.name) ASC,
          LOWER(users.email) ASC
      `,
      sql`
        SELECT
          inv.id,
          inv.email,
          inv.role,
          inv.blackbaud_constituent_id,
          inv.blackbaud_lookup_id,
          inv.blackbaud_name,
          existing_user.id AS existing_user_id,
          existing_user.name AS existing_user_name,
          inv.accepted_at,
          inv.revoked_at,
          inv.created_at,
          inviter.name AS invited_by_name,
          inviter.email AS invited_by_email
        FROM user_invitations inv
        LEFT JOIN users inviter ON inviter.id = inv.invited_by
        LEFT JOIN users existing_user ON LOWER(existing_user.email) = LOWER(inv.email)
        ORDER BY inv.created_at DESC
      `,
    ]);

    return Response.json({
      currentUser: user,
      bootstrapAdminEmail: getBootstrapAdminEmail() || null,
      bootstrapAdminEmails: getBootstrapAdminEmails(),
      users,
      invitations,
    });
  } catch (error) {
    console.error("Admin access GET error:", error);
    return Response.json(
      { error: error?.message || "Failed to load access management" },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  try {
    const { user, error } = await requireAdminSession();
    if (error) return error;

    const body = await request.json();
    const name = body?.name ? String(body.name).trim() : "";
    const email = normalizeEmail(body?.email);
    const normalizedRoles = normalizeWorkspaceRoles(body?.roles ?? body?.role);
    const role = normalizedRoles[0] || null;
    const serializedRoles = serializeWorkspaceRoles(normalizedRoles);
    const provisionOnly = body?.provisionOnly === true;
    const blackbaudConstituentId = body?.blackbaudConstituentId
      ? String(body.blackbaudConstituentId).trim()
      : null;
    const blackbaudLookupId = body?.blackbaudLookupId
      ? String(body.blackbaudLookupId).trim()
      : null;
    const blackbaudName = body?.blackbaudName
      ? String(body.blackbaudName).trim()
      : null;

    if (!email) {
      return Response.json({ error: "Email is required" }, { status: 400 });
    }

    assertAssignableRole(normalizedRoles);

    const existingUser = await sql`
      SELECT id
      FROM users
      WHERE email = ${email}
      LIMIT 1
    `;

    if (existingUser.length > 0) {
      const existingUserState = await sql`
        SELECT role, blackbaud_constituent_id, blackbaud_lookup_id
        FROM users
        WHERE id = ${existingUser[0].id}
        LIMIT 1
      `;
      const updatedUser = await sql`
        UPDATE users
        SET
          name = COALESCE(NULLIF(${name}, ''), name),
          role = ${serializedRoles},
          blackbaud_constituent_id = COALESCE(${blackbaudConstituentId}, blackbaud_constituent_id),
          blackbaud_lookup_id = COALESCE(${blackbaudLookupId}, blackbaud_lookup_id),
          updated_at = NOW()
        WHERE id = ${existingUser[0].id}
        RETURNING id, name, email, role, blackbaud_lookup_id, created_at, updated_at
      `;

      const priorUser = existingUserState[0] || null;
      const blackbaudLinkChanged =
        String(priorUser?.blackbaud_constituent_id || "") !==
          String(blackbaudConstituentId || priorUser?.blackbaud_constituent_id || "") ||
        String(priorUser?.blackbaud_lookup_id || "") !==
          String(blackbaudLookupId || priorUser?.blackbaud_lookup_id || "");

      if (
        (canUseMgoWorkspaceRole(serializedRoles) || canUseMgoWorkspaceRole(priorUser?.role)) &&
        blackbaudLinkChanged
      ) {
        await resetPortfolioSeedState(existingUser[0].id);
      }

      return Response.json({
        mode: "user-updated",
        user: updatedUser[0],
      });
    }

    if (provisionOnly) {
      if (!name) {
        return Response.json(
          { error: "Name is required to create a workspace." },
          { status: 400 },
        );
      }

      if (!canUseMgoWorkspaceRole(serializedRoles)) {
        return Response.json(
          {
            error:
              "Only MGO and Executive users can be created as an MGO workspace without an invitation.",
          },
          { status: 400 },
        );
      }

      const createdUser = await sql`
        INSERT INTO users (
          name,
          email,
          role,
          blackbaud_constituent_id,
          blackbaud_lookup_id,
          created_at,
          updated_at
        )
        VALUES (
          ${name},
          ${email},
          ${serializedRoles},
          ${blackbaudConstituentId},
          ${blackbaudLookupId},
          NOW(),
          NOW()
        )
        RETURNING id, name, email, role, active, deactivated_at, blackbaud_constituent_id, blackbaud_lookup_id, created_at, updated_at
      `;

      if (canUseMgoWorkspaceRole(serializedRoles) && (blackbaudConstituentId || blackbaudLookupId)) {
        await resetPortfolioSeedState(createdUser[0].id);
      }

      return Response.json(
        {
          mode: "workspace-created",
          user: createdUser[0],
        },
        { status: 201 },
      );
    }

    const invitation = await sql`
      INSERT INTO user_invitations (
        email,
        role,
        blackbaud_constituent_id,
        blackbaud_lookup_id,
        blackbaud_name,
        invited_by,
        accepted_at,
        revoked_at,
        created_at,
        updated_at
      )
      VALUES (
        ${email},
        ${serializedRoles},
        ${blackbaudConstituentId},
        ${blackbaudLookupId},
        ${blackbaudName},
        ${user.id},
        NULL,
        NULL,
        NOW(),
        NOW()
      )
      ON CONFLICT (email)
      DO UPDATE SET
        role = EXCLUDED.role,
        blackbaud_constituent_id = EXCLUDED.blackbaud_constituent_id,
        blackbaud_lookup_id = EXCLUDED.blackbaud_lookup_id,
        blackbaud_name = EXCLUDED.blackbaud_name,
        invited_by = EXCLUDED.invited_by,
        accepted_at = NULL,
        revoked_at = NULL,
        updated_at = NOW()
      RETURNING *
    `;

    return Response.json(
      {
        mode: "invitation-created",
        invitation: invitation[0],
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Admin access POST error:", error);
    return Response.json(
      { error: error?.message || "Failed to save invitation" },
      { status: 500 },
    );
  }
}

export async function PATCH(request) {
  try {
    const { error } = await requireAdminSession();
    if (error) return error;

    const body = await request.json();
    const invitationId = Number(body?.invitationId);
    if (Number.isInteger(invitationId) && invitationId > 0) {
      const serializedInvitationRoles =
        body?.roles === undefined && body?.role === undefined
          ? null
          : serializeWorkspaceRoles(body?.roles ?? body?.role);
      const resentInvitation = await sql`
        UPDATE user_invitations
        SET
          role = COALESCE(${serializedInvitationRoles}, role),
          blackbaud_constituent_id = COALESCE(${body?.blackbaudConstituentId ? String(body.blackbaudConstituentId).trim() : null}, blackbaud_constituent_id),
          blackbaud_lookup_id = COALESCE(${body?.blackbaudLookupId ? String(body.blackbaudLookupId).trim() : null}, blackbaud_lookup_id),
          blackbaud_name = COALESCE(${body?.blackbaudName ? String(body.blackbaudName).trim() : null}, blackbaud_name),
          accepted_at = NULL,
          revoked_at = NULL,
          updated_at = NOW()
        WHERE id = ${invitationId}
        RETURNING *
      `;

      if (resentInvitation.length === 0) {
        return Response.json({ error: "Invitation not found" }, { status: 404 });
      }

      return Response.json({ invitation: resentInvitation[0], mode: "invitation-resent" });
    }

    const userId = Number(body?.userId);
    const requestedRoles = body?.roles ?? body?.role;
    const normalizedRoles =
      requestedRoles === undefined ? undefined : normalizeWorkspaceRoles(requestedRoles);
    const role = normalizedRoles?.[0];
    const serializedRoles =
      normalizedRoles === undefined ? undefined : serializeWorkspaceRoles(normalizedRoles);
    const active =
      body?.active === undefined ? undefined : Boolean(body.active);
    const blackbaudConstituentId = body?.blackbaudConstituentId
      ? String(body.blackbaudConstituentId).trim()
      : null;
    const blackbaudLookupId = body?.blackbaudLookupId
      ? String(body.blackbaudLookupId).trim()
      : null;

    if (!Number.isInteger(userId) || userId <= 0) {
      return Response.json({ error: "User id is required" }, { status: 400 });
    }

    const existingUser = await sql`
      SELECT role, blackbaud_constituent_id, blackbaud_lookup_id
      FROM users
      WHERE id = ${userId}
      LIMIT 1
    `;

    if (existingUser.length === 0) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    if (requestedRoles !== undefined && !role) {
      return Response.json({ error: "Invalid role" }, { status: 400 });
    }

    if (serializedRoles !== undefined && serializedRoles !== existingUser[0].role) {
      assertAssignableRole(normalizedRoles);
    }

    const updatedUser = await sql`
      UPDATE users
      SET
        role = COALESCE(${serializedRoles || null}, role),
        active = COALESCE(${active}, active),
        deactivated_at = CASE
          WHEN ${active} = FALSE THEN COALESCE(deactivated_at, NOW())
          WHEN ${active} = TRUE THEN NULL
          ELSE deactivated_at
        END,
        blackbaud_constituent_id = COALESCE(${blackbaudConstituentId}, blackbaud_constituent_id),
        blackbaud_lookup_id = COALESCE(${blackbaudLookupId}, blackbaud_lookup_id),
        updated_at = NOW()
      WHERE id = ${userId}
      RETURNING id, name, email, role, active, deactivated_at, blackbaud_constituent_id, blackbaud_lookup_id, created_at, updated_at
    `;

    const priorUser = existingUser[0] || null;
    const nextRole = serializedRoles || priorUser?.role;
    const blackbaudLinkChanged =
      String(priorUser?.blackbaud_constituent_id || "") !==
        String(blackbaudConstituentId || priorUser?.blackbaud_constituent_id || "") ||
      String(priorUser?.blackbaud_lookup_id || "") !==
        String(blackbaudLookupId || priorUser?.blackbaud_lookup_id || "");

    if (canUseMgoWorkspaceRole(nextRole) && blackbaudLinkChanged) {
      await resetPortfolioSeedState(userId);
    }

    return Response.json({ user: updatedUser[0] });
  } catch (error) {
    console.error("Admin access PATCH error:", error);
    return Response.json(
      { error: error?.message || "Failed to update user role" },
      { status: 500 },
    );
  }
}

export async function DELETE(request) {
  try {
    const { user: currentUser, error } = await requireAdminSession();
    if (error) return error;

    const url = new URL(request.url);
    const userId = Number(url.searchParams.get("userId"));
    if (Number.isInteger(userId) && userId > 0) {
      const targetUsers = await sql`
        SELECT id, name, email, active
        FROM users
        WHERE id = ${userId}
        LIMIT 1
      `;
      const targetUser = targetUsers[0];

      if (!targetUser) {
        return Response.json({ error: "App user not found" }, { status: 404 });
      }

      if (Number(targetUser.id) === Number(currentUser.id)) {
        return Response.json(
          { error: "You cannot delete your own app account." },
          { status: 403 },
        );
      }

      if (targetUser.active) {
        return Response.json(
          { error: "Deactivate this app account before deleting it." },
          { status: 400 },
        );
      }

      const bootstrapEmails = getBootstrapAdminEmails().map((email) => normalizeEmail(email));
      if (bootstrapEmails.includes(normalizeEmail(targetUser.email))) {
        return Response.json(
          { error: "Bootstrap administrator accounts cannot be deleted." },
          { status: 403 },
        );
      }

      const dependencyRows = await sql`
        SELECT
          (SELECT COUNT(*) FROM constituents WHERE user_id = ${userId}) AS constituents,
          (SELECT COUNT(*) FROM submissions WHERE user_id = ${userId} OR reviewed_by = ${userId}) AS submissions,
          (SELECT COUNT(*) FROM list_requests WHERE user_id = ${userId} OR reviewed_by = ${userId}) AS list_requests,
          (SELECT COUNT(*) FROM prospect_pool WHERE assigned_user_id = ${userId} OR created_by = ${userId} OR assignment_updated_by = ${userId}) AS prospect_pool,
          (SELECT COUNT(*) FROM data_change_requests WHERE requester_user_id = ${userId} OR owner_user_id = ${userId} OR reviewed_by = ${userId}) AS data_change_requests,
          (SELECT COUNT(*) FROM prospect_pool_assignment_audits WHERE assigned_to_user_id = ${userId} OR assigned_by_user_id = ${userId}) AS assignment_audits,
          (SELECT COUNT(*) FROM prospects WHERE user_id = ${userId}) AS prospects,
          (SELECT COUNT(*) FROM pending_actions WHERE owner_user_id = ${userId}) AS pending_actions,
          (SELECT COUNT(*) FROM discussion_items WHERE owner_user_id = ${userId} OR created_by = ${userId} OR assigned_user_id = ${userId}) AS discussion_items,
          (SELECT COUNT(*) FROM discussion_item_participants WHERE user_id = ${userId}) AS discussion_participation,
          (SELECT COUNT(*) FROM prospect_opportunity_gift_links WHERE created_by = ${userId}) AS opportunity_gift_links,
          (SELECT COUNT(*) FROM constituency_import_runs WHERE created_by_user_id = ${userId} OR workspace_user_id = ${userId}) AS import_runs,
          (SELECT COUNT(*) FROM constituency_import_rows WHERE create_approved_by_user_id = ${userId}) AS import_rows,
          (SELECT COUNT(*) FROM knowledge_base_article_overrides WHERE owner_user_id = ${userId} OR reviewer_user_id = ${userId} OR created_by = ${userId} OR updated_by = ${userId}) AS knowledge_articles,
          (SELECT COUNT(*) FROM knowledge_base_article_revisions WHERE created_by = ${userId}) AS knowledge_revisions,
          (SELECT COUNT(*) FROM giving_society_configurations WHERE created_by = ${userId} OR updated_by = ${userId}) AS giving_societies,
          (SELECT COUNT(*) FROM blackbaud_field_mappings WHERE reviewed_by = ${userId} OR updated_by = ${userId}) AS field_mappings,
          (SELECT COUNT(*) FROM report_configurations WHERE created_by = ${userId} OR updated_by = ${userId}) AS report_configurations
      `;
      const dependencies = Object.entries(dependencyRows[0] || {})
        .filter(([, count]) => Number(count) > 0)
        .map(([name, count]) => ({ name, count: Number(count) }));

      if (dependencies.length > 0) {
        return Response.json(
          {
            error:
              "This inactive app account has app work or audit history and cannot be deleted. Keep it inactive instead.",
            dependencies,
          },
          { status: 409 },
        );
      }

      await sql`
        DELETE FROM user_invitations
        WHERE LOWER(email) = LOWER(${targetUser.email})
      `;
      const deletedUsers = await sql`
        DELETE FROM users
        WHERE id = ${userId}
          AND active = FALSE
        RETURNING id, name, email
      `;

      if (deletedUsers.length === 0) {
        return Response.json(
          { error: "App user could not be deleted. Refresh and try again." },
          { status: 409 },
        );
      }

      return Response.json({ success: true, user: deletedUsers[0] });
    }

    const id = Number(url.searchParams.get("id"));
    if (!Number.isInteger(id) || id <= 0) {
      return Response.json({ error: "Invitation id is required" }, { status: 400 });
    }

    const result = await sql`
      UPDATE user_invitations
      SET revoked_at = NOW(), updated_at = NOW()
      WHERE id = ${id}
        AND accepted_at IS NULL
        AND revoked_at IS NULL
      RETURNING id
    `;

    if (result.length === 0) {
      return Response.json(
        { error: "Invitation not found or already inactive" },
        { status: 404 },
      );
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error("Admin access DELETE error:", error);
    return Response.json(
      { error: error?.message || "Failed to revoke invitation" },
      { status: 500 },
    );
  }
}
