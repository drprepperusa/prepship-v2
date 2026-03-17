import { useState } from 'react'

interface BatchPanelProps {
  selectedOrderIds: number[]
  onClose: () => void
}

export default function BatchPanel({ selectedOrderIds, onClose }: BatchPanelProps) {
  const [isProcessing, setIsProcessing] = useState(false)
  const [status, setStatus] = useState<string>('')

  const handleBatchCreateLabels = async () => {
    setIsProcessing(true)
    setStatus('Creating labels for ' + selectedOrderIds.length + ' orders…')
    try {
      const response = await fetch('/api/batch/create-labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIds: selectedOrderIds }),
      })
      if (response.ok) {
        setStatus('✓ Labels created successfully')
        setTimeout(() => onClose(), 1500)
      } else {
        setStatus('✗ Failed to create labels')
      }
    } catch (error) {
      setStatus('✗ Error: ' + (error as Error).message)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleBatchMarkShipped = async () => {
    setIsProcessing(true)
    setStatus('Marking ' + selectedOrderIds.length + ' orders as shipped…')
    try {
      const response = await fetch('/api/batch/mark-shipped', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIds: selectedOrderIds }),
      })
      if (response.ok) {
        setStatus('✓ Orders marked shipped')
        setTimeout(() => onClose(), 1500)
      } else {
        setStatus('✗ Failed to mark orders')
      }
    } catch (error) {
      setStatus('✗ Error: ' + (error as Error).message)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleBatchExport = async () => {
    setIsProcessing(true)
    setStatus('Exporting CSV…')
    try {
      const response = await fetch('/api/batch/export-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIds: selectedOrderIds }),
      })
      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `orders-${new Date().toISOString().split('T')[0]}.csv`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
        setStatus('✓ CSV downloaded')
        setTimeout(() => onClose(), 1500)
      } else {
        setStatus('✗ Failed to export')
      }
    } catch (error) {
      setStatus('✗ Error: ' + (error as Error).message)
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 9000,
      backgroundColor: 'rgba(0,0,0,.45)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div style={{
        backgroundColor: 'var(--surface)',
        borderRadius: '10px',
        boxShadow: 'var(--shadow-lg)',
        width: '500px',
        maxWidth: '95vw',
        padding: '24px',
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text)', margin: 0 }}>
            Batch Operations
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '20px',
              cursor: 'pointer',
              color: 'var(--text3)',
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ marginBottom: '12px', padding: '10px', backgroundColor: 'var(--surface2)', borderRadius: '6px' }}>
          <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text)' }}>
            {selectedOrderIds.length} order{selectedOrderIds.length !== 1 ? 's' : ''} selected
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>
            Order IDs: {selectedOrderIds.slice(0, 5).join(', ')}{selectedOrderIds.length > 5 ? '…' : ''}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
          <button
            onClick={handleBatchCreateLabels}
            disabled={isProcessing}
            style={{
              padding: '10px',
              backgroundColor: 'var(--ss-blue)',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
              opacity: isProcessing ? 0.7 : 1,
              transition: 'all 0.15s',
            }}
            onMouseOver={(e) => !isProcessing && (e.currentTarget.style.background = 'var(--ss-blue2)')}
            onMouseOut={(e) => (e.currentTarget.style.background = 'var(--ss-blue)')}
          >
            🖨️ Create Labels
          </button>

          <button
            onClick={handleBatchMarkShipped}
            disabled={isProcessing}
            style={{
              padding: '10px',
              backgroundColor: 'var(--green)',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
              opacity: isProcessing ? 0.7 : 1,
              transition: 'all 0.15s',
            }}
            onMouseOver={(e) => !isProcessing && (e.currentTarget.style.background = 'var(--green2)')}
            onMouseOut={(e) => (e.currentTarget.style.background = 'var(--green)')}
          >
            ✓ Mark Shipped
          </button>

          <button
            onClick={handleBatchExport}
            disabled={isProcessing}
            style={{
              padding: '10px',
              backgroundColor: 'var(--surface2)',
              color: 'var(--text)',
              border: '1px solid var(--border2)',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
              opacity: isProcessing ? 0.7 : 1,
              transition: 'all 0.15s',
            }}
            onMouseOver={(e) => !isProcessing && (e.currentTarget.style.background = 'var(--surface3)')}
            onMouseOut={(e) => (e.currentTarget.style.background = 'var(--surface2)')}
          >
            📥 Export CSV
          </button>
        </div>

        {status && (
          <div style={{
            padding: '8px 12px',
            borderRadius: '6px',
            backgroundColor: status.startsWith('✓') ? 'var(--green-bg)' : 'var(--red-bg)',
            color: status.startsWith('✓') ? 'var(--green-dark)' : 'var(--red)',
            fontSize: '12px',
            marginBottom: '12px',
          }}>
            {status}
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            disabled={isProcessing}
            style={{
              padding: '8px 16px',
              backgroundColor: 'var(--surface2)',
              color: 'var(--text)',
              border: '1px solid var(--border2)',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: '600',
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
