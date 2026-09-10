import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

export interface Column<T> {
  header: string;
  accessorKey?: keyof T;
  render?: (row: T, index: number) => React.ReactNode;
  align?: 'left' | 'center' | 'right';
  mono?: boolean;
  sortable?: boolean;
  width?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (row: T, index: number) => string | number;
  emptyMessage?: string;
  emptyActionText?: string;
  onEmptyAction?: () => void;
  className?: string;
  maxHeight?: string;
  footerRow?: React.ReactNode;
  rowClassName?: (row: T, index: number) => string;
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  emptyMessage = 'No ledger records found for this period.',
  emptyActionText,
  onEmptyAction,
  className = '',
  maxHeight = '650px',
  footerRow,
  rowClassName
}: DataTableProps<T>) {
  const [sortCol, setSortCol] = useState<keyof T | null>(null);
  const [sortAsc, setSortAsc] = useState(true);

  const handleSort = (col: Column<T>) => {
    if (!col.accessorKey || !col.sortable) return;
    if (sortCol === col.accessorKey) {
      setSortAsc(prev => !prev);
    } else {
      setSortCol(col.accessorKey);
      setSortAsc(true);
    }
  };

  const sortedData = [...data].sort((a, b) => {
    if (!sortCol) return 0;
    const aVal = a[sortCol];
    const bVal = b[sortCol];
    if (aVal === bVal) return 0;
    if (aVal == null) return 1;
    if (bVal == null) return -1;
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sortAsc ? aVal - bVal : bVal - aVal;
    }
    return sortAsc
      ? String(aVal).localeCompare(String(bVal))
      : String(bVal).localeCompare(String(aVal));
  });

  return (
    <div
      className={`border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] overflow-hidden rounded-none ${className}`}
      style={{ borderColor: 'var(--erp-hairline-strong)' }}
    >
      <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight }}>
        <table className="w-full text-left border-collapse font-body">
          <thead className="sticky top-0 z-20 bg-[var(--erp-surface-2)] border-b-2 border-[var(--erp-hairline-strong)] select-none shadow-xs">
            <tr>
              {columns.map((col, idx) => {
                const isSorted = sortCol === col.accessorKey;
                return (
                  <th
                    key={idx}
                    onClick={() => handleSort(col)}
                    data-sortable={col.sortable ? "true" : "false"}
                    style={{ width: col.width }}
                    className={`px-3.5 py-2.5 font-mono text-[11px] font-semibold tracking-wider uppercase border-r border-[var(--erp-hairline)] last:border-r-0 whitespace-nowrap transition-colors ${
                      isSorted
                        ? 'text-[var(--erp-gold)] bg-[var(--erp-surface)] font-bold'
                        : 'text-[var(--erp-muted)] hover:text-[var(--erp-text)]'
                    } ${
                      col.align === 'right'
                        ? 'text-right'
                        : col.align === 'center'
                        ? 'text-center'
                        : 'text-left'
                    } ${col.sortable ? 'cursor-pointer hover:bg-[var(--erp-surface)]/80' : ''}`}
                  >
                    <div
                      className={`inline-flex items-center gap-1.5 ${
                        col.align === 'right' ? 'justify-end' : col.align === 'center' ? 'justify-center' : 'justify-start'
                      }`}
                    >
                      <span className="tracking-wider">{col.header}</span>
                      {col.sortable && col.accessorKey && (
                        <span className="inline-flex items-center">
                          {isSorted ? (
                            sortAsc ? (
                              <ChevronUp className="w-3.5 h-3.5 text-[var(--erp-gold)] stroke-[2.5]" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5 text-[var(--erp-gold)] stroke-[2.5]" />
                            )
                          ) : (
                            <span className="opacity-30 hover:opacity-75 text-[10px] text-[var(--erp-muted)]">↕</span>
                          )}
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--erp-hairline)] text-sm font-body">
            {sortedData.length > 0 ? (
              sortedData.map((row, rIdx) => {
                const customRowClass = rowClassName ? rowClassName(row, rIdx) : '';
                return (
                  <tr
                    key={keyExtractor(row, rIdx)}
                    className={`transition-colors group ${
                      customRowClass || 'hover:bg-[var(--erp-surface-2)]/60'
                    }`}
                  >
                    {columns.map((col, cIdx) => {
                    const cellContent = col.render
                      ? col.render(row, rIdx)
                      : col.accessorKey
                      ? (row[col.accessorKey] as React.ReactNode)
                      : null;

                    return (
                      <td
                        key={cIdx}
                        className={`px-3.5 py-2 text-xs border-r border-[var(--erp-hairline)] last:border-r-0 whitespace-nowrap text-[var(--erp-text)] ${
                          col.mono ? 'font-mono' : 'font-body'
                        } ${
                          col.align === 'right'
                            ? 'text-right'
                            : col.align === 'center'
                            ? 'text-center'
                            : 'text-left'
                        }`}
                      >
                        {cellContent}
                      </td>
                    );
                  })}
                </tr>
              );
            })
          ) : (
              <tr>
                <td colSpan={columns.length} className="py-12 text-center text-xs font-body text-[var(--erp-muted)]">
                  <div className="flex flex-col items-center justify-center gap-2 font-body">
                    <p className="font-mono">{emptyMessage}</p>
                    {emptyActionText && onEmptyAction && (
                      <button
                        onClick={onEmptyAction}
                        className="px-3 py-1.5 text-xs font-body text-[var(--erp-gold)] border border-[var(--erp-gold)]/40 hover:bg-[var(--erp-gold)]/10 transition-colors cursor-pointer"
                      >
                        {emptyActionText}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            )}
          </tbody>
          {footerRow && (
            <tfoot className="sticky bottom-0 bg-[var(--erp-surface-2)] border-t border-[var(--erp-hairline-strong)] font-mono text-xs">
              {footerRow}
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
