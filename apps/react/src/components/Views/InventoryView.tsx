import { useState, useEffect, useRef, useCallback } from 'react'
import { useToast } from '../../hooks/useToast'
import { useStoreVisibilityContext } from '../../contexts/StoreVisibilityContext'

// ── Types ────────────────────────────────────────────────────────────────────

interface InventoryItem {
  id: number
  clientId: number
  clientName: string
  sku: string
  name: string
  minStock: number
  active: boolean
  weightOz: number
  parentSkuId: number | null
  parentName: string | null
  baseUnitQty: number
  packageLength: number
  packageWidth: number
  packageHeight: number
  productLength: number
  productWidth: number
  productHeight: number
  packageId: number | null
  packageName: string | null
  units_per_pack: number
  cuFtOverride: number | null
  currentStock: number
  lastMovement: number | null
  imageUrl: string | null
  baseUnits: number
  status: 'ok' | 'low' | 'out'
}

interface ClientDto {
  clientId: number
  name: string
  contactName: string
  email: string
  phone: string
  storeIds: number[]
  rateSourceClientId: number | null
  rateSourceName: string
}

interface ParentSkuDto {
  parentSkuId: number
  clientId: number
  name: string
  sku?: string | null
  baseUnitQty?: number
}

interface LedgerEntry {
  id: number
  invSkuId: number
  type: string
  qty: number
  orderId: number | null
  note: string | null
  createdBy: string | null
  createdAt: number
  sku: string
  skuName: string
  clientId: number
  clientName: string
}

interface InventoryAlert {
  type: 'sku' | 'parent'
  id: number
  sku?: string
  name: string
  stock: number
  minStock: number
  parentSkuId: number | null
  status: 'out' | 'low'
}

interface PackageDto {
  packageId: number
  name: string
  source: string
  length: number
  width: number
  height: number
  unitCost?: number | null
}

type TabId = 'stock' | 'receive' | 'clients' | 'history'

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtWeight(oz: number): string {
  if (oz >= 16) return `${(oz / 16).toFixed(2)} lb`
  return `${oz} oz`
}

function getDateRangeLast30() {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 30)
  return {
    from: start.toISOString().split('T')[0],
    to: end.toISOString().split('T')[0],
  }
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function InventoryView() {
  const { showToast } = useToast()
  const [activeTab, setActiveTab] = useState<TabId>('stock')
  const [clients, setClients] = useState<ClientDto[]>([])
  const [stockData, setStockData] = useState<InventoryItem[]>([])
  const [parentSkus, setParentSkus] = useState<ParentSkuDto[]>([])
  const [packages, setPackages] = useState<PackageDto[]>([])
  const [alerts, setAlerts] = useState<InventoryAlert[]>([])
  const [loading, setLoading] = useState(false)
  const [showCreateParentSku, setShowCreateParentSku] = useState(false)
  const [selectedClientForParent, setSelectedClientForParent] = useState('')

  const loadClients = useCallback(async () => {
    try {
      const r = await fetch('/api/clients')
      if (r.ok) setClients(await r.json())
    } catch { setClients([]) }
  }, [])

  const loadStock = useCallback(async (clientId = '') => {
    try {
      const url = '/api/inventory' + (clientId ? `?clientId=${clientId}` : '')
      const r = await fetch(url)
      if (r.ok) setStockData(await r.json())
    } catch { setStockData([]) }
  }, [])

  const loadPackages = useCallback(async () => {
    try {
      const r = await fetch('/api/packages')
      if (r.ok) setPackages(await r.json())
    } catch { setPackages([]) }
  }, [])

  const loadAlerts = useCallback(async (clientId = '') => {
    try {
      const qs = clientId ? `?clientId=${clientId}` : ''
      const r = await fetch('/api/inventory/alerts' + qs)
      if (r.ok) {
        const data = await r.json()
        setAlerts(Array.isArray(data) ? data : [])
      }
    } catch { setAlerts([]) }
  }, [])

  useEffect(() => {
    setLoading(true)
    // Load clients first, then load alerts for first client
    loadClients().then(async () => {
      await Promise.all([loadStock(), loadPackages()])
    }).finally(() => setLoading(false))
  }, []) // eslint-disable-line

  const refresh = () => {
    setLoading(true)
    Promise.all([loadClients(), loadStock(), loadPackages()])
      .finally(() => setLoading(false))
  }

  const tabs = [
    { id: 'stock' as TabId, label: 'Stock Levels', icon: '📦' },
    { id: 'receive' as TabId, label: 'Receive', icon: '📥' },
    { id: 'clients' as TabId, label: 'Clients', icon: '👥' },
    { id: 'history' as TabId, label: 'History', icon: '📋' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '800', color: 'var(--text)', margin: 0 }}>📦 Inventory</h2>
          {alerts.length > 0 && (
            <span style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #f59e0b', borderRadius: '12px', padding: '2px 10px', fontSize: '11px', fontWeight: '700' }}>
              ⚠ {alerts.length} Low/Out
            </span>
          )}
          <button className="btn btn-outline btn-sm" onClick={refresh} style={{ marginLeft: 'auto' }}>
            {loading ? '⏳' : '↻'} Refresh
          </button>
        </div>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '6px 12px',
                backgroundColor: activeTab === tab.id ? 'var(--ss-blue)' : 'var(--surface2)',
                color: activeTab === tab.id ? '#fff' : 'var(--text2)',
                border: activeTab === tab.id ? 'none' : '1px solid var(--border2)',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
          <button
            className="btn btn-primary btn-sm"
            onClick={() => {
              setSelectedClientForParent('')
              setShowCreateParentSku(true)
            }}
            style={{ marginLeft: 'auto' }}
            title="Create a new product parent SKU"
          >
            ➕ Create Product
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '18px' }}>
        {activeTab === 'stock' && (
          <StockTab
            stockData={stockData}
            clients={clients}
            packages={packages}
            parentSkus={parentSkus}
            setParentSkus={setParentSkus}
            onReload={refresh}
            showToast={showToast}
          />
        )}
        {activeTab === 'receive' && (
          <ReceiveTab clients={clients} onReload={refresh} showToast={showToast} />
        )}
        {activeTab === 'clients' && (
          <ClientsTab clients={clients} onReload={() => { loadClients(); refresh() }} showToast={showToast} />
        )}
        {activeTab === 'history' && (
          <HistoryTab clients={clients} showToast={showToast} />
        )}
      </div>

      {showCreateParentSku && (
        <CreateParentSkuModal
          clients={clients}
          selectedClientId={selectedClientForParent}
          onClientChange={setSelectedClientForParent}
          onClose={() => setShowCreateParentSku(false)}
          onDone={() => {
            setShowCreateParentSku(false)
            refresh()
          }}
          showToast={showToast}
        />
      )}
    </div>
  )
}

// ── Stock Tab ─────────────────────────────────────────────────────────────────

