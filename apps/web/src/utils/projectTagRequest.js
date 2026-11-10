export const PROJECT_TAG_REQUEST_TIMEOUT_MS = 30000;

export async function requestProjectTags(endpoint, { signal, ...options } = {}) {
  if (signal?.aborted) throw new DOMException("Request cancelled", "AbortError");
  const controller = new AbortController();
  const writing = options.method === "POST";
  const fallback = writing
    ? "Tag changes could not be confirmed. Reload the project before trying again."
    : "Project tags could not be loaded. Reload the project to try again.";
  let timer, cancel;
  const interrupted = new Promise((_, reject) => {
    cancel = () => {
      reject(new DOMException("Request cancelled", "AbortError"));
      controller.abort();
    };
    signal?.addEventListener("abort", cancel, { once: true });
    timer = setTimeout(() => {
      reject(new Error(writing
        ? "The tag save is taking longer than expected. It may have finished. Reload the project to check before trying again."
        : "Loading project tags took too long. Reload the project to try again."));
      controller.abort();
    }, PROJECT_TAG_REQUEST_TIMEOUT_MS);
  });
  try {
    // Bound both the response and its body; never automatically replay a write.
    const request = (async () => {
      const response = await fetch(endpoint, { ...options, cache: "no-store", signal: controller.signal });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data || typeof data !== "object" || Array.isArray(data))
        throw new Error(typeof data?.error === "string" ? data.error : fallback);
      return data;
    })();
    return await Promise.race([request, interrupted]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}
