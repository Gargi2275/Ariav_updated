import React from 'react';

export interface PurchaseOrderLineImportToggleProps {
  isDigitalPo: boolean;
  mode: 'manual' | 'upload';
  onModeChange: (mode: 'manual' | 'upload') => void;
}

export function shouldShowLineItemsGrid(mode: 'manual' | 'upload', rowsLoaded: boolean): boolean {
  return mode === 'manual' || rowsLoaded;
}

export function lineItemsAreReadOnly(mode: 'manual' | 'upload', rowsLoaded: boolean): boolean {
  return mode === 'upload' && rowsLoaded;
}

export const PurchaseOrderLineImportToggle: React.FC<PurchaseOrderLineImportToggleProps> = ({
  isDigitalPo,
  mode,
  onModeChange,
}) => {
  if (!isDigitalPo) return null;
  return (
    <div className="inline-flex rounded-md border border-[var(--erp-hairline-strong)] p-1 bg-[var(--erp-surface)]" role="group" aria-label="Line item entry method">
      <button
        type="button"
        aria-pressed={mode === 'upload'}
        onClick={() => onModeChange('upload')}
        className={`px-3 py-2 text-xs font-semibold rounded ${mode === 'upload' ? 'bg-[var(--erp-gold)] text-[#0F141B]' : 'text-[var(--erp-muted)] hover:text-[var(--erp-text)]'}`}
      >
        Upload Excel
      </button>
      <button
        type="button"
        aria-pressed={mode === 'manual'}
        onClick={() => onModeChange('manual')}
        className={`px-3 py-2 text-xs font-semibold rounded ${mode === 'manual' ? 'bg-[var(--erp-gold)] text-[#0F141B]' : 'text-[var(--erp-muted)] hover:text-[var(--erp-text)]'}`}
      >
        Enter manually
      </button>
    </div>
  );
};
