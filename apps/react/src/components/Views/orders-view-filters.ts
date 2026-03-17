export type OrdersDateFilterValue =
  | ""
  | "this-month"
  | "last-month"
  | "last-30"
  | "last-90"
  | "custom"
  | "thisMonth"
  | "lastMonth"
  | "last30"
  | "last90";

interface DateRangeOptions {
  start?: string;
  end?: string;
}

interface FilterableOrderItem {
  sku?: string | null;
  name?: string | null;
}

interface FilterableOrder {
  orderNumber?: string | null;
  customerEmail?: string | null;
  shipTo?: {
    name?: string | null;
  } | null;
  items?: FilterableOrderItem[] | null;
}

export function getOrdersDateRange(
  preset: OrdersDateFilterValue,
  custom: DateRangeOptions = {},
  now: Date = new Date(),
): { start: Date | null; end: Date | null } | null {
  if (!preset) return null;

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const msPerDay = 24 * 60 * 60 * 1000;

  switch (preset) {
    case "last-30":
    case "last30":
      return {
        start: new Date(today.getTime() - 30 * msPerDay),
        end: now,
      };
    case "last-90":
    case "last90":
      return {
        start: new Date(today.getTime() - 90 * msPerDay),
        end: now,
      };
    case "this-month":
    case "thisMonth":
      return {
        start: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0),
        end: now,
      };
    case "last-month":
    case "lastMonth":
      return {
        start: new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0),
        end: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999),
      };
    case "custom":
      return {
        start: custom.start ? new Date(`${custom.start}T00:00:00`) : null,
        end: custom.end ? new Date(`${custom.end}T23:59:59`) : null,
      };
    default:
      return null;
  }
}

export function orderMatchesSearch(order: FilterableOrder, searchText: string): boolean {
  const query = searchText.trim().toLowerCase();
  if (!query) return true;

  return (
    String(order.orderNumber ?? "").toLowerCase().includes(query) ||
    String(order.shipTo?.name ?? "").toLowerCase().includes(query) ||
    String(order.customerEmail ?? "").toLowerCase().includes(query) ||
    (order.items ?? []).some((item) =>
      String(item.sku ?? "").toLowerCase().includes(query) ||
      String(item.name ?? "").toLowerCase().includes(query),
    )
  );
}

export function orderMatchesSku(order: FilterableOrder, skuFilter: string): boolean {
  if (!skuFilter || skuFilter === "all") return true;
  return (order.items ?? []).some((item) => item.sku === skuFilter);
}
