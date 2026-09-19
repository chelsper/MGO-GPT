import { useEffect, useRef, useState } from "react";

export default function useConstituentList(listKey) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
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
    if (!response.ok)
      throw new Error(
        payload?.error ||
          "Could not load the list. Reload status before trying again.",
      );
    return payload;
  }
  async function reload() {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setLoading(true);
    setError("");
    setRefreshing(false);
    try {
      const payload = await request(current.signal);
      if (!current.signal.aborted) setData(payload);
    } catch (failure) {
      if (!current.signal.aborted) setError(failure.message);
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
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    } catch (failure) {
      if (!current.signal.aborted) setError(failure.message);
    } finally {
      if (!current.signal.aborted) setRefreshing(false);
    }
  }
  return { data, error, loading, refreshing, reload, refresh };
}
