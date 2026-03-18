export function buildShippedOrdersCacheKey(storeId, page, range) {
  const scope = serializeDateRange(range);
  return `prepship_shipped_${storeId || 'all'}_p${page || 1}_${scope}`;
}

function serializeDateRange(range) {
  const start = serializeDateBoundary(range?.start);
  const end = serializeDateBoundary(range?.end);
  return `${start}_${end}`;
}

function serializeDateBoundary(value) {
  if (!(value instanceof Date)) return 'all';
  if (Number.isNaN(value.getTime())) return 'all';
  return value.toISOString();
}
