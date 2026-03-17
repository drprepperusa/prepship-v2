import { useContext } from 'react'
import type { ToastType } from '../contexts/ToastContext'
import { ToastContext } from '../contexts/ToastContext'

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within ToastProvider')
  }

  const showToast = (message: string, type: ToastType = 'info') => {
    context.addToast(message, type)
  }

  return { showToast }
}
