import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical, RotateCcw, Trash2 } from 'lucide-react';

const MENU_WIDTH = 184;

export function kebabMenuPosition(anchor: DOMRect, width = MENU_WIDTH) {
  const left = Math.min(Math.max(8, anchor.right - width), window.innerWidth - width - 8);
  return { top: anchor.bottom + 4, left };
}

/** Outside-click closer. Listener is attached on the next tick so the opening click does not close the menu. */
export function useOutsideKebabClose(open: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-row-kebab]')) return;
      onCloseRef.current();
    };
    const timer = window.setTimeout(() => {
      document.addEventListener('mousedown', onPointerDown);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open]);
}

export function RowKebabTrigger({
  expanded,
  onClick,
}: {
  expanded: boolean;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      data-row-kebab
      className="p-1 text-[var(--erp-muted)] hover:text-[var(--erp-gold)] cursor-pointer"
      title="More actions"
      aria-haspopup="menu"
      aria-expanded={expanded}
      onClick={e => {
        e.preventDefault();
        e.stopPropagation();
        onClick(e);
      }}
    >
      <MoreVertical className="w-3.5 h-3.5 pointer-events-none" />
    </button>
  );
}

export function RowKebabMenu({
  open,
  top,
  left,
  onReactivate,
  onDeletePermanent,
}: {
  open: boolean;
  top: number;
  left: number;
  onReactivate: () => void;
  onDeletePermanent: () => void;
}) {
  if (!open) return null;
  return createPortal(
    <div
      data-row-kebab
      role="menu"
      className="fixed z-[70] min-w-[11.5rem] border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface-2)] shadow-lg py-1"
      style={{ top, left }}
    >
      <button
        type="button"
        role="menuitem"
        className="w-full px-3 py-1.5 text-left text-[11px] font-body text-[var(--erp-text)] hover:bg-[var(--erp-surface)] flex items-center gap-2 cursor-pointer"
        onClick={onReactivate}
      >
        <RotateCcw className="w-3.5 h-3.5 text-[var(--erp-gold)]" /> Reactivate
      </button>
      <button
        type="button"
        role="menuitem"
        className="w-full px-3 py-1.5 text-left text-[11px] font-body text-red-400 hover:bg-[var(--erp-surface)] flex items-center gap-2 cursor-pointer"
        onClick={onDeletePermanent}
      >
        <Trash2 className="w-3.5 h-3.5" /> Delete permanently
      </button>
    </div>,
    document.body,
  );
}
