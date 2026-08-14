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

async function getEditableContext(request) {
  await ensureAppSchema();
  const session = await auth();
  if (!session?.user?.email) {
    return { response: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const context = await getWorkspaceUser(session, request);
  if (!context.workspaceUser) {
    return { response: Response.json({ error: "User not found" }, { status: 404 }) };
  }
  if (!canEditWorkspace(context)) {
    return { response: writePermissionError() };
  }

  return { context };
}

function getCategoryId(params) {
  const categoryId = Number(params?.id);
  return Number.isInteger(categoryId) && categoryId > 0 ? categoryId : null;
}

export async function PATCH(request, { params }) {
  try {
    const categoryId = getCategoryId(params);
    if (!categoryId) {
      return Response.json({ error: "Invalid category." }, { status: 400 });
    }

    const { context, response } = await getEditableContext(request);
    if (response) return response;

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
      UPDATE portfolio_categories
      SET name = ${name}, updated_at = NOW()
      WHERE id = ${categoryId}
        AND owner_user_id = ${context.workspaceUser.id}
      RETURNING id, name, created_at, updated_at
    `;
    if (!categories[0]) {
      return Response.json({ error: "Category not found." }, { status: 404 });
    }

    return Response.json({ category: categories[0] });
  } catch (error) {
    if (error?.code === "23505") {
      return Response.json(
        { error: "A category with this name already exists." },
        { status: 409 },
      );
    }

    console.error("Error renaming portfolio category:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to rename portfolio category" },
      { status: 500 },
    );
  }
}

export async function DELETE(request, { params }) {
  try {
    const categoryId = getCategoryId(params);
    if (!categoryId) {
      return Response.json({ error: "Invalid category." }, { status: 400 });
    }

    const { context, response } = await getEditableContext(request);
    if (response) return response;

    const categories = await sql`
      DELETE FROM portfolio_categories
      WHERE id = ${categoryId}
        AND owner_user_id = ${context.workspaceUser.id}
      RETURNING id
    `;
    if (!categories[0]) {
      return Response.json({ error: "Category not found." }, { status: 404 });
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error deleting portfolio category:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to delete portfolio category" },
      { status: 500 },
    );
  }
}
