import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import sql from "@/app/api/utils/sql";

function canEditWorkspace({ sessionUser, workspaceUser, isActing }) {
  return !isActing && Number(sessionUser?.id) === Number(workspaceUser?.id);
}

function sameParent(left, right) {
  return String(left || "") === String(right || "");
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
      return Response.json(
        { error: "Return to your own MGO workspace to organize your portfolio." },
        { status: 403 },
      );
    }

    const body = await request.json();
    const categoryId = Number(body?.categoryId);
    const direction = body?.direction;
    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      return Response.json({ error: "Choose a valid category." }, { status: 400 });
    }
    if (direction !== "up" && direction !== "down") {
      return Response.json({ error: "Choose a valid move direction." }, { status: 400 });
    }

    const categories = await sql`
      SELECT id, name, parent_category_id, sort_order
      FROM portfolio_categories
      WHERE owner_user_id = ${context.workspaceUser.id}
      ORDER BY sort_order, id
    `;
    const category = categories.find((item) => Number(item.id) === categoryId);
    if (!category) {
      return Response.json({ error: "Category not found." }, { status: 404 });
    }

    const siblings = categories
      .filter((item) => sameParent(item.parent_category_id, category.parent_category_id))
      .sort(
        (left, right) =>
          Number(left.sort_order || 0) - Number(right.sort_order || 0) ||
          Number(left.id) - Number(right.id),
      );
    const currentIndex = siblings.findIndex((item) => Number(item.id) === categoryId);
    const adjacentIndex = currentIndex + (direction === "up" ? -1 : 1);
    const adjacentCategory = siblings[adjacentIndex];
    if (!adjacentCategory) {
      return Response.json({ category });
    }

    await sql`
      UPDATE portfolio_categories
      SET sort_order = ${Number(adjacentCategory.sort_order || 0)}, updated_at = NOW()
      WHERE id = ${category.id}
        AND owner_user_id = ${context.workspaceUser.id}
    `;
    await sql`
      UPDATE portfolio_categories
      SET sort_order = ${Number(category.sort_order || 0)}, updated_at = NOW()
      WHERE id = ${adjacentCategory.id}
        AND owner_user_id = ${context.workspaceUser.id}
    `;

    return Response.json({
      category: {
        ...category,
        sort_order: Number(adjacentCategory.sort_order || 0),
      },
    });
  } catch (error) {
    console.error("Error reordering portfolio category:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to reorder portfolio category" },
      { status: 500 },
    );
  }
}
