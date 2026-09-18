import React from 'react';

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
  values: number[];
}

interface ReportChartProps {
  kind: 'bar' | 'line';
  labels: string[];
  series: ChartSeries[];
  empty?: boolean;
  emptyMessage?: string;
}

function tickLabel(label: string): string {
  return /^\d{4}-\d{2}/.test(label) ? label.slice(5) : label;
}

export const ReportChart: React.FC<ReportChartProps> = ({
  kind,
  labels,
  series,
  empty,
  emptyMessage = 'No data for this period',
}) => {
  if (empty || !labels.length || !series.length) {
    return (
      <div className="h-64 flex items-center justify-center border border-[var(--erp-hairline)] bg-[var(--erp-surface-2)]">
        <p className="text-xs font-mono text-[var(--erp-muted)]">{emptyMessage}</p>
      </div>
    );
  }
  const width = 720;
  const height = 260;
  const pad = { top: 16, right: 16, bottom: 36, left: 56 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const max = Math.max(1, ...series.flatMap(s => s.values));
  const n = labels.length;
  const groupW = innerW / n;

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full min-w-[560px] h-64" role="img">
        {[0, 0.25, 0.5, 0.75, 1].map(t => {
          const y = pad.top + innerH * (1 - t);
          return (
            <g key={t}>
              <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} stroke="var(--erp-hairline)" strokeWidth="1" />
              <text x={pad.left - 8} y={y + 3} textAnchor="end" fill="var(--erp-muted)" fontSize="10" fontFamily="var(--font-mono, monospace)">
                {Math.round(max * t).toLocaleString('en-IN')}
              </text>
            </g>
          );
        })}
        {kind === 'bar'
          ? series[0] && labels.map((label, i) => {
              const barSlot = groupW * 0.7;
              const barW = barSlot / series.length;
              return (
                <g key={label}>
                  {series.map((s, si) => {
                    const h = (s.values[i] / max) * innerH;
                    const x = pad.left + i * groupW + groupW * 0.15 + si * barW;
                    const y = pad.top + innerH - h;
                    return <rect key={s.key} x={x} y={y} width={Math.max(2, barW - 2)} height={h} fill={s.color} />;
                  })}
                  <text
                    x={pad.left + i * groupW + groupW / 2}
                    y={height - 12}
                    textAnchor="middle"
                    fill="var(--erp-muted)"
                    fontSize="9"
                    fontFamily="var(--font-mono, monospace)"
                  >
                    {tickLabel(label)}
                  </text>
                </g>
              );
            })
          : series.map(s => {
              const pts = s.values.map((v, i) => {
                const x = pad.left + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
                const y = pad.top + innerH - (v / max) * innerH;
                return `${x},${y}`;
              }).join(' ');
              return (
                <polyline
                  key={s.key}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="2"
                  points={pts}
                />
              );
            })}
        {kind === 'line' && labels.map((label, i) => (
          <text
            key={label}
            x={pad.left + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW)}
            y={height - 12}
            textAnchor="middle"
            fill="var(--erp-muted)"
            fontSize="9"
            fontFamily="var(--font-mono, monospace)"
          >
            {tickLabel(label)}
          </text>
        ))}
      </svg>
      <div className="flex flex-wrap gap-3 px-2 pb-2">
        {series.map(s => (
          <span key={s.key} className="text-[11px] font-mono text-[var(--erp-muted)] flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
};
