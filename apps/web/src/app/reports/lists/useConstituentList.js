import { useEffect, useRef, useState } from "react";

export default function useConstituentList(listKey) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [errorStatus, setErrorStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const controller = useRef(null);
  const endpoint = `/api/reports/lists/${encodeURIComponent(listKey)}`;
  async function request(signal, body) {
    const response = await fetch(endpoint, {
      cache: "no-store",
      signal,
      ...(body
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        : {}),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const failure = new Error(
        payload?.error ||
          "Could not load the list. Reload status before trying again.",
      );
      failure.status = response.status;
      throw failure;
    }
    return payload;
  }
  function handleFailure(failure) {
    setError(failure.message);
    setErrorStatus(failure.status || null);
    // Do not leave private results/actions visible after access is rejected.
    if (failure.status === 401 || failure.status === 403) setData(null);
  }
  async function reload() {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setLoading(true);
    setError("");
    setErrorStatus(null);
    setRefreshing(false);
    try {
      const payload = await request(current.signal);
      if (!current.signal.aborted) setData(payload);
    } catch (failure) {
      if (!current.signal.aborted) handleFailure(failure);
    } finally {
      if (!current.signal.aborted) setLoading(false);
    }
  }
  useEffect(() => {
    setData(null);
    reload();
    return () => controller.current?.abort();
  }, [listKey]);
  async function refresh(restart = false) {
    if (refreshing) return;
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setRefreshing(true);
    setError("");
    setErrorStatus(null);
    try {
      let command = { action: restart === true ? "restart" : "start" };
      for (
        let attempt = 0;
        attempt < 2200 && !current.signal.aborted;
        attempt += 1
      ) {
        const payload = await request(current.signal, command);
        if (current.signal.aborted) return;
        setData(payload);
        if (
          !payload.refresh ||
          payload.refresh.status !== "running" ||
          payload.refresh.busy
        )
          return;
        command = { action: "continue", jobId: payload.refresh.id };
        await new Promise((resolve) => setTimeout(resolve, payload.refresh.stage === "query" ? 2000 : 500));
      }
    } catch (failure) {
      if (!current.signal.aborted) handleFailure(failure);
    } finally {
      if (!current.signal.aborted) setRefreshing(false);
    }
  }
  return { data, error, errorStatus, loading, refreshing, reload, refresh };
}
