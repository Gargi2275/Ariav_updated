import React from 'react';

export interface LedgerMetricItem {
  label: string;
  value: string | number;
  subValue?: string;
  change?: string;
  trend?: 'up' | 'down' | 'neutral';
  badge?: string;
}

interface LedgerMetricStripProps {
  metrics: LedgerMetricItem[];
  className?: string;
}

export const LedgerMetricStrip: React.FC<LedgerMetricStripProps> = ({ metrics, className = '' }) => {
  return (
    <div
      className={`grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 divide-x divide-y lg:divide-y-0 border text-left bg-[var(--erp-surface)] border-[var(--erp-hairline-strong)] ${className}`}
      style={{
        borderColor: 'var(--erp-hairline-strong)',
      }}
    >
      {metrics.map((metric, idx) => {
        const semanticBorder = metric.trend === 'up'
          ? 'border-l-2 border-l-[var(--erp-positive)]'
          : metric.trend === 'down'
          ? 'border-l-2 border-l-[var(--erp-negative)]'
          : 'border-l-2 border-l-[var(--erp-gold)]';

        const badgeClass = metric.trend === 'up'
          ? 'erp-badge erp-badge-jade text-[9px] px-1.5 py-0'
          : metric.trend === 'down'
          ? 'erp-badge erp-badge-rose text-[9px] px-1.5 py-0'
          : 'erp-badge erp-badge-gold text-[9px] px-1.5 py-0';

        return (
          <div
            key={idx}
            className={`p-3.5 transition-colors hover:bg-[var(--erp-surface-2)] flex flex-col justify-between ${semanticBorder}`}
            style={{ borderColor: 'var(--erp-hairline)' }}
          >
            {/* Header: Micro-Label without truncation and clean line wrap */}
            <div className="flex items-start justify-between gap-1.5 mb-2 min-h-[26px]">
              <span className="font-body text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-[var(--erp-muted)] leading-tight">
                {metric.label}
              </span>
              {metric.badge && (
                <span className={badgeClass}>
                  {metric.badge}
                </span>
              )}
            </div>
            
            {/* Hero Number (Large, Bold Monospace) */}
            <div className="my-0.5">
              <div className="font-mono text-2xl lg:text-[26px] font-bold tracking-tight text-[var(--erp-text)] leading-none">
                {metric.value}
              </div>
              {metric.subValue && (
                <span className="font-mono text-[11px] text-[var(--erp-muted)] mt-1 block">
                  {metric.subValue}
                </span>
              )}
            </div>

            {/* Micro-Trend Footnote with High-Contrast Directional Indicator */}
            {metric.change && (
              <div className="mt-2 pt-1.5 border-t border-[var(--erp-hairline)] flex items-center justify-between text-[11px] font-mono">
                <span
                  className={`font-semibold ${
                    metric.trend === 'up'
                      ? 'text-[var(--erp-positive)]'
                      : metric.trend === 'down'
                      ? 'text-[var(--erp-negative)]'
                      : 'text-[var(--erp-muted)]'
                  }`}
                >
                  {metric.change}
                </span>
                <span
                  className={`text-xs font-bold leading-none select-none ${
                    metric.trend === 'up'
                      ? 'text-[var(--erp-positive)]'
                      : metric.trend === 'down'
                      ? 'text-[var(--erp-negative)]'
                      : 'text-[var(--erp-gold)]'
                  }`}
                  title={metric.trend === 'up' ? 'Positive trend' : metric.trend === 'down' ? 'Down / Liability' : 'Neutral position'}
                >
                  {metric.trend === 'up' ? '▲' : metric.trend === 'down' ? '▼' : '■'}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