function StockTab({
  stockData,
  clients,
  packages,
  parentSkus,
  setParentSkus,
  onReload,
  showToast,
}: {
  stockData: InventoryItem[]
  clients: ClientDto[]
  packages: PackageDto[]
  parentSkus: ParentSkuDto[]
  setParentSkus: (ps: ParentSkuDto[]) => void
  onReload: () => void
  showToast: (msg: string) => void
}) {
  const [search, setSearch] = useState('')
  const [clientFilter, setClientFilter] = useState('')
  const [alertOnly, setAlertOnly] = useState(false)
  const [bulkDimsMode, setBulkDimsMode] = useState(false)
  const [adjustModal, setAdjustModal] = useState<{ id: number; sku: string } | null>(null)
  const [editModal, setEditModal] = useState<InventoryItem | null>(null)
  const [skuDrawer, setSkuDrawer] = useState<number | null>(null)

  const handlePopulate = async () => {
    showToast('📥 Scanning orders for SKUs…')
    try {
      const r = await fetch('/api/inventory/populate', { method: 'POST' })
      const d = await r.json()
      if (d.ok) {
        showToast(`✅ Imported ${d.skusRegistered} SKUs, processed ${d.shippedProcessed} shipments`)
        onReload()
      } else showToast('❌ Failed')
    } catch (e: any) { showToast('❌ ' + e.message) }
  }

  const handleImportDims = async () => {
    const qs = clientFilter ? `?clientId=${clientFilter}` : ''
    showToast('📐 Importing weight & dims from ShipStation…')
    try {
      const r = await fetch('/api/inventory/import-dims' + qs, { method: 'POST' })
      const d = await r.json()
      if (d.ok) {
        showToast(`✅ Updated ${d.updated} SKUs — ${d.skipped} already had dims, ${d.noMatch} not in SS catalog`)
        onReload()
      } else showToast('❌ Import failed')
    } catch (e: any) { showToast('❌ ' + e.message) }
  }

  let rows = stockData
  if (clientFilter) rows = rows.filter(r => String(r.clientId) === String(clientFilter))
  if (search) rows = rows.filter(r => (r.sku + r.name).toLowerCase().includes(search.toLowerCase()))
  if (alertOnly) rows = rows.filter(r => r.status !== 'ok')

  const byClient: Record<string, { name: string; rows: InventoryItem[] }> = {}
  rows.forEach(r => {
    if (!byClient[r.clientId]) byClient[r.clientId] = { name: r.clientName, rows: [] }
    byClient[r.clientId].rows.push(r)
  })

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '14px', alignItems: 'center' }}>
        <input
          placeholder="Search SKU / name…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ padding: '6px 10px', border: '1px solid var(--border2)', borderRadius: '6px', background: 'var(--surface2)', color: 'var(--text)', fontSize: '12px', width: '200px' }}
        />
        <select
          value={clientFilter}
          onChange={e => setClientFilter(e.target.value)}
          style={{ padding: '6px 8px', border: '1px solid var(--border2)', borderRadius: '6px', background: 'var(--surface2)', color: 'var(--text)', fontSize: '12px' }}
        >
          <option value="">All Clients</option>
          {clients.map(c => <option key={c.clientId} value={c.clientId}>{c.name}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
          <input type="checkbox" checked={alertOnly} onChange={e => setAlertOnly(e.target.checked)} />
          ⚠ Alerts only
        </label>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
          <button
            className="btn btn-outline btn-sm"
            onClick={() => setBulkDimsMode(!bulkDimsMode)}
            style={bulkDimsMode ? { background: 'var(--ss-blue)', color: '#fff', borderColor: 'var(--ss-blue)' } : {}}
          >
            {bulkDimsMode ? '✕ Exit Bulk' : '✏️ Bulk Dims'}
          </button>
          <button className="btn btn-outline btn-sm" onClick={handleImportDims}>📐 Import Dims</button>
          <button className="btn btn-primary btn-sm" onClick={handlePopulate}>📥 Import SKUs</button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text3)' }}>
          <div style={{ fontSize: '36px', marginBottom: '8px' }}>📭</div>
          <div>{alertOnly ? 'No low/out stock' : 'No SKUs found'}</div>
        </div>
      ) : (
        Object.values(byClient).map(group => (
          <ClientStockGroup
            key={group.name}
            group={group}
            bulkDimsMode={bulkDimsMode}
            onAdjust={(id, sku) => setAdjustModal({ id, sku })}
            onEdit={setEditModal}
            onOpenDrawer={setSkuDrawer}
            onBulkSave={async () => {
              // handled inline
            }}
            onReload={onReload}
            showToast={showToast}
          />
        ))
      )}

      {adjustModal && (
        <AdjustModal
          invSkuId={adjustModal.id}
          sku={adjustModal.sku}
          onClose={() => setAdjustModal(null)}
          onDone={onReload}
          showToast={showToast}
        />
      )}

      {editModal && (
        <EditSkuModal
          sku={editModal}
          packages={packages.filter(p => p.source === 'custom')}
          parentSkus={parentSkus.filter(p => p.clientId === editModal.clientId)}
          clients={clients}
          onClose={() => setEditModal(null)}
          onDone={() => { setEditModal(null); onReload() }}
          showToast={showToast}
        />
      )}

      {skuDrawer !== null && (
        <SkuDrawer
          invSkuId={skuDrawer}
          onClose={() => setSkuDrawer(null)}
        />
      )}
    </div>
  )
}

// ── Client Stock Group ────────────────────────────────────────────────────────

