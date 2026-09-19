/**
 * Map items with at most `limit` tasks in flight, preserving input order in the
 * results. Unlike Promise.all over every item, a page with many remote assets
 * never opens more connections than the limit allows.
 */
export const mapWithConcurrency = async <Item, Result>(
  items: readonly Item[],
  limit: number,
  task: (item: Item) => Promise<Result>,
): Promise<Result[]> => {
  const results = new Array<Result>(items.length);
  let cursor = 0;

  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;

      results[index] = await task(items[index] as Item);
    }
  };

  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker);

  await Promise.all(workers);

  return results;
};
