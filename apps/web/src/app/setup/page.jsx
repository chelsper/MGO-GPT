"use client";

import { useEffect, useState } from "react";
import useUser from "@/utils/useUser";
import SetupHub, { isSetupStatus } from "@/components/SetupHub";

export default function SetupPage() {
  const { data: user, loading: loadingUser } = useUser();
  const email = user?.email;
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    setResult(null);
    setError("");
    if (loadingUser) {
      setLoading(true);
      return;
    }
    if (!email) {
      setLoading(false);
      setError("Sign in to view setup.");
      return;
    }
    const controller = new AbortController();
    let active = true;
    let timedOut = false;
    setLoading(true);
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 20_000);
    fetch("/api/admin/setup-status", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            response.status === 401
              ? "Sign in to view setup."
              : response.status === 403
                ? "Setup is available to active Admin and Advancement Services users only."
                : "Saved setup could not be loaded. No NXT checks or changes were started.",
          );
        const payload = await response.json().catch(() => null);
        if (!isSetupStatus(payload))
          throw new Error(
            "The saved setup response was incomplete. Reload status to try again.",
          );
        if (active) setResult({ email, data: payload });
      })
      .catch((failure) => {
        if (active)
          setError(
            timedOut
              ? "The saved setup read timed out. No NXT checks or changes were started. Try again."
              : failure.message || "Saved setup could not be loaded.",
          );
      })
      .finally(() => {
        clearTimeout(timer);
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [email, loadingUser, attempt]);
  return (
    <SetupHub
      data={result && result.email === email ? result.data : null}
      loading={loading}
      error={error}
      onReload={() => setAttempt((value) => value + 1)}
    />
  );
}
