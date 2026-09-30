import { AsyncLocalStorage } from "node:async_hooks";

const storage = new AsyncLocalStorage();

export class BackgroundReadPausedError extends Error {
  constructor() {
    super("Background maintenance paused at its safe request limit. Saved data remains available.");
    this.name = "BackgroundReadPausedError";
    // Existing summary loaders propagate throttling rather than save partial data.
    this.httpStatus = 429;
    this.quotaPaused = true;
    this.retryAfterMs = 10 * 60 * 1000;
  }
}

export function withBlackbaudReadBudget(reserve, callback) {
  return storage.run({ reserve, paused: false, tail: Promise.resolve() }, callback);
}

export function hasBlackbaudReadBudget() { return !!storage.getStore(); }

export async function reserveBlackbaudRead(method) {
  const context = storage.getStore();
  if (!context) return;
  // Serialize reservations within a summary's parallel optional sections.
  const next = context.tail.then(async () => {
    if (context.paused || String(method).toUpperCase() !== "GET") throw new BackgroundReadPausedError();
    try {
      if (!await context.reserve()) throw new BackgroundReadPausedError();
    } catch {
      context.paused = true;
      throw new BackgroundReadPausedError();
    }
  });
  context.tail = next.catch(() => {});
  return next;
}
