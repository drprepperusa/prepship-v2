import { useState, useEffect } from 'react'
import { useQueue } from './QueueContext'
import type { QueueItem } from './QueueContext'

export default function PrintQueuePanel() {
  const { queue, isOpen, setIsOpen, removeFromQueue, markPrinted, clearPrinted, clearAll, refreshQueue } = useQueue()
  const [groupBySku, setGroupBySku] = useState(false)
  const [printing, setPrinting] = useState<string | null>(null)

  // Keyboard shortcut: Ctrl+P opens queue
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault()
        setIsOpen(true)
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, setIsOpen])

  if (!isOpen) return null

  const handlePrintSingle = async (item: QueueItem) => {
    setPrinting(item.queueId)
    try {
      await fetch('/api/labels/print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ labelId: item.labelId, orderId: item.orderId }),
      })
      markPrinted(item.queueId)
      if (item.labelUrl) window.open(item.labelUrl, '_blank')
    } catch (err) {
      console.error('Print failed:', err)
    } finally {
      setPrinting(null)
    }
  }

  const handlePrintAll = () => {
    const pending = queue.filter(q => q.status === 'pending')
    if (pending.length === 0) return

    // Build print HTML
    const printHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Print Queue</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          table { width: 100%; border-collapse: collapse; }
          th { background: #f0f4f8; padding: 8px 12px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.4px; border-bottom: 2px solid #ddd; }
          td { padding: 8px 12px; border-bottom: 1px solid #eee; font-size: 13px; }
          .label-num { font-family: monospace; color: #2563eb; }
          @media print { body { margin: 0; } }
        </style>
      </head>
      <body>
        <h2 style="margin-bottom: 16px;">Print Queue — ${new Date().toLocaleDateString()}</h2>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Order #</th>
              <th>SKU</th>
              <th>Qty</th>
              <th>Label #</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            ${pending.map((item, idx) => `
              <tr>
                <td>${idx + 1}</td>
                <td>${item.orderNumber}</td>
                <td>${item.sku || '—'}</td>
                <td>${item.quantity}</td>
                <td class="label-num">${item.labelId || '—'}</td>
                <td>${item.notes || ''}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <p style="margin-top: 16px; font-size: 12px; color: #666;">Total: ${pending.length} labels</p>
      </body>
      </html>
    `

    const win = window.open('', '_blank', 'width=800,height=600')
    if (win) {
      win.document.write(printHtml)
      win.document.close()
      win.focus()
      setTimeout(() => {
        win.print()
        // Mark all as printed
        pending.forEach(item => markPrinted(item.queueId))
      }, 500)
    }
  }

  // Group by SKU if enabled
  const renderItems = () => {
    if (!groupBySku) {
      return (
        <tbody>
          {queue.map(item => renderRow(item))}
        </tbody>
      )
    }

    // Group by SKU
    const groups: Record<string, QueueItem[]> = {}
    queue.forEach(item => {
      const key = item.sku || 'no-sku'
      if (!groups[key]) groups[key] = []
      groups[key].push(item)
    })

    return (
      <tbody>
        {Object.entries(groups).map(([sku, items]) => (
          <>
            <tr key={`group-${sku}`} style={{ backgroundColor: 'var(--surface2)' }}>
              <td colSpan={7} style={{
                padding: '6px 10px',
                fontWeight: '700',
                fontSize: '11px',
                color: 'var(--text)',
                borderBottom: '1px solid var(--border)',
              }}>
                📦 {sku === 'no-sku' ? 'No SKU' : sku} — {items.reduce((s, i) => s + i.quantity, 0)} units
              </td>
            </tr>
            {items.map(item => renderRow(item))}
          </>
        ))}
      </tbody>
    )
  }

  const renderRow = (item: QueueItem) => (
    <tr
      key={item.queueId}
      style={{
        opacity: item.status === 'printed' ? 0.5 : 1,
        backgroundColor: item.status === 'printed' ? '#f0fdf4' : 'transparent',
      }}
    >
      <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', fontSize: '12px' }}>
        <span style={{ fontFamily: 'monospace', color: 'var(--ss-blue)', fontWeight: '600' }}>
          {item.orderNumber}
        </span>
      </td>
      <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', fontSize: '11px', color: 'var(--text2)' }}>
        {item.sku || '—'}
      </td>
      <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', fontSize: '11px', textAlign: 'center' }}>
        {item.quantity}
      </td>
      <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', fontSize: '10px', fontFamily: 'monospace', color: 'var(--text3)' }}>
        {item.labelId || '—'}
      </td>
      <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', fontSize: '11px' }}>
        {item.status === 'printed' ? (
          <span style={{ color: '#16a34a', fontWeight: '600', fontSize: '10px' }}>✅ Printed</span>
        ) : (
          <span style={{ color: 'var(--text3)', fontSize: '10px' }}>Pending</span>
        )}
      </td>
      <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', fontSize: '11px', color: 'var(--text3)' }}>
        {item.notes || '—'}
      </td>
      <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', gap: '4px' }}>
          {item.status !== 'printed' && (
            <button
              onClick={() => handlePrintSingle(item)}
              disabled={printing === item.queueId}
              style={{
                padding: '3px 8px',
                fontSize: '10px',
                background: 'var(--ss-blue)',
                color: '#fff',
                border: 'none',
                borderRadius: '3px',
                cursor: 'pointer',
              }}
            >
              {printing === item.queueId ? '⏳' : '🖨️'}
            </button>
          )}
          <button
            onClick={() => removeFromQueue(item.queueId)}
            style={{
              padding: '3px 8px',
              fontSize: '10px',
              background: '#fef2f2',
              color: '#dc2626',
              border: '1px solid #fca5a5',
              borderRadius: '3px',
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>
      </td>
    </tr>
  )

  const pendingCount = queue.filter(q => q.status === 'pending').length
  const printedCount = queue.filter(q => q.status === 'printed').length

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9500,
        backgroundColor: 'rgba(0,0,0,.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={() => setIsOpen(false)}
    >
      <div
        style={{
          backgroundColor: 'var(--surface)',
          borderRadius: '10px',
          boxShadow: 'var(--shadow-lg)',
          width: '760px',
          maxWidth: '95vw',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '14px 16px', borderBottom: '2px solid var(--ss-blue)', display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          <div style={{ fontSize: '26px' }}>🖨️</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '15px', fontWeight: '800' }}>Print Queue</div>
            <div style={{ fontSize: '11px', color: 'var(--text2)' }}>
              {pendingCount} pending · {printedCount} printed
            </div>
          </div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', cursor: 'pointer' }}>
              <input type="checkbox" checked={groupBySku} onChange={e => setGroupBySku(e.target.checked)} />
              Group by SKU
            </label>
            <button
              onClick={clearPrinted}
              disabled={printedCount === 0}
              style={{
                padding: '5px 10px',
                fontSize: '11px',
                background: 'var(--surface2)',
                border: '1px solid var(--border2)',
                borderRadius: '4px',
                cursor: 'pointer',
                color: 'var(--text2)',
                opacity: printedCount === 0 ? 0.5 : 1,
              }}
            >
              Clear printed
            </button>
            <button
              onClick={handlePrintAll}
              disabled={pendingCount === 0}
              style={{
                padding: '5px 14px',
                fontSize: '12px',
                fontWeight: '700',
                background: 'var(--ss-blue)',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                opacity: pendingCount === 0 ? 0.5 : 1,
              }}
            >
              🖨️ Print All ({pendingCount})
            </button>
            <button
              onClick={() => setIsOpen(false)}
              style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--text3)' }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Table */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {queue.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--text3)' }}>
              <div style={{ fontSize: '40px', marginBottom: '10px' }}>🖨️</div>
              <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>Queue is empty</div>
              <div style={{ fontSize: '12px' }}>Add orders from the order panel</div>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Order #', 'SKU', 'Qty', 'Label #', 'Status', 'Notes', 'Actions'].map(h => (
                    <th key={h} style={{
                      padding: '8px 10px',
                      textAlign: 'left',
                      fontSize: '10px',
                      fontWeight: '700',
                      textTransform: 'uppercase',
                      letterSpacing: '0.4px',
                      color: 'var(--text3)',
                      borderBottom: '2px solid var(--border)',
                      background: 'var(--surface2)',
                      position: 'sticky',
                      top: 0,
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              {renderItems()}
            </table>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div style={{ fontSize: '11px', color: 'var(--text3)' }}>
            Ctrl+P to open · Esc to close
          </div>
          <button
            onClick={clearAll}
            style={{
              padding: '4px 10px',
              fontSize: '11px',
              background: '#fef2f2',
              color: '#dc2626',
              border: '1px solid #fca5a5',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Clear All
          </button>
        </div>
      </div>
    </div>
  )
}
