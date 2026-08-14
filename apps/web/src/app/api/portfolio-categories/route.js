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

function normalizeCategoryName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

export async function GET(request) {
  try {
    await ensureAppSchema();

    const session = await auth();
    if (!session?.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspaceUser } = await getWorkspaceUser(session, request);
    if (!workspaceUser) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    const [categories, assignments] = await Promise.all([
      sql`
        SELECT
          pc.id,
          pc.name,
          pc.created_at,
          pc.updated_at,
          COUNT(pca.id)::INTEGER AS assignment_count
        FROM portfolio_categories pc
        LEFT JOIN portfolio_category_assignments pca
          ON pca.category_id = pc.id
          AND pca.owner_user_id = pc.owner_user_id
        WHERE pc.owner_user_id = ${workspaceUser.id}
        GROUP BY pc.id, pc.name, pc.created_at, pc.updated_at
        ORDER BY LOWER(pc.name), pc.id
      `,
      sql`
        SELECT category_id, blackbaud_constituent_id
        FROM portfolio_category_assignments
        WHERE owner_user_id = ${workspaceUser.id}
      `,
    ]);

    return Response.json({ categories, assignments });
  } catch (error) {
    console.error("Error loading portfolio categories:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to load portfolio categories" },
      { status: 500 },
    );
  }
}

export async function POST(request) {
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
    const name = normalizeCategoryName(body?.name);
    if (!name) {
      return Response.json({ error: "Enter a category name." }, { status: 400 });
    }
    if (name.length > 80) {
      return Response.json(
        { error: "Category names must be 80 characters or fewer." },
        { status: 400 },
      );
    }

    const categories = await sql`
      INSERT INTO portfolio_categories (owner_user_id, name)
      VALUES (${context.workspaceUser.id}, ${name})
      RETURNING id, name, created_at, updated_at, 0::INTEGER AS assignment_count
    `;

    return Response.json({ category: categories[0] }, { status: 201 });
  } catch (error) {
    if (error?.code === "23505") {
      return Response.json(
        { error: "A category with this name already exists." },
        { status: 409 },
      );
    }

    console.error("Error creating portfolio category:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to create portfolio category" },
      { status: 500 },
    );
  }
}
