/**
 * MarkupTable Component
 * Displays and edits per-carrier markups
 */

import React, { useState, useEffect } from 'react';
import { useMarkups } from '../../contexts/MarkupsContext';
import type { MarkupType } from '../../types/markups';
import './MarkupTable.css';

interface CarrierAccount {
  shippingProviderId: number;
  nickname: string;
  name: string;
}

export function MarkupTable({ accounts }: { accounts: CarrierAccount[] }) {
  const { markups, saveMarkup, loading, error } = useMarkups();
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(''), 3000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  const handleMarkupChange = async (
    pidOrCarrier: number | string,
    type: MarkupType,
    value: string
  ) => {
    setSaving(true);
    try {
      const numValue = parseFloat(value) || 0;
      await saveMarkup(pidOrCarrier, type, numValue);
      setSuccessMessage('✅ Markup saved — rates refreshed');
    } catch (err) {
      console.error('Failed to save markup:', err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="markup-table-loading">Loading markups...</div>;

  if (!accounts || accounts.length === 0) {
    return (
      <div className="markup-table-empty">
        <span>Open Rate Browser once to load carrier accounts.</span>
      </div>
    );
  }

  return (
    <div className="markup-table-container">
      {error && <div className="markup-table-error">⚠️ {error}</div>}
      {successMessage && <div className="markup-table-success">{successMessage}</div>}

      <table className="markup-table">
        <thead>
          <tr>
            <th>Carrier Account</th>
            <th>Type</th>
            <th>Value</th>
            <th>Preview</th>
          </tr>
        </thead>
        <tbody>
          {accounts.map(account => {
            const m = markups[account.shippingProviderId] || { type: 'flat' as const, value: 0 };
            const label = account.nickname || account.name || `Account ${account.shippingProviderId}`;
            const preview = m.type === 'pct' ? `+${m.value || 0}%` : `+$${(m.value || 0).toFixed(2)}`;

            return (
              <tr key={account.shippingProviderId} className="markup-row">
                <td className="markup-label">{label}</td>
                <td>
                  <select
                    value={m.type}
                    onChange={e =>
                      handleMarkupChange(account.shippingProviderId, e.target.value as MarkupType, String(m.value))
                    }
                    disabled={saving}
                    className="markup-type-select"
                  >
                    <option value="flat">$</option>
                    <option value="pct">%</option>
                  </select>
                </td>
                <td>
                  <input
                    type="number"
                    min="0"
                    step="0.25"
                    value={m.value != null ? m.value : ''}
                    placeholder="0"
                    onChange={e => handleMarkupChange(account.shippingProviderId, m.type, e.target.value)}
                    disabled={saving}
                    className="markup-value-input"
                  />
                </td>
                <td className="markup-preview">{preview}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
