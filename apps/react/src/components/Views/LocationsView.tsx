import { useState } from 'react'
import { useLocations } from '../../hooks'
import type { LocationDto, SaveLocationInput } from '@prepshipv2/contracts/locations/contracts'

export default function LocationsView() {
  const { locations, loading, error, addLocation, deleteLocation } = useLocations()
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState<SaveLocationInput>({
    name: '',
    company: '',
    street1: '',
    city: '',
    state: '',
    postalCode: '',
    isDefault: false,
  })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<Error | null>(null)

  const handleAddLocation = () => {
    setFormData({
      name: '',
      company: '',
      street1: '',
      city: '',
      state: '',
      postalCode: '',
      isDefault: false,
    })
    setSaveError(null)
    setShowForm(true)
  }

  const handleSaveLocation = async () => {
    if (!formData.name || !formData.street1 || !formData.city || !formData.state || !formData.postalCode) {
      setSaveError(new Error('Please fill in all fields'))
      return
    }

    setSaving(true)
    setSaveError(null)

    try {
      await addLocation(formData)
      setShowForm(false)
    } catch (err) {
      setSaveError(err instanceof Error ? err : new Error('Failed to save location'))
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteLocation = async (locationId: number) => {
    if (!confirm('Delete this location?')) return
    try {
      await deleteLocation(locationId)
    } catch (err) {
      console.error('Failed to delete location:', err)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: '16px', fontWeight: '800', color: 'var(--text)', margin: 0, marginBottom: '4px' }}>📍 Ship-From Locations</h2>
          <p style={{ fontSize: '12px', color: 'var(--text3)', margin: 0 }}>Add warehouses, 3PL centers, or drop-ship addresses</p>
        </div>
        <button
          className="btn btn-primary btn-sm"
          onClick={handleAddLocation}
        >
          ＋ Add Location
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '18px' }}>
        {error && (
          <div style={{ padding: '12px', backgroundColor: 'rgba(255,0,0,0.1)', border: '1px solid rgba(255,0,0,0.3)', borderRadius: '4px', marginBottom: '16px', color: 'var(--text2)', fontSize: '12px' }}>
            ⚠️ {error.message}
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <div className="spinner"></div>
            <div style={{ fontSize: '12px', marginTop: '8px', color: 'var(--text3)' }}>Loading locations…</div>
          </div>
        ) : locations.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text3)' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>📍</div>
            <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>No Locations Yet</div>
            <div style={{ fontSize: '12px', marginBottom: '16px' }}>Add a location to get started</div>
            <button
              className="btn btn-primary btn-sm"
              onClick={handleAddLocation}
            >
              ＋ Add Location
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '12px' }}>
            {locations.map(loc => (
              <div key={loc.locationId} style={{
                padding: '14px',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                backgroundColor: 'var(--surface2)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text)' }}>{loc.name}</div>
                  {loc.isDefault && (
                    <span style={{ fontSize: '11px', padding: '2px 7px', backgroundColor: 'var(--ss-blue)', color: '#fff', borderRadius: '4px', fontWeight: '600' }}>Default</span>
                  )}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text2)', lineHeight: '1.6' }}>
                  {loc.company && <div>{loc.company}</div>}
                  <div>{loc.street1}</div>
                  {loc.street2 && <div>{loc.street2}</div>}
                  <div>{loc.city}, {loc.state} {loc.postalCode}</div>
                </div>
                <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
                  <button
                    onClick={() => handleDeleteLocation(loc.locationId)}
                    style={{
                      flex: 1,
                      padding: '5px',
                      fontSize: '11px',
                      border: '1px solid var(--border2)',
                      borderRadius: '4px',
                      backgroundColor: 'var(--surface)',
                      cursor: 'pointer',
                      color: '#e74c3c',
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Form Modal */}
      {showForm && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9000,
          backgroundColor: 'rgba(0,0,0,.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }} onClick={() => setShowForm(false)}>
          <div style={{
            backgroundColor: 'var(--surface)',
            borderRadius: '10px',
            boxShadow: 'var(--shadow-lg)',
            width: '500px',
            maxWidth: '95vw',
            padding: '24px',
          }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: '15px', fontWeight: '700', marginBottom: '16px', color: 'var(--text)' }}>Add Location</h3>
            
            {saveError && (
              <div style={{ padding: '10px', backgroundColor: 'rgba(255,0,0,0.1)', border: '1px solid rgba(255,0,0,0.3)', borderRadius: '4px', marginBottom: '16px', color: '#e74c3c', fontSize: '12px' }}>
                {saveError.message}
              </div>
            )}
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
              <input 
                type="text" 
                placeholder="Location Name *" 
                value={formData.name} 
                onChange={(e) => setFormData({...formData, name: e.target.value})} 
                style={{ gridColumn: '1 / -1', padding: '8px', border: '1px solid var(--border2)', borderRadius: '4px', backgroundColor: 'var(--surface2)', color: 'var(--text)' }} 
              />
              <input 
                type="text" 
                placeholder="Company" 
                value={formData.company} 
                onChange={(e) => setFormData({...formData, company: e.target.value})} 
                style={{ gridColumn: '1 / -1', padding: '8px', border: '1px solid var(--border2)', borderRadius: '4px', backgroundColor: 'var(--surface2)', color: 'var(--text)' }} 
              />
              <input 
                type="text" 
                placeholder="Street Address *" 
                value={formData.street1} 
                onChange={(e) => setFormData({...formData, street1: e.target.value})} 
                style={{ gridColumn: '1 / -1', padding: '8px', border: '1px solid var(--border2)', borderRadius: '4px', backgroundColor: 'var(--surface2)', color: 'var(--text)' }} 
              />
              <input 
                type="text" 
                placeholder="City *" 
                value={formData.city} 
                onChange={(e) => setFormData({...formData, city: e.target.value})} 
                style={{ padding: '8px', border: '1px solid var(--border2)', borderRadius: '4px', backgroundColor: 'var(--surface2)', color: 'var(--text)' }} 
              />
              <input 
                type="text" 
                placeholder="State *" 
                value={formData.state} 
                onChange={(e) => setFormData({...formData, state: e.target.value})} 
                style={{ padding: '8px', border: '1px solid var(--border2)', borderRadius: '4px', backgroundColor: 'var(--surface2)', color: 'var(--text)' }} 
              />
              <input 
                type="text" 
                placeholder="ZIP *" 
                value={formData.postalCode} 
                onChange={(e) => setFormData({...formData, postalCode: e.target.value})} 
                style={{ gridColumn: '1 / -1', padding: '8px', border: '1px solid var(--border2)', borderRadius: '4px', backgroundColor: 'var(--surface2)', color: 'var(--text)' }} 
              />
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '16px', fontSize: '12px', color: 'var(--text2)' }}>
              <input 
                type="checkbox" 
                checked={formData.isDefault}
                onChange={(e) => setFormData({...formData, isDefault: e.target.checked})}
              />
              Set as default ship-from location
            </label>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button 
                onClick={() => setShowForm(false)}
                disabled={saving}
                style={{ padding: '8px 16px', backgroundColor: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: '4px', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveLocation}
                disabled={saving}
                style={{ padding: '8px 16px', backgroundColor: 'var(--ss-blue)', color: '#fff', border: 'none', borderRadius: '4px', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: '600', opacity: saving ? 0.6 : 1 }}
              >
                {saving ? '⏳ Saving…' : '💾 Save Location'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