function ClientStockGroup({
  group,
  bulkDimsMode,
  onAdjust,
  onEdit,
  onOpenDrawer,
  onBulkSave,
  onReload,
  showToast,
}: {
  group: { name: string; rows: InventoryItem[] }
  bulkDimsMode: boolean
  onAdjust: (id: number, sku: string) => void
  onEdit: (item: InventoryItem) => void
  onOpenDrawer: (id: number) => void
  onBulkSave: () => Promise<void>
  onReload: () => void
  showToast: (msg: string) => void
}) {
  const bulkRefs = useRef<Record<number, { weightOz: HTMLInputElement | null; length: HTMLInputElement | null; width: HTMLInputElement | null; height: HTMLInputElement | null }>>({})

  const saveBulk = async () => {
    const updates = group.rows.map(r => {
      const refs = bulkRefs.current[r.id]
      return {
        id: String(r.id),
        weightOz: refs?.weightOz?.value || '0',
        length: refs?.length?.value || '0',
        width: refs?.width?.value || '0',
        height: refs?.height?.value || '0',
      }
    })
    try {
      const res = await fetch('/api/inventory/bulk-update-dims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      })
      const d = await res.json()
      showToast(`✅ Saved dims for ${d.updated} SKUs`)
      onReload()
    } catch (e: any) { showToast('❌ Save failed: ' + e.message) }
  }

  return (
    <div style={{ marginBottom: '18px' }}>
      <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '6px' }}>{group.name}</div>
      {bulkDimsMode && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', padding: '8px 12px', background: 'var(--ss-blue-bg)', border: '1px solid var(--ss-blue)', borderRadius: '8px' }}>
          <span style={{ fontSize: '12px', color: 'var(--ss-blue)', fontWeight: '600', flex: 1 }}>✏️ Bulk Dims Mode — edit inline, then save all at once</span>
          <button className="btn btn-primary btn-sm" onClick={saveBulk}>💾 Save All</button>
        </div>
      )}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="inv-table inv-stock-table" style={{ margin: 0, width: '100%', borderCollapse: 'collapse' }}>
            {bulkDimsMode ? (
              <>
                <thead>
                  <tr>
                    <th>SKU</th><th style={{ width: 48 }}></th><th>Name</th>
                    <th style={{ width: 90 }}>Wt (oz)</th>
                    <th style={{ width: 72 }}>L (in)</th>
                    <th style={{ width: 72 }}>W (in)</th>
                    <th style={{ width: 72 }}>H (in)</th>
                  </tr>
                </thead>
                <tbody>
                  {group.rows.map(r => {
                    if (!bulkRefs.current[r.id]) bulkRefs.current[r.id] = { weightOz: null, length: null, width: null, height: null }
                    return (
                      <tr key={r.id}>
                        <td style={{ fontFamily: 'monospace', fontSize: '11px' }}>{r.sku}</td>
                        <td style={{ padding: '4px 6px' }}>
                          {r.imageUrl
                            ? <img src={r.imageUrl} style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 4 }} />
                            : <div style={{ width: 32, height: 32, background: 'var(--surface3)', borderRadius: 4, border: '1px dashed var(--border)' }} />}
                        </td>
                        <td style={{ fontSize: '11.5px', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name || '—'}</td>
                        <td><input type="number" step="0.1" min="0" defaultValue={r.weightOz || 0} ref={el => { if (bulkRefs.current[r.id]) bulkRefs.current[r.id].weightOz = el }} style={{ padding: '3px 5px', border: '1px solid var(--border2)', borderRadius: 4, background: 'var(--surface2)', color: 'var(--text)', fontSize: '11.5px', width: '100%', boxSizing: 'border-box' }} /></td>
                        <td><input type="number" step="0.1" min="0" defaultValue={r.packageLength || 0} ref={el => { if (bulkRefs.current[r.id]) bulkRefs.current[r.id].length = el }} style={{ padding: '3px 5px', border: '1px solid var(--border2)', borderRadius: 4, background: 'var(--surface2)', color: 'var(--text)', fontSize: '11.5px', width: '100%', boxSizing: 'border-box' }} /></td>
                        <td><input type="number" step="0.1" min="0" defaultValue={r.packageWidth || 0} ref={el => { if (bulkRefs.current[r.id]) bulkRefs.current[r.id].width = el }} style={{ padding: '3px 5px', border: '1px solid var(--border2)', borderRadius: 4, background: 'var(--surface2)', color: 'var(--text)', fontSize: '11.5px', width: '100%', boxSizing: 'border-box' }} /></td>
                        <td><input type="number" step="0.1" min="0" defaultValue={r.packageHeight || 0} ref={el => { if (bulkRefs.current[r.id]) bulkRefs.current[r.id].height = el }} style={{ padding: '3px 5px', border: '1px solid var(--border2)', borderRadius: 4, background: 'var(--surface2)', color: 'var(--text)', fontSize: '11.5px', width: '100%', boxSizing: 'border-box' }} /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </>
            ) : (
              <>
                <thead>
                  <tr>
                    <th>SKU</th><th style={{ width: 48 }}></th><th>Name</th>
                    <th style={{ textAlign: 'right' }}>Weight</th>
                    <th style={{ textAlign: 'center' }}>Dims (L×W×H)</th>
                    <th style={{ textAlign: 'center' }} title="Cubic footage per unit">Cu Ft/Unit</th>
                    <th>Package</th>
                    <th style={{ textAlign: 'center' }}>Stock</th>
                    <th style={{ textAlign: 'center' }}>Units/Pack</th>
                    <th style={{ textAlign: 'center' }}>Total Units</th>
                    <th style={{ textAlign: 'center' }}>Min</th>
                    <th style={{ textAlign: 'center' }}>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody style={{ display: 'contents' }}>
                  {group.rows.map(r => {
                    const badge = r.status === 'out'
                      ? <span className="stock-badge stock-out">OUT</span>
                      : r.status === 'low'
                      ? <span className="stock-badge stock-low">LOW</span>
                      : <span className="stock-badge stock-ok">OK</span>
                    const wtDisplay = r.weightOz > 0 ? fmtWeight(r.weightOz) : <span style={{ color: 'var(--text4)' }}>—</span>
                    const dimsDisplay = (r.packageLength > 0 || r.packageWidth > 0 || r.packageHeight > 0)
                      ? `${r.packageLength}×${r.packageWidth}×${r.packageHeight}`
                      : <span style={{ color: 'var(--text4)' }}>—</span>
                    const pkgDisplay = r.packageName || <span style={{ color: 'var(--text4)' }}>—</span>
                    const cuFt = r.cuFtOverride && r.cuFtOverride > 0
                      ? r.cuFtOverride
                      : (r.productLength > 0 && r.productWidth > 0 && r.productHeight > 0
                        ? (r.productLength * r.productWidth * r.productHeight) / 1728
                        : 0)
                    return (
                      <tr key={r.id}>
                        {/* m-img: product image (mobile card) */}
                        <td className="m-img" style={{ padding: '4px 6px' }}>
                          {r.imageUrl
                            ? <img src={r.imageUrl} style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 5, display: 'block', cursor: 'zoom-in' }} onError={e => { (e.target as HTMLImageElement).outerHTML = '<div style="width:40px;height:40px;background:var(--surface3);border-radius:5px;border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:18px">📦</div>' }} />
                            : <div className="no-img" style={{ width: 40, height: 40, background: 'var(--surface3)', border: '1px dashed var(--border)', borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: 'var(--text4)', textAlign: 'center', lineHeight: 1.2 }}>no<br />img</div>}
                        </td>
                        {/* m-name: SKU + name stacked (mobile), name only (desktop) */}
                        <td className="m-name" style={{ fontSize: '12px', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }} onClick={() => onOpenDrawer(r.id)}>
                          <span className="mob-sku">{r.sku}</span>
                          <span className="mob-name">{r.name || '—'}</span>
                        </td>
                        {/* Desktop SKU column (hidden on mobile) */}
                        <td style={{ fontFamily: 'monospace', fontSize: '11.5px', cursor: 'pointer', color: 'var(--ss-blue)' }} onClick={() => onOpenDrawer(r.id)} title="View orders & sales trend">{r.sku}</td>
                        <td style={{ textAlign: 'right', fontSize: '11.5px' }}>{wtDisplay}</td>
                        <td style={{ textAlign: 'center', fontSize: '11.5px', fontFamily: 'monospace' }}>{dimsDisplay}</td>
                        <td style={{ textAlign: 'center', fontSize: '11px', color: 'var(--text3)' }}>
                          {cuFt > 0
                            ? <span title={r.cuFtOverride && r.cuFtOverride > 0 ? 'Manual override' : 'Auto-computed from product dims'}>{cuFt.toFixed(3)}{r.cuFtOverride && r.cuFtOverride > 0 ? <span style={{ color: 'var(--ss-blue)', fontSize: 9, marginLeft: 2 }}>✎</span> : null}</span>
                            : <span style={{ color: 'var(--text4)' }}>—</span>}
                        </td>
                        <td style={{ fontSize: '11.5px' }}>{pkgDisplay}</td>
                        {/* m-stock: stock number (mobile) */}
                        <td className="m-stock" style={{ textAlign: 'center', fontWeight: 700, fontSize: 13, color: r.currentStock <= 0 ? 'var(--red)' : 'var(--text)' }}>{r.currentStock}</td>
                        <td style={{ textAlign: 'center', fontSize: 12, color: 'var(--text3)' }}>
                          {r.units_per_pack > 1
                            ? <span style={{ background: 'var(--ss-blue-bg)', color: 'var(--ss-blue)', fontSize: 10.5, fontWeight: 700, padding: '1px 6px', borderRadius: 4 }}>×{r.units_per_pack}</span>
                            : '—'}
                        </td>
                        <td style={{ textAlign: 'center', fontSize: 12, color: 'var(--text2)' }}>{r.units_per_pack > 1 ? <strong>{r.currentStock * r.units_per_pack}</strong> : '—'}</td>
                        <td style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 12 }}>{r.minStock}</td>
                        {/* m-status: status badge (mobile) */}
                        <td className="m-status" style={{ textAlign: 'center' }}>{badge}</td>
                        {/* m-actions: edit + adjust buttons (mobile) */}
                        <td className="m-actions" style={{ whiteSpace: 'nowrap' }}>
                          <button className="btn btn-ghost btn-xs" onClick={() => onEdit(r)} title="Edit SKU details">✏️</button>
                          <button className="btn btn-ghost btn-xs" onClick={() => onAdjust(r.id, r.sku)} title="Add / Remove Stock" style={{ fontSize: 13, fontWeight: 700, color: 'var(--ss-blue)' }}>+</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </>
            )}
          </table>
        </div>
      </div>
    </div>
  )
}

// ── Adjust Modal ──────────────────────────────────────────────────────────────

function AdjustModal({ invSkuId, sku, onClose, onDone, showToast }: { invSkuId: number; sku: string; onClose: () => void; onDone: () => void; showToast: (msg: string) => void }) {
  const today = new Date().toISOString().slice(0, 10)
  const [type, setType] = useState<'receive' | 'return' | 'damage' | 'adjust'>('receive')
  const [sign, setSign] = useState<1 | -1>(1)
  const [qty, setQty] = useState('1')
  const [note, setNote] = useState('')
  const [date, setDate] = useState(today)

  useEffect(() => {
    if (type === 'damage') setSign(-1)
    else setSign(1)
  }, [type])

  const submit = async () => {
    const n = sign * (parseInt(qty) || 0)
    if (!n || Math.abs(n) <= 0) { showToast('⚠ Enter a positive quantity'); return }
    const finalNote = note.trim() || (n > 0 ? `Manual ${type}` : 'Manual remove')
    const adjustedAt = date ? new Date(date + 'T12:00:00').toISOString() : new Date().toISOString()
    try {
      const r = await fetch('/api/inventory/adjust', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invSkuId, qty: n, note: finalNote, type, adjustedAt }),
      })
      const d = await r.json()
      if (d.ok) {
        const dateStr = new Date(adjustedAt).toLocaleDateString()
        showToast(`✅ ${type.charAt(0).toUpperCase() + type.slice(1)} recorded on ${dateStr}. New total: ${d.newStock}`)
        onDone()
        onClose()
      } else showToast('❌ Adjust failed')
    } catch { showToast('❌ Network error') }
  }

  const typeColors: Record<string, string> = { receive: 'var(--ss-blue)', return: '#d97706', damage: 'var(--red)', adjust: 'var(--ss-blue)' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}>
      <div style={{ background: 'var(--surface)', borderRadius: 10, padding: '22px 24px', width: 380, maxWidth: '95vw', boxShadow: '0 8px 40px rgba(0,0,0,.3)' }}
        onClick={e => e.stopPropagation()}
        onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onClose() }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>Inventory Entry</div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14, fontFamily: 'monospace' }}>{sku}</div>

        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.4px', display: 'block', marginBottom: 4 }}>Type</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(['receive', 'return', 'damage', 'adjust'] as const).map(t => (
              <button key={t} onClick={() => setType(t)} style={{
                flex: 1, padding: '6px 10px', borderRadius: 6, cursor: 'pointer', fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap',
                border: `2px solid ${type === t ? typeColors[t] : 'var(--border2)'}`,
                background: type === t ? typeColors[t] : 'var(--surface2)',
                color: type === t ? '#fff' : 'var(--text)',
              }}>
                {t === 'receive' ? '📦 Receive' : t === 'return' ? '↩ Return' : t === 'damage' ? '⚠ Damage' : '± Adjust'}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.4px', display: 'block', marginBottom: 4 }}>Direction</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setSign(1)} style={{ flex: 1, padding: 7, borderRadius: 6, fontWeight: 700, cursor: 'pointer', fontSize: 13, border: `2px solid ${sign === 1 ? 'var(--ss-blue)' : 'var(--border2)'}`, background: sign === 1 ? 'var(--ss-blue)' : 'var(--surface2)', color: sign === 1 ? '#fff' : 'var(--text)' }}>+ Add</button>
            <button onClick={() => setSign(-1)} style={{ flex: 1, padding: 7, borderRadius: 6, fontWeight: 700, cursor: 'pointer', fontSize: 13, border: `2px solid ${sign === -1 ? 'var(--red)' : 'var(--border2)'}`, background: sign === -1 ? 'var(--red)' : 'var(--surface2)', color: sign === -1 ? '#fff' : 'var(--text)' }}>− Remove</button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 700, width: 16, textAlign: 'center' }}>{sign > 0 ? '+' : '−'}</span>
          <input type="number" min="1" step="1" value={qty} onChange={e => setQty(e.target.value)} autoFocus
            style={{ flex: 1, padding: '7px 10px', border: '1px solid var(--border2)', borderRadius: 6, background: 'var(--surface2)', color: 'var(--text)', fontSize: 14, fontWeight: 700 }} />
        </div>
        <input type="text" placeholder="Note (e.g. PO#, reason, ref)" maxLength={120} value={note} onChange={e => setNote(e.target.value)}
          style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', border: '1px solid var(--border2)', borderRadius: 6, background: 'var(--surface2)', color: 'var(--text)', fontSize: 12, marginBottom: 10 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <span style={{ fontSize: 12, color: 'var(--text2)', whiteSpace: 'nowrap' }}>📅 Date:</span>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            style={{ flex: 1, padding: '6px 8px', border: '1px solid var(--border2)', borderRadius: 6, background: 'var(--surface2)', color: 'var(--text)', fontSize: 12 }} />
          {date === today && <span style={{ fontSize: 11, color: 'var(--text3)', whiteSpace: 'nowrap' }}>(today)</span>}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '7px 16px', borderRadius: 6, border: '1px solid var(--border2)', background: 'var(--surface2)', color: 'var(--text)', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
          <button onClick={submit} style={{ padding: '7px 16px', borderRadius: 6, border: 'none', background: 'var(--ss-blue)', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Save</button>
        </div>
      </div>
    </div>
  )
}

