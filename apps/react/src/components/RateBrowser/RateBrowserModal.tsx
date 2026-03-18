/**
 * RateBrowserModal — Full-screen rate browsing modal
 * Per-account tabs, inline markup editing, rate selection with cost display
 * 
 * Replaces V2 rate-browser.js (736 LOC)
 * No global state, no innerHTML, no document.getElementById
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useMarkups } from '../../contexts/MarkupsContext';
import { applyCarrierMarkup } from '../../utils/markups';
import type { Rate } from '../../types/orders';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RateBrowserOrder {
  orderId: number;
  orderNumber: string;
  shipTo?: { postalCode?: string; residential?: boolean; name?: string };
  weight?: { value: number; units?: string };
  dimensions?: { length: number; width: number; height: number };
  rateDims?: { length: number; width: number; height: number };
  storeId?: number;
  items?: Array<{ sku: string; quantity: number; adjustment?: boolean }>;
}

interface CarrierAccount {
  shippingProviderId: number;
  code?: string;
  carrierCode?: string;
  nickname: string;
  name?: string;
}

interface RateWithMarkup extends Rate {
  markedCost: number;
  baseCost: number;
}

interface CarrierRateState {
  status: 'idle' | 'loading' | 'ok' | 'error';
  rates: RateWithMarkup[];
  error?: string;
}

export interface RateSelection {
  carrierCode: string;
  serviceCode: string;
  serviceName: string;
  shippingProviderId: number;
  shipmentCost: number;
  otherCost: number;
  carrierNickname?: string | null;
  weightLb?: number;
  weightOz?: number;
  length?: number;
  width?: number;
  height?: number;
}

interface RateBrowserModalProps {
  isOpen: boolean;
  order: RateBrowserOrder | null;
  onClose: () => void;
  onSelectRate?: (selection: RateSelection) => void;
}

type ViewMode = 'all' | 'carrier';
type SvcClass = '' | 'ground' | 'express';

// ── Constants ─────────────────────────────────────────────────────────────────

const CARRIER_COLORS: Record<string, string> = {
  stamps_com: '#1473e6',
  usps: '#1473e6',
  fedex: '#4d148c',
  ups: '#ffd100',
  dhl_express: '#ffcc00',
};

function carrierLabel(code: string, nickname?: string | null): string {
  if (nickname) return nickname;
  if (code === 'stamps_com' || code === 'usps') return 'USPS';
  if (code.startsWith('fedex')) return 'FedEx';
  if (code.startsWith('ups')) return 'UPS';
  if (code.startsWith('dhl')) return 'DHL';
  return code.toUpperCase();
}

function etaLabel(rate: Rate): string {
  if (rate.deliveryDays) return `${rate.deliveryDays}d`;
  if (rate.estimatedDelivery) {
    try {
      const d = new Date(rate.estimatedDelivery);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch { return ''; }
  }
  return '';
}

function svcClassMatch(rate: Rate, filter: SvcClass): boolean {
  if (!filter) return true;
  const code = (rate.serviceCode || '').toLowerCase();
  const name = (rate.serviceName || '').toLowerCase();
  if (filter === 'ground') {
    return code.includes('ground') || code.includes('first') || code.includes('advantage') || name.includes('ground') || name.includes('first class');
  }
  if (filter === 'express') {
    return code.includes('express') || code.includes('priority') || code.includes('overnight') || code.includes('2day') || code.includes('next_day') || name.includes('express') || name.includes('priority') || name.includes('overnight');
  }
  return true;
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function RateBrowserModal({ isOpen, order, onClose, onSelectRate }: RateBrowserModalProps) {
  const { markups, applyMarkup } = useMarkups();

  // Form state
  const [weightLb, setWeightLb] = useState(0);
  const [weightOz, setWeightOz] = useState(0);
  const [zip, setZip] = useState('');
  const [length, setLength] = useState(0);
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const [residential, setResidential] = useState(true);
  const [signature, setSignature] = useState<'none' | 'adult' | 'direct'>('none');

  // Rate state
  const [carriers, setCarriers] = useState<CarrierAccount[]>([]);
  const [ratesByCarrier, setRatesByCarrier] = useState<Record<number, CarrierRateState>>({});
  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const [selectedCarrierPid, setSelectedCarrierPid] = useState<number | null>(null);
  const [svcClass, setSvcClass] = useState<SvcClass>('');
  const [isFetching, setIsFetching] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Init form when order changes
  useEffect(() => {
    if (!isOpen || !order) return;

    const wtOz = order.weight?.value || 0;
    setWeightLb(Math.floor(wtOz / 16));
    setWeightOz(Math.round(wtOz % 16));
    setZip((order.shipTo?.postalCode || '').replace(/\D/g, '').slice(0, 5));

    // Dim priority: rateDims > order dimensions
    const dims = order.rateDims || order.dimensions;
    setLength(dims?.length || 0);
    setWidth(dims?.width || 0);
    setHeight(dims?.height || 0);
    setResidential(order.shipTo?.residential !== false);
    setRatesByCarrier({});

    // Load carriers for store
    loadCarriers(order.storeId);
  }, [isOpen, order?.orderId]);

  async function loadCarriers(storeId?: number) {
    try {
      const url = storeId
        ? `/api/carriers-for-store?storeId=${storeId}`
        : '/api/carriers';
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list: CarrierAccount[] = (data.carriers || data || []).map((c: any) => ({
        shippingProviderId: c.shippingProviderId,
        code: c.code || c.carrierCode,
        carrierCode: c.code || c.carrierCode,
        nickname: c.nickname || c.name || c.code,
        name: c.name,
      }));
      setCarriers(list);
    } catch (e) {
      console.error('[RateBrowser] Failed to load carriers:', e);
      // Fallback: try global carriers
      try {
        const res = await fetch('/api/carriers');
        if (res.ok) {
          const data = await res.json();
          setCarriers((data.carriers || data || []).map((c: any) => ({
            shippingProviderId: c.shippingProviderId,
            code: c.code || c.carrierCode,
            carrierCode: c.code || c.carrierCode,
            nickname: c.nickname || c.name,
            name: c.name,
          })));
        }
      } catch {}
    }
  }

  const totalWeightOz = weightLb * 16 + weightOz;

  const handleBrowseRates = useCallback(async () => {
    if (!totalWeightOz || !zip) return;

    // Abort any in-flight requests
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const { signal } = abortRef.current;

    setIsFetching(true);

    // Init all carriers as loading
    const init: Record<number, CarrierRateState> = {};
    carriers.forEach(c => { init[c.shippingProviderId] = { status: 'loading', rates: [] }; });
    setRatesByCarrier(init);

    // Fetch per carrier with 150ms stagger to avoid hammering
    for (let i = 0; i < carriers.length; i++) {
      if (signal.aborted) break;
      const carrier = carriers[i];

      if (i > 0) await new Promise(r => setTimeout(r, 150));
      if (signal.aborted) break;

      // Try cached first
      try {
        const dimsParam = (length > 0 && width > 0 && height > 0)
          ? `&l=${length}&w=${width}&h=${height}`
          : '';
        const cachedUrl = `/api/rates/cached?wt=${totalWeightOz}&zip=${zip}${dimsParam}&residential=${residential}&storeId=${order?.storeId || ''}`;
        const cachedRes = await fetch(cachedUrl, { signal });
        if (cachedRes.ok) {
          const cached = await cachedRes.json();
          if (cached.cached && Array.isArray(cached.rates) && cached.rates.length > 0) {
            // Filter to this carrier
            const carrierRates = cached.rates.filter(
              (r: Rate) => r.shippingProviderId === carrier.shippingProviderId
            );
            if (carrierRates.length > 0) {
              const enriched = enrichRates(carrierRates, markups);
              setRatesByCarrier(prev => ({
                ...prev,
                [carrier.shippingProviderId]: { status: 'ok', rates: enriched }
              }));
              continue;
            }
          }
        }
      } catch (e: unknown) {
        if ((e as Error).name === 'AbortError') break;
      }

      // Live fetch
      try {
        const body = {
          shippingProviderId: carrier.shippingProviderId,
          carrierCode: carrier.carrierCode || carrier.code,
          toPostalCode: zip,
          weightOz: totalWeightOz,
          residential,
          storeId: order?.storeId || null,
          ...(length > 0 && width > 0 && height > 0 ? { dimensions: { length, width, height } } : {}),
          ...(signature !== 'none' ? { signatureOption: signature } : {}),
        };

        const res = await fetch('/api/rates/browse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal,
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const rawRates: Rate[] = data.rates || data || [];
        const enriched = enrichRates(rawRates, markups);

        setRatesByCarrier(prev => ({
          ...prev,
          [carrier.shippingProviderId]: { status: 'ok', rates: enriched }
        }));
      } catch (e: unknown) {
        if ((e as Error).name === 'AbortError') break;
        setRatesByCarrier(prev => ({
          ...prev,
          [carrier.shippingProviderId]: {
            status: 'error',
            rates: [],
            error: (e as Error).message || 'Failed'
          }
        }));
      }
    }

    setIsFetching(false);
  }, [carriers, totalWeightOz, zip, length, width, height, residential, signature, markups, order?.storeId]);

  function enrichRates(rates: Rate[], markupsMap: typeof markups): RateWithMarkup[] {
    return rates.map(r => {
      const baseCost = (r.shipmentCost ?? r.amount ?? 0) + (r.otherCost ?? 0);
      const markup = markupsMap[r.shippingProviderId] || markupsMap[r.carrierCode];
      const markedCost = markup
        ? applyMarkup(baseCost, markup)
        : baseCost;
      return { ...r, baseCost, markedCost };
    });
  }

  // All rates combined + sorted
  const allRates = useMemo(() => {
    const combined: Array<RateWithMarkup & { carrierPid: number }> = [];
    Object.entries(ratesByCarrier).forEach(([pidStr, state]) => {
      if (state.status === 'ok') {
        const pid = parseInt(pidStr);
        state.rates.forEach(r => combined.push({ ...r, carrierPid: pid }));
      }
    });
    return combined
      .filter(r => svcClassMatch(r, svcClass))
      .sort((a, b) => a.markedCost - b.markedCost);
  }, [ratesByCarrier, svcClass]);

  // Current carrier rates (for carrier tab view)
  const currentCarrierRates = useMemo(() => {
    if (!selectedCarrierPid) return [];
    const state = ratesByCarrier[selectedCarrierPid];
    if (!state || state.status !== 'ok') return [];
    return state.rates.filter(r => svcClassMatch(r, svcClass));
  }, [ratesByCarrier, selectedCarrierPid, svcClass]);

  function handleSelectRate(r: RateWithMarkup) {
    if (!order) return;

    const selection: RateSelection = {
      carrierCode: r.carrierCode,
      serviceCode: r.serviceCode,
      serviceName: r.serviceName,
      shippingProviderId: r.shippingProviderId,
      shipmentCost: r.shipmentCost ?? r.amount ?? 0,
      otherCost: r.otherCost ?? 0,
      carrierNickname: r.carrierNickname,
      weightLb,
      weightOz,
      ...(length > 0 && width > 0 && height > 0 ? { length, width, height } : {}),
    };

    // Save selected PID to DB
    fetch(`/api/orders/${order.orderId}/selected-pid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selectedPid: r.shippingProviderId }),
    }).catch(() => {});

    // Save dims if entered
    if (length > 0 && width > 0 && height > 0) {
      const sku = order.items?.find(i => !i.adjustment)?.sku || null;
      const qty = order.items?.find(i => !i.adjustment)?.quantity || null;
      fetch(`/api/orders/${order.orderId}/dims`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku, qty, length, width, height }),
      }).catch(() => {});
    }

    onSelectRate?.(selection);
    onClose();
  }

  function handleClose() {
    abortRef.current?.abort();
    setIsFetching(false);
    onClose();
  }

  const hasWeight = totalWeightOz > 0;
  const hasDims = length > 0 && width > 0 && height > 0;
  const canFetch = hasWeight && !!zip;
  const carrierCount = carriers.length;
  const loadedCount = Object.values(ratesByCarrier).filter(s => s.status === 'ok').length;
  const rateCount = allRates.length;

  if (!isOpen || !order) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(0,0,0,.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={handleClose}
    >
      <div
        style={{
          background: 'var(--surface)',
          borderRadius: 12,
          boxShadow: '0 20px 60px rgba(0,0,0,.4)',
          width: '100%',
          maxWidth: 1400,
          height: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div style={{
          padding: '14px 18px',
          borderBottom: '2px solid var(--ss-blue)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexShrink: 0,
          background: 'var(--surface2)',
        }}>
          <div style={{ fontSize: 26 }}>💰</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800 }}>Rate Browser</div>
            <div style={{ fontSize: 11, color: 'var(--text2)' }}>
              {order.orderNumber} · {order.shipTo?.name || ''} · {zip || 'no zip'}
              {isFetching && <span style={{ color: 'var(--ss-blue)', marginLeft: 6 }}>⏳ Fetching {loadedCount}/{carrierCount}…</span>}
              {!isFetching && rateCount > 0 && <span style={{ color: 'var(--green)', marginLeft: 6 }}>✓ {rateCount} rates</span>}
            </div>
          </div>
          <button
            onClick={handleClose}
            style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text3)' }}
          >
            ✕
          </button>
        </div>

        <div style={{ display: 'flex', flex: 1, minHeight: 0, gap: 0 }}>
          {/* ── Left Sidebar: Controls + Carrier List ── */}
          <div style={{
            width: 260,
            borderRight: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            flexShrink: 0,
            overflow: 'hidden',
          }}>
            {/* Dims / Weight form */}
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text3)', letterSpacing: '.4px', marginBottom: 8 }}>
                Weight & Dims
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
                {[
                  { label: 'lb', val: weightLb, set: (v: number) => setWeightLb(Math.max(0, v)), min: 0 },
                  { label: 'oz', val: weightOz, set: (v: number) => setWeightOz(Math.max(0, v)), min: 0 },
                ].map(f => (
                  <div key={f.label}>
                    <label style={{ display: 'block', fontSize: 9, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 2 }}>{f.label}</label>
                    <input
                      type="number" min={f.min} step="0.5" value={f.val || ''}
                      onChange={e => f.set(parseFloat(e.target.value) || 0)}
                      placeholder="0"
                      style={{ width: '100%', padding: '4px 6px', border: '1px solid var(--border2)', borderRadius: 4, background: 'var(--surface)', color: 'var(--text)', fontSize: 12, boxSizing: 'border-box' as const }}
                    />
                  </div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, marginBottom: 8 }}>
                {[
                  { label: 'L', val: length, set: setLength },
                  { label: 'W', val: width, set: setWidth },
                  { label: 'H', val: height, set: setHeight },
                ].map(f => (
                  <div key={f.label}>
                    <label style={{ display: 'block', fontSize: 9, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 2 }}>{f.label}</label>
                    <input
                      type="number" min={0} step="0.25" value={f.val || ''}
                      onChange={e => f.set(parseFloat(e.target.value) || 0)}
                      placeholder="0"
                      style={{ width: '100%', padding: '4px 5px', border: '1px solid var(--border2)', borderRadius: 4, background: 'var(--surface)', color: 'var(--text)', fontSize: 11, boxSizing: 'border-box' as const }}
                    />
                  </div>
                ))}
              </div>
              <div style={{ marginBottom: 8 }}>
                <label style={{ display: 'block', fontSize: 9, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 2 }}>To ZIP</label>
                <input
                  type="text" maxLength={5} value={zip}
                  onChange={e => setZip(e.target.value.replace(/\D/g, '').slice(0, 5))}
                  placeholder="90210"
                  style={{ width: '100%', padding: '4px 6px', border: '1px solid var(--border2)', borderRadius: 4, background: 'var(--surface)', color: 'var(--text)', fontSize: 12, boxSizing: 'border-box' as const }}
                />
              </div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, cursor: 'pointer' }}>
                  <input type="checkbox" checked={residential} onChange={e => setResidential(e.target.checked)} />
                  Residential
                </label>
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={{ display: 'block', fontSize: 9, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 2 }}>Service Class</label>
                <select
                  value={svcClass}
                  onChange={e => setSvcClass(e.target.value as SvcClass)}
                  style={{ width: '100%', padding: '4px 6px', border: '1px solid var(--border2)', borderRadius: 4, background: 'var(--surface)', color: 'var(--text)', fontSize: 11 }}
                >
                  <option value="">All Services</option>
                  <option value="ground">Ground / Economy</option>
                  <option value="express">Express / Priority</option>
                </select>
              </div>
              <button
                onClick={handleBrowseRates}
                disabled={!canFetch || isFetching}
                style={{
                  width: '100%', padding: '8px', fontSize: 12, fontWeight: 700,
                  background: canFetch && !isFetching ? 'var(--ss-blue)' : 'var(--surface2)',
                  color: canFetch && !isFetching ? '#fff' : 'var(--text3)',
                  border: `1px solid ${canFetch && !isFetching ? 'var(--ss-blue)' : 'var(--border2)'}`,
                  borderRadius: 5, cursor: canFetch && !isFetching ? 'pointer' : 'not-allowed',
                }}
              >
                {isFetching ? `⏳ ${loadedCount}/${carrierCount}` : '🔍 Browse Rates'}
              </button>
            </div>

            {/* View toggle */}
            <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 4 }}>
              <button
                onClick={() => setViewMode('all')}
                style={{
                  flex: 1, padding: '4px 8px', fontSize: 10, fontWeight: 700,
                  background: viewMode === 'all' ? 'var(--ss-blue)' : 'var(--surface2)',
                  color: viewMode === 'all' ? '#fff' : 'var(--text2)',
                  border: '1px solid var(--border2)', borderRadius: 4, cursor: 'pointer',
                }}
              >
                All ({rateCount})
              </button>
              <button
                onClick={() => setViewMode('carrier')}
                style={{
                  flex: 1, padding: '4px 8px', fontSize: 10, fontWeight: 700,
                  background: viewMode === 'carrier' ? 'var(--ss-blue)' : 'var(--surface2)',
                  color: viewMode === 'carrier' ? '#fff' : 'var(--text2)',
                  border: '1px solid var(--border2)', borderRadius: 4, cursor: 'pointer',
                }}
              >
                By Carrier
              </button>
            </div>

            {/* Carrier list */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {carriers.length === 0 ? (
                <div style={{ padding: '20px 12px', textAlign: 'center', color: 'var(--text3)', fontSize: 11 }}>
                  No carriers loaded
                </div>
              ) : carriers.map(carrier => {
                const state = ratesByCarrier[carrier.shippingProviderId];
                const rateCount = state?.status === 'ok' ? state.rates.length : 0;
                const isSelected = selectedCarrierPid === carrier.shippingProviderId && viewMode === 'carrier';
                const color = CARRIER_COLORS[carrier.carrierCode || ''] || 'var(--text3)';

                return (
                  <div
                    key={carrier.shippingProviderId}
                    onClick={() => {
                      setSelectedCarrierPid(carrier.shippingProviderId);
                      setViewMode('carrier');
                    }}
                    style={{
                      padding: '8px 12px',
                      borderBottom: '1px solid var(--border)',
                      cursor: 'pointer',
                      background: isSelected ? 'var(--ss-blue-bg)' : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: color, flexShrink: 0,
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {carrier.nickname}
                      </div>
                      {carrier.name && carrier.name !== carrier.nickname && (
                        <div style={{ fontSize: 10, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {carrier.name}
                        </div>
                      )}
                    </div>
                    {state?.status === 'loading' && <span style={{ fontSize: 10, color: 'var(--text3)' }}>⏳</span>}
                    {state?.status === 'ok' && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--green)' }}>{rateCount}</span>}
                    {state?.status === 'error' && <span style={{ fontSize: 10, color: 'var(--red)' }}>✕</span>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Right Panel: Rates ── */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 300, overflow: 'hidden' }}>
            {/* Rates header */}
            <div style={{
              padding: '10px 16px',
              borderBottom: '1px solid var(--border)',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: 'var(--surface2)',
            }}>
              <div style={{ fontSize: 12, fontWeight: 700 }}>
                {viewMode === 'all' ? `All Rates (cheapest first)` : `${carriers.find(c => c.shippingProviderId === selectedCarrierPid)?.nickname || 'Carrier'} Rates`}
              </div>
              {!hasDims && (
                <div style={{ marginLeft: 'auto', fontSize: 10, color: '#b45309', background: '#fef3c7', padding: '2px 8px', borderRadius: 10, border: '1px solid #fcd34d' }}>
                  ⚠ No dims — rates may be inaccurate
                </div>
              )}
            </div>

            {/* Rate list */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <RateList
                rates={viewMode === 'all' ? allRates : currentCarrierRates}
                showCarrier={viewMode === 'all'}
                carriers={carriers}
                isFetching={isFetching}
                hasSearched={Object.keys(ratesByCarrier).length > 0}
                onSelect={handleSelectRate}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── RateList ──────────────────────────────────────────────────────────────────

interface RateListProps {
  rates: RateWithMarkup[];
  showCarrier: boolean;
  carriers: CarrierAccount[];
  isFetching: boolean;
  hasSearched: boolean;
  onSelect: (rate: RateWithMarkup) => void;
}

function RateList({ rates, showCarrier, carriers, isFetching, hasSearched, onSelect }: RateListProps) {
  if (!hasSearched && !isFetching) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text3)' }}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>📦</div>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Enter weight & click Browse Rates</div>
        <div style={{ fontSize: 11 }}>Rates from all carriers will appear here</div>
      </div>
    );
  }

  if (isFetching && rates.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text3)' }}>
        <div className="spinner" />
        <div style={{ marginTop: 10, fontSize: 12 }}>Fetching rates…</div>
      </div>
    );
  }

  if (hasSearched && rates.length === 0 && !isFetching) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text3)' }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>❌</div>
        <div style={{ fontSize: 13 }}>No rates found</div>
        <div style={{ fontSize: 11, marginTop: 4 }}>Check weight/ZIP or try different dimensions</div>
      </div>
    );
  }

  return (
    <div>
      {rates.map((rate, idx) => (
        <RateRow
          key={`${rate.shippingProviderId}-${rate.serviceCode}-${idx}`}
          rate={rate}
          index={idx}
          showCarrier={showCarrier}
          carriers={carriers}
          isRecommended={idx === 0}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

// ── RateRow ───────────────────────────────────────────────────────────────────

interface RateRowProps {
  rate: RateWithMarkup;
  index: number;
  showCarrier: boolean;
  carriers: CarrierAccount[];
  isRecommended: boolean;
  onSelect: (rate: RateWithMarkup) => void;
}

function RateRow({ rate, index, showCarrier, carriers, isRecommended, onSelect }: RateRowProps) {
  const eta = etaLabel(rate);
  const carrier = carriers.find(c => c.shippingProviderId === rate.shippingProviderId);
  const label = showCarrier
    ? carrierLabel(rate.carrierCode, carrier?.nickname)
    : rate.serviceName;

  const hasMarkup = rate.markedCost > rate.baseCost + 0.005;
  const svcName = showCarrier ? rate.serviceName : '';

  return (
    <div
      onClick={() => onSelect(rate)}
      style={{
        padding: '10px 16px',
        borderBottom: '1px solid var(--border)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        transition: 'background .1s',
        background: isRecommended ? 'rgba(37,99,235,.04)' : 'transparent',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')}
      onMouseLeave={e => (e.currentTarget.style.background = isRecommended ? 'rgba(37,99,235,.04)' : 'transparent')}
    >
      {/* Rank */}
      <div style={{
        width: 22, height: 22, borderRadius: '50%',
        background: isRecommended ? 'var(--ss-blue)' : 'var(--surface2)',
        color: isRecommended ? '#fff' : 'var(--text3)',
        fontSize: 10, fontWeight: 800,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        {isRecommended ? '★' : index + 1}
      </div>

      {/* Service info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
        </div>
        {svcName && showCarrier && (
          <div style={{ fontSize: 11, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
            {svcName}
          </div>
        )}
        {eta && (
          <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 1 }}>📅 {eta}</div>
        )}
      </div>

      {/* Price */}
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: isRecommended ? 'var(--green)' : 'var(--text)' }}>
          ${rate.markedCost.toFixed(2)}
        </div>
        {hasMarkup && (
          <div style={{ fontSize: 10, color: 'var(--text3)' }}>
            base: ${rate.baseCost.toFixed(2)}
          </div>
        )}
      </div>

      {/* Select button */}
      <button
        onClick={e => { e.stopPropagation(); onSelect(rate); }}
        style={{
          padding: '5px 12px', fontSize: 11, fontWeight: 700,
          background: isRecommended ? 'var(--ss-blue)' : 'var(--surface2)',
          color: isRecommended ? '#fff' : 'var(--text)',
          border: `1px solid ${isRecommended ? 'var(--ss-blue)' : 'var(--border2)'}`,
          borderRadius: 4, cursor: 'pointer', flexShrink: 0,
        }}
      >
        Select
      </button>
    </div>
  );
}
