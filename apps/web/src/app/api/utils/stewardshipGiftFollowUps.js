export function giftFollowUpFilters(params) {
  const filters = {
    search: (params.get("search") || "").trim(),
    status: params.get("status") || "Open",
    owner: params.get("owner") || "",
    due: params.get("due") || "all",
    page: params.get("page") || "1",
  };
  if (filters.search.length > 200 || !["Open", "Done", "all"].includes(filters.status) ||
      !["all", "overdue", "today", "upcoming", "undated"].includes(filters.due) ||
      (filters.owner && (!/^[1-9]\d*$/.test(filters.owner) || !Number.isSafeInteger(Number(filters.owner)))) ||
      !/^[1-9]\d*$/.test(filters.page) || Number(filters.page) > 1_000_000) {
    throw new Error("Choose valid search and filter values.");
  }
  return { ...filters, page: Number(filters.page) };
}

// One statement keeps the result count, page and owner choices on the same saved-data snapshot.
export async function readStewardshipGiftFollowUps(db, filters, asOf) {
  const { search, status, owner, due, page } = filters;
  const [result] = await db`
    WITH gift_tasks AS (
      SELECT pa.id, pa.title, pa.status, pa.due_date, pa.completed_at,
        pa.owner_user_id, COALESCE(NULLIF(u.name, ''), 'Workspace ' || u.id) AS owner_name,
        u.active AS owner_active, pa.source_gift_id,
        pa.source_gift_snapshot->>'constituentId' AS constituent_id,
        pa.source_gift_snapshot->>'constituentName' AS donor_name,
        pa.source_gift_snapshot->'amount' AS gift_amount,
        pa.source_gift_snapshot->>'date' AS gift_date,
        pa.source_gift_snapshot->>'checkedAt' AS gift_checked_at,
        CASE WHEN NULLIF(pa.source_gift_snapshot->>'constituentId', '') IS NOT NULL
          THEN COUNT(*) OVER (PARTITION BY pa.source_gift_id, pa.source_gift_snapshot->>'constituentId')
          ELSE 1 END AS linked_task_count
      FROM pending_actions pa
      JOIN users u ON u.id = pa.owner_user_id
      WHERE pa.source_gift_id IS NOT NULL
    ), filters AS (
      SELECT ${search}::text AS search, ${status}::text AS status,
        ${owner || null}::bigint AS owner, ${due}::text AS due, ${asOf}::date AS today
    ), matched AS (
      SELECT g.* FROM gift_tasks g CROSS JOIN filters f
      WHERE (f.status = 'all' OR g.status = f.status)
        AND (f.owner IS NULL OR g.owner_user_id = f.owner)
        AND (f.search = '' OR POSITION(LOWER(f.search) IN LOWER(CONCAT_WS(' ',
          g.donor_name, g.constituent_id, g.title, g.owner_name))) > 0)
        AND (f.due = 'all' OR (g.status = 'Open' AND (
          (f.due = 'overdue' AND g.due_date < f.today) OR
          (f.due = 'today' AND g.due_date = f.today) OR
          (f.due = 'upcoming' AND g.due_date > f.today AND g.due_date <= f.today + 7) OR
          (f.due = 'undated' AND g.due_date IS NULL))))
    ), totals AS (
      SELECT COUNT(*)::int AS total FROM matched
    ), paging AS (
      SELECT total, GREATEST(1, CEIL(total / 25.0)::int) AS pages,
        LEAST(${page}::int, GREATEST(1, CEIL(total / 25.0)::int)) AS page FROM totals
    ), page_rows AS (
      SELECT * FROM matched ORDER BY due_date ASC NULLS LAST, id ASC
      LIMIT 25 OFFSET (SELECT (page - 1) * 25 FROM paging)
    ), owners AS (
      SELECT DISTINCT owner_user_id, owner_name, owner_active FROM gift_tasks
    )
    SELECT total, page, pages, 25 AS page_size,
      COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', p.id::text, 'title', p.title, 'status', p.status,
        'dueDate', p.due_date::text, 'completedAt', p.completed_at,
        'ownerId', p.owner_user_id::text, 'ownerName', p.owner_name, 'ownerActive', p.owner_active,
        'giftId', p.source_gift_id, 'constituentId', p.constituent_id,
        'donorName', p.donor_name, 'giftAmount', p.gift_amount, 'giftDate', p.gift_date,
        'giftCheckedAt', p.gift_checked_at, 'linkedTaskCount', p.linked_task_count
      ) ORDER BY p.due_date ASC NULLS LAST, p.id ASC) FROM page_rows p), '[]'::jsonb) AS items,
      COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', o.owner_user_id::text, 'name', o.owner_name, 'active', o.owner_active
      ) ORDER BY o.owner_name, o.owner_user_id) FROM owners o), '[]'::jsonb) AS owners
    FROM paging
  `;
  return { items: result.items, owners: result.owners, total: Number(result.total),
    page: Number(result.page), pages: Number(result.pages), pageSize: Number(result.page_size) };
}
