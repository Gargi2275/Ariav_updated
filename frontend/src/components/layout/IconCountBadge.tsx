import React from 'react';

type IconCountTone = 'gold' | 'rose';

function formatCount(count: number): string {
  if (count > 99) return '99+';
  return String(count);
}

/** Overlapping corner count for icon-only header buttons. Hidden when count is 0. */
export const IconCountBadge: React.FC<{ count: number; tone: IconCountTone }> = ({ count, tone }) => {
  if (count <= 0) return null;
  const label = formatCount(count);
  const isWide = label.length > 1;
  const toneClass = tone === 'rose' ? 'bg-[var(--erp-negative)]' : 'bg-[var(--erp-gold)]';

  return (
    <span
      className={`absolute -top-1 -right-1 h-[14px] min-w-[14px] ${isWide ? 'px-1' : ''} rounded-full ${toneClass} text-white text-[9px] font-mono font-semibold leading-none flex items-center justify-center pointer-events-none`}
    >
      {label}
    </span>
  );
};