// ── Edit SKU Modal ────────────────────────────────────────────────────────────

function EditSkuModal({
  sku, packages, parentSkus, clients, onClose, onDone, showToast,
}: {
  sku: InventoryItem
  packages: PackageDto[]
  parentSkus: ParentSkuDto[]
  clients: ClientDto[]
  onClose: () => void
  onDone: () => void
  showToast: (msg: string) => void
}) {
  const [weight, setWeight] = useState(String(sku.weightOz || 0))
  const [minStock, setMinStock] = useState(String(sku.minStock || 0))
  const [upp, setUpp] = useState(String(sku.units_per_pack || 1))
  const [pkgL, setPkgL] = useState(String(sku.packageLength || 0))
  const [pkgW, setPkgW] = useState(String(sku.packageWidth || 0))
  const [pkgH, setPkgH] = useState(String(sku.packageHeight || 0))
  const [prodL, setProdL] = useState(String(sku.productLength || 0))
  const [prodW, setProdW] = useState(String(sku.productWidth || 0))
  const [prodH, setProdH] = useState(String(sku.productHeight || 0))
  const [pkgId, setPkgId] = useState(String(sku.packageId || ''))
  const [parentId, setParentId] = useState(String(sku.parentSkuId || ''))
  const [baseUnit, setBaseUnit] = useState(String(sku.baseUnitQty || 1))
  const [cuFt, setCuFt] = useState(String(sku.cuFtOverride && sku.cuFtOverride > 0 ? sku.cuFtOverride : 0))

  const save = async () => {
    const body = {
      name: sku.name,
      minStock: parseFloat(minStock) || 0,
      weightOz: parseFloat(weight) || 0,
      length: parseFloat(pkgL) || 0,
      width: parseFloat(pkgW) || 0,
      height: parseFloat(pkgH) || 0,
      productLength: parseFloat(prodL) || 0,
      productWidth: parseFloat(prodW) || 0,
      productHeight: parseFloat(prodH) || 0,
      packageId: parseInt(pkgId) || null,
      units_per_pack: Math.max(1, parseInt(upp) || 1),
      cuFtOverride: parseFloat(cuFt) || null,
    }
    try {
      const pid = parseInt(parentId)
      if (!isNaN(pid) && pid > 0) {
        await fetch(`/api/inventory/${sku.id}/set-parent`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ parentSkuId: pid, baseUnitQty: Math.max(1, parseInt(baseUnit) || 1) }),
        })
      } else if (sku.parentSkuId) {
        await fetch(`/api/inventory/${sku.id}/set-parent`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ parentSkuId: null }),
        })
      }
      const r = await fetch(`/api/inventory/${sku.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const d = await r.json()
      if (d.ok) { showToast('✅ Saved'); onDone() }
      else showToast('❌ ' + (d.error || 'Save failed'))
    } catch (e: any) { showToast('❌ ' + e.message) }
  }

  const IS = { fontSize: 12 } as React.CSSProperties
  const labelS: React.CSSProperties = { fontSize: 10, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', overflowY: 'auto', padding: 20 }} onClick={onClose}>
      <div style={{ background: 'var(--surface)', borderRadius: 10, padding: '22px 24px', width: 420, maxWidth: '95vw', boxShadow: '0 8px 40px rgba(0,0,0,.3)', margin: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Edit SKU Details</div>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 14, fontFamily: 'monospace' }}>{sku.sku}</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
          <div><label style={labelS}>Weight (oz)</label><input type="number" step="0.1" value={weight} onChange={e => setWeight(e.target.value)} className="ship-select" style={{ width: '100%', ...IS }} /></div>
          <div><label style={labelS}>Min Stock</label><input type="number" min="0" value={minStock} onChange={e => setMinStock(e.target.value)} className="ship-select" style={{ width: '100%', ...IS }} /></div>
          <div><label style={labelS}>Units / Pack</label><input type="number" min="1" value={upp} onChange={e => setUpp(e.target.value)} className="ship-select" style={{ width: '100%', ...IS }} /></div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelS}>📦 Parent SKU (for variants)</label>
          <select value={parentId} onChange={e => setParentId(e.target.value)} className="ship-select" style={{ width: '100%', ...IS }}>
            <option value="">— No Parent —</option>
            {parentSkus.map(p => <option key={p.parentSkuId} value={p.parentSkuId}>{p.name}</option>)}
          </select>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelS}>Base Unit Qty (per pack)</label>
          <input type="number" min="1" value={baseUnit} onChange={e => setBaseUnit(e.target.value)} className="ship-select" style={{ width: '100%', ...IS }} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
          <div><label style={labelS}>📦 Pkg L</label><input type="number" step="0.1" value={pkgL} onChange={e => setPkgL(e.target.value)} className="ship-select" style={{ width: '100%', ...IS }} /></div>
          <div><label style={labelS}>📦 Pkg W</label><input type="number" step="0.1" value={pkgW} onChange={e => setPkgW(e.target.value)} className="ship-select" style={{ width: '100%', ...IS }} /></div>
          <div><label style={labelS}>📦 Pkg H</label><input type="number" step="0.1" value={pkgH} onChange={e => setPkgH(e.target.value)} className="ship-select" style={{ width: '100%', ...IS }} /></div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
          <div><label style={labelS}>📦 Prod L</label><input type="number" step="0.1" value={prodL} onChange={e => setProdL(e.target.value)} className="ship-select" style={{ width: '100%', ...IS }} /></div>
          <div><label style={labelS}>📦 Prod W</label><input type="number" step="0.1" value={prodW} onChange={e => setProdW(e.target.value)} className="ship-select" style={{ width: '100%', ...IS }} /></div>
          <div><label style={labelS}>📦 Prod H</label><input type="number" step="0.1" value={prodH} onChange={e => setProdH(e.target.value)} className="ship-select" style={{ width: '100%', ...IS }} /></div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelS}>📦 Shipping Package</label>
          <select value={pkgId} onChange={e => setPkgId(e.target.value)} className="ship-select" style={{ width: '100%', ...IS }}>
            <option value="">— No Package —</option>
            {packages.map(p => <option key={p.packageId} value={p.packageId}>{p.name} ({p.length}×{p.width}×{p.height})</option>)}
          </select>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelS}>Cu Ft Override (0 = auto from product dims)</label>
          <input type="number" step="0.0001" min="0" value={cuFt} onChange={e => setCuFt(e.target.value)} className="ship-select" style={{ width: 130, ...IS }} />
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-outline btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={save}>Save</button>
        </div>
      </div>
    </div>
  )
}

// ── SKU Drawer ────────────────────────────────────────────────────────────────

interface SkuOrdersData {
  sku: string
  name: string
  totalUnits: number
  orders: Array<{ orderId: number; orderNumber: string; shipToName: string; qty: number; orderStatus: string; orderDate: string }>
  dailySales: Array<{ day: string; units: number }>
}

function SkuDrawer({ invSkuId, onClose }: { invSkuId: number; onClose: () => void }) {
  const [data, setData] = useState<SkuOrdersData | null>(null)
  const [error, setError] = useState('')
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    fetch(`/api/inventory/${invSkuId}/sku-orders`)
      .then(r => r.json())
      .then(d => setData(d))
      .catch(e => setError(e.message))
  }, [invSkuId])

  useEffect(() => {
    if (data && canvasRef.current) drawChart(canvasRef.current, data.dailySales)
  }, [data])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 4000, display: 'flex', justifyContent: 'flex-end' }} onClick={onClose}>
      <div style={{ width: 680, maxWidth: '100vw', height: '100%', background: 'var(--surface)', display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 32px rgba(0,0,0,.25)', overflow: 'hidden', animation: 'slideInRight .2s ease' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{data ? (data.name || data.sku) : 'Loading…'}</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2, fontFamily: 'monospace' }}>{data?.sku}</div>
          </div>
          <button onClick={onClose} style={{ padding: '5px 10px', border: '1px solid var(--border2)', borderRadius: 6, background: 'var(--surface2)', color: 'var(--text)', cursor: 'pointer', fontSize: 13 }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px' }}>
          {error && <div style={{ color: 'var(--red)', padding: 16 }}>Failed to load: {error}</div>}
          {!data && !error && <div style={{ color: 'var(--text3)', padding: 16 }}>Loading…</div>}
          {data && (
            <>
              <div style={{ display: 'flex', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
                {[
                  { label: '30-Day Units Sold', value: data.totalUnits.toLocaleString(), color: '#e07a00' },
                  { label: 'Total Orders', value: data.orders.length.toLocaleString(), color: 'var(--text)' },
                  { label: 'Avg/Day (30d)', value: (data.totalUnits / 30).toFixed(1), color: 'var(--text)' },
                ].map(s => (
                  <div key={s.label} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', flex: 1, minWidth: 120 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: 'var(--text3)', marginBottom: 4 }}>{s.label}</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
                  </div>
                ))}
              </div>
              <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px', marginBottom: 18 }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>📊 Units Sold — Last 30 Days</div>
                <canvas ref={canvasRef} style={{ width: '100%', height: 160, display: 'block' }} />
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Recent Orders ({data.orders.length})</div>
              {data.orders.length === 0 ? (
                <div style={{ color: 'var(--text3)', fontSize: 12, padding: 16, textAlign: 'center' }}>No orders found for this SKU.</div>
              ) : (
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
                        {['Order #', 'Customer', 'Qty', 'Status', 'Date'].map(h => (
                          <th key={h} style={{ padding: '7px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: 'var(--text3)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.orders.map((o, i) => {
                        const statusColor = o.orderStatus === 'shipped' ? 'var(--green)' : o.orderStatus === 'awaiting_shipment' ? 'var(--ss-blue)' : 'var(--text3)'
                        return (
                          <tr key={o.orderId} style={{ borderTop: '1px solid var(--border)', background: i % 2 !== 0 ? 'var(--surface2)' : '' }}>
                            <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontSize: 11, color: 'var(--ss-blue)' }}>{o.orderNumber}</td>
                            <td style={{ padding: '6px 10px', fontSize: 11.5, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.shipToName || '—'}</td>
                            <td style={{ padding: '6px 6px', textAlign: 'center', fontWeight: 700 }}>{o.qty || 1}</td>
                            <td style={{ padding: '6px 10px', fontSize: 11, fontWeight: 700, color: statusColor }}>{o.orderStatus}</td>
                            <td style={{ padding: '6px 10px', fontSize: 11, color: 'var(--text3)' }}>{o.orderDate ? new Date(o.orderDate).toLocaleDateString() : '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Create Parent SKU Modal ───────────────────────────────────────────────────

function CreateParentSkuModal({
  clients,
  selectedClientId,
  onClientChange,
  onClose,
  onDone,
  showToast,
}: {
  clients: ClientDto[]
  selectedClientId: string
  onClientChange: (id: string) => void
  onClose: () => void
  onDone: () => void
  showToast: (msg: string) => void
}) {
  const [sku, setSku] = useState('')
  const [name, setName] = useState('')
  const [weight, setWeight] = useState('')
  const [length, setLength] = useState('')
  const [width, setWidth] = useState('')
  const [height, setHeight] = useState('')
  const [supplierCost, setSupplierCost] = useState('')
  const [marginPercent, setMarginPercent] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    // Validation
    if (!selectedClientId.trim()) {
      showToast('⚠ Select a client')
      return
    }
    if (!sku.trim()) {
      showToast('⚠ SKU is required')
      return
    }
    if (!name.trim()) {
      showToast('⚠ Product name is required')
      return
    }
    if (!weight.trim() || parseFloat(weight) <= 0) {
      showToast('⚠ Weight must be > 0')
      return
    }
    if (!length.trim() || parseFloat(length) < 0 ||
        !width.trim() || parseFloat(width) < 0 ||
        !height.trim() || parseFloat(height) < 0) {
      showToast('⚠ All dimensions must be ≥ 0')
      return
    }

    setSaving(true)
    try {
      // Step 1: Create parent SKU
      const parentRes = await fetch('/api/parent-skus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: parseInt(selectedClientId),
          name: name.trim(),
          sku: sku.trim(),
          baseUnitQty: 1,
        }),
      })

      const parentData = await parentRes.json()
      if (!parentData.parentSkuId) {
        showToast('❌ Failed to create parent SKU')
        setSaving(false)
        return
      }

      // Step 2: Create inventory SKU via receive endpoint (creates with 0 stock)
      const invRes = await fetch('/api/inventory/receive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: parseInt(selectedClientId),
          items: [
            {
              sku: sku.trim(),
              name: name.trim(),
              qty: 0,
            },
          ],
          note: 'Created via Create Product modal',
        }),
      })

      const invData = await invRes.json()
      if (!invData.received || invData.received.length === 0) {
        showToast('❌ Failed to create inventory SKU')
        setSaving(false)
        return
      }

      const invSkuId = invData.received[0].invSkuId

      // Step 3: Update the newly created SKU with parent relationship and dimensions
      if (invSkuId) {
        const parentRes = await fetch(`/api/inventory/${invSkuId}/set-parent`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            parentSkuId: parentData.parentSkuId,
            baseUnitQty: 1,
          }),
        })

        if (parentRes.ok) {
          // Step 4: Update dimensions and weight
          await fetch(`/api/inventory/${invSkuId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: name.trim(),
              minStock: 0,
              weightOz: parseFloat(weight) || 0,
              length: parseFloat(length) || 0,
              width: parseFloat(width) || 0,
              height: parseFloat(height) || 0,
            }),
          })
        }
      }

      showToast(`✅ Product "${name}" created with SKU ${sku.trim()}`)
      setSku('')
      setName('')
      setWeight('')
      setLength('')
      setWidth('')
      setHeight('')
      setSupplierCost('')
      setMarginPercent('')
      onDone()
    } catch (e: any) {
      showToast('❌ ' + (e.message || 'Error creating product'))
    } finally {
      setSaving(false)
    }
  }

  const labelS: React.CSSProperties = { fontSize: 10, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }
  const inputS: React.CSSProperties = { fontSize: 12, padding: '7px 10px', border: '1px solid var(--border2)', borderRadius: 6, background: 'var(--surface2)', color: 'var(--text)' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', overflowY: 'auto', padding: 20 }} onClick={onClose}>
      <div style={{ background: 'var(--surface)', borderRadius: 10, padding: '22px 24px', width: 500, maxWidth: '95vw', boxShadow: '0 8px 40px rgba(0,0,0,.3)', margin: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 2 }}>➕ Create Parent SKU</div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14 }}>Add a new product to inventory</div>

        {/* Client selector */}
        <div style={{ marginBottom: 14 }}>
          <label style={labelS}>Client *</label>
          <select
            value={selectedClientId}
            onChange={e => onClientChange(e.target.value)}
            className="ship-select"
            style={{ width: '100%', ...inputS }}
          >
            <option value="">Select Client…</option>
            {clients.map(c => (
              <option key={c.clientId} value={c.clientId}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* SKU field */}
        <div style={{ marginBottom: 12 }}>
          <label style={labelS}>SKU *</label>
          <input
            type="text"
            placeholder="e.g. SKU-001"
            value={sku}
            onChange={e => setSku(e.target.value)}
            autoFocus
            style={{ width: '100%', ...inputS }}
          />
        </div>

        {/* Product Name field */}
        <div style={{ marginBottom: 12 }}>
          <label style={labelS}>Product Name *</label>
          <input
            type="text"
            placeholder="e.g. Samyang Ramen 5-Pack"
            value={name}
            onChange={e => setName(e.target.value)}
            style={{ width: '100%', ...inputS }}
          />
        </div>

        {/* Weight field */}
        <div style={{ marginBottom: 12 }}>
          <label style={labelS}>Weight (oz) *</label>
          <input
            type="number"
            step="0.1"
            min="0"
            placeholder="e.g. 8.5"
            value={weight}
            onChange={e => setWeight(e.target.value)}
            style={{ width: '100%', ...inputS }}
          />
        </div>

        {/* Dimensions row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
          <div>
            <label style={labelS}>Length (in) *</label>
            <input
              type="number"
              step="0.1"
              min="0"
              placeholder="L"
              value={length}
              onChange={e => setLength(e.target.value)}
              style={{ width: '100%', ...inputS }}
            />
          </div>
          <div>
            <label style={labelS}>Width (in) *</label>
            <input
              type="number"
              step="0.1"
              min="0"
              placeholder="W"
              value={width}
              onChange={e => setWidth(e.target.value)}
              style={{ width: '100%', ...inputS }}
            />
          </div>
          <div>
            <label style={labelS}>Height (in) *</label>
            <input
              type="number"
              step="0.1"
              min="0"
              placeholder="H"
              value={height}
              onChange={e => setHeight(e.target.value)}
              style={{ width: '100%', ...inputS }}
            />
          </div>
        </div>

        {/* Supplier Cost field (optional) */}
        <div style={{ marginBottom: 12 }}>
          <label style={labelS}>Supplier Cost ($) — Optional</label>
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder="e.g. 2.50"
            value={supplierCost}
            onChange={e => setSupplierCost(e.target.value)}
            style={{ width: '100%', ...inputS }}
          />
        </div>

        {/* Margin % field (optional) */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelS}>Margin / Markup (%) — Optional</label>
          <input
            type="number"
            step="1"
            min="0"
            placeholder="e.g. 30"
            value={marginPercent}
            onChange={e => setMarginPercent(e.target.value)}
            style={{ width: '100%', ...inputS }}
          />
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            disabled={saving}
            style={{
              padding: '7px 16px',
              borderRadius: 6,
              border: '1px solid var(--border2)',
              background: 'var(--surface2)',
              color: 'var(--text)',
              cursor: saving ? 'not-allowed' : 'pointer',
              fontSize: 13,
              opacity: saving ? 0.6 : 1,
            }}
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving}
            style={{
              padding: '7px 16px',
              borderRadius: 6,
              border: 'none',
              background: 'var(--ss-blue)',
              color: '#fff',
              cursor: saving ? 'not-allowed' : 'pointer',
              fontSize: 13,
              fontWeight: 600,
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? '⏳ Creating…' : '✅ Create Product'}
          </button>
        </div>
      </div>
    </div>
  )
}

