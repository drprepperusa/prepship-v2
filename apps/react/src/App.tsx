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

type ViewType = 'orders' | 'inventory' | 'locations' | 'packages' | 'rates' | 'analysis' | 'settings' | 'billing'
type OrderStatus = 'awaiting_shipment' | 'shipped' | 'cancelled'

function App() {
  const [currentView, setCurrentView] = useState<ViewType>('orders')
  const [currentStatus, setCurrentStatus] = useState<OrderStatus>('awaiting_shipment')
  const [selectedOrders, setSelectedOrders] = useState<Set<number>>(new Set())
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const handleShowView = (view: ViewType) => {
    setCurrentView(view)
    setMobileMenuOpen(false)
  }

  const handleSelectStatus = (status: OrderStatus) => {
    setCurrentStatus(status)
  }

  const renderView = () => {
    switch (currentView) {
      case 'orders':
        return <OrdersView status={currentStatus} selectedOrders={selectedOrders} setSelectedOrders={setSelectedOrders} />
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
        return <OrdersView status={currentStatus} selectedOrders={selectedOrders} setSelectedOrders={setSelectedOrders} />
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
          mobileMenuOpen={mobileMenuOpen}
          onToggleMobileMenu={() => setMobileMenuOpen(!mobileMenuOpen)}
        />
        
        {renderView()}
      </div>
    </div>
  )
}

export default App
