/**
 * ProfitEstimate Component
 * Displays estimated profit from markups
 */

import React, { useMemo } from 'react';
import { useMarkups } from '../../contexts/MarkupsContext';
import './ProfitEstimate.css';

export function ProfitEstimate({ dailyOrders }: { dailyOrders: number }) {
  const { markups } = useMarkups();

  const estimate = useMemo(() => {
    const values = Object.values(markups).map(m => {
      if (m.type === 'pct') {
        // Use 8oz label as baseline (8 * (pct / 100) = profit per label)
        return 8 * (m.value / 100);
      }
      return m.value || 0;
    });

    const avgMarkup = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    const dailyProfit = dailyOrders * avgMarkup;
    const monthlyProfit = dailyProfit * 30;

    return {
      avgMarkup: avgMarkup.toFixed(2),
      dailyProfit: dailyProfit.toFixed(0),
      monthlyProfit: monthlyProfit.toFixed(0)
    };
  }, [markups, dailyOrders]);

  return (
    <div className="profit-estimate">
      <div className="profit-row">
        <span>Avg markup/label:</span>
        <strong style={{ color: 'var(--orange)' }}>${estimate.avgMarkup}</strong>
      </div>
      <div className="profit-row">
        <span>Daily orders:</span>
        <strong>{dailyOrders.toLocaleString()}</strong>
      </div>
      <div className="profit-row">
        <span>Est. daily profit:</span>
        <strong style={{ color: 'var(--green)' }}>${estimate.dailyProfit}</strong>
      </div>
      <div className="profit-row">
        <span>Est. monthly profit:</span>
        <strong style={{ color: 'var(--green)' }}>${estimate.monthlyProfit}/mo</strong>
      </div>
    </div>
  );
}
