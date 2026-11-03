let pending = 0;
const listeners = new Set();
export const pendingAppWrites = () => pending;
export function subscribeAppWrites(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function publish() {
  for (const listener of listeners) {
    try { listener(); } catch { /* UI observers cannot prevent an app save. */ }
  }
}

export async function trackAppWrite(input, init, send) {
  let tracked = false;
  if (typeof window !== "undefined") {
    try {
      const request = input && typeof input === "object" && "url" in input ? input : null;
      const url = new URL(request?.url || String(input), window.location.origin);
      const method = String(init?.method || request?.method || "GET").toUpperCase();
      tracked = url.origin === window.location.origin && url.pathname.startsWith("/api/") &&
        url.pathname !== "/api/app-release/reload" && !["GET", "HEAD", "OPTIONS"].includes(method);
    } catch { /* Invalid input remains the native fetch's responsibility. */ }
  }
  if (tracked) { pending++; publish(); }
  try { return await send(); }
  finally { if (tracked) { pending--; publish(); } }
}
