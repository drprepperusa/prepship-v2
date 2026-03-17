import { ageHours, ageColor, ageDisplay } from '../../utils/orders';

interface AgeCellProps {
  createdAt: string;
}

export default function AgeCell({ createdAt }: AgeCellProps) {
  const color = ageColor(createdAt);
  const display = ageDisplay(createdAt);

  const bgColor = {
    red: 'rgba(220, 53, 69, 0.1)',
    orange: 'rgba(255, 193, 7, 0.1)',
    green: 'rgba(40, 167, 69, 0.1)'
  }[color];

  const textColor = {
    red: '#dc3545',
    orange: '#ffc107',
    green: '#28a745'
  }[color];

  return (
    <td
      className="col-age"
      style={{
        backgroundColor: bgColor,
        color: textColor,
        fontWeight: '500',
        fontSize: '12px',
        textAlign: 'center'
      }}
    >
      {display}
    </td>
  );
}
