import { auth } from '@/auth';
import getWorkspaceUser from '@/app/api/utils/getWorkspaceUser';
import ensureAppSchema from '@/app/api/utils/ensureAppSchema';
import sql from '@/app/api/utils/sql';
import { isReviewerRole } from '@/utils/workspaceRoles';
import { IMPORT_HISTORY_PAGE_SIZE, importHistoryQuery, parseImportHistoryFilters, serializeImportHistory } from '@/app/api/utils/importHistory';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });

// This endpoint reads saved outcomes only. No NXT calls, retries, or approvals.
export async function GET(request) {
  try {
    const session = await auth();
    if (!session?.user?.email) return json({ error: 'Sign in to view import history.' }, 401);
    const { sessionUser } = await getWorkspaceUser(session, request);
    if (!sessionUser || sessionUser.active === false || !isReviewerRole(sessionUser.role)) {
      return json({ error: 'Only Advancement Services users can view import history.' }, 403);
    }
    let filters;
    try { filters = parseImportHistoryFilters(request.url); }
    catch { return json({ error: 'Invalid history filters.' }, 400); }
    await ensureAppSchema();
    const rows = await sql(importHistoryQuery, [filters.type, filters.search, filters.outcome,
      IMPORT_HISTORY_PAGE_SIZE, (filters.page - 1) * IMPORT_HISTORY_PAGE_SIZE]);
    return json(serializeImportHistory(rows[0], filters));
  } catch {
    return json({ error: 'Import history could not be loaded. No import records were changed.' }, 500);
  }
}
