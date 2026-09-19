"use client";

import { useEffect, useRef, useState } from "react";

const endpoint = "/api/reports/portfolio-giving";

export function usePortfolioGivingReport({ workspaceUserId, enabled }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const controller = useRef(null);
  const running = useRef(false);

  function acceptPayload(payload) {
    // Progress responses repeat the immutable published snapshot. Preserve its
    // identity so a refresh checkpoint does not close an open gift-link dialog.
    setData((previous) => ({
      ...payload,
      snapshot:
        previous?.snapshot?.generatedAt &&
        previous.snapshot.generatedAt === payload.snapshot?.generatedAt &&
        previous.snapshot.workspaceUserId === payload.snapshot?.workspaceUserId
          ? previous.snapshot
          : payload.snapshot,
    }));
  }

  async function read(options = {}) {
    const response = await fetch(endpoint, { cache: "no-store", ...options });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload)
      throw new Error(payload?.error || "Could not load the saved report.");
    if (
      payload.snapshot &&
      Number(payload.snapshot.workspaceUserId) !== Number(workspaceUserId)
    )
      throw new Error(
        "Your selected workspace changed. Reload this page before continuing.",
      );
    return payload;
  }

  useEffect(() => {
    const current = ++generation.current;
    const abort = new AbortController();
    controller.current = abort;
    running.current = false;
    setData(null);
    setError("");
    setRefreshing(false);
    setLoading(Boolean(enabled && workspaceUserId));
    if (enabled && workspaceUserId) {
      read({ signal: abort.signal })
        .then((payload) => {
          if (generation.current === current) acceptPayload(payload);
        })
        .catch((reason) => {
          if (generation.current === current && !abort.signal.aborted)
            setError(reason.message);
        })
        .finally(() => {
          if (generation.current === current) setLoading(false);
        });
    }
    return () => {
      generation.current += 1;
      controller.current?.abort();
    };
  }, [workspaceUserId, enabled]);

  async function reload() {
    if (running.current) return;
    const current = generation.current;
    const abort = new AbortController();
    controller.current = abort;
    setLoading(true);
    setError("");
    try {
      const payload = await read({ signal: abort.signal });
      if (generation.current === current) acceptPayload(payload);
    } catch (reason) {
      if (generation.current === current && !abort.signal.aborted)
        setError(reason.message);
    } finally {
      if (generation.current === current) setLoading(false);
    }
  }

  async function refresh() {
    if (running.current || !enabled || !workspaceUserId) return;
    running.current = true;
    const current = generation.current;
    const abort = new AbortController();
    controller.current = abort;
    setRefreshing(true);
    setError("");
    let command = { action: "start" };
    try {
      while (!abort.signal.aborted && generation.current === current) {
        const payload = await read({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(command),
          signal: abort.signal,
        });
        if (generation.current !== current || abort.signal.aborted) return;
        acceptPayload(payload);
        if (payload.refresh?.status !== "pending" || payload.refresh?.busy)
          break;
        command = { action: "continue", jobId: payload.refresh.id };
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    } catch (reason) {
      if (generation.current === current && !abort.signal.aborted)
        setError(
          `${reason.message} The saved report is unchanged. Reload status before retrying an interrupted refresh.`,
        );
    } finally {
      if (generation.current === current) {
        running.current = false;
        setRefreshing(false);
      }
    }
  }

  return { data, loading, refreshing, error, refresh, reload };
}
