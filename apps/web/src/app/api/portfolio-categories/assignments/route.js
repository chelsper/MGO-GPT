import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import sql from "@/app/api/utils/sql";

function canEditWorkspace({ sessionUser, workspaceUser, isActing }) {
  return !isActing && Number(sessionUser?.id) === Number(workspaceUser?.id);
}

function writePermissionError() {
  return Response.json(
    { error: "Return to your own MGO workspace to organize your portfolio." },
    { status: 403 },
  );
}

export async function PUT(request) {
  try {
    await ensureAppSchema();

    const session = await auth();
    if (!session?.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const context = await getWorkspaceUser(session, request);
    if (!context.workspaceUser) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }
    if (!canEditWorkspace(context)) {
      return writePermissionError();
    }

    const body = await request.json();
    const constituentId = String(body?.constituentId || "").trim();
    const categoryId = body?.categoryId ? Number(body.categoryId) : null;
    if (!constituentId) {
      return Response.json({ error: "A constituent is required." }, { status: 400 });
    }
    if (body?.categoryId && (!Number.isInteger(categoryId) || categoryId <= 0)) {
      return Response.json({ error: "Invalid category." }, { status: 400 });
    }

    if (!categoryId) {
      await sql`
        DELETE FROM portfolio_category_assignments
        WHERE owner_user_id = ${context.workspaceUser.id}
          AND blackbaud_constituent_id = ${constituentId}
      `;
      return Response.json({ assignment: null });
    }

    const categories = await sql`
      SELECT id, name
      FROM portfolio_categories
      WHERE id = ${categoryId}
        AND owner_user_id = ${context.workspaceUser.id}
      LIMIT 1
    `;
    if (!categories[0]) {
      return Response.json({ error: "Category not found." }, { status: 404 });
    }

    const assignments = await sql`
      INSERT INTO portfolio_category_assignments (
        owner_user_id,
        category_id,
        blackbaud_constituent_id,
        updated_at
      )
      VALUES (
        ${context.workspaceUser.id},
        ${categoryId},
        ${constituentId},
        NOW()
      )
      ON CONFLICT (owner_user_id, blackbaud_constituent_id)
      DO UPDATE SET
        category_id = EXCLUDED.category_id,
        updated_at = NOW()
      RETURNING category_id, blackbaud_constituent_id, updated_at
    `;

    return Response.json({ assignment: assignments[0], category: categories[0] });
  } catch (error) {
    console.error("Error assigning portfolio category:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to assign portfolio category" },
      { status: 500 },
    );
  }
}
