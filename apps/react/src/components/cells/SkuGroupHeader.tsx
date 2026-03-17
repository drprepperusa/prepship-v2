interface SkuGroupHeaderProps {
  sku: string;
  orderIds: number[];
  selectedOrders: Set<number>;
  onSelectGroup: (orderIds: number[], selected: boolean) => void;
}

export default function SkuGroupHeader({
  sku,
  orderIds,
  selectedOrders,
  onSelectGroup
}: SkuGroupHeaderProps) {
  const allSelected = orderIds.every(id => selectedOrders.has(id));
  const someSelected = orderIds.some(id => selectedOrders.has(id));

  const isIndeterminate = someSelected && !allSelected;

  return (
    <tr className="sku-group-header" style={{ backgroundColor: '#f5f5f5' }}>
      <td colSpan={20} style={{ padding: '8px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="checkbox"
            checked={allSelected}
            ref={el => {
              if (el) el.indeterminate = isIndeterminate;
            }}
            onChange={(e) => onSelectGroup(orderIds, e.target.checked)}
            style={{ cursor: 'pointer' }}
          />
          <span style={{ fontWeight: 'bold', fontSize: '12px' }}>
            SKU: <code style={{ fontFamily: 'monospace', fontSize: '11px' }}>{sku}</code>
            {' '}({orderIds.length} {orderIds.length === 1 ? 'order' : 'orders'})
          </span>
        </div>
      </td>
    </tr>
  );
}
