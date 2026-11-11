export const LIST_MEMBERSHIP_TIMEOUT_MS = 30000;

export async function requestListMembership(endpoint, body, signal) {
  if (signal?.aborted) throw new DOMException("Request cancelled", "AbortError");
  const controller = new AbortController();
  let timer, cancel;
  const interrupted = new Promise((_, reject) => {
    cancel = () => {
      reject(new DOMException("Request cancelled", "AbortError"));
      controller.abort();
    };
    signal?.addEventListener("abort", cancel, { once: true });
    timer = setTimeout(() => {
      reject(new Error("NXT confirmation is taking longer than expected. The addition may have finished."));
      controller.abort();
    }, LIST_MEMBERSHIP_TIMEOUT_MS);
  });
  try {
    // An expired request may still finish on the server. Only verify, never replay it.
    const request = (async () => {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const error = new Error(typeof payload?.error === "string" ? payload.error : "Could not verify this addition.");
        error.safeToCorrect = body.action === "add" && [400, 422].includes(response.status) && typeof payload?.error === "string";
        throw error;
      }
      if (!payload || !["added", "already_present", "needs_verification", "not_submitted"].includes(payload.status) || typeof payload.message !== "string")
        throw new Error("NXT did not return a complete confirmation.");
      return payload;
    })();
    return await Promise.race([request, interrupted]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}