function drawChart(canvas: HTMLCanvasElement, dailySales: Array<{ day: string; units: number }>) {
  const dpr = window.devicePixelRatio || 1
  const rect = canvas.getBoundingClientRect()
  const W = rect.width || 620, H = rect.height || 160
  canvas.width = W * dpr; canvas.height = H * dpr
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px'
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.scale(dpr, dpr)
  const cs = getComputedStyle(document.documentElement)
  const colBg = cs.getPropertyValue('--surface2').trim() || '#f5f5f5'
  const colGrid = cs.getPropertyValue('--border').trim() || '#e0e0e0'
  const colText = cs.getPropertyValue('--text3').trim() || '#888'
  const PAD_L = 36, PAD_R = 8, PAD_T = 10, PAD_B = 28
  const chartW = W - PAD_L - PAD_R, chartH = H - PAD_T - PAD_B
  const maxVal = Math.max(...dailySales.map(d => d.units), 1)
  const nBars = dailySales.length, gap = chartW / nBars
  const barW = Math.max(2, gap * 0.72)
  const today = new Date().toISOString().slice(0, 10)
  ctx.fillStyle = colBg; ctx.fillRect(0, 0, W, H)
  ctx.strokeStyle = colGrid; ctx.lineWidth = 1; ctx.setLineDash([3, 3])
  for (let g = 0; g <= 3; g++) {
    const y = PAD_T + chartH - (g / 3) * chartH
    ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(PAD_L + chartW, y); ctx.stroke()
    if (g > 0) {
      ctx.fillStyle = colText; ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'right'
      ctx.fillText(String(Math.round((g / 3) * maxVal)), PAD_L - 4, y + 3.5)
    }
  }
  ctx.setLineDash([])
  dailySales.forEach((d, i) => {
    const barH = d.units > 0 ? Math.max(2, (d.units / maxVal) * chartH) : 0
    const x = PAD_L + i * gap + (gap - barW) / 2, y = PAD_T + chartH - barH
    const isToday = d.day === today
    ctx.fillStyle = isToday ? '#ff9a1f' : '#e07a00'
    if (barH > 0) {
      const r = Math.min(3, barW / 2)
      ctx.beginPath()
      ctx.moveTo(x + r, y); ctx.lineTo(x + barW - r, y)
      ctx.quadraticCurveTo(x + barW, y, x + barW, y + r)
      ctx.lineTo(x + barW, y + barH); ctx.lineTo(x, y + barH); ctx.lineTo(x, y + r)
      ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath(); ctx.fill()
    }
    if (barH > 14 && d.units > 0) {
      ctx.fillStyle = '#fff'; ctx.font = 'bold 9px system-ui, sans-serif'; ctx.textAlign = 'center'
      ctx.fillText(String(d.units), x + barW / 2, y + 10)
    }
    if (i % 5 === 0 || isToday || i === nBars - 1) {
      ctx.fillStyle = isToday ? '#e07a00' : colText
      ctx.font = isToday ? 'bold 9px system-ui, sans-serif' : '9px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(d.day.slice(5), x + barW / 2, H - 6)
    }
  })
}

