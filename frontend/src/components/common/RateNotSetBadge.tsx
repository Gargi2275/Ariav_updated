import React from 'react';

export function rateIsUnset(rate: string | number | null | undefined): boolean {
  if (rate === null || rate === undefined) return true;
  if (typeof rate === 'string' && rate.trim() === '') return true;
  return false;
}

export const RateNotSetBadge: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span className={`text-[var(--erp-muted)] ${className}`}>Not set</span>
);
