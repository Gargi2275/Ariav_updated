import React from 'react';
import { StatusChip } from './StatusChip';

export function rateIsUnset(rate: string | number | null | undefined): boolean {
  if (rate === null || rate === undefined) return true;
  if (typeof rate === 'string' && rate.trim() === '') return true;
  return false;
}

export const RateNotSetBadge: React.FC<{ className?: string }> = ({ className = '' }) => (
  <StatusChip status="critical" label="RATE NOT SET" className={className} />
);
