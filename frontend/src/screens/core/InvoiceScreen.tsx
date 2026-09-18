import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Eye, FileText, Plus, Search, Trash2, X } from 'lucide-react';
import { useErp } from '../../context/ErpContext';
import { PageHeader } from '../../components/common/PageHeader';
import { DataTable, Column } from '../../components/common/DataTable';
import { StatusChip, StatusChipType } from '../../components/common/StatusChip';
import { TextInput, RequiredLegend } from '../../components/common/FormControls';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { MasterError, MasterLoading, emptyTableProps } from '../masters/MasterStatus';
import { num } from '../../services/mastersApi';
import { notifyApiError, notifySuccess } from '../../services/notify';
import { acquireSaveLock, releaseSaveLock } from '../../services/saveLock';
import { clearFieldMessage, collectRequired } from '../../services/requiredFields';
import { customersApi, readCustomerListFilter } from '../../services/customersApi';
import { PurchaseOrderLineRow, PurchaseOrderRow, purchaseOrdersApi } from '../../services/purchaseOrdersApi';
import {
  INVOICE_FROM_PO_KEY,
  LEDGER_OPEN_INVOICE_KEY,
  INVOICE_STATUSES,
  InvoiceRow,
  addDaysIso,
  invoicesApi,
  todayIso,
} from '../../services/invoicesApi';

const sectionTitle = 'text-[11px] font-mono uppercase tracking-wider text-[var(--erp-gold)] border-b border-[var(--erp-hairline)] pb-1 mb-3';

function money(value: string | number | null | undefined): string {
  return `₹${num(value).toFixed(2)}`;
}

function invoiceChip(status: string, isOverdue?: boolean): StatusChipType | string {
  if (isOverdue || status === 'Overdue') return 'overdue';
  switch (status) {
    case 'Cancelled':
      return 'rejected';
    case 'Draft':
      return 'inactive';
    case 'Issued':
      return 'pending';
    case 'Partially Paid':
      return 'notice';
    case 'Paid':
      return 'paid';
    case 'Adjusted':
      return 'notice';
    default:
      return 'inactive';
  }
}

type LineDraft = {
  poLine: PurchaseOrderLineRow;
  quantity: string;
  rate: string;
};

