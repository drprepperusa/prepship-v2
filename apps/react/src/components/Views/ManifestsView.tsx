import { useState } from 'react'

export default function ManifestsView() {
  const [manifests] = useState<any[]>([])

  return (
    <div className="view-content">
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text)' }}>Manifests</h2>
        <button className="btn btn-primary btn-sm">+ Create Manifest</button>
      </div>

      <div style={{ background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border)', boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Manifest #', 'Date', 'Carrier', 'Orders', 'Status', 'Actions'].map(h => (
                <th key={h} style={{
                  padding: '8px 12px',
                  textAlign: 'left',
                  fontSize: '10px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '.4px',
                  color: 'var(--text3)',
                  borderBottom: '2px solid var(--border)',
                  background: 'var(--surface2)',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {manifests.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text3)', fontSize: '13px' }}>
                  <div style={{ fontSize: '32px', marginBottom: '8px' }}>📋</div>
                  <div>No manifests yet</div>
                  <div style={{ fontSize: '11px', marginTop: '4px' }}>Create a manifest to group shipments for carrier pickup</div>
                </td>
              </tr>
            ) : manifests.map((m: any, i) => (
              <tr key={i} style={{ cursor: 'pointer' }}>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', fontWeight: 700, color: 'var(--ss-blue)' }}>{m.id}</td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', fontSize: '12px' }}>{m.date}</td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>{m.carrier}</td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>{m.orderCount}</td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
                  <span style={{
                    background: 'var(--green-bg)', color: 'var(--green)',
                    border: '1px solid var(--green-border)', padding: '2px 8px',
                    borderRadius: '9px', fontSize: '10px', fontWeight: 700,
                  }}>{m.status}</span>
                </td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
                  <button className="btn btn-ghost btn-xs">📄 View</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
