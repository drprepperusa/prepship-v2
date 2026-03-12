export function buildOrdersQueryParams({ page = 1, pageSize = 50, orderStatus, storeId, range } = {}) {
  const params = new URLSearchParams({ pageSize: String(pageSize), page: String(page) });
  if (orderStatus) params.set('orderStatus', orderStatus);
  if (storeId) params.set('storeId', storeId);
  if (range?.start instanceof Date && !Number.isNaN(range.start.getTime())) {
    params.set('dateStart', range.start.toISOString());
  }
  if (range?.end instanceof Date && !Number.isNaN(range.end.getTime())) {
    params.set('dateEnd', range.end.toISOString());
  }
  return params;
}

export function didOrdersResponseChange(previous, next) {
  if (!previous || !next) return previous !== next;

  if ((previous.total || 0) !== (next.total || 0)) return true;
  if ((previous.pages || 0) !== (next.pages || 0)) return true;
  if ((previous.page || 0) !== (next.page || 0)) return true;

  const previousOrders = Array.isArray(previous.orders) ? previous.orders : [];
  const nextOrders = Array.isArray(next.orders) ? next.orders : [];

  if (previousOrders.length !== nextOrders.length) return true;

  const previousById = new Map(previousOrders.map((order) => [order?.orderId, JSON.stringify(order ?? null)]));

  for (const order of nextOrders) {
    const prior = previousById.get(order?.orderId);
    if (prior == null) return true;
    if (prior !== JSON.stringify(order ?? null)) return true;
  }

  return false;
}
