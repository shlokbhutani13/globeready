export function capNewsBySource(items = [], perSourceCap = 6) {
  const counts = new Map();
  return items.filter((item) => {
    if (!item?.autoIngested) return true;
    const source = item.sourceId || item.publisher || "unknown";
    const count = counts.get(source) || 0;
    if (count >= perSourceCap) return false;
    counts.set(source, count + 1);
    return true;
  });
}