export const InvoiceScreen: React.FC = () => {
  const { userRole } = useErp();
  const canWrite = userRole === 'admin' || userRole === 'operator';
  const canCancel = userRole === 'admin';

  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [customerFilter, setCustomerFilter] = useState<number | ''>(() => readCustomerListFilter());
  const [mode, setMode] = useState<'list' | 'form' | 'detail'>('list');
  const [detail, setDetail] = useState<InvoiceRow | null>(null);
  const [pendingDelete, setPendingDelete] = useState<InvoiceRow | null>(null);
  const [pendingCancel, setPendingCancel] = useState<InvoiceRow | null>(null);
  const [pickPoOpen, setPickPoOpen] = useState(false);
  const [poChoices, setPoChoices] = useState<PurchaseOrderRow[]>([]);

  const [po, setPo] = useState<PurchaseOrderRow | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(todayIso());
  const [dueDate, setDueDate] = useState(todayIso());
  const [dueTouched, setDueTouched] = useState(false);
  const [creditDays, setCreditDays] = useState(0);
  const [paymentTerms, setPaymentTerms] = useState('');
  const [remarks, setRemarks] = useState('');
  const [discountPercent, setDiscountPercent] = useState('0');
  const [discountAmount, setDiscountAmount] = useState('0');
  const [taxPercent, setTaxPercent] = useState('0');
  const [otherCharges, setOtherCharges] = useState('0');
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [fieldMessages, setFieldMessages] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const savingLock = useRef(false);
  const numberRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await invoicesApi.list({
        status: statusFilter || undefined,
        search: search || undefined,
        customer_id: customerFilter || undefined,
      }));
    } catch (e) {
      const parsed = notifyApiError(e, 'Could not load invoices.');
      setError(parsed.message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search, customerFilter]);

  useEffect(() => { void load(); }, [load]);

  const openFromPo = useCallback(async (poId: number) => {
    try {
      const row = await purchaseOrdersApi.retrieve(poId);
      const invoiceable = row.lines.filter(l => l.id && num(l.invoiceable_quantity) > 0);
      if (!invoiceable.length) {
        notifyApiError(new Error('No dispatched quantity remaining to invoice on this purchase order.'));
        return;
      }
      const customer = await customersApi.retrieve(row.customer_id);
      const days = Number(customer.credit_days || 0);
      const date = todayIso();
      setPo(row);
      setInvoiceNumber('');
      setInvoiceDate(date);
      setDueDate(addDaysIso(date, days));
      setDueTouched(false);
      setCreditDays(days);
      setPaymentTerms(days > 0 ? `Net ${days} days` : '');
      setRemarks('');
      setDiscountPercent('0');
      setDiscountAmount('0');
      setTaxPercent('0');
      setOtherCharges('0');
      setLines(invoiceable.map(l => ({ poLine: l, quantity: '', rate: String(l.rate) })));
      setFieldMessages({});
      setMode('form');
    } catch (e) {
      notifyApiError(e);
    }
  }, []);

  useEffect(() => {
    const raw = sessionStorage.getItem(INVOICE_FROM_PO_KEY);
    if (!raw) return;
    sessionStorage.removeItem(INVOICE_FROM_PO_KEY);
    const id = Number(raw);
    if (id) void openFromPo(id);
  }, [openFromPo]);

  const totals = useMemo(() => {
    const subtotal = lines.reduce((sum, l) => sum + num(l.quantity) * num(l.rate), 0);
    const pct = num(discountPercent);
    let disc = num(discountAmount);
    if (pct && !disc) disc = subtotal * pct / 100;
    const tax = Math.max(0, subtotal - disc) * num(taxPercent) / 100;
    const net = subtotal - disc + tax + num(otherCharges);
    return { subtotal, disc, tax, net };
  }, [lines, discountPercent, discountAmount, taxPercent, otherCharges]);

  const openDetail = useCallback(async (id: number) => {
    try {
      setDetail(await invoicesApi.retrieve(id));
      setMode('detail');
    } catch (e) {
      notifyApiError(e);
    }
  }, []);

  useEffect(() => {
    const raw = sessionStorage.getItem(LEDGER_OPEN_INVOICE_KEY);
    if (!raw) return;
    sessionStorage.removeItem(LEDGER_OPEN_INVOICE_KEY);
    const id = Number(raw);
    if (id) void openDetail(id);
  }, [openDetail]);

  const openPickPo = async () => {
    try {
      const all = await purchaseOrdersApi.list({});
      setPoChoices(all.filter(r => r.lines.some(l => num(l.invoiceable_quantity) > 0)));
      setPickPoOpen(true);
    } catch (e) {
      notifyApiError(e);
    }
  };

  const persist = async (issueAfter: boolean) => {
    if (!po) return;
    const messages = collectRequired({
      invoice_number: invoiceNumber,
      invoice_date: invoiceDate,
      due_date: dueDate,
    });
    const filled = lines.filter(l => num(l.quantity) > 0);
    if (!filled.length) messages.lines = 'Enter a quantity for at least one invoiceable line.';
    filled.forEach((l, i) => {
      const cap = num(l.poLine.invoiceable_quantity);
      if (num(l.quantity) > cap) messages[`line_${i}`] = `Cannot exceed invoiceable ${cap.toFixed(2)}.`;
    });
    setFieldMessages(messages);
    if (Object.keys(messages).length) {
      if (messages.invoice_number) requestAnimationFrame(() => numberRef.current?.focus());
      return;
    }
    if (!acquireSaveLock(savingLock)) return;
    setSaving(true);
    try {
      const payload = {
        invoice_number: invoiceNumber.trim(),
        invoice_date: invoiceDate,
        due_date: dueDate,
        purchase_order_id: po.id,
        payment_terms: paymentTerms,
        remarks,
        discount_percent: num(discountPercent).toFixed(2),
        discount_amount: totals.disc.toFixed(2),
        tax_percent: num(taxPercent).toFixed(2),
        other_charges: num(otherCharges).toFixed(2),
        lines: filled.map(l => ({
          purchase_order_line_id: l.poLine.id,
          quantity: num(l.quantity).toFixed(2),
          rate: num(l.rate).toFixed(2),
        })),
      };
      const saved = await invoicesApi.create(payload);
      notifySuccess(`Invoice '${saved.invoice_number}' created.`);
      if (issueAfter) {
        const issued = await invoicesApi.issue(saved.id);
        notifySuccess('Invoice issued.');
        setDetail(issued);
        setMode('detail');
      } else {
        setMode('list');
      }
      await load();
    } catch (err) {
      notifyApiError(err);
    } finally {
      setSaving(false);
      releaseSaveLock(savingLock);
    }
  };

  const openPdf = async (id: number) => {
    try {
      const blob = await invoicesApi.pdf(id);
      window.open(URL.createObjectURL(blob), '_blank', 'noopener');
    } catch (err) {
      notifyApiError(err, 'Could not generate PDF.');
    }
  };

  const columns: Column<InvoiceRow>[] = [
    { header: 'Invoice No', render: r => <span className="font-mono text-[var(--erp-gold)]">{r.invoice_number}</span> },
    { header: 'Customer', render: r => <span>{r.customer_name}</span> },
    { header: 'Code', accessorKey: 'customer_code', mono: true, width: '110px' },
    { header: 'PO Number', render: r => <span className="font-mono">{r.po_number}</span> },
    { header: 'Invoice Date', accessorKey: 'invoice_date', mono: true, width: '110px' },
    { header: 'Due Date', accessorKey: 'due_date', mono: true, width: '110px' },
    { header: 'Net', align: 'right', mono: true, width: '110px', render: r => money(r.net_amount) },
    {
      header: 'Status',
      width: '150px',
      render: r => <StatusChip status={invoiceChip(r.display_status || r.status, r.is_overdue)} label={(r.display_status || r.status).toUpperCase()} />,
    },
    {
      header: '',
      align: 'right',
      width: '88px',
      render: r => (
        <div className="flex justify-end gap-1">
          <button type="button" className="p-1 text-[var(--erp-muted)] hover:text-[var(--erp-gold)] cursor-pointer" title="View" onClick={() => void openDetail(r.id)}><Eye className="w-3.5 h-3.5" /></button>
          {canWrite && r.status === 'Draft' && (
            <button type="button" className="p-1 text-[var(--erp-muted)] hover:text-[var(--erp-negative)] cursor-pointer" title="Delete draft" onClick={() => setPendingDelete(r)}><Trash2 className="w-3.5 h-3.5" /></button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="p-6 flex flex-col gap-6 text-left">
      <PageHeader
        moduleNumber="42"
        section="Accounts"
        title="Invoices"
        subtitle="Client invoices against dispatched purchase order quantities"
        actions={
          canWrite ? (
            <button type="button" onClick={() => void openPickPo()} className="px-4 py-1.5 bg-[var(--erp-gold)] text-[#0F141B] font-body text-xs font-semibold flex items-center gap-1.5 cursor-pointer">
              <Plus className="w-3.5 h-3.5" /> Create Invoice
            </button>
          ) : undefined
        }
      />
      {error && <MasterError message={error} onRetry={() => void load()} />}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] p-3">
        <div className="relative w-full lg:w-80">
          <Search className="w-4 h-4 text-[var(--erp-muted)] absolute left-3 top-2.5" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search invoice, customer code, PO…" className="w-full pl-9 pr-3 py-1.5 text-xs bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] focus:border-[var(--erp-gold)] focus:outline-none font-mono" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-2 py-1 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] font-mono text-xs">
          <option value="">All statuses</option>
          {INVOICE_STATUSES.map(s => <option key={s}>{s}</option>)}
        </select>
        {customerFilter ? (
          <button type="button" onClick={() => setCustomerFilter('')} className="text-[11px] font-mono text-[var(--erp-gold)] hover:underline cursor-pointer">
            Clear customer filter
          </button>
        ) : null}
      </div>
      {loading ? (
        <MasterLoading label="Loading invoices…" />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          keyExtractor={r => r.id}
          {...emptyTableProps(
            rows.length,
            rows.length,
            'No invoices yet.',
            'No invoices match this filter.',
            canWrite ? 'Create Invoice' : '',
            canWrite ? () => void openPickPo() : () => undefined,
          )}
        />
      )}

      {pickPoOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] p-5 space-y-4">
            <div className="flex justify-between border-b border-[var(--erp-hairline)] pb-3">
              <h3 className="font-display text-lg font-bold">Create invoice from PO</h3>
              <button type="button" onClick={() => setPickPoOpen(false)}><X className="w-4 h-4" /></button>
            </div>
            <p className="text-xs font-mono text-[var(--erp-muted)]">Invoices can only be created against dispatched purchase order quantities.</p>
            {poChoices.length ? (
              <div className="max-h-80 overflow-y-auto border border-[var(--erp-hairline)]">
                {poChoices.map(row => (
                  <button
                    key={row.id}
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm border-b border-[var(--erp-hairline)] hover:bg-[var(--erp-surface-2)]"
                    onClick={() => { setPickPoOpen(false); void openFromPo(row.id); }}
                  >
                    <span className="font-mono text-[var(--erp-gold)]">{row.po_number}</span>
                    <span className="text-[var(--erp-muted)]"> · {row.customer_name} · {row.brand_name}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs font-mono text-[var(--erp-muted)]">No purchase orders have invoiceable dispatched quantity.</p>
            )}
          </div>
        </div>
      )}

      {mode === 'form' && po && canWrite && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <form noValidate onSubmit={e => { e.preventDefault(); void persist(false); }} className="w-full max-w-5xl max-h-[92vh] overflow-y-auto bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] p-6 space-y-6">
            <div className="flex justify-between border-b border-[var(--erp-hairline)] pb-3 sticky top-0 bg-[var(--erp-surface)] z-10">
              <h3 className="font-display text-lg font-bold flex items-center gap-2"><FileText className="w-4 h-4 text-[var(--erp-gold)]" />Create Invoice · {po.po_number}</h3>
              <button type="button" onClick={() => setMode('list')}><X className="w-4 h-4" /></button>
            </div>
            <RequiredLegend />
            <p className="text-xs font-mono text-[var(--erp-muted)]">{po.entity_code} · {po.customer_code} {po.customer_name} · {po.brand_name}</p>
            <section>
              <h4 className={sectionTitle}>Header</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <TextInput ref={numberRef} label="Invoice number" mono required error={fieldMessages.invoice_number} value={invoiceNumber} onChange={e => { setInvoiceNumber(e.target.value); setFieldMessages(prev => clearFieldMessage(prev, 'invoice_number')); }} />
                <TextInput
                  label="Invoice date"
                  type="date"
                  required
                  error={fieldMessages.invoice_date}
                  value={invoiceDate}
                  onChange={e => {
                    setInvoiceDate(e.target.value);
                    if (!dueTouched) setDueDate(addDaysIso(e.target.value, creditDays));
                    setFieldMessages(prev => clearFieldMessage(prev, 'invoice_date'));
                  }}
                />
                <TextInput
                  label="Due date"
                  type="date"
                  required
                  error={fieldMessages.due_date}
                  value={dueDate}
                  onChange={e => { setDueDate(e.target.value); setDueTouched(true); setFieldMessages(prev => clearFieldMessage(prev, 'due_date')); }}
                />
                <TextInput label="Payment terms" value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)} />
              </div>
            </section>
            <section>
              <h4 className={sectionTitle}>Line items</h4>
              {fieldMessages.lines && <p className="text-xs font-mono text-[var(--erp-negative)] mb-2">{fieldMessages.lines}</p>}
              <div className="overflow-x-auto border border-[var(--erp-hairline)]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[var(--erp-surface-2)] font-mono text-[10px] uppercase tracking-wider text-[var(--erp-muted)]">
                    <tr>
                      <th className="px-3 py-2">Product</th>
                      <th className="px-3 py-2 text-right">Invoiceable</th>
                      <th className="px-3 py-2 w-32">Qty this invoice *</th>
                      <th className="px-3 py-2 w-28">Rate *</th>
                      <th className="px-3 py-2 text-right">Line total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line, index) => (
                      <tr key={line.poLine.id} className="border-t border-[var(--erp-hairline)]">
                        <td className="px-3 py-2">{line.poLine.product_code ? `${line.poLine.product_code} · ${line.poLine.product_name}` : line.poLine.product_name}</td>
                        <td className="px-3 py-2 text-right font-mono">{num(line.poLine.invoiceable_quantity).toFixed(2)}</td>
                        <td className="px-3 py-2">
                          <input
                            value={line.quantity}
                            onChange={e => setLines(prev => prev.map((l, i) => i === index ? { ...l, quantity: e.target.value } : l))}
                            className={`w-full px-2 py-1.5 font-mono bg-[var(--erp-surface)] border text-[var(--erp-text)] ${fieldMessages[`line_${index}`] ? 'border-[var(--erp-negative)]' : 'border-[var(--erp-hairline-strong)]'}`}
                          />
                          {fieldMessages[`line_${index}`] && <p className="text-[10px] font-mono text-[var(--erp-negative)] mt-1">{fieldMessages[`line_${index}`]}</p>}
                        </td>
                        <td className="px-3 py-2">
                          <input value={line.rate} onChange={e => setLines(prev => prev.map((l, i) => i === index ? { ...l, rate: e.target.value } : l))} className="w-full px-2 py-1.5 font-mono bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] text-[var(--erp-text)]" />
                        </td>
                        <td className="px-3 py-2 text-right font-mono">{money(num(line.quantity) * num(line.rate))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section>
              <h4 className={sectionTitle}>Discount, tax & charges</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <TextInput label="Discount %" mono value={discountPercent} onChange={e => { setDiscountPercent(e.target.value); setDiscountAmount(''); }} />
                <TextInput label="Discount amount" mono value={discountAmount} onChange={e => { setDiscountAmount(e.target.value); setDiscountPercent('0'); }} />
                <TextInput label="Tax %" mono value={taxPercent} onChange={e => setTaxPercent(e.target.value)} />
                <TextInput label="Other charges" mono value={otherCharges} onChange={e => setOtherCharges(e.target.value)} />
              </div>
              <div className="mt-4 flex flex-wrap justify-end gap-6 font-mono text-sm border-t border-[var(--erp-hairline)] pt-3">
                <div>Subtotal {money(totals.subtotal)}</div>
                <div>Discount {money(totals.disc)}</div>
                <div>Tax {money(totals.tax)}</div>
                <div className="text-[var(--erp-gold)]">Net {money(totals.net)}</div>
              </div>
            </section>
            <section>
              <h4 className={sectionTitle}>Remarks</h4>
              <textarea value={remarks} onChange={e => setRemarks(e.target.value)} rows={3} className="w-full px-3 py-2 text-sm bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] text-[var(--erp-text)] focus:outline-none focus:border-[var(--erp-gold)] rounded-none" />
            </section>
            <div className="flex justify-end gap-3 pt-2 border-t border-[var(--erp-hairline)]">
              <button type="button" onClick={() => setMode('list')} className="px-4 py-2 border border-[var(--erp-hairline)] text-xs font-mono">Cancel</button>
              <button type="submit" disabled={saving} className="px-5 py-2 border border-[var(--erp-gold)] text-[var(--erp-gold)] text-xs font-semibold">{saving ? 'Saving…' : 'Save as Draft'}</button>
              <button type="button" disabled={saving} onClick={() => void persist(true)} className="px-5 py-2 bg-[var(--erp-gold)] text-[#0F141B] text-xs font-semibold">{saving ? 'Saving…' : 'Save & Issue'}</button>
            </div>
          </form>
        </div>
      )}

      {mode === 'detail' && detail && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-4xl max-h-[92vh] overflow-y-auto bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] p-6 space-y-5">
            <div className="flex justify-between items-start border-b border-[var(--erp-hairline)] pb-3">
              <div>
                <h3 className="font-display text-lg font-bold">{detail.invoice_number}</h3>
                <p className="text-xs font-mono text-[var(--erp-muted)] mt-1">{detail.invoice_date} · due {detail.due_date} · {detail.customer_code} {detail.customer_name} · {detail.po_number}</p>
              </div>
              <div className="flex items-center gap-2">
                <StatusChip status={invoiceChip(detail.display_status, detail.is_overdue)} label={detail.display_status.toUpperCase()} />
                <button type="button" onClick={() => setMode('list')}><X className="w-4 h-4" /></button>
              </div>
            </div>
            <div className="overflow-x-auto border border-[var(--erp-hairline)]">
              <table className="w-full text-left text-xs">
                <thead className="bg-[var(--erp-surface-2)] font-mono text-[10px] uppercase tracking-wider text-[var(--erp-muted)]">
                  <tr>
                    <th className="px-3 py-2">Product</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Rate</th>
                    <th className="px-3 py-2 text-right">Line total</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.lines.map(line => (
                    <tr key={line.id} className="border-t border-[var(--erp-hairline)]">
                      <td className="px-3 py-2">{line.product_code ? `${line.product_code} · ${line.product_name}` : line.product_name}</td>
                      <td className="px-3 py-2 text-right font-mono">{num(line.quantity).toFixed(2)}</td>
                      <td className="px-3 py-2 text-right font-mono">{money(line.rate)}</td>
                      <td className="px-3 py-2 text-right font-mono">{money(line.line_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap justify-end gap-6 font-mono text-sm">
              <div>Subtotal {money(detail.subtotal)}</div>
              <div>Discount {money(detail.discount_amount)}</div>
              <div>Tax {money(detail.tax_amount)}</div>
              <div>Other {money(detail.other_charges)}</div>
              <div className="text-[var(--erp-gold)]">Net {money(detail.net_amount)}</div>
            </div>
            {detail.payment_terms ? <p className="text-xs font-mono text-[var(--erp-muted)]">Terms: {detail.payment_terms}</p> : null}
            {detail.remarks ? <p className="text-sm text-[var(--erp-muted)]">{detail.remarks}</p> : null}
            <section>
              <h4 className={sectionTitle}>Payments</h4>
              {(detail.payment_allocations || []).length ? (
                <div className="overflow-x-auto border border-[var(--erp-hairline)]">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[var(--erp-surface-2)] font-mono text-[10px] uppercase tracking-wider text-[var(--erp-muted)]">
                      <tr>
                        <th className="px-3 py-2">Payment</th>
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2">Mode</th>
                        <th className="px-3 py-2 text-right">Allocated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(detail.payment_allocations || []).map(row => (
                        <tr key={row.id} className="border-t border-[var(--erp-hairline)]">
                          <td className="px-3 py-2 font-mono text-[var(--erp-gold)]">{row.payment_number}</td>
                          <td className="px-3 py-2 font-mono">{row.payment_date}</td>
                          <td className="px-3 py-2">{row.payment_mode}</td>
                          <td className="px-3 py-2 text-right font-mono">{money(row.allocated_amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs font-mono text-[var(--erp-muted)]">No payments allocated yet.</p>
              )}
              <div className="mt-3 flex flex-wrap justify-end gap-6 font-mono text-sm">
                <div>Paid {money(detail.total_paid)}</div>
                <div className="text-[var(--erp-gold)]">Balance due {money(detail.remaining_balance ?? detail.net_amount)}</div>
              </div>
            </section>
            <div className="flex flex-wrap justify-between gap-3 pt-3 border-t border-[var(--erp-hairline)]">
              <div className="flex flex-wrap gap-2">
                {detail.status === 'Draft' && canWrite && (
                  <>
                    <button type="button" onClick={() => void invoicesApi.issue(detail.id).then(row => { notifySuccess('Invoice issued.'); setDetail(row); void load(); }).catch(notifyApiError)} className="px-4 py-2 bg-[var(--erp-gold)] text-[#0F141B] text-xs font-semibold">Issue</button>
                    <button type="button" onClick={() => setPendingDelete(detail)} className="px-4 py-2 border border-[var(--erp-negative)]/40 text-[var(--erp-negative)] text-xs font-mono">Delete draft</button>
                  </>
                )}
                {canCancel && (detail.status === 'Draft' || detail.status === 'Issued') && (
                  <button type="button" onClick={() => setPendingCancel(detail)} className="px-4 py-2 border border-[var(--erp-negative)]/40 text-[var(--erp-negative)] text-xs font-mono">Cancel invoice</button>
                )}
              </div>
              <button type="button" onClick={() => void openPdf(detail.id)} className="px-4 py-2 border border-[var(--erp-gold)] text-[var(--erp-gold)] text-xs font-semibold flex items-center gap-1.5">
                <Download className="w-3.5 h-3.5" /> Download PDF
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        entityType="invoice"
        entityLabel={pendingDelete ? pendingDelete.invoice_number : ''}
        title="Delete draft invoice?"
        message={pendingDelete ? `Delete draft '${pendingDelete.invoice_number}'? This cannot be undone.` : ''}
        confirmLabel="Delete"
        confirmTone="critical"
        onCancel={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (!pendingDelete) return;
          try {
            await invoicesApi.remove(pendingDelete.id);
            notifySuccess(`Invoice '${pendingDelete.invoice_number}' deleted.`);
            setPendingDelete(null);
            setMode('list');
            await load();
          } catch (err) {
            notifyApiError(err);
          }
        }}
      />
      <ConfirmDialog
        open={!!pendingCancel}
        entityType="invoice"
        entityLabel={pendingCancel ? pendingCancel.invoice_number : ''}
        title="Cancel invoice?"
        message={pendingCancel ? `Cancel '${pendingCancel.invoice_number}'? This cannot be undone.` : ''}
        confirmLabel="Cancel invoice"
        confirmTone="critical"
        onCancel={() => setPendingCancel(null)}
        onConfirm={async () => {
          if (!pendingCancel) return;
          try {
            const updated = await invoicesApi.changeStatus(pendingCancel.id, 'Cancelled');
            notifySuccess('Invoice cancelled.');
            setPendingCancel(null);
            setDetail(updated);
            await load();
          } catch (err) {
            notifyApiError(err);
          }
        }}
      />
    </div>
  );
};