// ── Receive Tab ───────────────────────────────────────────────────────────────

interface ReceiveRow {
  id: number
  sku: string
  name: string
  qty: string
}

function ReceiveTab({ clients, onReload, showToast }: { clients: ClientDto[]; onReload: () => void; showToast: (msg: string) => void }) {
  const [clientId, setClientId] = useState('')
  const [rows, setRows] = useState<ReceiveRow[]>([{ id: Date.now(), sku: '', name: '', qty: '' }])
  const [note, setNote] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [result, setResult] = useState('')
  const [clientSkus, setClientSkus] = useState<InventoryItem[]>([])

  const onClientChange = async (cid: string) => {
    setClientId(cid)
    if (!cid) { setClientSkus([]); return }
    try {
      const r = await fetch('/api/inventory?clientId=' + cid)
      if (r.ok) setClientSkus(await r.json())
    } catch { setClientSkus([]) }
    setRows([{ id: Date.now(), sku: '', name: '', qty: '' }])
  }

  const addRow = () => setRows(prev => [...prev, { id: Date.now(), sku: '', name: '', qty: '' }])
  const removeRow = (id: number) => setRows(prev => prev.filter(r => r.id !== id))
  const updateRow = (id: number, field: keyof ReceiveRow, val: string) => {
    setRows(prev => prev.map(r => {
      if (r.id !== id) return r
      const updated = { ...r, [field]: val }
      if (field === 'sku') {
        const found = clientSkus.find(s => s.sku === val)
        if (found && !r.name) updated.name = found.name
      }
      return updated
    }))
  }

  const submit = async () => {
    if (!clientId) return showToast('⚠ Select a client first')
    const items = rows.filter(r => r.sku && parseInt(r.qty) > 0).map(r => ({
      sku: r.sku, name: r.name, qty: parseInt(r.qty),
    }))
    if (!items.length) return showToast('⚠ Add at least one SKU with quantity')
    const receivedAt = date ? new Date(date + 'T12:00:00').toISOString() : new Date().toISOString()
    try {
      const res = await fetch('/api/inventory/receive', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: parseInt(clientId), items, note, receivedAt }),
      })
      const d = await res.json()
      if (d.ok) {
        const dateStr = new Date(receivedAt).toLocaleDateString()
        setResult(`✅ Received ${d.received.length} SKU(s) on ${dateStr}: ${d.received.map((x: any) => `${x.sku} (${x.qty} units → ${x.newStock} total)`).join(', ')}`)
        setRows([{ id: Date.now(), sku: '', name: '', qty: '' }])
        setNote('')
        onReload()
      } else showToast('❌ ' + d.error)
    } catch (e: any) { showToast('❌ ' + e.message) }
  }

  const skuList = clientSkus.map(s => s.sku)

  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Client</label>
        <select value={clientId} onChange={e => onClientChange(e.target.value)} className="ship-select" style={{ width: '100%', fontSize: 12 }}>
          <option value="">Select Client…</option>
          {clients.map(c => <option key={c.clientId} value={c.clientId}>{c.name}</option>)}
        </select>
      </div>

      <div style={{ marginBottom: 10 }}>
        <datalist id="recv-sku-list">{skuList.map(s => <option key={s} value={s} />)}</datalist>
        {rows.map(row => (
          <div key={row.id} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6, padding: 8, background: 'var(--surface2)', borderRadius: 6, border: '1px solid var(--border)' }}>
            <input type="text" list="recv-sku-list" placeholder="SKU" value={row.sku} onChange={e => updateRow(row.id, 'sku', e.target.value)}
              style={{ flex: 1, fontFamily: 'monospace', fontSize: 12, padding: '6px 8px', border: '1px solid var(--border2)', borderRadius: 4, background: 'var(--surface)', color: 'var(--text)' }} />
            <input type="text" placeholder="Product name" value={row.name} onChange={e => updateRow(row.id, 'name', e.target.value)}
              style={{ flex: 2, fontSize: 12, padding: '6px 8px', border: '1px solid var(--border2)', borderRadius: 4, background: 'var(--surface)', color: 'var(--text)' }} />
            <input type="number" placeholder="Qty" min="1" value={row.qty} onChange={e => updateRow(row.id, 'qty', e.target.value)}
              style={{ width: 72, fontSize: 12, padding: '6px 8px', border: '1px solid var(--border2)', borderRadius: 4, background: 'var(--surface)', color: 'var(--text)', textAlign: 'center' }} />
            <button className="btn btn-ghost btn-xs" onClick={() => removeRow(row.id)}>✕</button>
          </div>
        ))}
        <button className="btn btn-outline btn-sm" onClick={addRow}>+ Add Row</button>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'center' }}>
        <input type="text" placeholder="Note (e.g. PO#, ref)" value={note} onChange={e => setNote(e.target.value)}
          style={{ flex: 1, padding: '7px 10px', border: '1px solid var(--border2)', borderRadius: 6, background: 'var(--surface2)', color: 'var(--text)', fontSize: 12 }} />
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          style={{ padding: '7px 10px', border: '1px solid var(--border2)', borderRadius: 6, background: 'var(--surface2)', color: 'var(--text)', fontSize: 12 }} />
      </div>

      <button className="btn btn-primary" onClick={submit} style={{ width: '100%', padding: '10px', fontSize: 13, fontWeight: 700 }}>✅ Submit Receive</button>

      {result && (
        <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--green-bg, #f0fdf4)', border: '1px solid var(--green)', borderRadius: 8, fontSize: 12, color: 'var(--green-dark, #15803d)' }}>
          {result}
        </div>
      )}
    </div>
  )
}

