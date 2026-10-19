import React from 'react';
import { useErp } from '../../context/ErpContext';
import { periodLabel } from '../../utils/dateFilters';

export const PeriodScope: React.FC = () => {
  const { financialYear, periodMonth } = useErp();
  return (
    <p className="text-[11px] font-mono text-[var(--erp-muted)]">
      Showing {periodLabel(financialYear, periodMonth)}. Change the year or month in the header.
    </p>
  );
};
