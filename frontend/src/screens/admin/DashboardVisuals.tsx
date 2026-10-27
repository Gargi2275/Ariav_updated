import React, { useState } from 'react';

export function exactInr(value: number): string {
  return `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function axisInr(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 10000000) return `₹${(value / 10000000).toLocaleString('en-IN', { maximumFractionDigits: 2 })} Cr`;
  if (abs >= 100000) return `₹${(value / 100000).toLocaleString('en-IN', { maximumFractionDigits: 2 })} L`;
  return exactInr(value);
}

export function Panel({
  title,
  hint,
  children,
  action,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-2 rounded-md border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] p-3 shadow-[0_1px_2px_rgba(27,36,48,0.04)]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-display text-base font-semibold leading-tight text-[var(--erp-text)]">{title}</h2>
          {hint ? <p className="mt-0.5 text-[11px] leading-snug text-[var(--erp-muted)]">{hint}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex min-h-10 items-center justify-center rounded-md border border-dashed border-[var(--erp-hairline-strong)] px-3 py-2 text-center text-xs leading-snug text-[var(--erp-muted)]">
      {message}
    </div>
  );
}

export function HBars({
  rows,
  format,
  onOpen,
}: {
  rows: { key: string; label: string; value: number; tone?: string; detail?: string }[];
  format: (value: number) => string;
  onOpen?: (key: string) => void;
}) {
  const [active, setActive] = useState<string | null>(null);
  const max = Math.max(1, ...rows.map(row => row.value));
  if (!rows.length) return <EmptyChart message="No rows in this scope." />;
  return (
    <div className="flex flex-col gap-1">
      {rows.map(row => {
        const width = `${Math.max(row.value > 0 ? 2 : 0, (row.value / max) * 100)}%`;
        const body = (
          <>
            <span className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="truncate text-[var(--erp-text)]">{row.label}</span>
              <span className="shrink-0 font-mono tabular-nums text-[var(--erp-text)]">{format(row.value)}</span>
            </span>
            <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-[var(--erp-surface-2)]">
              <span className="block h-full rounded-full" style={{ width, background: row.tone || 'var(--erp-gold)' }} />
            </span>
            {row.detail ? <span className="mt-1 block text-xs text-[var(--erp-muted)]">{row.detail}</span> : null}
          </>
        );
        if (!onOpen) {
          return <div key={row.key} className="px-1 py-1">{body}</div>;
        }
        return (
          <button
            key={row.key}
            type="button"
            onClick={() => onOpen(row.key)}
            onFocus={() => setActive(row.key)}
            onBlur={() => setActive(current => current === row.key ? null : current)}
            onMouseEnter={() => setActive(row.key)}
            onMouseLeave={() => setActive(current => current === row.key ? null : current)}
            className={`rounded-md px-2 py-1.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--erp-gold)] ${active === row.key ? 'bg-[var(--erp-surface-2)]' : 'hover:bg-[var(--erp-surface-2)]'}`}
            aria-label={`${row.label}, ${format(row.value)}`}
          >
            {body}
          </button>
        );
      })}
    </div>
  );
}

export function FlowChart({
  points,
}: {
  points: { key: string; label: string; value: number; color: string }[];
}) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [tip, setTip] = useState<string | null>(null);
  const visible = points.filter(point => !hidden.has(point.key));
  const peak = Math.max(0, ...visible.map(point => point.value));
  const max = Math.max(peak, 1);
  const axisMax = peak === 0 ? 0 : peak;
  if (points.every(point => point.value === 0)) {
    return (
      <div className="rounded-md border border-dashed border-[var(--erp-hairline-strong)] px-3 py-3 text-xs text-[var(--erp-muted)]">
        <p>No amount recorded for this selection.</p>
        <ul className="mt-1 space-y-0.5">
          {points.map(point => (
            <li key={point.key} className="flex justify-between gap-3">
              <span>{point.label}</span>
              <span className="font-mono text-[var(--erp-text)]">{exactInr(point.value)}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  const width = 640;
  const height = 148;
  const pad = { top: 8, right: 8, bottom: 28, left: 64 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-2">
        {points.map(point => {
          const off = hidden.has(point.key);
          return (
            <button
              key={point.key}
              type="button"
              aria-pressed={!off}
              onClick={() => setHidden(prev => {
                const next = new Set(prev);
                if (next.has(point.key)) next.delete(point.key);
                else if (next.size < points.length - 1) next.add(point.key);
                return next;
              })}
              className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] ${off ? 'border-[var(--erp-hairline)] text-[var(--erp-faint)]' : 'border-[var(--erp-hairline-strong)] text-[var(--erp-text)]'}`}
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: off ? 'var(--erp-faint)' : point.color }} />
              {point.label}
            </button>
          );
        })}
      </div>
      {visible.length === 0 ? <EmptyChart message="Turn a series back on to see the chart." /> : (
        <div className="overflow-x-auto">
          <svg viewBox={`0 0 ${width} ${height}`} className="h-32 w-full min-w-[420px]" role="img" aria-label="Period money measures">
            {[0, 0.5, 1].map(tick => {
              const y = pad.top + innerH * (1 - tick);
              return (
                <g key={tick}>
                  <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} stroke="var(--erp-hairline)" />
                  <text x={pad.left - 8} y={y + 4} textAnchor="end" fill="var(--erp-muted)" fontSize="11" fontFamily="var(--font-mono, monospace)">{axisInr(axisMax * tick)}</text>
                </g>
              );
            })}
            {visible.map((point, index) => {
              const slot = innerW / visible.length;
              const barW = Math.min(72, slot * 0.45);
              const h = (point.value / max) * innerH;
              const x = pad.left + index * slot + (slot - barW) / 2;
              const y = pad.top + innerH - h;
              return (
                <g key={point.key} onMouseEnter={() => setTip(point.key)} onMouseLeave={() => setTip(null)}>
                  <rect x={x} y={y} width={barW} height={Math.max(h, point.value === 0 ? 1 : 0)} fill={point.color} rx="3" />
                  <text x={x + barW / 2} y={height - 12} textAnchor="middle" fill="var(--erp-muted)" fontSize="11">{point.label}</text>
                </g>
              );
            })}
          </svg>
          <p className="min-h-5 text-xs text-[var(--erp-muted)]" aria-live="polite">
            {tip ? `${points.find(point => point.key === tip)?.label}: ${exactInr(points.find(point => point.key === tip)?.value || 0)}` : 'Hover a bar for the exact amount.'}
          </p>
        </div>
      )}
      <details className="mt-1 text-xs">
        <summary className="cursor-pointer text-[var(--erp-gold)]">View as a table</summary>
        <table className="mt-2 w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-[var(--erp-muted)]">
            <tr><th className="py-1 font-medium">Measure</th><th className="py-1 text-right font-medium">Amount</th></tr>
          </thead>
          <tbody>
            {points.map(point => (
              <tr key={point.key} className="border-t border-[var(--erp-hairline)]">
                <td className="py-1.5">{point.label}</td>
                <td className="py-1.5 text-right font-mono tabular-nums">{exactInr(point.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

export function ProgressSplit({
  total,
  parts,
  onOpen,
}: {
  total: number;
  parts: { key: string; label: string; value: number; color: string }[];
  onOpen?: (key: string) => void;
}) {
  if (total <= 0) return <EmptyChart message="No purchase orders in this period." />;
  const covered = parts.reduce((sum, part) => sum + part.value, 0);
  if (covered !== total) {
    return <EmptyChart message="Dispatch counts do not add up to the purchase-order total, so a single progress bar is not shown." />;
  }
  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-[var(--erp-surface-2)]" role="img" aria-label={parts.map(part => `${part.label} ${part.value}`).join(', ')}>
        {parts.map(part => part.value > 0 ? (
          <span key={part.key} style={{ width: `${(part.value / total) * 100}%`, background: part.color }} title={`${part.label}: ${part.value}`} />
        ) : null)}
      </div>
      <ul className="mt-2 grid grid-cols-3 gap-2">
        {parts.map(part => {
          const body = (
            <>
              <span className="block text-[11px] text-[var(--erp-muted)]">{part.label}</span>
              <span className="font-mono text-sm tabular-nums text-[var(--erp-text)]">{part.value}</span>
              <span className="block text-[11px] text-[var(--erp-faint)]">{Math.round((part.value / total) * 100)}%</span>
            </>
          );
          return (
            <li key={part.key}>
              {onOpen ? (
                <button type="button" onClick={() => onOpen(part.key)} className="w-full rounded-md px-1 py-0.5 text-left hover:bg-[var(--erp-surface-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--erp-gold)]">
                  {body}
                </button>
              ) : body}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
