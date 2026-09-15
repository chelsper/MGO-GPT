import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import { blackbaudApiFetch, isBlackbaudQuotaExceededError } from "@/app/api/utils/blackbaud";
import {
  claimPortfolioContactGate, isAssignedPortfolioConstituent, mapPortfolioContact,
  readPortfolioContact, releasePortfolioContactGate, savePortfolioContact,
} from "@/app/api/utils/portfolioContactRefresh";
import { portfolioContactsAreFresh } from "@/utils/portfolioContacts";

const reply = (body, status = 200) => Response.json(body, {
  status, headers: { "Cache-Control": "private, no-store" },
});

export async function GET(request, { params }) {
  let gate;
  let cooldownMs = 500;
  let saved = null;
  try {
    const session = await auth(request);
    if (!session?.user?.email) return reply({ error: "Unauthorized" }, 401);
    await ensureAppSchema();
    const { sessionUser, workspaceUser, isActing } = await getWorkspaceUser(session, request);
    const url = new URL(request.url);
    if (!workspaceUser?.id || !sessionUser?.id ||
        url.searchParams.get("workspace_id") !== String(workspaceUser.id) ||
        url.searchParams.get("viewer_id") !== String(sessionUser.id)) {
      return reply({ error: "Workspace changed. Reopen the portfolio before checking contacts." }, 409);
    }
    const constituentId = String(params.constituentId || "").trim();
    if (!/^\d+$/.test(constituentId)) return reply({ error: "Invalid constituent" }, 400);
    if (!await isAssignedPortfolioConstituent(workspaceUser.id, constituentId)) {
      return reply({ error: "This constituent is not in the saved portfolio." }, 403);
    }
    const scope = {
      workspaceUserId: workspaceUser.id,
      authUserId: isActing ? sessionUser.id : workspaceUser.id,
      constituentId, origin: url.origin,
    };
    saved = await readPortfolioContact(scope);
    if (portfolioContactsAreFresh(saved)) return reply({ status: "fresh", contacts: saved });
    gate = await claimPortfolioContactGate(scope);
    if (!gate.token) return reply({ status: "paused", reason: "busy", contacts: saved, retryAt: gate.retryAt });
    // A different worker may have completed this record while we acquired the lease.
    saved = await readPortfolioContact(scope);
    if (portfolioContactsAreFresh(saved)) return reply({ status: "fresh", contacts: saved });
    const checkedAt = new Date().toISOString();
    const record = await blackbaudApiFetch(`/constituent/v1/constituents/${constituentId}`, {
      userId: scope.workspaceUserId, authUserId: scope.authUserId, origin: scope.origin,
      timeoutMs: 8_000, maxRetries: 0,
    });
    const constituent = mapPortfolioContact(record, constituentId);
    await savePortfolioContact(scope, constituent, checkedAt);
    return reply({ status: "updated", contacts: {
      email: constituent.email, phone: constituent.phone, address: constituent.address,
      contactCheckedAt: checkedAt, contactDataSource: "nxt-summary-cache",
    } });
  } catch (error) {
    const throttled = error?.httpStatus === 429 || isBlackbaudQuotaExceededError(error);
    const retryAfterMs = Number(error?.retryAfterMs);
    cooldownMs = Math.max(60_000, Number.isFinite(retryAfterMs) ? Math.min(retryAfterMs, 86_400_000) : 0);
    return reply({
      status: "paused", reason: throttled ? "throttled" : "unavailable", contacts: saved,
      retryAt: new Date(Date.now() + cooldownMs).toISOString(),
    }, 503);
  } finally {
    if (gate?.token) {
      try { await releasePortfolioContactGate(gate, cooldownMs); }
      catch { /* The bounded lease expires if the database is temporarily unavailable. */ }
    }
  }
}
