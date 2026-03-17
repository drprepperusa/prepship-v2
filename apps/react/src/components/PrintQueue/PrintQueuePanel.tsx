/**
 * PrintQueuePanel — Print queue modal
 * 
 * DB-first (via QueueContext), localStorage as cache
 * Ctrl+P shortcut, Print All HTML, Group by SKU
 * Async PDF merge with progress polling
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useQueue } from './QueueContext'
import type { QueueItem } from './QueueContext'

type MergeState =
  | { status: 'idle' }
  | { status: 'starting' }
  | { status: 'polling'; jobId: string; progress: number }
  | { status: 'done' }
  | { status: 'error'; message: string }

export default function PrintQueuePanel() {
  const { queue, isOpen, setIsOpen, removeFromQueue, markPrinted, clearPrinted, clearAll, refreshQueue } = useQueue()
  const [groupBySku, setGroupBySku] = useState(false)
  const [printingSingle, setPrintingSingle] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [mergeState, setMergeState] = useState<MergeState>({ status: 'idle' })
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const blobUrlRef = useRef<string | null>(null)

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
    }
  }, [])

  // Keyboard: Ctrl+P opens queue
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

  const displayQueue = showHistory ? queue : queue.filter(q => q.status !== 'printed')
  const pendingCount = queue.filter(q => q.status === 'pending').length
  const printedCount = queue.filter(q => q.status === 'printed').length

  // ── Print Single ───────────────────────────────────────────────────────────

  const handlePrintSingle = async (item: QueueItem) => {
    setPrintingSingle(item.queueId)
    try {
      if (item.labelUrl) window.open(item.labelUrl, '_blank')
      markPrinted(item.queueId)
    } catch (err) {
      console.error('Print failed:', err)
    } finally {
      setPrintingSingle(null)
    }
  }

  // ── Print All (HTML window) ────────────────────────────────────────────────

  const handlePrintAll = () => {
    const pending = queue.filter(q => q.status === 'pending')
    if (pending.length === 0) return

    const printHtml = `<!DOCTYPE html>
<html>
<head>
  <title>Print Queue — ${new Date().toLocaleDateString()}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    h2 { font-size: 16px; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #f0f4f8; padding: 8px 12px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.4px; border-bottom: 2px solid #ddd; }
    td { padding: 8px 12px; border-bottom: 1px solid #eee; font-size: 13px; }
    .order-num { font-family: monospace; color: #2563eb; font-weight: 700; }
    .sku { color: #555; font-size: 12px; }
    .footer { margin-top: 16px; font-size: 12px; color: #666; }
    @media print { body { margin: 0; } }
  </style>
</head>
<body>
  <h2>Print Queue — ${new Date().toLocaleDateString()}</h2>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Order #</th>
        <th>SKU</th>
        <th>Qty</th>
        <th>Notes</th>
      </tr>
    </thead>
    <tbody>
      ${pending.map((item, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td class="order-num">${item.orderNumber}</td>
        <td class="sku">${item.sku || '—'}</td>
        <td>${item.quantity}</td>
        <td>${item.notes || ''}</td>
      </tr>`).join('')}
    </tbody>
  </table>
  <p class="footer">Total: ${pending.length} labels · Generated ${new Date().toLocaleString()}</p>
</body>
</html>`

    const win = window.open('', '_blank', 'width=800,height=600')
    if (win) {
      win.document.write(printHtml)
      win.document.close()
      win.focus()
      setTimeout(() => {
        win.print()
        pending.forEach(item => markPrinted(item.queueId))
      }, 500)
    }
  }

  // ── Async PDF Merge ────────────────────────────────────────────────────────

  const pollMergeStatus = useCallback(async (jobId: string) => {
    try {
      const res = await fetch(`/api/queue/print/status/${jobId}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()

      if (data.status === 'done' || data.status === 'complete') {
        setMergeState({ status: 'done' })
        // Download
        const dlRes = await fetch(`/api/queue/print/download/${jobId}`)
        if (dlRes.ok) {
          const blob = await dlRes.blob()
          if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
          const url = URL.createObjectURL(blob)
          blobUrlRef.current = url
          const a = document.createElement('a')
          a.href = url
          a.download = `queue-labels-${new Date().toISOString().slice(0,10)}.pdf`
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
        }
        queue.filter(q => q.status === 'pending').forEach(item => markPrinted(item.queueId))
        setMergeState({ status: 'idle' })
      } else if (data.status === 'error') {
        setMergeState({ status: 'error', message: data.message || 'Merge failed' })
      } else {
        // Still running
        const progress = typeof data.progress === 'number' ? data.progress : 50
        setMergeState({ status: 'polling', jobId, progress })
        pollTimerRef.current = setTimeout(() => pollMergeStatus(jobId), 600)
      }
    } catch (e: unknown) {
      setMergeState({ status: 'error', message: (e as Error).message || 'Failed to poll status' })
    }
  }, [queue, markPrinted])

  const handleMergePDF = async () => {
    const pending = queue.filter(q => q.status === 'pending' && q.labelUrl)
    if (pending.length === 0) return

    setMergeState({ status: 'starting' })
    try {
      const res = await fetch('/api/queue/print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ labelUrls: pending.map(i => i.labelUrl) }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (data.jobId) {
        setMergeState({ status: 'polling', jobId: data.jobId, progress: 0 })
        void pollMergeStatus(data.jobId)
      } else if (data.url || data.downloadUrl) {
        // Immediate download
        window.open(data.url || data.downloadUrl, '_blank')
        setMergeState({ status: 'idle' })
      }
    } catch (e: unknown) {
      setMergeState({ status: 'error', message: (e as Error).message })
    }
  }

  // ── Grouped render ─────────────────────────────────────────────────────────

  const renderItems = () => {
    if (!groupBySku) {
      return (
        <tbody>
          {displayQueue.map(item => renderRow(item))}
        </tbody>
      )
    }

    // Group by SKU
    const groups: Record<string, QueueItem[]> = {}
    displayQueue.forEach(item => {
      const key = item.sku || 'no-sku'
      if (!groups[key]) groups[key] = []
      groups[key].push(item)
    })

    return (
      <tbody>
        {Object.entries(groups).map(([sku, items]) => (
          <>
            <tr key={`group-${sku}`} style={{ backgroundColor: 'var(--surface2)' }}>
              <td colSpan={7} style={{ padding: '6px 10px', fontWeight: 700, fontSize: 11, color: 'var(--text)', borderBottom: '1px solid var(--border)' }}>
                📦 {sku === 'no-sku' ? 'No SKU' : sku} — {items.reduce((s, i) => s + i.quantity, 0)} units ({items.length} orders)
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
      <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
        <span style={{ fontFamily: 'monospace', color: 'var(--ss-blue)', fontWeight: 600 }}>{item.orderNumber}</span>
      </td>
      <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--text2)' }}>
        {item.sku || '—'}
      </td>
      <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', fontSize: 11, textAlign: 'center' }}>
        {item.quantity}
      </td>
      <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', fontSize: 11 }}>
        {item.status === 'printed'
          ? <span style={{ color: '#16a34a', fontWeight: 600, fontSize: 10 }}>✅ Printed{item.printCount && item.printCount > 1 ? ` (×${item.printCount})` : ''}</span>
          : <span style={{ color: 'var(--text3)', fontSize: 10 }}>Pending</span>}
      </td>
      <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--text3)' }}>
        {item.notes || '—'}
      </td>
      <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {item.status !== 'printed' && (
            <button
              onClick={() => handlePrintSingle(item)}
              disabled={printingSingle === item.queueId}
              style={{ padding: '3px 8px', fontSize: 10, background: 'var(--ss-blue)', color: '#fff', border: 'none', borderRadius: 3, cursor: 'pointer' }}
            >
              {printingSingle === item.queueId ? '⏳' : '🖨️'}
            </button>
          )}
          <button
            onClick={() => removeFromQueue(item.queueId)}
            style={{ padding: '3px 8px', fontSize: 10, background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 3, cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>
      </td>
    </tr>
  )

  const isMerging = mergeState.status === 'polling' || mergeState.status === 'starting'

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9500, backgroundColor: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={() => setIsOpen(false)}
    >
      <div
        style={{ backgroundColor: 'var(--surface)', borderRadius: 10, boxShadow: 'var(--shadow-lg)', width: 820, maxWidth: '95vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '14px 16px', borderBottom: '2px solid var(--ss-blue)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div style={{ fontSize: 26 }}>🖨️</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800 }}>Print Queue</div>
            <div style={{ fontSize: 11, color: 'var(--text2)' }}>
              {pendingCount} pending · {printedCount} printed
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, cursor: 'pointer' }}>
              <input type="checkbox" checked={groupBySku} onChange={e => setGroupBySku(e.target.checked)} />
              Group by SKU
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, cursor: 'pointer' }}>
              <input type="checkbox" checked={showHistory} onChange={e => { setShowHistory(e.target.checked); void refreshQueue() }} />
              Show History
            </label>
            <button
              onClick={clearPrinted}
              disabled={printedCount === 0}
              style={{ padding: '5px 10px', fontSize: 11, background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 4, cursor: 'pointer', color: 'var(--text2)', opacity: printedCount === 0 ? 0.5 : 1 }}
            >
              Clear printed
            </button>
            <button
              onClick={handlePrintAll}
              disabled={pendingCount === 0}
              style={{ padding: '5px 14px', fontSize: 12, fontWeight: 700, background: 'var(--ss-blue)', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', opacity: pendingCount === 0 ? 0.5 : 1 }}
            >
              🖨️ Print All ({pendingCount})
            </button>
            <button
              onClick={handleMergePDF}
              disabled={pendingCount === 0 || isMerging}
              style={{ padding: '5px 14px', fontSize: 12, fontWeight: 700, background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', opacity: pendingCount === 0 || isMerging ? 0.5 : 1 }}
            >
              {isMerging ? '⏳ Merging…' : '📄 Merge PDF'}
            </button>
            <button
              onClick={() => setIsOpen(false)}
              style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text3)' }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* PDF merge progress */}
        {mergeState.status === 'polling' && (
          <div style={{ padding: '8px 16px', background: '#f3e8ff', borderBottom: '1px solid #e9d5ff', flexShrink: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#7c3aed', marginBottom: 4 }}>⏳ Merging PDFs… {mergeState.progress}%</div>
            <div style={{ height: 4, background: '#e9d5ff', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: '#7c3aed', width: `${mergeState.progress}%`, transition: 'width .3s' }} />
            </div>
          </div>
        )}

        {mergeState.status === 'error' && (
          <div style={{ padding: '8px 16px', background: '#fef2f2', borderBottom: '1px solid #fecaca', fontSize: 11, color: '#dc2626', flexShrink: 0 }}>
            ❌ Merge failed: {mergeState.message}
            <button onClick={() => setMergeState({ status: 'idle' })} style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', textDecoration: 'underline', fontSize: 11 }}>Dismiss</button>
          </div>
        )}

        {/* Table */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {displayQueue.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--text3)' }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>🖨️</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{showHistory ? 'No history' : 'Queue is empty'}</div>
              <div style={{ fontSize: 12 }}>Add orders from the order panel</div>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Order #', 'SKU', 'Qty', 'Status', 'Notes', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--text3)', borderBottom: '2px solid var(--border)', background: 'var(--surface2)', position: 'sticky', top: 0 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              {renderItems()}
            </table>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div style={{ fontSize: 11, color: 'var(--text3)' }}>
            Ctrl+P to open · Esc to close
          </div>
          <button
            onClick={() => clearAll()}
            style={{ padding: '4px 10px', fontSize: 11, background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 4, cursor: 'pointer' }}
          >
            Clear All
          </button>
        </div>
      </div>
    </div>
  )
}
