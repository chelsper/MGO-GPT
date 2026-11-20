export async function requestProjectOutreach(
  endpoint,
  { signal, ...options } = {},
) {
  if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
  const controller = new AbortController();
  let timer, cancel;
  const deadline = new Promise((_, reject) => {
    cancel = () => {
      controller.abort();
      reject(new DOMException("Cancelled", "AbortError"));
    };
    signal?.addEventListener("abort", cancel, { once: true });
    timer = setTimeout(() => {
      controller.abort();
      reject(
        new Error(
          options.method === "POST"
            ? "This change may still be finishing. Reload saved outreach before trying again; nothing will be automatically resubmitted."
            : "Saved outreach took too long to load. Try reloading saved outreach.",
        ),
      );
    }, 60000);
  });
  try {
    return await Promise.race([
      deadline,
      (async () => {
        const response = await fetch(endpoint, {
          ...options,
          cache: "no-store",
          signal: controller.signal,
        });
        const body = await response.json();
        if (!response.ok)
          throw new Error(
            body?.error ||
              "Outreach could not finish. Reload saved status before continuing.",
          );
        if (!body || typeof body !== "object" || Array.isArray(body))
          throw new Error(
            "Outreach returned incomplete status. Reload saved outreach.",
          );
        return body;
      })(),
    ]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}
