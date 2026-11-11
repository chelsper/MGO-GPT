export async function requestPortfolioAssignment(body, signal) {
  const controller = new AbortController();
  let timer, cancel;
  const interrupted = new Promise((_, reject) => {
    cancel = () => { reject(new DOMException("Cancelled", "AbortError")); controller.abort(); };
    if (signal?.aborted) cancel();
    else signal?.addEventListener("abort", cancel, { once: true });
    timer = setTimeout(() => { reject(new Error("Request confirmation timed out")); controller.abort(); }, 30000);
  });
  try {
    const request = (async () => {
      const response = await fetch("/api/portfolio-assignment-requests", {
        method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
        body: JSON.stringify(body), signal: controller.signal,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw Object.assign(new Error(typeof payload?.error === "string" ? payload.error : "Could not confirm this request."),
          { safeToCorrect: [400, 401, 403, 409].includes(response.status) });
      }
      if (!payload || !["requested", "not_submitted"].includes(payload.status) || typeof payload.message !== "string")
        throw new Error("Incomplete request confirmation");
      return payload;
    })();
    return await Promise.race([request, interrupted]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}
