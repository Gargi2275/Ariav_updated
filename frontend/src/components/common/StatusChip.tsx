import React from 'react';
import { VoucherStatus } from '../../types/erp';

export type StatusChipType =
  | VoucherStatus
  | 'approved'
  | 'dr'
  | 'cr'
  | 'active'
  | 'inactive'
  | 'overdue'
  | 'critical'
  | 'notice'
  | 'due soon'
  | 'due_soon'
  | 'within limit'
  | 'within_limit'
  | 'dispatched'
  | 'partially_dispatched'
  | 'paid'
  | 'unpaid';

interface StatusChipProps {
  status: StatusChipType | string;
  label?: string;
  className?: string;
}

export const StatusChip: React.FC<StatusChipProps> = ({ status, label, className = '' }) => {
  const norm = status.toLowerCase().replace(/_/g, ' ');
  
  let colorClasses = '';
  let dotColor = '';

  switch (norm) {
    case 'overdue':
    case 'critical':
    case 'rejected':
    case 'unpaid':
    case 'cr':
      colorClasses = 'bg-[rgba(217,99,90,0.12)] text-[var(--erp-negative)] border-[rgba(217,99,90,0.35)]';
      dotColor = 'bg-[var(--erp-negative)]';
      break;
    case 'due soon':
    case 'notice':
    case 'pending':
    case 'partial':
    case 'partially dispatched':
      colorClasses = 'bg-[rgba(201,162,78,0.12)] text-[var(--erp-gold)] border-[rgba(201,162,78,0.35)]';
      dotColor = 'bg-[var(--erp-gold)] animate-pulse';
      break;
    case 'within limit':
    case 'cleared':
    case 'posted':
    case 'approved':
    case 'balanced':
    case 'active':
    case 'dispatched':
    case 'paid':
    case 'dr':
      colorClasses = 'bg-[rgba(55,168,131,0.12)] text-[var(--erp-positive)] border-[rgba(55,168,131,0.35)]';
      dotColor = 'bg-[var(--erp-positive)]';
      break;
    default:
      colorClasses = 'bg-[var(--erp-surface-2)] text-[var(--erp-muted)] border-[var(--erp-hairline-strong)]';
      dotColor = 'bg-[var(--erp-muted)]';
  }

  const displayLabel = label || status.toUpperCase().replace(/_/g, ' ');

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 text-[11px] font-mono font-medium tracking-normal border whitespace-nowrap rounded-none select-none ${colorClasses} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
      <span>{displayLabel}</span>
    </span>
  );
};
