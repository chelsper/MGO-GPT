export function normalizeInterruptedPortfolioItems(items) {
  return items.map((item) =>
    item.status === "processing" ? { ...item, status: "pending" } : item,
  );
}

export function selectPortfolioRefreshItems(
  items,
  { batchSize = 10, failedOnly = false } = {},
) {
  const eligibleStatus = failedOnly ? "failed" : "pending";
  return items
    .filter((item) => item.status === eligibleStatus)
    .sort((left, right) => Number(left.position) - Number(right.position))
    .slice(0, Math.max(1, Number(batchSize) || 10));
}

export async function runPortfolioRefreshBatch({
  items,
  concurrency = 2,
  processItem,
  releaseItem = async () => {},
}) {
  const results = new Array(items.length);
  let nextIndex = 0;
  let paused = false;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      const item = items[index];
      if (paused) {
        await releaseItem(item);
        results[index] = { status: "deferred" };
        continue;
      }

      const result = await processItem(item);
      results[index] = result;
      if (result?.status === "paused") paused = true;
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(Math.max(1, Number(concurrency) || 2), items.length) },
      () => worker(),
    ),
  );

  return { paused, results };
}
