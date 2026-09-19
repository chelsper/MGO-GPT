import {
  listContext,
  listFailure,
  listResponse,
  requireListSameOrigin,
} from "@/app/api/utils/constituentListContext";
import { addListMember } from "@/app/api/utils/constituentListMembership";
import { listError } from "@/app/api/utils/listConfigurations";
export const maxDuration = 300;

export async function POST(request, { params }) {
  try {
    requireListSameOrigin(request);
    const context = await listContext(request, params.listKey);
    if (!context.report.canManageMembers)
      throw listError(
        "Only authorized Admin, Advancement Services, and Executive users may add list members.",
        403,
      );
    const body = await request.json().catch(() => null);
    if (
      !body ||
      !/^\d{1,40}$/.test(body.constituentId || "") ||
      !["add", "verify"].includes(body.action) ||
      Object.keys(body).some(
        (key) =>
          !["action", "constituentId", "value", "revision"].includes(key),
      )
    )
      throw listError(
        "Select an NXT constituent and a valid membership action.",
      );
    if (body.revision !== context.report.revision)
      throw listError(
        "The list settings changed. Reload before adding anyone.",
        409,
      );
    const result = await addListMember({
      ...context,
      source: context.report.dataConfiguration,
      constituentId: String(body.constituentId),
      value: body.value,
      verifyOnly: body.action === "verify",
      beforeWrite: async () => {
        const current = await listContext(request, params.listKey);
        if (
          !current.report.canManageMembers ||
          current.report.revision !== context.report.revision
        )
          throw listError(
            "List permissions or settings changed. Reload before adding anyone.",
            409,
          );
      },
    });
    await listContext(request, params.listKey);
    return listResponse(result);
  } catch (error) {
    return listFailure(error);
  }
}
