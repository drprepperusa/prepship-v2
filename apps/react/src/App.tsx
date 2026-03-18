import { useState } from 'react'
import './App.css'
import Sidebar from './components/Sidebar/Sidebar'
import Topbar from './components/Topbar/Topbar'
import OrdersView from './components/Views/OrdersView'
import InventoryView from './components/Views/InventoryView'
import LocationsView from './components/Views/LocationsView'
import PackagesView from './components/Views/PackagesView'
import RateShopView from './components/Views/RateShopView'
import AnalysisView from './components/Views/AnalysisView'
import SettingsView from './components/Views/SettingsView'
import BillingView from './components/Views/BillingView'
import ManifestsView from './components/Views/ManifestsView'
import BatchPanel from './components/BatchPanel/BatchPanel'
import PrintQueuePanel from './components/PrintQueue/PrintQueuePanel'
import { QueueProvider, useQueue } from './components/PrintQueue/QueueContext'
import { ToastProvider } from './contexts/ToastContext'
import { MarkupsProvider } from './contexts/MarkupsContext'
import { StoresProvider } from './contexts/StoresContext'
import { StoreVisibilityProvider } from './contexts/StoreVisibilityContext'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'

type ViewType = 'orders' | 'inventory' | 'locations' | 'packages' | 'rates' | 'analysis' | 'settings' | 'billing' | 'manifests'
type OrderStatus = 'awaiting_shipment' | 'shipped' | 'cancelled'

function AppInner() {
  const [currentView, setCurrentView] = useState<ViewType>('orders')
  const [currentStatus, setCurrentStatus] = useState<OrderStatus>('awaiting_shipment')
  const [selectedOrders, setSelectedOrders] = useState<Set<number>>(new Set())
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [showBatchPanel, setShowBatchPanel] = useState(false)
  const [allOrders, setAllOrders] = useState<any[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null)

  const { setIsOpen: setQueueOpen } = useQueue()

  // Keyboard shortcuts
  useKeyboardShortcuts({
    selectedOrderIds: Array.from(selectedOrders),
    orders: allOrders,
    onOpenPrintQueue: () => setQueueOpen(true),
    onCloseAll: () => {
      setShowBatchPanel(false)
    },
  })

  const handleShowView = (view: ViewType) => {
    setCurrentView(view)
    setMobileMenuOpen(false)
  }

  const handleSelectStatus = (status: OrderStatus) => {
    setCurrentStatus(status)
    setCurrentView('orders')
  }

  const handleSearch = (query: string) => {
    setSearchQuery(query)
    if (query) setCurrentView('orders')
  }

  const handleSelectStore = (clientId: number) => {
    setSelectedClientId(prev => prev === clientId ? null : clientId)
  }

  const handlePrintLabels = async (orderIds: number[]) => {
    if (!orderIds.length) return
    for (const orderId of orderIds) {
      try {
        const r = await fetch(`/api/labels/${orderId}/retrieve`)
        if (!r.ok) continue
        const data = await r.json()
        if (data.labelUrl) {
          window.open(data.labelUrl, '_blank')
          await new Promise(resolve => setTimeout(resolve, 200))
        }
      } catch (e) {
        console.error(`Failed to retrieve label for order ${orderId}:`, e)
      }
    }
  }

  const handlePrintBatch = () => {
    if (currentStatus === 'shipped') {
      void handlePrintLabels(Array.from(selectedOrders))
    } else {
      setShowBatchPanel(true)
    }
  }

  // Auto-show batch panel when 2+ orders selected
  const handleSetSelectedOrders = (orders: Set<number>) => {
    setSelectedOrders(orders)
    if (orders.size >= 2) {
      setShowBatchPanel(true)
    } else {
      setShowBatchPanel(false)
    }
  }

  const renderView = () => {
    switch (currentView) {
      case 'orders':
        return (
          <OrdersView
            status={currentStatus}
            selectedOrders={selectedOrders}
            setSelectedOrders={handleSetSelectedOrders}
            onOpenPanel={() => {}}
            onOrdersLoaded={setAllOrders}
            searchQuery={searchQuery}
            selectedClientId={selectedClientId}
          />
        )
      case 'inventory':
        return <InventoryView />
      case 'locations':
        return <LocationsView />
      case 'packages':
        return <PackagesView />
      case 'rates':
        return <RateShopView />
      case 'analysis':
        return <AnalysisView />
      case 'settings':
        return <SettingsView />
      case 'billing':
        return <BillingView />
      case 'manifests':
        return <ManifestsView />
      default:
        return (
          <OrdersView
            status={currentStatus}
            selectedOrders={selectedOrders}
            setSelectedOrders={handleSetSelectedOrders}
            onOpenPanel={() => {}}
            selectedClientId={selectedClientId}
          />
        )
    }
  }

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100%' }}>
      <div className="panel-backdrop" id="panelBackdrop"></div>

      <Sidebar
        currentStatus={currentStatus}
        onSelectStatus={handleSelectStatus}
        onShowView={handleShowView}
        mobileMenuOpen={mobileMenuOpen}
        onCloseMobileMenu={() => setMobileMenuOpen(false)}
        onSearch={handleSearch}
        onSelectStore={handleSelectStore}
        activeStore={selectedClientId}
      />

      <div className="main">
        <Topbar
          currentView={currentView}
          currentStatus={currentStatus}
          selectedOrdersCount={selectedOrders.size}
          onClearSelection={() => handleSetSelectedOrders(new Set())}
          onShowBatchPanel={() => setShowBatchPanel(true)}
          mobileMenuOpen={mobileMenuOpen}
          onToggleMobileMenu={() => setMobileMenuOpen(!mobileMenuOpen)}
          onOpenPrintQueue={() => setQueueOpen(true)}
          selectedOrderIds={Array.from(selectedOrders)}
          onPrintLabels={handlePrintLabels}
          onPrintBatch={handlePrintBatch}
        />

        {renderView()}

        {/* Batch Panel — right sidebar, only when 2+ selected */}
        {showBatchPanel && selectedOrders.size >= 2 && (
          <BatchPanel
            selectedOrderIds={Array.from(selectedOrders)}
            orders={allOrders}
            onClose={() => {
              setShowBatchPanel(false)
              handleSetSelectedOrders(new Set())
            }}
            onRefresh={() => {
              handleSetSelectedOrders(new Set())
              setShowBatchPanel(false)
            }}
          />
        )}

        {/* Print Queue Panel */}
        <PrintQueuePanel />
      </div>
    </div>
  )
}

function App() {
  return (
    <ToastProvider>
      <StoresProvider>
        <StoreVisibilityProvider>
          <MarkupsProvider>
            <QueueProvider>
              <AppInner />
            </QueueProvider>
          </MarkupsProvider>
        </StoreVisibilityProvider>
      </StoresProvider>
    </ToastProvider>
  )
}

export default App
