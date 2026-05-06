import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import knowledgeBase from "./data/knowledge-base-complete.json";
import {
  ARTICLE_TEMPLATES,
  ARTICLE_TYPES,
  DIRECTORY_LINKS,
  asArray,
  createArticleId,
  getStructuredFields,
  legacySectionsToBlocks,
  mergeCategories,
  normalizeDateString,
  serializeSections,
  slugify,
} from "./catalog";
import { isAdminRole, isReviewerRole } from "@/utils/workspaceRoles";

const baseCategories = mergeCategories(
  Array.isArray(knowledgeBase?.categories) ? knowledgeBase.categories : [],
);
const baseArticles = Array.isArray(knowledgeBase?.articles) ? knowledgeBase.articles : [];

function uniqueStrings(values) {
  return Array.from(
    new Set(
      asArray(values)
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  );
}

function normalizeRequestLinks(links) {
  return asArray(links)
    .map((link) => {
      if (!link) return null;
      if (typeof link === "string") {
        return { label: link, href: "" };
      }
      return {
        label: String(link.label || "").trim(),
        href: String(link.href || "").trim(),
      };
    })
    .filter((link) => link && link.label);
}

function getCategoryMap() {
  return new Map(baseCategories.map((category) => [category.id, category]));
}

function inferArticleType(article, override) {
  if (override?.article_type) return String(override.article_type);
  const explicit = article?.articleType || article?.type;
  if (explicit) return String(explicit);
  return "procedure";
}

function normalizeOverrideRow(row) {
  return {
    ...row,
    tags: asArray(row?.tags),
    related_article_ids: asArray(row?.related_article_ids),
    related_system_ids: asArray(row?.related_system_ids),
    related_process_ids: asArray(row?.related_process_ids),
    related_request_links: normalizeRequestLinks(row?.related_request_links),
    sections: row?.sections && typeof row.sections === "object" ? row.sections : {},
  };
}

function resolveContentBlocks(sections) {
  if (Array.isArray(sections?.contentBlocks) && sections.contentBlocks.length > 0) {
    return sections.contentBlocks;
  }
  return legacySectionsToBlocks(sections);
}

function normalizeArticle(article, overrideMap, userMap) {
  const override = normalizeOverrideRow(overrideMap.get(article.id) || {});
  const sections =
    override.sections && Object.keys(override.sections).length > 0
      ? override.sections
      : article.sections || {};
  const fields = getStructuredFields(sections);
  const contentBlocks = resolveContentBlocks(sections);
  const relatedArticleIds = uniqueStrings(
    override.related_article_ids?.length
      ? override.related_article_ids
      : sections.relatedArticles,
  );
  const relatedSystemIds = uniqueStrings(override.related_system_ids || fields.relatedSystems);
  const relatedProcessIds = uniqueStrings(override.related_process_ids || fields.relatedProcesses);
  const relatedRequestLinks = normalizeRequestLinks(
    override.related_request_links?.length
      ? override.related_request_links
      : fields.relatedRequestLinks,
  );

  const owner = override.owner_user_id ? userMap.get(Number(override.owner_user_id)) || null : null;
  const reviewer = override.reviewer_user_id
    ? userMap.get(Number(override.reviewer_user_id)) || null
    : null;

  return {
    id: article.id,
    slug: slugify(article.id),
    sourceType: override.created_at ? "override" : "base",
    categoryId: override.category_id || article.categoryId || null,
    articleType: inferArticleType(article, override),
    status: override.status || "published",
    title: override.title || article.title || "Untitled article",
    summary: override.summary || article.summary || "",
    tags: uniqueStrings(override.tags?.length ? override.tags : article.tags),
    relatedArticleIds,
    relatedSystemIds,
    relatedProcessIds,
    relatedRequestLinks,
    fields,
    contentBlocks,
    lastUpdated:
      normalizeDateString(override.updated_at) ||
      normalizeDateString(article.lastUpdated) ||
      null,
    lastReviewed: normalizeDateString(override.last_reviewed_at) || null,
    publishedAt: normalizeDateString(override.published_at) || null,
    owner,
    reviewer,
    featured: Boolean(override.featured),
    templateKey: override.template_key || null,
    revisionCount: Number(override.revision_count || 0),
  };
}

function buildPayload({ overrides, users, includeDrafts = false }) {
  const overrideMap = new Map(overrides.map((row) => [row.article_id, row]));
  const userMap = new Map(users.map((user) => [Number(user.id), user]));
  const categoryMap = getCategoryMap();

  const mergedArticles = baseArticles.map((article) =>
    normalizeArticle(article, overrideMap, userMap),
  );

  for (const override of overrides) {
    if (baseArticles.some((article) => article.id === override.article_id)) continue;
    const normalized = normalizeArticle(
      {
        id: override.article_id,
        categoryId: override.category_id || null,
        title: override.title || "Untitled draft",
        summary: override.summary || "",
        tags: override.tags || [],
        lastUpdated: override.updated_at,
        sections: override.sections || {},
      },
      new Map([[override.article_id, override]]),
      userMap,
    );
    mergedArticles.push(normalized);
  }

  const visibleArticles = mergedArticles.filter((article) =>
    includeDrafts ? article.status !== "archived" : article.status === "published",
  );

  const categories = baseCategories.map((category) => {
    const categoryArticles = visibleArticles.filter(
      (article) => article.categoryId === category.id,
    );
    const relatedCategoryIds = Array.from(
      new Set(
        categoryArticles
          .flatMap((article) =>
            article.relatedArticleIds
              .map((relatedId) => mergedArticles.find((candidate) => candidate.id === relatedId))
              .filter(Boolean)
              .map((related) => related.categoryId),
          )
          .filter((id) => id && id !== category.id),
      ),
    );

    return {
      ...category,
      articleCount: categoryArticles.length,
      articleIds: categoryArticles.map((article) => article.id),
      relatedCategoryIds,
      owner: categoryArticles.find((article) => article.owner)?.owner || null,
      reviewer: categoryArticles.find((article) => article.reviewer)?.reviewer || null,
      recentlyUpdatedIds: categoryArticles
        .slice()
        .sort((a, b) => String(b.lastUpdated || "").localeCompare(String(a.lastUpdated || "")))
        .slice(0, 3)
        .map((article) => article.id),
      featuredArticleIds: categoryArticles
        .filter((article) => article.featured)
        .slice(0, 3)
        .map((article) => article.id),
    };
  });

  const featuredArticles = visibleArticles
    .filter((article) => article.featured)
    .slice(0, 6);
  const recentArticles = visibleArticles
    .slice()
    .sort((a, b) => String(b.lastUpdated || "").localeCompare(String(a.lastUpdated || "")))
    .slice(0, 8);

  const startHereArticles = visibleArticles.slice(0, 6).map((article) => article.id);
  const systems = visibleArticles.filter((article) => article.articleType === "system");
  const processes = visibleArticles.filter((article) => article.articleType === "process");
  const glossary = visibleArticles.filter((article) => article.articleType === "glossary");

  return {
    exportDate: knowledgeBase?.exportDate || null,
    categories,
    articles: visibleArticles,
    directories: DIRECTORY_LINKS.map((directory) => ({
      ...directory,
      count:
        directory.kind === "system"
          ? systems.length
          : directory.kind === "process"
            ? processes.length
            : directory.kind === "glossary"
              ? glossary.length
              : startHereArticles.length,
    })),
    featuredArticles,
    recentArticles,
    startHereArticleIds: startHereArticles,
    quickLinks: [
      { id: "systems", label: "Systems directory", targetType: "directory" },
      { id: "processes", label: "Process maps", targetType: "directory" },
      { id: "glossary", label: "Glossary", targetType: "directory" },
      { id: "manage", label: "Manage content", href: "/knowledge-base/manage" },
    ],
    systems,
    processes,
    glossary,
    templates: ARTICLE_TEMPLATES,
    articleTypes: ARTICLE_TYPES,
  };
}

async function loadUsers() {
  return sql`
    SELECT id, name, email, role
    FROM users
    WHERE active = TRUE
    ORDER BY LOWER(name) ASC, LOWER(email) ASC
  `;
}

async function loadOverrides() {
  await ensureAppSchema();
  return sql`
    SELECT
      o.*,
      (
        SELECT COUNT(*)
        FROM knowledge_base_article_revisions r
        WHERE r.article_id = o.article_id
      ) AS revision_count
    FROM knowledge_base_article_overrides o
  `;
}

async function resolveReviewer() {
  const session = await auth();
  if (!session?.user?.email) return null;
  const rows = await sql`
    SELECT id, name, email, role
    FROM users
    WHERE email = ${session.user.email}
    LIMIT 1
  `;
  return rows[0] || null;
}

function validateArticleInput(payload, categoryIds, userIds, articleIds) {
  const title = String(payload?.title || "").trim();
  const summary = String(payload?.summary || "").trim();
  const articleId = String(payload?.articleId || "").trim();
  const categoryId = String(payload?.categoryId || "").trim();
  const articleType = String(payload?.articleType || "").trim() || "procedure";
  const status = String(payload?.status || "draft").trim();
  const contentBlocks = asArray(payload?.contentBlocks);
  const tags = uniqueStrings(payload?.tags);
  const relatedArticleIds = uniqueStrings(payload?.relatedArticleIds);
  const relatedSystemIds = uniqueStrings(payload?.relatedSystemIds);
  const relatedProcessIds = uniqueStrings(payload?.relatedProcessIds);
  const relatedRequestLinks = normalizeRequestLinks(payload?.relatedRequestLinks);
  const fields = payload?.fields && typeof payload.fields === "object" ? payload.fields : {};
  const ownerUserId = payload?.ownerUserId ? Number(payload.ownerUserId) : null;
  const reviewerUserId = payload?.reviewerUserId ? Number(payload.reviewerUserId) : null;

  if (!articleId) throw new Error("Article ID is required.");
  if (!title) throw new Error("Title is required.");
  if (!summary) throw new Error("Summary is required.");
  if (!categoryId || !categoryIds.has(categoryId)) throw new Error("Valid category is required.");
  if (!ARTICLE_TYPES.some((item) => item.value === articleType)) {
    throw new Error("Valid article type is required.");
  }
  if (!["draft", "published", "archived"].includes(status)) {
    throw new Error("Valid status is required.");
  }
  if (status === "published" && contentBlocks.length === 0) {
    throw new Error("Published articles need at least one content section.");
  }
  if (ownerUserId && !userIds.has(ownerUserId)) throw new Error("Owner must be a valid user.");
  if (reviewerUserId && !userIds.has(reviewerUserId)) {
    throw new Error("Reviewer must be a valid user.");
  }
  if (
    status === "published" &&
    relatedArticleIds.some((id) => !articleIds.has(id))
  ) {
    throw new Error("Published articles cannot reference missing related articles.");
  }
  if (
    status === "published" &&
    relatedSystemIds.some((id) => !articleIds.has(id))
  ) {
    throw new Error("Published articles cannot reference missing related systems.");
  }
  if (
    status === "published" &&
    relatedProcessIds.some((id) => !articleIds.has(id))
  ) {
    throw new Error("Published articles cannot reference missing related processes.");
  }
  if (
    status === "published" &&
    relatedRequestLinks.some((link) => link.href && !/^\/|https?:\/\//i.test(link.href))
  ) {
    throw new Error("Published articles cannot include invalid related request links.");
  }

  return {
    articleId,
    title,
    summary,
    categoryId,
    articleType,
    status,
    tags,
    relatedArticleIds,
    relatedSystemIds,
    relatedProcessIds,
    relatedRequestLinks,
    fields,
    contentBlocks,
    ownerUserId,
    reviewerUserId,
    lastReviewedAt: normalizeDateString(payload?.lastReviewedAt),
    featured: Boolean(payload?.featured),
    templateKey: payload?.templateKey ? String(payload.templateKey) : null,
  };
}

async function writeRevision({ articleId, reviewerId, action, snapshot }) {
  await sql`
    INSERT INTO knowledge_base_article_revisions (
      article_id,
      snapshot,
      action,
      created_by
    ) VALUES (
      ${articleId},
      ${JSON.stringify(snapshot)},
      ${action},
      ${reviewerId}
    )
  `;
}

export async function GET(request) {
  const [overrides, users, reviewer] = await Promise.all([
    loadOverrides(),
    loadUsers(),
    resolveReviewer(),
  ]);

  const includeDrafts =
    new URL(request.url).searchParams.get("manage") === "1" &&
    reviewer &&
    isReviewerRole(reviewer.role);

  const payload = buildPayload({ overrides, users, includeDrafts });

  return Response.json({
    ...payload,
    viewer: reviewer
      ? {
          id: reviewer.id,
          role: reviewer.role,
          canEdit: isReviewerRole(reviewer.role),
          canPublish: isReviewerRole(reviewer.role),
          isAdmin: isAdminRole(reviewer.role),
        }
      : {
          id: null,
          role: null,
          canEdit: false,
          canPublish: false,
          isAdmin: false,
        },
    ...(includeDrafts
      ? {
          editorOptions: {
            users: users.map((user) => ({
              id: user.id,
              name: user.name,
              email: user.email,
              role: user.role,
            })),
          },
        }
      : {}),
  });
}

export async function POST(request) {
  try {
    await ensureAppSchema();
    const reviewer = await resolveReviewer();
    if (!reviewer || !isReviewerRole(reviewer.role)) {
      return Response.json({ error: "Forbidden — reviewers only" }, { status: 403 });
    }

    const body = await request.json();
    const articleId =
      String(body?.articleId || "").trim() ||
      createArticleId(String(body?.articleType || "article"));
    const users = await loadUsers();
    const categoryIds = new Set(baseCategories.map((category) => category.id));
    const userIds = new Set(users.map((user) => Number(user.id)));
    const articleIds = new Set([
      ...baseArticles.map((article) => article.id),
      ...(await loadOverrides()).map((row) => row.article_id),
      articleId,
    ]);
    const input = validateArticleInput(
      { ...body, articleId, status: body?.status || "draft" },
      categoryIds,
      userIds,
      articleIds,
    );

    await sql`
      INSERT INTO knowledge_base_article_overrides (
        article_id,
        category_id,
        article_type,
        status,
        title,
        summary,
        tags,
        related_article_ids,
        related_system_ids,
        related_process_ids,
        related_request_links,
        owner_user_id,
        reviewer_user_id,
        last_reviewed_at,
        published_at,
        template_key,
        featured,
        sections,
        created_by,
        updated_by,
        updated_at
      ) VALUES (
        ${input.articleId},
        ${input.categoryId},
        ${input.articleType},
        ${input.status},
        ${input.title},
        ${input.summary},
        ${JSON.stringify(input.tags)},
        ${JSON.stringify(input.relatedArticleIds)},
        ${JSON.stringify(input.relatedSystemIds)},
        ${JSON.stringify(input.relatedProcessIds)},
        ${JSON.stringify(input.relatedRequestLinks)},
        ${input.ownerUserId},
        ${input.reviewerUserId},
        ${input.lastReviewedAt},
        ${input.status === "published" ? new Date().toISOString() : null},
        ${input.templateKey},
        ${input.featured},
        ${JSON.stringify(
          serializeSections({
            contentBlocks: input.contentBlocks,
            fields: input.fields,
            relatedArticleIds: input.relatedArticleIds,
          }),
        )},
        ${reviewer.id},
        ${reviewer.id},
        NOW()
      )
    `;

    await writeRevision({
      articleId: input.articleId,
      reviewerId: reviewer.id,
      action: "create",
      snapshot: input,
    });

    return Response.json({ success: true, articleId: input.articleId }, { status: 201 });
  } catch (error) {
    console.error("Knowledge base create error:", error);
    return Response.json(
      { error: error?.message || "Failed to create knowledge base article" },
      { status: 500 },
    );
  }
}

export async function PATCH(request) {
  try {
    await ensureAppSchema();
    const reviewer = await resolveReviewer();
    if (!reviewer || !isReviewerRole(reviewer.role)) {
      return Response.json({ error: "Forbidden — reviewers only" }, { status: 403 });
    }

    const body = await request.json();
    const users = await loadUsers();
    const categoryIds = new Set(baseCategories.map((category) => category.id));
    const userIds = new Set(users.map((user) => Number(user.id)));
    const articleIds = new Set([
      ...baseArticles.map((article) => article.id),
      ...(await loadOverrides()).map((row) => row.article_id),
    ]);
    const input = validateArticleInput(body, categoryIds, userIds, articleIds);

    const previousRows = await sql`
      SELECT *
      FROM knowledge_base_article_overrides
      WHERE article_id = ${input.articleId}
      LIMIT 1
    `;
    const previous = previousRows[0] || null;

    await sql`
      INSERT INTO knowledge_base_article_overrides (
        article_id,
        category_id,
        article_type,
        status,
        title,
        summary,
        tags,
        related_article_ids,
        related_system_ids,
        related_process_ids,
        related_request_links,
        owner_user_id,
        reviewer_user_id,
        last_reviewed_at,
        published_at,
        template_key,
        featured,
        sections,
        created_by,
        created_at,
        updated_by,
        updated_at
      ) VALUES (
        ${input.articleId},
        ${input.categoryId},
        ${input.articleType},
        ${input.status},
        ${input.title},
        ${input.summary},
        ${JSON.stringify(input.tags)},
        ${JSON.stringify(input.relatedArticleIds)},
        ${JSON.stringify(input.relatedSystemIds)},
        ${JSON.stringify(input.relatedProcessIds)},
        ${JSON.stringify(input.relatedRequestLinks)},
        ${input.ownerUserId},
        ${input.reviewerUserId},
        ${input.lastReviewedAt},
        ${
          input.status === "published"
            ? new Date().toISOString()
            : previous?.published_at || null
        },
        ${input.templateKey},
        ${input.featured},
        ${JSON.stringify(
          serializeSections({
            contentBlocks: input.contentBlocks,
            fields: input.fields,
            relatedArticleIds: input.relatedArticleIds,
          }),
        )},
        ${previous?.created_by || reviewer.id},
        ${previous?.created_at || new Date().toISOString()},
        ${reviewer.id},
        NOW()
      )
      ON CONFLICT (article_id)
      DO UPDATE SET
        category_id = EXCLUDED.category_id,
        article_type = EXCLUDED.article_type,
        status = EXCLUDED.status,
        title = EXCLUDED.title,
        summary = EXCLUDED.summary,
        tags = EXCLUDED.tags,
        related_article_ids = EXCLUDED.related_article_ids,
        related_system_ids = EXCLUDED.related_system_ids,
        related_process_ids = EXCLUDED.related_process_ids,
        related_request_links = EXCLUDED.related_request_links,
        owner_user_id = EXCLUDED.owner_user_id,
        reviewer_user_id = EXCLUDED.reviewer_user_id,
        last_reviewed_at = EXCLUDED.last_reviewed_at,
        published_at = EXCLUDED.published_at,
        template_key = EXCLUDED.template_key,
        featured = EXCLUDED.featured,
        sections = EXCLUDED.sections,
        updated_by = EXCLUDED.updated_by,
        updated_at = NOW()
    `;

    await writeRevision({
      articleId: input.articleId,
      reviewerId: reviewer.id,
      action: "save",
      snapshot: {
        before: previous,
        after: input,
      },
    });

    return Response.json({ success: true, articleId: input.articleId });
  } catch (error) {
    console.error("Knowledge base update error:", error);
    return Response.json(
      { error: error?.message || "Failed to update knowledge base article" },
      { status: 500 },
    );
  }
}
