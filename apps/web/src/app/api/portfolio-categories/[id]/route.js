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

function getOptionalParentCategoryId(body) {
  if (!Object.prototype.hasOwnProperty.call(body || {}, "parentCategoryId")) {
    return { provided: false, value: null };
  }

  const rawValue = body.parentCategoryId;
  if (rawValue === null || rawValue === "" || rawValue === undefined) {
    return { provided: true, value: null };
  }

  const parentCategoryId = Number(rawValue);
  return {
    provided: true,
    value:
      Number.isInteger(parentCategoryId) && parentCategoryId > 0
        ? parentCategoryId
        : undefined,
  };
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
    const hasName = Object.prototype.hasOwnProperty.call(body || {}, "name");
    const name = hasName ? normalizeCategoryName(body?.name) : null;
    const parentCategory = getOptionalParentCategoryId(body);
    if (!hasName && !parentCategory.provided) {
      return Response.json({ error: "Choose a category change." }, { status: 400 });
    }
    if (hasName && !name) {
      return Response.json({ error: "Enter a category name." }, { status: 400 });
    }
    if (name && name.length > 80) {
      return Response.json(
        { error: "Category names must be 80 characters or fewer." },
        { status: 400 },
      );
    }

    if (parentCategory.provided && parentCategory.value === undefined) {
      return Response.json({ error: "Choose a valid parent category." }, { status: 400 });
    }

    const workspaceCategories = await sql`
      SELECT id, name, parent_category_id, sort_order
      FROM portfolio_categories
      WHERE owner_user_id = ${context.workspaceUser.id}
    `;
    const categoryById = new Map(
      workspaceCategories.map((category) => [String(category.id), category]),
    );
    const existingCategory = categoryById.get(String(categoryId));
    if (!existingCategory) {
      return Response.json({ error: "Category not found." }, { status: 404 });
    }

    if (parentCategory.provided && parentCategory.value !== null) {
      if (parentCategory.value === categoryId) {
        return Response.json(
          { error: "A category cannot be nested inside itself." },
          { status: 400 },
        );
      }

      let ancestor = categoryById.get(String(parentCategory.value));
      const visited = new Set();
      while (ancestor && !visited.has(String(ancestor.id))) {
        if (Number(ancestor.id) === categoryId) {
          return Response.json(
            { error: "A category cannot be nested inside one of its subcategories." },
            { status: 400 },
          );
        }
        visited.add(String(ancestor.id));
        ancestor = ancestor.parent_category_id
          ? categoryById.get(String(ancestor.parent_category_id))
          : null;
      }

      if (!categoryById.has(String(parentCategory.value))) {
        return Response.json({ error: "Parent category not found." }, { status: 404 });
      }
    }

    const parentChanged =
      parentCategory.provided &&
      String(existingCategory.parent_category_id || "") !== String(parentCategory.value || "");
    let sortOrder = Number(existingCategory.sort_order || 0);
    if (parentChanged) {
      const positions = await sql`
        SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_sort_order
        FROM portfolio_categories
        WHERE owner_user_id = ${context.workspaceUser.id}
          AND parent_category_id IS NOT DISTINCT FROM ${parentCategory.value}
      `;
      sortOrder = Number(positions[0]?.next_sort_order || 0);
    }

    const categories = await sql`
      UPDATE portfolio_categories
      SET
        name = ${name || existingCategory.name},
        parent_category_id = ${parentCategory.provided
          ? parentCategory.value
          : existingCategory.parent_category_id},
        sort_order = ${sortOrder},
        updated_at = NOW()
      WHERE id = ${categoryId}
        AND owner_user_id = ${context.workspaceUser.id}
      RETURNING id, name, parent_category_id, sort_order, created_at, updated_at
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

    console.error("Error updating portfolio category:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to update portfolio category" },
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
