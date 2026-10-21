// The browser's AbortSignal does not cross HTTP into a server Request. Keep
// cancellation at this simulated transport boundary (jsdom and Node differ).
export function dispatchRequest(url, options, handler, context) {
  const { signal, ...init } = options || {};
  const abortReason = () => signal.reason ?? new DOMException("Request aborted", "AbortError");
  if (signal?.aborted) return Promise.reject(abortReason());
  const request = new Request(url, init);
  return new Promise((resolve, reject) => {
    const abort = () => reject(abortReason());
    signal?.addEventListener("abort", abort, { once: true });
    const finish = callback => value => {
      signal?.removeEventListener("abort", abort);
      callback(value);
    };
    Promise.resolve().then(() => {
      if (signal?.aborted) throw abortReason();
      return handler(request, context);
    }).then(finish(resolve), finish(reject));
  });
}
