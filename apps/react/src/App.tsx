import { useState } from 'react'
import { StoresProvider } from './contexts/StoresContext'
import { MarkupsProvider } from './contexts/MarkupsContext'
import { ToastProvider } from './contexts/ToastContext'
import { StoreVisibilityProvider } from './contexts/StoreVisibilityContext'
import Sidebar from './components/Sidebar/Sidebar'
import OrdersView from './components/Views/OrdersView'
import './App.css'

type ViewType = 'orders' | 'inventory' | 'locations' | 'packages' | 'rates' | 'analysis' | 'settings' | 'billing' | 'manifests'
type OrderStatus = 'awaiting_shipment' | 'shipped' | 'cancelled'

export default function App() {
  const [currentView, setCurrentView] = useState<ViewType>('orders')
  const [currentStatus, setCurrentStatus] = useState<OrderStatus>('awaiting_shipment')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [activeStore, setActiveStore] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [dateFilter, setDateFilter] = useState<'' | 'this-month' | 'last-month' | 'last-30' | 'last-90' | 'custom'>('')

  const handleCloseMobileMenu = () => setMobileMenuOpen(false)

  return (
    <ToastProvider>
      <StoresProvider>
        <MarkupsProvider>
          <StoreVisibilityProvider>
            <div className="app-container">
              <button 
                className="mobile-menu-toggle"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                aria-label="Toggle menu"
              >
                ☰
              </button>
              
              <Sidebar 
                currentStatus={currentStatus}
                onSelectStatus={setCurrentStatus}
                onShowView={setCurrentView}
                mobileMenuOpen={mobileMenuOpen}
                onCloseMobileMenu={handleCloseMobileMenu}
                onSearch={setSearchQuery}
                onSelectStore={setActiveStore}
                activeStore={activeStore}
                dateFilter={dateFilter}
              />
              
              <main className="main-content">
                {currentView === 'orders' && (
                  <OrdersView 
                    searchQuery={searchQuery}
                    activeStore={activeStore}
                    dateFilter={dateFilter}
                    onDateFilterChange={setDateFilter}
                  />
                )}
                
                {currentView !== 'orders' && (
                  <div className="view-placeholder">
                    <p>{currentView.charAt(0).toUpperCase() + currentView.slice(1)} view coming soon...</p>
                  </div>
                )}
              </main>
            </div>
          </StoreVisibilityProvider>
        </MarkupsProvider>
      </StoresProvider>
    </ToastProvider>
  )
}
