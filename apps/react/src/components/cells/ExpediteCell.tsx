import type { Rate } from '../../types/orders';
import { getExpedited } from '../../utils/orders';

interface ExpediateCellProps {
  rate?: Rate;
}

export default function ExpediteCell({ rate }: ExpediateCellProps) {
  if (!rate) {
    return <td className="col-expedite">—</td>;
  }

  const expedited = getExpedited(rate.serviceCode);
  if (!expedited) {
    return <td className="col-expedite">—</td>;
  }

  const bgColor = expedited === '1-day' ? '#ff6b6b' : '#4ecdc4';
  const label = expedited === '1-day' ? '1-Day' : '2-Day';

  return (
    <td className="col-expedite" style={{ textAlign: 'center' }}>
      <span
        style={{
          display: 'inline-block',
          padding: '2px 6px',
          borderRadius: '3px',
          backgroundColor: bgColor,
          color: '#fff',
          fontSize: '10px',
          fontWeight: 'bold'
        }}
      >
        {label}
      </span>
    </td>
  );
}
