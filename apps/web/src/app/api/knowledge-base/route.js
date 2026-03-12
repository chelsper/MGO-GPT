import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import knowledgeBase from "./data/knowledge-base-complete.json";
import { isReviewerRole } from "@/utils/workspaceRoles";

const baseCategories = Array.isArray(knowledgeBase?.categories)
  ? knowledgeBase.categories
  : [];
const baseArticles = Array.isArray(knowledgeBase?.articles)
  ? knowledgeBase.articles
  : [];

function mergeKnowledgeBase(overrides) {
  const overrideMap = new Map(overrides.map((item) => [item.article_id, item]));
  const articles = baseArticles.map((article) => {
    const override = overrideMap.get(article.id);
    if (!override) {
      return article;
    }

    return {
      ...article,
      title: override.title || article.title,
      summary: override.summary || article.summary,
      tags: Array.isArray(override.tags) ? override.tags : article.tags,
      sections:
        override.sections && typeof override.sections === "object"
          ? override.sections
          : article.sections,
      lastUpdated: override.updated_at
        ? new Date(override.updated_at).toISOString().slice(0, 10)
        : article.lastUpdated,
    };
  });

  return {
    exportDate: knowledgeBase?.exportDate || null,
    categories: baseCategories,
    articles,
  };
}

export async function GET() {
  await ensureAppSchema();

  const overrides = await sql`
    SELECT article_id, title, summary, tags, sections, updated_at
    FROM knowledge_base_article_overrides
  `;

  return Response.json(mergeKnowledgeBase(overrides));
}

export async function PATCH(request) {
  try {
    await ensureAppSchema();

    const session = await auth();
    if (!session || !session.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const reviewer = await sql`
      SELECT id, role
      FROM users
      WHERE email = ${session.user.email}
      LIMIT 1
    `;

    if (reviewer.length === 0 || !isReviewerRole(reviewer[0].role)) {
      return Response.json(
        { error: "Forbidden — reviewers only" },
        { status: 403 },
      );
    }

    const body = await request.json();
    const articleId = body?.articleId;
    const title = body?.title?.trim();
    const summary = body?.summary?.trim();
    const tags = Array.isArray(body?.tags)
      ? body.tags.map((tag) => String(tag).trim()).filter(Boolean)
      : null;
    const sections = body?.sections;

    if (!articleId || !baseArticles.some((article) => article.id === articleId)) {
      return Response.json({ error: "Valid article ID is required" }, { status: 400 });
    }
    if (!title || !summary || !sections || typeof sections !== "object") {
      return Response.json(
        { error: "Title, summary, and sections are required" },
        { status: 400 },
      );
    }

    await sql`
      INSERT INTO knowledge_base_article_overrides (
        article_id,
        title,
        summary,
        tags,
        sections,
        updated_by,
        updated_at
      ) VALUES (
        ${articleId},
        ${title},
        ${summary},
        ${tags ? JSON.stringify(tags) : null},
        ${JSON.stringify(sections)},
        ${reviewer[0].id},
        NOW()
      )
      ON CONFLICT (article_id)
      DO UPDATE SET
        title = EXCLUDED.title,
        summary = EXCLUDED.summary,
        tags = EXCLUDED.tags,
        sections = EXCLUDED.sections,
        updated_by = EXCLUDED.updated_by,
        updated_at = NOW()
    `;

    const updated = await sql`
      SELECT article_id, title, summary, tags, sections, updated_at
      FROM knowledge_base_article_overrides
      WHERE article_id = ${articleId}
      LIMIT 1
    `;

    return Response.json({ success: true, article: updated[0] || null });
  } catch (error) {
    console.error("Knowledge base update error:", error);
    return Response.json(
      { error: error?.message || "Failed to update knowledge base article" },
      { status: 500 },
    );
  }
}
