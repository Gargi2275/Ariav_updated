import React from 'react';

export interface LedgerMetricItem {
  label: string;
  value: string | number;
  subValue?: string;
  change?: string;
  trend?: 'up' | 'down' | 'neutral';
  badge?: string;
  onClick?: () => void;
  hrefLabel?: string;
}

interface LedgerMetricStripProps {
  metrics: LedgerMetricItem[];
  className?: string;
  compact?: boolean;
}

export const LedgerMetricStrip: React.FC<LedgerMetricStripProps> = ({ metrics, className = '', compact = false }) => {
  return (
    <div
      className={`grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2 text-left ${className}`}
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
            className={`dashboard-kpi-card ${compact ? 'min-h-[96px] p-4' : 'p-4'} flex flex-col justify-between ${semanticBorder} ${metric.onClick ? 'cursor-pointer group/kpi' : ''}`}
            onClick={metric.onClick}
            onKeyDown={metric.onClick ? event => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                metric.onClick?.();
              }
            } : undefined}
            role={metric.onClick ? 'link' : undefined}
            tabIndex={metric.onClick ? 0 : undefined}
            aria-label={metric.onClick ? `Open ${metric.hrefLabel || metric.label}` : undefined}
            title={metric.onClick ? `Open ${metric.hrefLabel || metric.label}` : undefined}
          >
            {/* Header: Micro-Label without truncation and clean line wrap */}
            <div className={`${compact ? 'mb-2 min-h-[18px]' : 'mb-2 min-h-[26px]'} flex items-start justify-between gap-1.5`}>
              <span className={`font-body ${compact ? 'text-xs' : 'text-xs sm:text-[13px]'} font-semibold uppercase tracking-wide leading-tight ${metric.onClick ? 'text-[var(--erp-gold)] group-hover/kpi:text-[var(--erp-gold-soft)]' : 'text-[var(--erp-muted)]'}`}>
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
              <div className={`font-mono ${compact ? 'text-xl lg:text-2xl' : 'text-2xl lg:text-[26px]'} font-bold tracking-tight leading-tight ${metric.onClick ? 'text-[var(--erp-text)] group-hover/kpi:text-[var(--erp-gold-soft)]' : 'text-[var(--erp-text)]'}`}>
                {metric.value}
              </div>
              {metric.subValue && (
                <span className="font-body text-xs text-[var(--erp-muted)] mt-1 block leading-snug">
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
