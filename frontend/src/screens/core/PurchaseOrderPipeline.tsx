import React, { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { GripVertical, Lock, MoreHorizontal } from 'lucide-react';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import { createPortal } from 'react-dom';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { num } from '../../services/mastersApi';
import { notifyApiError } from '../../services/notify';
import { PipelineSummary, PurchaseOrderRow, purchaseOrdersApi } from '../../services/purchaseOrdersApi';

const LOCKED = new Set(['Partially Dispatched', 'Fully Dispatched']);
const PIPELINE_STATUSES = [
  'Draft',
  'Submitted',
  'Sent to Brand',
  'Brand Accepted',
  'Partially Dispatched',
  'Fully Dispatched',
  'Closed',
  'On Hold',
  'Rejected',
  'Cancelled',
] as const;
type Summary = Record<string, { count: number; total_amount: string }>;

export function isPipelineDropAllowed(row: PurchaseOrderRow, status: string): boolean {
  return !LOCKED.has(status) && row.allowed_transitions.includes(status);
}

interface Props {
  rowsByStatus: Record<string, PurchaseOrderRow[]>;
  summary: PipelineSummary['statuses'];
  orderTypeFilter: string;
  loading: boolean;
  onLoadMore: (status: string) => void;
  onOpen: (id: number) => void;
  onRefresh: () => Promise<void>;
  density: 'compact' | 'comfortable';
}

export interface PurchaseOrderPipelineHandle {
  scrollBy: (direction: -1 | 1) => void;
}

const money = (value: string | number | null | undefined) => `₹${num(value).toFixed(2)}`;

function Card({ row, orderTypeFilter, density, onOpen, onMove }: { row: PurchaseOrderRow; orderTypeFilter: string; density: 'compact' | 'comfortable'; onOpen: (id: number) => void; onMove: (row: PurchaseOrderRow, status: string) => void }) {
  const movable = row.allowed_transitions.length > 0;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: row.id, disabled: !movable, data: { row } });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  return (
    <article ref={setNodeRef} style={style} title={orderTypeFilter ? undefined : `${row.order_type} purchase order`} aria-label={orderTypeFilter ? undefined : `${row.order_type} purchase order`} className={`relative border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface-2)] ${density === 'compact' ? 'h-[70px] p-1.5' : 'p-3'} ${isDragging ? 'opacity-30' : ''}`}>
      {!orderTypeFilter ? <span title={`${row.order_type} purchase order`} aria-label={`${row.order_type} purchase order`} className={`absolute inset-y-0 left-0 w-[3px] ${row.order_type === 'Manual' ? 'bg-[var(--erp-gold)]' : 'bg-[var(--erp-positive)]'}`} /> : null}
      <div className="flex items-start gap-1">
        {movable ? <button type="button" {...listeners} {...attributes} aria-label={`Drag ${row.po_number}`} className="mt-0.5 flex h-7 w-6 shrink-0 items-center justify-center text-[var(--erp-muted)] cursor-grab"><GripVertical className="w-3.5 h-3.5" /></button> : <span className="w-6 shrink-0" />}
        <button type="button" onClick={() => onOpen(row.id)} className="min-w-0 flex-1 text-left">
          <span className="flex justify-between gap-2 font-mono text-[13px] text-[var(--erp-gold)]"><span className="truncate">{row.po_number}</span><span className="text-[var(--erp-text)]">{row.priced_lines ? money(row.total_amount) : '—'}</span></span>
          <span className="mt-0.5 flex justify-between gap-2 text-[11px]"><span className="truncate" title={row.customer_name}>{row.customer_name}</span><span className="shrink-0">{row.lines.length} lines</span></span>
        </button>
        <select aria-label={`Move ${row.po_number}`} disabled={!movable} value="" onChange={event => { if (event.target.value) onMove(row, event.target.value); }} className="h-7 w-7 shrink-0 appearance-none bg-transparent text-[var(--erp-muted)]">
          <option value=""><MoreHorizontal /></option>
          {row.allowed_transitions.map(status => <option key={status} value={status}>Move to {status}</option>)}
        </select>
      </div>
      <div className={`${density === 'compact' ? 'ml-7 mt-0.5' : 'mt-2'} flex items-center justify-between gap-2 text-[11px] font-mono text-[var(--erp-muted)]`}>
        <span className="truncate">{row.po_date} · {row.brand_code} · {row.entity_code}</span>
        {row.unpriced_lines ? <span className="shrink-0 text-[10px] text-[var(--erp-muted)]">{row.unpriced_lines} unpriced</span> : null}
      </div>
    </article>
  );
}

