"use client";

import { useEffect, useState } from "react";
import useUser from "@/utils/useUser";
import ReportConfigurationEditor from "@/components/ReportConfigurationEditor";

export default function ReportConfigurationsPage() {
  const { data: user, loading: loadingUser } = useUser();
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const email = user?.email;

  useEffect(() => {
    if (!loadingUser && !email) window.location.href = "/account/signin";
  }, [email, loadingUser]);

  useEffect(() => {
    if (!email) return;
    const controller = new AbortController();
    setError("");
    fetch("/api/reports/configurations", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result?.error || "Could not load report configurations.");
        if (!controller.signal.aborted) setPayload(result);
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(failure.message);
      });
    return () => controller.abort();
  }, [email, attempt]);

  if (!email || (!payload && !error)) return <main style={{ padding: 32 }} role="status">Loading report configurations...</main>;
  if (error) return <main style={{ padding: 32 }}><p role="alert">{error}</p><button onClick={() => setAttempt((value) => value + 1)}>Try again</button></main>;
  if (!payload.canManage) return <main style={{ padding: 32 }}><h1>Report Access &amp; Configurations</h1><p>Only Admin and Advancement Services users can manage report configurations.</p><a href="/reports">View my reports</a></main>;
  return <ReportConfigurationEditor initialConfigurations={payload.configurations || []} users={payload.users || []} />;
}
