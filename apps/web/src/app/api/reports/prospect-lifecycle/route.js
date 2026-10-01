import { auth } from '@/auth';
import ensureAppSchema from '@/app/api/utils/ensureAppSchema';
import getOrCreateUser from '@/app/api/utils/getOrCreateUser';
import { getReportAccessForUser } from '@/app/api/utils/reportAccess';
import { readProspectLifecycle } from '@/app/api/utils/prospectLifecycleStore';
import { buildProspectLifecycle } from '@/utils/prospectLifecycle';
import { PIPELINE_REPORT_KEY } from '@/utils/pipelineReport';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET(request) {
  try {
    const session = await auth();
    if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401, headers });
    await ensureAppSchema();
    const user = await getOrCreateUser(session);
    if (!user || user.active === false) return Response.json({ error: 'Inactive account' }, { status: 403, headers });
    const access = await getReportAccessForUser(PIPELINE_REPORT_KEY, user);
    if (!access.canView) return Response.json({ error: 'You do not have access to the pipeline.' }, { status: 403, headers });
    const saved = await readProspectLifecycle({ origin: new URL(request.url).origin });
    return Response.json(buildProspectLifecycle(saved), { headers });
  } catch {
    console.error('Prospect lifecycle saved report unavailable');
    return Response.json({ error: 'The saved lifecycle report could not be loaded. No partial assignment or action totals are shown. Please try again.' }, { status: 500, headers });
  }
}
