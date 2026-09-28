import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import sql from "@/app/api/utils/sql";
import { isReviewerRole } from "@/utils/workspaceRoles";
import { ensureSocietyLetterSchema } from "@/app/api/utils/societyLetterStore";
import { readStewardshipOverview } from "@/app/api/utils/stewardshipOverview";

const reply = (body, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
export async function GET(request) {
  try {
    const session = await auth();
    if (!session?.user?.email)
      return reply({ error: "Sign in to view stewardship." }, 401);
    await ensureAppSchema();
    const { sessionUser } = await getWorkspaceUser(session, request);
    if (
      !sessionUser?.id ||
      sessionUser.active === false ||
      !isReviewerRole(sessionUser.role)
    )
      return reply(
        {
          error: "Stewardship is available to Admin and Advancement Services.",
        },
        403,
      );
    await ensureSocietyLetterSchema();
    return reply({
      ...(await readStewardshipOverview(sql)),
      viewerKey: String(session.user.id || session.user.email),
    });
  } catch {
    return reply(
      {
        error:
          "Saved counts are unavailable. You can still open your work below.",
      },
      500,
    );
  }
}