// ── Clients Tab ───────────────────────────────────────────────────────────────

function ClientsTab({ clients, onReload, showToast }: { clients: ClientDto[]; onReload: () => void; showToast: (msg: string) => void }) {
  const [showForm, setShowForm] = useState(false)
  const [editClient, setEditClient] = useState<ClientDto | null>(null)
  const [name, setName] = useState('')
  const [contact, setContact] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [storeIds, setStoreIds] = useState('')
  const [rateSource, setRateSource] = useState('')
  const [syncing, setSyncing] = useState(false)
  const { useStoreVisibility, toggleStoreVisibility } = useStoreVisibilityContext()

  const openForm = (c?: ClientDto) => {
    if (c) {
      setEditClient(c); setName(c.name); setContact(c.contactName || ''); setEmail(c.email || '')
      setPhone(c.phone || ''); setStoreIds((c.storeIds || []).join(', ')); setRateSource(String(c.rateSourceClientId || ''))
    } else {
      setEditClient(null); setName(''); setContact(''); setEmail(''); setPhone(''); setStoreIds(''); setRateSource('')
    }
    setShowForm(true)
  }

  const save = async () => {
    if (!name.trim()) return showToast('⚠ Client name required')
    const payload = {
      name: name.trim(), contactName: contact.trim(), email: email.trim(), phone: phone.trim(),
      storeIds: storeIds.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n)),
      rate_source_client_id: rateSource ? parseInt(rateSource) : null,
    }
    const url = editClient ? `/api/clients/${editClient.clientId}` : '/api/clients'
    const method = editClient ? 'PUT' : 'POST'
    try {
      const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const d = await r.json()
      if (d.ok || d.clientId) { showToast(editClient ? '✅ Client updated' : `✅ Client "${name}" added`); setShowForm(false); onReload() }
      else showToast('❌ ' + (d.error || 'Save failed'))
    } catch (e: any) { showToast('❌ ' + e.message) }
  }

  const deleteClient = async (c: ClientDto) => {
    if (!confirm(`Delete client "${c.name}"? Inventory records will be preserved.`)) return
    const r = await fetch(`/api/clients/${c.clientId}`, { method: 'DELETE' })
    const d = await r.json()
    if (d.ok) { showToast('✅ Client deleted'); onReload() }
    else showToast('❌ Delete failed')
  }

  const syncStores = async () => {
    setSyncing(true)
    try {
      const r = await fetch('/api/clients/sync-stores', { method: 'POST' })
      const d = await r.json()
      if (d.ok) { showToast(`✅ ${d.clients.length} clients synced`); onReload() }
      else showToast('⚠ Sync failed')
    } finally { setSyncing(false) }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <button className="btn btn-primary btn-sm" onClick={() => openForm()}>+ Add Client</button>
        <button className="btn btn-outline btn-sm" onClick={syncStores} disabled={syncing}>{syncing ? '⏳ Syncing…' : '↻ Sync from SS Stores'}</button>
      </div>

      {clients.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text3)' }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🏢</div>
          <div>No clients yet.</div>
        </div>
      ) : (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          <table className="inv-table inv-clients-table" style={{ margin: 0, width: '100%' }}>
            <thead><tr><th>Name</th><th>Contact</th><th>Email</th><th>Store IDs</th><th>Rate Source</th><th></th></tr></thead>
            <tbody>
              {clients.map(c => {
                const isVisible = useStoreVisibility(c.clientId)
                return (
                  <tr key={c.clientId}>
                    {/* m-name: client name */}
                    <td className="m-name" style={{ fontWeight: 600 }}>{c.name}</td>
                    {/* m-contact: contact name (desktop only) + phone (mobile) */}
                    <td className="m-contact" style={{ fontSize: 12 }}>{c.contactName || '—'}</td>
                    {/* Desktop: email */}
                    <td style={{ fontSize: 12 }}>{c.email || '—'}</td>
                    {/* Desktop: store IDs */}
                    <td style={{ fontSize: 12 }}>{(c.storeIds || []).join(', ') || '—'}</td>
                    {/* Desktop: rate source */}
                    <td style={{ fontSize: 12, fontWeight: 500 }}>{c.rateSourceName || 'DR PREPPER'}</td>
                    {/* m-actions: visibility toggle + edit + delete buttons */}
                    <td className="m-actions">
                      <button 
                        className="btn btn-ghost btn-xs" 
                        onClick={() => toggleStoreVisibility(c.clientId)}
                        title={isVisible ? 'Hide from awaiting shipment' : 'Show in awaiting shipment'}
                      >
                        {isVisible ? '👁️' : '🚫'}
                      </button>
                      <button className="btn btn-ghost btn-xs" onClick={() => openForm(c)}>Edit</button>
                      <button className="btn btn-ghost btn-xs" onClick={() => deleteClient(c)}>Delete</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowForm(false)}>
          <div style={{ background: 'var(--surface)', borderRadius: 10, padding: '22px 24px', width: 400, maxWidth: '95vw', boxShadow: '0 8px 40px rgba(0,0,0,.3)' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>{editClient ? 'Edit Client' : 'Add Client'}</div>
            {[
              { label: 'Name *', value: name, set: setName, placeholder: 'Client name' },
              { label: 'Contact', value: contact, set: setContact, placeholder: 'Contact name' },
              { label: 'Email', value: email, set: setEmail, placeholder: 'Email' },
              { label: 'Phone', value: phone, set: setPhone, placeholder: 'Phone' },
              { label: 'Store IDs (comma-separated)', value: storeIds, set: setStoreIds, placeholder: '1234, 5678' },
            ].map(f => (
              <div key={f.label} style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>{f.label}</label>
                <input type="text" value={f.value} onChange={e => f.set(e.target.value)} placeholder={f.placeholder} className="ship-select" style={{ width: '100%', fontSize: 12 }} />
              </div>
            ))}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Rate Source</label>
              <select value={rateSource} onChange={e => setRateSource(e.target.value)} className="ship-select" style={{ width: '100%', fontSize: 12 }}>
                <option value="">DR PREPPER</option>
                <option value="10">KFG</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-outline btn-sm" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={save}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── History Tab ───────────────────────────────────────────────────────────────

function HistoryTab({ clients, showToast }: { clients: ClientDto[]; showToast: (msg: string) => void }) {
  const range = getDateRangeLast30()
  const [clientId, setClientId] = useState('')
  const [type, setType] = useState('')
  const [from, setFrom] = useState(range.from)
  const [to, setTo] = useState(range.to)
  const [rows, setRows] = useState<LedgerEntry[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '500' })
      if (clientId) params.set('clientId', clientId)
      if (type) params.set('type', type)
      if (from) params.set('dateStart', String(new Date(from + 'T00:00:00').getTime()))
      if (to) params.set('dateEnd', String(new Date(to + 'T23:59:59').getTime()))
      const r = await fetch('/api/inventory/ledger?' + params)
      if (r.ok) setRows(await r.json())
    } finally { setLoading(false) }
  }, [clientId, type, from, to])

  useEffect(() => { load() }, [load])

  const typeColor: Record<string, string> = {
    receive: 'var(--green)', ship: 'var(--text3)', adjust: 'var(--ss-blue)', return: 'var(--yellow, #f59e0b)', damage: 'var(--red)',
  }

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14, alignItems: 'center' }}>
        <select value={clientId} onChange={e => setClientId(e.target.value)} className="ship-select" style={{ fontSize: 12 }}>
          <option value="">All Clients</option>
          {clients.map(c => <option key={c.clientId} value={c.clientId}>{c.name}</option>)}
        </select>
        <select value={type} onChange={e => setType(e.target.value)} className="ship-select" style={{ fontSize: 12 }}>
          <option value="">All Types</option>
          {['receive', 'ship', 'adjust', 'return', 'damage'].map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="ship-select" style={{ fontSize: 12 }} />
        <span style={{ fontSize: 12, color: 'var(--text3)' }}>to</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)} className="ship-select" style={{ fontSize: 12 }} />
        <button className="btn btn-outline btn-sm" onClick={load}>🔍 Load</button>
      </div>

      {loading && <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>Loading…</div>}

      {!loading && rows.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>No movements found</div>
      )}

      {!loading && rows.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
              <thead>
                <tr style={{ background: 'var(--surface2)', borderBottom: '2px solid var(--border)' }}>
                  {['Date', 'SKU', 'Type', 'Qty', 'Note', 'Source'].map(h => (
                    <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: 'var(--text3)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '5px 10px', color: 'var(--text3)' }}>{r.createdAt ? new Date(r.createdAt).toLocaleString() : '—'}</td>
                    <td style={{ padding: '5px 10px', fontFamily: 'monospace' }}>{r.sku || '—'}</td>
                    <td style={{ padding: '5px 10px' }}><span style={{ fontWeight: 700, color: typeColor[r.type] || 'var(--text)', textTransform: 'capitalize' }}>{r.type}</span></td>
                    <td style={{ padding: '5px 10px', textAlign: 'right', fontWeight: 700, color: r.qty > 0 ? 'var(--green)' : 'var(--red)' }}>{r.qty > 0 ? `+${r.qty}` : r.qty}</td>
                    <td style={{ padding: '5px 10px', color: 'var(--text2)' }}>{r.note || '—'}</td>
                    <td style={{ padding: '5px 10px', color: 'var(--text3)' }}>{r.createdBy || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
