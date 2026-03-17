import type { OrderDTO, Rate } from '../../types/orders';
import { getOrderDimensions, getOrderWeight } from '../../utils/orders';

interface RateCellProps {
  order: OrderDTO;
  rate?: Rate;
  loading?: boolean;
  markup?: number;
}

export default function RateCell({ order, rate, loading, markup = 0 }: RateCellProps) {
  const hasWeight = getOrderWeight(order) > 0;
  const dims = getOrderDimensions(order);
  const hasDims = !!dims;

  // State 1: Loading
  if (loading) {
    return (
      <td className="col-bestrate rate-loading" style={{ textAlign: 'center', color: '#666' }}>
        <span style={{ fontSize: '10px' }}>⟳</span>
      </td>
    );
  }

  // State 2: Missing dimensions
  if (!hasWeight || !hasDims) {
    return (
      <td className="col-bestrate rate-missing" style={{ color: '#999', fontSize: '12px' }}>
        + add dims
      </td>
    );
  }

  // State 3: No rate yet
  if (!rate) {
    return (
      <td className="col-bestrate rate-empty">—</td>
    );
  }

  // State 4: Rate available
  const basePrice = rate.amount;
  const markupAmt = markup > 0 ? basePrice * (markup / 100) : 0;
  const displayPrice = basePrice + markupAmt;

  return (
    <td className="col-bestrate rate-ready">
      <span style={{ fontSize: '12px' }}>
        ${basePrice.toFixed(2)}
        {markupAmt > 0 && (
          <span style={{ marginLeft: '4px', color: '#666', fontSize: '11px' }}>
            → ${displayPrice.toFixed(2)}
          </span>
        )}
      </span>
    </td>
  );
}
