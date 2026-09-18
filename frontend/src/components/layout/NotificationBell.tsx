import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BellRing, CheckCheck } from 'lucide-react';
import { useErp } from '../../context/ErpContext';
import { IconCountBadge } from './IconCountBadge';
import { notifyApiError } from '../../services/notify';
import { LEDGER_OPEN_INVOICE_KEY } from '../../services/invoicesApi';
import { LEDGER_OPEN_PAYMENT_KEY } from '../../services/paymentsApi';
import { OPEN_PO_KEY } from '../../services/purchaseOrdersApi';
import { OPEN_DISPATCH_KEY } from '../../services/dispatchesApi';
import {
  NotificationRow,
  notificationsApi,
  relativeTime,
} from '../../services/notificationsApi';

function openReference(row: NotificationRow, navigateTo: (id: number) => void) {
  if (row.reference_type === 'Invoice') {
    sessionStorage.setItem(LEDGER_OPEN_INVOICE_KEY, String(row.reference_id));
    navigateTo(42);
    return;
  }
  if (row.reference_type === 'Payment') {
    sessionStorage.setItem(LEDGER_OPEN_PAYMENT_KEY, String(row.reference_id));
    navigateTo(43);
    return;
  }
  if (row.reference_type === 'PurchaseOrder') {
    sessionStorage.setItem(OPEN_PO_KEY, String(row.reference_id));
    navigateTo(40);
    return;
  }
  if (row.reference_type === 'Dispatch') {
    sessionStorage.setItem(OPEN_DISPATCH_KEY, String(row.reference_id));
    navigateTo(41);
  }
}

export const NotificationBell: React.FC = () => {
  const { navigateTo } = useErp();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);

  const refreshCount = useCallback(async () => {
    try {
      const data = await notificationsApi.unreadCount();
      setUnread(data.unread_count);
    } catch {
      /* header stays quiet if the API is briefly unavailable */
    }
  }, []);

  const loadRecent = useCallback(async () => {
    try {
      const data = await notificationsApi.list();
      setRows(data.slice(0, 12));
    } catch (e) {
      notifyApiError(e, 'Could not load notifications.');
    }
  }, []);

  useEffect(() => {
    void refreshCount();
    const timer = window.setInterval(() => { void refreshCount(); }, 30000);
    return () => window.clearInterval(timer);
  }, [refreshCount]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      void loadRecent();
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, loadRecent]);

  const openItem = async (row: NotificationRow) => {
    if (row.status === 'Unread') {
      try {
        await notificationsApi.markRead(row.id);
        setUnread(n => Math.max(0, n - 1));
        setRows(prev => prev.map(r => (r.id === row.id ? { ...r, status: 'Read' } : r)));
      } catch (e) {
        notifyApiError(e);
      }
    }
    setOpen(false);
    openReference(row, navigateTo);
  };

  const markAll = async () => {
    try {
      await notificationsApi.markAllRead();
      setUnread(0);
      setRows(prev => prev.map(r => (r.status === 'Unread' ? { ...r, status: 'Read' } : r)));
    } catch (e) {
      notifyApiError(e);
    }
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        title={`Notifications (${unread} unread)`}
        aria-label={`Notifications, ${unread} unread`}
        className="relative h-8 w-8 inline-flex items-center justify-center bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] hover:border-[var(--erp-gold)] transition-colors cursor-pointer"
      >
        <BellRing className="w-3.5 h-3.5 stroke-[1.75] text-[var(--erp-gold)] shrink-0" />
        <IconCountBadge count={unread} tone="gold" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-80 sm:w-96 max-h-[420px] overflow-hidden bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] shadow-2xl z-50 flex flex-col">
          <div className="px-3 py-2 border-b border-[var(--erp-hairline)] flex items-center justify-between">
            <span className="font-mono text-[10px] tracking-wider text-[var(--erp-muted)] uppercase">Notifications</span>
            <button
              type="button"
              onClick={() => void markAll()}
              className="text-[10px] font-mono text-[var(--erp-gold)] hover:underline cursor-pointer flex items-center gap-1"
            >
              <CheckCheck className="w-3 h-3" /> Mark all read
            </button>
          </div>
          <div className="overflow-y-auto flex-1">
            {rows.length ? rows.map(row => (
              <button
                key={row.id}
                type="button"
                onClick={() => void openItem(row)}
                className="w-full text-left px-3 py-2.5 border-b border-[var(--erp-hairline)]/60 hover:bg-[var(--erp-surface-2)] cursor-pointer"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className={`text-xs leading-snug ${row.status === 'Unread' ? 'font-semibold text-[var(--erp-text)]' : 'text-[var(--erp-muted)]'}`}>
                    {row.status === 'Unread' ? <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--erp-gold)] mr-1.5 align-middle" /> : null}
                    {row.title}
                  </span>
                  <span className="font-mono text-[10px] text-[var(--erp-muted)] shrink-0">{relativeTime(row.created_at)}</span>
                </div>
                <p className="text-[11px] text-[var(--erp-muted)] mt-1 line-clamp-2">{row.message}</p>
              </button>
            )) : (
              <p className="px-3 py-6 text-xs font-mono text-[var(--erp-muted)] text-center">No notifications yet.</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => { setOpen(false); navigateTo(46); }}
            className="px-3 py-2 border-t border-[var(--erp-hairline)] text-[10px] font-mono text-[var(--erp-gold)] hover:underline cursor-pointer text-center"
          >
            View all notifications
          </button>
        </div>
      )}
    </div>
  );
};
