import { useEffect, useCallback, useRef } from 'react'

interface KeyboardShortcutsOptions {
  selectedOrderIds?: number[]
  orders?: any[]
  onOpenPrintQueue?: () => void
  onCloseAll?: () => void
  onConfirm?: () => void
}

export function useKeyboardShortcuts(options: KeyboardShortcutsOptions = {}) {
  const { selectedOrderIds = [], orders = [], onOpenPrintQueue, onCloseAll, onConfirm } = options
  const confirmBtnRef = useRef<HTMLButtonElement | null>(null)

  // Update ref when modal confirm button appears
  useEffect(() => {
    const updateConfirmBtnRef = () => {
      confirmBtnRef.current = document.querySelector('.modal-confirm-btn') as HTMLButtonElement
    }
    
    const observer = new MutationObserver(updateConfirmBtnRef)
    observer.observe(document.body, { childList: true, subtree: true })
    
    return () => {
      observer.disconnect()
    }
  }, [])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const target = e.target as HTMLElement
    // Skip if in an input/textarea
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return

    const ctrl = e.ctrlKey || e.metaKey

    // Ctrl+C: Copy order number
    if (ctrl && e.key === 'c' && selectedOrderIds.length > 0) {
      const orderNums = selectedOrderIds.map(id => {
        const o = orders.find((o: any) => o.orderId === id)
        return o?.orderNumber || String(id)
      }).join('\n')
      navigator.clipboard.writeText(orderNums).catch(() => {})
      e.preventDefault()
      return
    }

    // Ctrl+P: Open print queue
    if (ctrl && e.key === 'p') {
      e.preventDefault()
      onOpenPrintQueue?.()
      return
    }

    // Esc: Close modals/panels
    if (e.key === 'Escape') {
      onCloseAll?.()
      return
    }

    // Enter: Confirm action
    if (e.key === 'Enter' && !ctrl && !e.shiftKey) {
      if (confirmBtnRef.current) {
        confirmBtnRef.current.click()
        e.preventDefault()
      }
      onConfirm?.()
      return
    }
  }, [selectedOrderIds, orders, onOpenPrintQueue, onCloseAll, onConfirm])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])
}
