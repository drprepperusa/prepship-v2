import { useState } from 'react';
import type { OrderDTO, Rate } from '../../types/orders';
import { getOrderDimensions, getOrderWeight } from '../../utils/orders';
import { useMarkups } from '../../contexts/MarkupsContext';
import { applyCarrierMarkup, priceDisplay, isOrionRate } from '../../utils/markups';

interface RateCellProps {
  order: OrderDTO;
  rate?: Rate;
  loading?: boolean;
}

export default function RateCell({ order, rate, loading }: RateCellProps) {
  const { markups } = useMarkups();
  const [showTooltip, setShowTooltip] = useState(false);

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

  // State 4: Rate available — show with markup applied
  const baseCost = (rate.shipmentCost || 0) + (rate.otherCost || 0);
  const markedPrice = applyCarrierMarkup(rate, markups);
  const info = priceDisplay(rate, markups);
  const isOrion = isOrionRate(rate);

  return (
    <td
      className="col-bestrate rate-ready"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      style={{ position: 'relative' }}
    >
      <span style={{ fontSize: '12px', cursor: 'default' }}>
        {isOrion && (
          <div style={{ lineHeight: '1.3' }}>
            <strong style={{ color: 'var(--green)' }}>${markedPrice.toFixed(2)}</strong>
            <div style={{ fontSize: '10px', color: '#999' }}>${baseCost.toFixed(2)} cost</div>
          </div>
        )}
        {!isOrion && (
          <>
            <strong>${markedPrice.toFixed(2)}</strong>
            {info.markupAmount > 0.01 && (
              <span style={{ marginLeft: '4px', color: '#666', fontSize: '11px' }}>
                +${info.markupAmount.toFixed(2)}
              </span>
            )}
          </>
        )}
      </span>

      {showTooltip && info.markupAmount > 0.01 && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            padding: '4px 8px',
            fontSize: '11px',
            color: 'var(--text)',
            whiteSpace: 'nowrap',
            marginBottom: '4px',
            zIndex: 100
          }}
        >
          Base: ${info.basePrice.toFixed(2)} + Markup: ${info.markupAmount.toFixed(2)} = ${info.total.toFixed(2)}
        </div>
      )}
    </td>
  );
}
