import { requireDashboardUser } from "@/app/api/utils/dashboardAuth";
import { EXECUTIVE_TEAM_STANDINGS_REPORT_KEY, getReportAccessForUser } from "@/app/api/utils/reportAccess";
import { isAdminRole, isMgoRole } from "@/utils/workspaceRoles";
import sql from "@/app/api/utils/sql";

const headers = { "Cache-Control": "private, no-store" };
const fail = (message, status = 400) => Object.assign(new Error(message), { status });

function year(value) {
  if (!/^\d{4}$/.test(String(value)) || Number(value) < 2000 || Number(value) > 2200) throw fail("Invalid fiscal year");
  return Number(value);
}

export function validateGoal(value, integer = false) {
  if (value === null || value === "") return null;
  if (!["string", "number"].includes(typeof value) || !/^\d+(\.\d{1,2})?$/.test(String(value))) throw fail("Enter a positive goal, or leave it blank");
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0 || number > (integer ? 1000000 : 1000000000000) || (integer && !Number.isInteger(number))) throw fail("Goal is outside the allowed range");
  return number;
}

async function authorizedUser() {
  const user = await requireDashboardUser();
  const access = await getReportAccessForUser(EXECUTIVE_TEAM_STANDINGS_REPORT_KEY, user);
  if (!access.canView) throw fail("You do not have access to this report", 403);
  return user;
}

function errorResponse(error) {
  return Response.json({ error: error.status ? error.message : "Could not save or load annual goals" }, { status: error.status || 500, headers });
}

export async function GET(request) {
  try {
    const user = await authorizedUser();
    const fiscalYearStart = year(new URL(request.url).searchParams.get("fiscalYearStart"));
    const goals = await sql`SELECT user_id, raised_goal, actions_goal, updated_at FROM standings_annual_goals WHERE fiscal_year_start = ${fiscalYearStart}`;
    return Response.json({ goals, canEdit: isAdminRole(user.role) }, { headers });
  } catch (error) { return errorResponse(error); }
}

export async function PUT(request) {
  try {
    const user = await authorizedUser();
    if (!isAdminRole(user.role)) throw fail("Only administrators can edit annual goals", 403);
    const body = await request.json().catch(() => { throw fail("Invalid request"); });
    const fiscalYearStart = year(body?.fiscalYearStart);
    const userId = Number(body?.userId);
    if (!Number.isSafeInteger(userId) || userId < 1) throw fail("Invalid MGO");
    const raised = validateGoal(body.raisedGoal);
    const actions = validateGoal(body.actionsGoal, true);
    const users = await sql`SELECT id, role FROM users WHERE id = ${userId} AND active = TRUE LIMIT 1`;
    if (!users[0] || !isMgoRole(users[0].role)) throw fail("Select an active MGO");
    const goals = await sql`
      INSERT INTO standings_annual_goals (user_id, fiscal_year_start, raised_goal, actions_goal, updated_by)
      VALUES (${userId}, ${fiscalYearStart}, ${raised}, ${actions}, ${user.id})
      ON CONFLICT (user_id, fiscal_year_start) DO UPDATE SET
        raised_goal = EXCLUDED.raised_goal, actions_goal = EXCLUDED.actions_goal,
        updated_by = EXCLUDED.updated_by, updated_at = NOW()
      RETURNING user_id, raised_goal, actions_goal, updated_at
    `;
    return Response.json({ goal: goals[0] }, { headers });
  } catch (error) { return errorResponse(error); }
}