function Column({ status, rows, summary, active, loading, onLoadMore, onOpen, onMove, orderTypeFilter, density }: {
  status: string; rows: PurchaseOrderRow[]; summary: Summary; active: PurchaseOrderRow | null; loading: boolean;
  onLoadMore: () => void; onOpen: (id: number) => void; onMove: (row: PurchaseOrderRow, status: string) => void; orderTypeFilter: string; density: 'compact' | 'comfortable';
}) {
  const locked = LOCKED.has(status);
  const allowed = !!active && isPipelineDropAllowed(active, status);
  const { isOver, setNodeRef } = useDroppable({ id: status, disabled: locked || (!!active && !allowed) });
  const dimmed = !!active && !allowed;
  const meta = summary[status] || { count: 0, total_amount: '0' };
  return (
    <section ref={setNodeRef} className={`flex h-full ${rows.length ? 'w-[260px] min-w-[260px]' : 'w-[150px] min-w-[150px]'} shrink-0 flex-col border border-[var(--erp-hairline)] bg-[var(--erp-surface)] transition-opacity ${dimmed ? 'opacity-35' : ''} ${isOver ? 'border-[var(--erp-gold)] bg-[var(--erp-gold)]/5' : ''}`}>
      <header className="flex h-9 shrink-0 items-center justify-between gap-1 border-b border-[var(--erp-hairline)] bg-[var(--erp-surface)]/95 px-2 backdrop-blur-sm">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[11px] font-mono uppercase tracking-wider text-[var(--erp-gold)]">{status} <span className="text-[var(--erp-muted)]">{meta.count} · {money(meta.total_amount)}</span></h3>
          {locked ? <span title="Set automatically when a dispatch is recorded."><Lock className="w-3.5 h-3.5 text-[var(--erp-muted)]" aria-label="Set automatically when a dispatch is recorded." /></span> : null}
        </div>
      </header>
      <div className={`min-h-0 flex-1 overflow-y-auto ${density === 'compact' ? 'space-y-1 p-1' : 'space-y-2 p-2'}`}>
        {loading && !rows.length ? <p className="p-2 text-xs text-[var(--erp-muted)]">Loading…</p> : null}
        {rows.map(row => <React.Fragment key={row.id}><Card row={row} orderTypeFilter={orderTypeFilter} density={density} onOpen={onOpen} onMove={onMove} /></React.Fragment>)}
        {rows.length < meta.count ? <button type="button" onClick={onLoadMore} className="w-full border border-[var(--erp-hairline)] py-2 text-[11px] font-mono text-[var(--erp-gold)]">Load more</button> : null}
      </div>
    </section>
  );
}

export const PurchaseOrderPipeline = forwardRef<PurchaseOrderPipelineHandle, Props>(({ rowsByStatus, summary, orderTypeFilter, density, loading, onLoadMore, onOpen, onRefresh }, ref) => {
  const [activeId, setActiveId] = useState<number | null>(null);
  const [pending, setPending] = useState<{ row: PurchaseOrderRow; status: string } | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const active = useMemo(() => (Object.values(rowsByStatus) as PurchaseOrderRow[][]).flat().find(row => row.id === activeId) || null, [activeId, rowsByStatus]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const execute = async (row: PurchaseOrderRow, status: string) => {
    try {
      await purchaseOrdersApi.changeStatus(row.id, status);
      await onRefresh();
    } catch (error) {
      notifyApiError(error, 'Could not change purchase order status.');
      await onRefresh();
    }
  };
  const requestMove = async (row: PurchaseOrderRow, status: string) => {
    if (!isPipelineDropAllowed(row, status)) return;
    if (['Cancelled', 'Rejected', 'Closed'].includes(status)) setPending({ row, status });
    else await execute(row, status);
  };
  const onDragStart = (event: DragStartEvent) => setActiveId(Number(event.active.id));
  const onDragEnd = async (event: DragEndEvent) => {
    setActiveId(null);
    const row = event.active.data.current?.row as PurchaseOrderRow | undefined;
    const status = String(event.over?.id || '');
    if (row && status) await requestMove(row, status);
  };
  const scrollBoard = (direction: -1 | 1) => {
    boardRef.current?.scrollBy({ left: direction * 292, behavior: 'smooth' });
  };
  useImperativeHandle(ref, () => ({ scrollBy: scrollBoard }), []);
  const onBoardWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!event.shiftKey || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    event.preventDefault();
    boardRef.current?.scrollBy({ left: event.deltaY, behavior: 'auto' });
  };

  return (
    <>
      <style>{`
        .po-pipeline-scroll {
          scrollbar-width: auto;
          scrollbar-color: var(--erp-gold) var(--erp-surface-2);
        }
        .po-pipeline-scroll::-webkit-scrollbar {
          height: 12px;
          width: 10px;
        }
        .po-pipeline-scroll::-webkit-scrollbar-track {
          background: var(--erp-surface-2);
        }
        .po-pipeline-scroll::-webkit-scrollbar-thumb {
          background: var(--erp-gold);
          border: 3px solid var(--erp-surface-2);
          border-radius: 8px;
        }
        @media (max-height: 620px) {
          .po-pipeline-scroll {
            position: sticky;
            bottom: 0;
          }
        }
      `}</style>
      <DndContext autoScroll sensors={sensors} onDragStart={onDragStart} onDragEnd={event => void onDragEnd(event)}>
        <div className="flex min-h-[320px] flex-1 min-h-0 flex-col gap-2">
          <div ref={boardRef} onWheel={onBoardWheel} className="po-pipeline-scroll min-h-0 flex-1 overflow-x-auto overflow-y-hidden pb-3">
            <div className="flex h-full min-w-max gap-2">
            {PIPELINE_STATUSES.map(status => <React.Fragment key={status}><Column status={status} rows={rowsByStatus[status] || []} summary={summary} active={active} loading={loading} onLoadMore={() => onLoadMore(status)} onOpen={onOpen} onMove={requestMove} orderTypeFilter={orderTypeFilter} density={density} /></React.Fragment>)}
            </div>
          </div>
        </div>
        {createPortal(
          <DragOverlay>{active ? <Card row={active} orderTypeFilter={orderTypeFilter} density={density} onOpen={() => undefined} onMove={() => undefined} /> : null}</DragOverlay>,
          document.body,
        )}
      </DndContext>
      <ConfirmDialog
        open={!!pending}
        entityType="purchase order"
        entityLabel={pending?.row.po_number || ''}
        title={pending ? `Move ${pending.row.po_number} to ${pending.status}?` : undefined}
        message={pending ? `This changes the purchase order status to ${pending.status}.` : undefined}
        confirmLabel="Move"
        confirmTone="critical"
        onCancel={() => setPending(null)}
        onConfirm={async () => {
          if (!pending) return;
          const action = pending;
          setPending(null);
          await execute(action.row, action.status);
        }}
      />
    </>
  );
});
