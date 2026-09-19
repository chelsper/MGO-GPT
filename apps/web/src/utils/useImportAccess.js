import { useEffect, useState } from "react";
import { isReviewerRole } from "@/utils/workspaceRoles";

const normalizeEmail = (value) => typeof value === "string" ? value.trim().toLowerCase() : "";
const unavailable = "Your account access could not be verified. Retry the access check. This check makes no changes to NXT.";

export default function useImportAccess({ user, loading }) {
  const email = normalizeEmail(user?.email);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState(null);

  useEffect(() => {
    setResult(null);
    if (loading || !email) return;
    const controller = new AbortController();
    let active = true;
    const finish = (value) => {
      if (active) setResult({ email, attempt, ...value });
    };
    const timer = setTimeout(() => {
      finish({ status: "error", message: "The account access check timed out. Retry to continue. This check makes no changes to NXT." });
      active = false;
      controller.abort();
    }, 20_000);

    async function check() {
      try {
        const response = await fetch("/api/users/profile", { cache: "no-store", signal: controller.signal });
        if (response.status === 401) { finish({ status: "signed_out" }); return; }
        if (response.status === 403) { finish({ status: "denied" }); return; }
        if (!response.ok) throw new Error("Profile unavailable");
        const payload = await response.json();
        const account = payload?.user;
        if (!account?.id || normalizeEmail(account.email) !== email ||
            typeof account.active !== "boolean" ||
            !(typeof account.role === "string" || (Array.isArray(account.role) && account.role.every((role) => typeof role === "string")))) {
          throw new Error("Incomplete account profile");
        }
        // Import APIs authorize this saved account, not a display mode, acting
        // workspace, or potentially stale role in the authentication session.
        finish({ status: account.active && isReviewerRole(account.role) ? "allowed" : "denied" });
      } catch {
        finish({ status: "error", message: unavailable });
      } finally {
        clearTimeout(timer);
      }
    }
    void check();
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [email, loading, attempt]);

  const retry = () => setAttempt((value) => value + 1);
  if (loading) return { status: "loading", retry };
  if (!email) return { status: "signed_out", retry };
  if (result?.email !== email || result?.attempt !== attempt) return { status: "loading", retry };
  return { status: result.status, message: result.message, retry };
}
