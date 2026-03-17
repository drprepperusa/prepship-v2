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
import OrderPanel from './components/OrderPanel/OrderPanel'
import BatchPanel from './components/BatchPanel/BatchPanel'

type ViewType = 'orders' | 'inventory' | 'locations' | 'packages' | 'rates' | 'analysis' | 'settings' | 'billing'
type OrderStatus = 'awaiting_shipment' | 'shipped' | 'cancelled'

function App() {
  const [currentView, setCurrentView] = useState<ViewType>('orders')
  const [currentStatus, setCurrentStatus] = useState<OrderStatus>('awaiting_shipment')
  const [selectedOrders, setSelectedOrders] = useState<Set<number>>(new Set())
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [panelOrderId, setPanelOrderId] = useState<number | null>(null)
  const [showBatchPanel, setShowBatchPanel] = useState(false)

  const handleShowView = (view: ViewType) => {
    setCurrentView(view)
    setMobileMenuOpen(false)
  }

  const handleSelectStatus = (status: OrderStatus) => {
    setCurrentStatus(status)
  }

  const handleOpenPanel = (orderId: number) => {
    setPanelOrderId(orderId)
  }

  const handleClosePanel = () => {
    setPanelOrderId(null)
  }

  const renderView = () => {
    switch (currentView) {
      case 'orders':
        return <OrdersView status={currentStatus} selectedOrders={selectedOrders} setSelectedOrders={setSelectedOrders} onOpenPanel={handleOpenPanel} />
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
      default:
        return <OrdersView status={currentStatus} selectedOrders={selectedOrders} setSelectedOrders={setSelectedOrders} onOpenPanel={handleOpenPanel} />
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
      />
      
      <div className="main">
        <Topbar 
          currentView={currentView}
          currentStatus={currentStatus}
          selectedOrdersCount={selectedOrders.size}
          onClearSelection={() => setSelectedOrders(new Set())}
          onShowBatchPanel={() => setShowBatchPanel(true)}
          mobileMenuOpen={mobileMenuOpen}
          onToggleMobileMenu={() => setMobileMenuOpen(!mobileMenuOpen)}
        />
        
        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          <div style={{ flex: 1, overflow: 'auto' }}>
            {renderView()}
          </div>
          {currentView === 'orders' && panelOrderId && (
            <OrderPanel orderId={panelOrderId} onClose={handleClosePanel} />
          )}
        </div>

        {showBatchPanel && selectedOrders.size > 0 && (
          <BatchPanel 
            selectedOrderIds={Array.from(selectedOrders)} 
            onClose={() => setShowBatchPanel(false)}
          />
        )}
      </div>
    </div>
  )
}

export default App
