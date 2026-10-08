import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Eye, Plus, Search, Trash2, Wallet, X } from 'lucide-react';
import { useErp } from '../../context/ErpContext';
import { PageHeader } from '../../components/common/PageHeader';
import { DataTable, Column } from '../../components/common/DataTable';
import { StatusChip } from '../../components/common/StatusChip';
import { FormField, RequiredLegend, TextInput } from '../../components/common/FormControls';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { MasterError, MasterLoading, emptyTableProps } from '../masters/MasterStatus';
import { num } from '../../services/mastersApi';
import { notifyApiError, notifySuccess } from '../../services/notify';
import { acquireSaveLock, releaseSaveLock } from '../../services/saveLock';
import { clearFieldMessage, collectRequired } from '../../services/requiredFields';
import { EntityRow, entitiesApi } from '../../services/entitiesApi';
import { CustomerRow, customersApi, readCustomerListFilter } from '../../services/customersApi';
import { InvoiceRow, invoicesApi } from '../../services/invoicesApi';
import {
  LEDGER_OPEN_PAYMENT_KEY,
  PAYMENT_ADJUSTMENT_REASONS,
  PAYMENT_MODES,
  PaymentAdjustmentRow,
  PaymentAllocationRow,
  PaymentRow,
  paymentTodayIso,
  paymentsApi,
} from '../../services/paymentsApi';

const sectionTitle = 'text-[11px] font-mono uppercase tracking-wider text-[var(--erp-gold)] border-b border-[var(--erp-hairline)] pb-1 mb-3';
const selectClass = 'px-3 py-2 text-sm bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] text-[var(--erp-text)]';

function money(value: string | number | null | undefined): string {
  return `₹${num(value).toFixed(2)}`;
}

function stampDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const PaymentScreen: React.FC = () => {
  const { userRole } = useErp();
  const canWrite = userRole === 'admin' || userRole === 'operator';
  const canDelete = userRole === 'admin';

  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [modeFilter, setModeFilter] = useState('');
  const [listCustomerFilter, setListCustomerFilter] = useState<number | ''>(() => readCustomerListFilter());
  const [mode, setMode] = useState<'list' | 'form' | 'detail'>('list');
  const [detail, setDetail] = useState<PaymentRow | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PaymentRow | null>(null);
  const [pendingAlloc, setPendingAlloc] = useState<PaymentAllocationRow | null>(null);

  const [entities, setEntities] = useState<EntityRow[]>([]);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [outstanding, setOutstanding] = useState<InvoiceRow[]>([]);
  const [advanceBalance, setAdvanceBalance] = useState(0);

  const [entityId, setEntityId] = useState<number | ''>('');
  const [customerId, setCustomerId] = useState<number | ''>('');
  const [paymentNumber, setPaymentNumber] = useState('');
  const [paymentDate, setPaymentDate] = useState(paymentTodayIso());
  const [amount, setAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('NEFT');
  const [bankCashAccount, setBankCashAccount] = useState('');
  const [transactionReference, setTransactionReference] = useState('');
  const [remarks, setRemarks] = useState('');
  const [allocAmounts, setAllocAmounts] = useState<Record<number, string>>({});
  const [fieldMessages, setFieldMessages] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const savingLock = useRef(false);
  const numberRef = useRef<HTMLInputElement>(null);

  const [allocInvoiceId, setAllocInvoiceId] = useState<number | ''>('');
  const [allocAmount, setAllocAmount] = useState('');
  const [allocReasonPreset, setAllocReasonPreset] = useState<string>(PAYMENT_ADJUSTMENT_REASONS[0]);
  const [allocReasonOther, setAllocReasonOther] = useState('');
  const [allocReference, setAllocReference] = useState('');
  const [allocMessages, setAllocMessages] = useState<Record<string, string>>({});
  const [allocInvoices, setAllocInvoices] = useState<InvoiceRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await paymentsApi.list({
        search: search || undefined,
        payment_mode: modeFilter || undefined,
        customer_id: listCustomerFilter || undefined,
      }));
    } catch (e) {
      const parsed = notifyApiError(e, 'Could not load payments.');
      setError(parsed.message);
    } finally {
      setLoading(false);
    }
  }, [search, modeFilter, listCustomerFilter]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    void entitiesApi.list({ status: 'Active' }).then(setEntities).catch(notifyApiError);
  }, []);

  useEffect(() => {
    if (!entityId) {
      setCustomers([]);
      return;
    }
    void customersApi.list({ status: 'Active', entity_id: entityId }).then(setCustomers).catch(notifyApiError);
  }, [entityId]);

  const loadCustomerContext = useCallback(async (id: number) => {
    try {
      const [invoices, advance] = await Promise.all([
        invoicesApi.list({ customer_id: id, status: 'Issued,Partially Paid' }),
        customersApi.advanceBalance(id),
      ]);
      setOutstanding(invoices.filter(inv => num(inv.remaining_balance) > 0));
      setAdvanceBalance(advance ? num(advance.advance_balance) : 0);
    } catch (e) {
      notifyApiError(e);
    }
  }, []);

  useEffect(() => {
    if (!customerId) {
      setOutstanding([]);
      setAdvanceBalance(0);
      setAllocAmounts({});
      return;
    }
    void loadCustomerContext(Number(customerId));
  }, [customerId, loadCustomerContext]);

  const totals = useMemo(() => {
    const paymentAmount = num(amount);
    const allocated = outstanding.reduce((sum, inv) => sum + num(allocAmounts[inv.id]), 0);
    return {
      allocated,
      unallocated: paymentAmount - allocated,
    };
  }, [amount, outstanding, allocAmounts]);

  const resetForm = () => {
    setEntityId('');
    setCustomerId('');
    setPaymentNumber('');
    setPaymentDate(paymentTodayIso());
    setAmount('');
    setPaymentMode('NEFT');
    setBankCashAccount('');
    setTransactionReference('');
    setRemarks('');
    setAllocAmounts({});
    setOutstanding([]);
    setAdvanceBalance(0);
    setFieldMessages({});
  };

  const openCreate = () => {
    resetForm();
    setMode('form');
  };

  const openDetail = useCallback(async (id: number) => {
    try {
      const row = await paymentsApi.retrieve(id);
      setDetail(row);
      setAllocInvoiceId('');
      setAllocAmount('');
      setAllocReasonPreset(PAYMENT_ADJUSTMENT_REASONS[0]);
      setAllocReasonOther('');
      setAllocReference('');
      setAllocMessages({});
      if (num(row.unallocated_amount) > 0) {
        const invoices = await invoicesApi.list({
          customer_id: row.customer_id,
          status: 'Issued,Partially Paid',
        });
        setAllocInvoices(invoices.filter(inv => num(inv.remaining_balance) > 0));
      } else {
        setAllocInvoices([]);
      }
      setMode('detail');
    } catch (e) {
      notifyApiError(e);
    }
  }, []);

  useEffect(() => {
    const raw = sessionStorage.getItem(LEDGER_OPEN_PAYMENT_KEY);
    if (!raw) return;
    sessionStorage.removeItem(LEDGER_OPEN_PAYMENT_KEY);
    const id = Number(raw);
    if (id) void openDetail(id);
  }, [openDetail]);

  const persist = async () => {
    const messages = collectRequired({
      payment_number: paymentNumber,
      payment_date: paymentDate,
      entity_id: entityId,
      customer_id: customerId,
      amount,
      payment_mode: paymentMode,
      bank_cash_account: bankCashAccount,
    });
    if (num(amount) <= 0) messages.amount = 'Amount must be greater than 0.';
    if (totals.unallocated < -0.001) messages.allocations = 'Allocated total cannot exceed the payment amount.';
    outstanding.forEach(inv => {
      const entered = num(allocAmounts[inv.id]);
      if (entered > num(inv.remaining_balance) + 0.001) {
        messages[`alloc_${inv.id}`] = `Cannot exceed remaining ${num(inv.remaining_balance).toFixed(2)}.`;
      }
    });
    setFieldMessages(messages);
    if (Object.keys(messages).length) {
      if (messages.payment_number) requestAnimationFrame(() => numberRef.current?.focus());
      return;
    }
    if (!acquireSaveLock(savingLock)) return;
    setSaving(true);
    try {
      const allocations = outstanding
        .filter(inv => num(allocAmounts[inv.id]) > 0)
        .map(inv => ({
          invoice_id: inv.id,
          allocated_amount: num(allocAmounts[inv.id]).toFixed(2),
        }));
      const saved = await paymentsApi.create({
        payment_number: paymentNumber.trim(),
        payment_date: paymentDate,
        entity_id: entityId,
        customer_id: customerId,
        amount: num(amount).toFixed(2),
        payment_mode: paymentMode,
        bank_cash_account: bankCashAccount.trim(),
        transaction_reference: transactionReference.trim(),
        remarks,
        allocations,
      });
      notifySuccess(`Payment '${saved.payment_number}' recorded.`);
      setMode('list');
      await load();
    } catch (err) {
      notifyApiError(err);
    } finally {
      setSaving(false);
      releaseSaveLock(savingLock);
    }
  };

  const resolvedAllocReason = allocReasonPreset === 'Other'
    ? allocReasonOther.trim()
    : allocReasonPreset;

  const submitAdvanceAlloc = async () => {
    const messages = collectRequired({
      invoice_id: allocInvoiceId,
      allocated_amount: allocAmount,
      reason: resolvedAllocReason,
    });
    if (num(allocAmount) <= 0) messages.allocated_amount = 'Amount must be greater than 0.';
    setAllocMessages(messages);
    if (Object.keys(messages).length) {
      if (messages.reason || messages.invoice_id || messages.allocated_amount) {
        notifyApiError(new Error(messages.reason || messages.invoice_id || messages.allocated_amount || 'Complete the required allocation fields.'));
      }
      return;
    }
    if (!detail || !allocInvoiceId) return;
    try {
      const updated = await paymentsApi.allocate(detail.id, {
        invoice_id: Number(allocInvoiceId),
        allocated_amount: num(allocAmount).toFixed(2),
        reason: resolvedAllocReason,
        reference: allocReference.trim() || undefined,
      });
      notifySuccess('Advance allocated.');
      setDetail(updated);
      setAllocInvoiceId('');
      setAllocAmount('');
      setAllocReasonPreset(PAYMENT_ADJUSTMENT_REASONS[0]);
      setAllocReasonOther('');
      setAllocReference('');
      setAllocMessages({});
      if (num(updated.unallocated_amount) > 0) {
        const invoices = await invoicesApi.list({
          customer_id: updated.customer_id,
          status: 'Issued,Partially Paid',
        });
        setAllocInvoices(invoices.filter(inv => num(inv.remaining_balance) > 0));
      } else {
        setAllocInvoices([]);
      }
      await load();
    } catch (err) {
      notifyApiError(err);
    }
  };

  const columns: Column<PaymentRow>[] = [
    { header: 'Payment No', render: r => <span className="font-mono text-[var(--erp-gold)]">{r.payment_number}</span> },
    { header: 'Customer', render: r => <span>{r.customer_name}</span> },
    { header: 'Code', accessorKey: 'customer_code', mono: true, width: '110px' },
    { header: 'Date', accessorKey: 'payment_date', mono: true, width: '110px' },
    { header: 'Amount', align: 'right', mono: true, width: '110px', render: r => money(r.amount) },
    {
      header: 'Unallocated',
      align: 'right',
      width: '140px',
      render: r => num(r.unallocated_amount) > 0
        ? <StatusChip status="notice" label={`ADVANCE ${money(r.unallocated_amount)}`} />
        : <span className="font-mono text-xs text-[var(--erp-muted)]">{money(0)}</span>,
    },
    { header: 'Mode', accessorKey: 'payment_mode', width: '120px' },
    {
      header: '',
      align: 'right',
      width: '88px',
      render: r => (
        <div className="flex justify-end gap-1">
          <button type="button" className="p-1 text-[var(--erp-muted)] hover:text-[var(--erp-gold)] cursor-pointer" title="View" onClick={() => void openDetail(r.id)}><Eye className="w-3.5 h-3.5" /></button>
          {canDelete && (
            <button type="button" className="p-1 text-[var(--erp-muted)] hover:text-[var(--erp-negative)] cursor-pointer" title="Delete payment" onClick={() => setPendingDelete(r)}><Trash2 className="w-3.5 h-3.5" /></button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="p-6 flex flex-col gap-6 text-left">
      <PageHeader
        moduleNumber="43"
        section="Accounts"
        title="Payments"
        subtitle="Record customer receipts and allocate against outstanding invoices"
        actions={
          canWrite ? (
            <button type="button" onClick={openCreate} className="px-4 py-1.5 bg-[var(--erp-gold)] text-[#0F141B] font-body text-xs font-semibold flex items-center gap-1.5 cursor-pointer">
              <Plus className="w-3.5 h-3.5" /> Record Payment
            </button>
          ) : undefined
        }
      />
      {error && <MasterError message={error} onRetry={() => void load()} />}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] p-3">
        <div className="relative w-full lg:w-80">
          <Search className="w-4 h-4 text-[var(--erp-muted)] absolute left-3 top-2.5" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search payment no, UTR, customer…" className="w-full pl-9 pr-3 py-1.5 text-xs bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] focus:border-[var(--erp-gold)] focus:outline-none font-mono" />
        </div>
        <select value={modeFilter} onChange={e => setModeFilter(e.target.value)} className="px-2 py-1 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] font-mono text-xs">
          <option value="">All modes</option>
          {PAYMENT_MODES.map(s => <option key={s}>{s}</option>)}
        </select>
        {listCustomerFilter ? (
          <button type="button" onClick={() => setListCustomerFilter('')} className="text-[11px] font-mono text-[var(--erp-gold)] hover:underline cursor-pointer">
            Clear customer filter
          </button>
        ) : null}
      </div>
      {loading ? (
        <MasterLoading label="Loading payments…" />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          keyExtractor={r => r.id}
          {...emptyTableProps(
            rows.length,
            rows.length,
            'No payments yet.',
            'No payments match this filter.',
            canWrite ? 'Record Payment' : '',
            canWrite ? openCreate : () => undefined,
          )}
        />
      )}

      {mode === 'form' && canWrite && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <form noValidate onSubmit={e => { e.preventDefault(); void persist(); }} className="w-full max-w-5xl max-h-[92vh] overflow-y-auto bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] p-6 space-y-6">
            <div className="flex justify-between border-b border-[var(--erp-hairline)] pb-3 sticky top-0 bg-[var(--erp-surface)] z-10">
              <h3 className="font-display text-lg font-bold flex items-center gap-2"><Wallet className="w-4 h-4 text-[var(--erp-gold)]" />Record Payment</h3>
              <button type="button" onClick={() => setMode('list')}><X className="w-4 h-4" /></button>
            </div>
            <RequiredLegend />
            <section>
              <h4 className={sectionTitle}>Customer</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="Entity" required error={fieldMessages.entity_id}>
                  <select
                    value={entityId}
                    onChange={e => {
                      const id = e.target.value ? Number(e.target.value) : '';
                      setEntityId(id);
                      setCustomerId('');
                      setFieldMessages(prev => clearFieldMessage(clearFieldMessage(prev, 'entity_id'), 'customer_id'));
                    }}
                    className={selectClass}
                  >
                    <option value="">Select entity…</option>
                    {entities.map(ent => (
                      <option key={ent.id} value={ent.id}>{ent.short_code} · {ent.entity_name}</option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Customer" required error={fieldMessages.customer_id}>
                  <select
                    value={customerId}
                    disabled={!entityId}
                    onChange={e => {
                      setCustomerId(e.target.value ? Number(e.target.value) : '');
                      setAllocAmounts({});
                      setFieldMessages(prev => clearFieldMessage(prev, 'customer_id'));
                    }}
                    className={selectClass}
                  >
                    <option value="">Select customer…</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>{c.customer_code} · {c.customer_name}</option>
                    ))}
                  </select>
                </FormField>
              </div>
              {customerId ? (
                <p className="mt-3 text-xs font-mono text-[var(--erp-gold)]">Advance/Credit Balance: {money(advanceBalance)}</p>
              ) : null}
            </section>
            <section>
              <h4 className={sectionTitle}>Payment details</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <TextInput ref={numberRef} label="Payment number" mono required error={fieldMessages.payment_number} value={paymentNumber} onChange={e => { setPaymentNumber(e.target.value); setFieldMessages(prev => clearFieldMessage(prev, 'payment_number')); }} />
                <TextInput label="Payment date" type="date" required error={fieldMessages.payment_date} value={paymentDate} onChange={e => { setPaymentDate(e.target.value); setFieldMessages(prev => clearFieldMessage(prev, 'payment_date')); }} />
                <TextInput label="Amount" mono required error={fieldMessages.amount} value={amount} onChange={e => { setAmount(e.target.value); setFieldMessages(prev => clearFieldMessage(prev, 'amount')); }} />
                <FormField label="Payment mode" required error={fieldMessages.payment_mode}>
                  <select value={paymentMode} onChange={e => setPaymentMode(e.target.value)} className={selectClass}>
                    {PAYMENT_MODES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </FormField>
                <TextInput label="Bank / cash account" required error={fieldMessages.bank_cash_account} value={bankCashAccount} onChange={e => { setBankCashAccount(e.target.value); setFieldMessages(prev => clearFieldMessage(prev, 'bank_cash_account')); }} />
                <TextInput label="Transaction reference" helper="Cheque number, UTR, transaction ID" value={transactionReference} onChange={e => setTransactionReference(e.target.value)} />
              </div>
            </section>
            <section>
              <h4 className={sectionTitle}>Allocate to invoices</h4>
              {fieldMessages.allocations && <p className="text-xs font-mono text-[var(--erp-negative)] mb-2">{fieldMessages.allocations}</p>}
              {outstanding.length ? (
                <div className="overflow-x-auto border border-[var(--erp-hairline)]">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[var(--erp-surface-2)] font-mono text-[10px] uppercase tracking-wider text-[var(--erp-muted)]">
                      <tr>
                        <th className="px-3 py-2">Invoice</th>
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2 text-right">Net</th>
                        <th className="px-3 py-2 text-right">Balance due</th>
                        <th className="px-3 py-2 w-36">Allocate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {outstanding.map(inv => (
                        <tr key={inv.id} className="border-t border-[var(--erp-hairline)]">
                          <td className="px-3 py-2 font-mono text-[var(--erp-gold)]">{inv.invoice_number}</td>
                          <td className="px-3 py-2 font-mono">{inv.invoice_date}</td>
                          <td className="px-3 py-2">{inv.display_status || inv.status}</td>
                          <td className="px-3 py-2 text-right font-mono">{money(inv.net_amount)}</td>
                          <td className="px-3 py-2 text-right font-mono">{money(inv.remaining_balance)}</td>
                          <td className="px-3 py-2">
                            <input
                              value={allocAmounts[inv.id] || ''}
                              onChange={e => setAllocAmounts(prev => ({ ...prev, [inv.id]: e.target.value }))}
                              className={`w-full px-2 py-1.5 font-mono bg-[var(--erp-surface)] border text-[var(--erp-text)] ${fieldMessages[`alloc_${inv.id}`] ? 'border-[var(--erp-negative)]' : 'border-[var(--erp-hairline-strong)]'}`}
                            />
                            {fieldMessages[`alloc_${inv.id}`] && <p className="text-[10px] font-mono text-[var(--erp-negative)] mt-1">{fieldMessages[`alloc_${inv.id}`]}</p>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs font-mono text-[var(--erp-muted)]">
                  {customerId ? 'No outstanding invoices. Unallocated amount will be held as Advance/Credit.' : 'Select a customer to see outstanding invoices.'}
                </p>
              )}
              <div className="mt-4 flex flex-wrap justify-end gap-6 font-mono text-sm border-t border-[var(--erp-hairline)] pt-3">
                <div>Allocated {money(totals.allocated)}</div>
                <div>Payment {money(amount)}</div>
                <div className={totals.unallocated > 0 ? 'text-[var(--erp-gold)]' : ''}>Unallocated (Advance) {money(totals.unallocated)}</div>
              </div>
            </section>
            <section>
              <h4 className={sectionTitle}>Remarks</h4>
              <textarea value={remarks} onChange={e => setRemarks(e.target.value)} rows={3} className="w-full px-3 py-2 text-sm bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] text-[var(--erp-text)] focus:outline-none focus:border-[var(--erp-gold)] rounded-none" />
            </section>
            <div className="flex justify-end gap-3 pt-2 border-t border-[var(--erp-hairline)]">
              <button type="button" onClick={() => setMode('list')} className="px-4 py-2 border border-[var(--erp-hairline)] text-xs font-mono">Cancel</button>
              <button type="submit" disabled={saving} className="px-5 py-2 bg-[var(--erp-gold)] text-[#0F141B] text-xs font-semibold">{saving ? 'Saving…' : 'Save payment'}</button>
            </div>
          </form>
        </div>
      )}

      {mode === 'detail' && detail && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-4xl max-h-[92vh] overflow-y-auto bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] p-6 space-y-5">
            <div className="flex justify-between items-start border-b border-[var(--erp-hairline)] pb-3">
              <div>
                <h3 className="font-display text-lg font-bold">{detail.payment_number}</h3>
                <p className="text-xs font-mono text-[var(--erp-muted)] mt-1">{detail.payment_date} · {detail.customer_code} {detail.customer_name} · {detail.payment_mode} · {detail.bank_cash_account}</p>
              </div>
              <button type="button" onClick={() => setMode('list')}><X className="w-4 h-4" /></button>
            </div>
            <div className="flex flex-wrap gap-6 font-mono text-sm">
              <div>Amount {money(detail.amount)}</div>
              <div className={num(detail.unallocated_amount) > 0 ? 'text-[var(--erp-gold)]' : ''}>Unallocated {money(detail.unallocated_amount)}</div>
              {detail.transaction_reference ? <div>Ref {detail.transaction_reference}</div> : null}
            </div>
            <section>
              <h4 className={sectionTitle}>Allocations</h4>
              {detail.allocations.length ? (
                <div className="overflow-x-auto border border-[var(--erp-hairline)]">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[var(--erp-surface-2)] font-mono text-[10px] uppercase tracking-wider text-[var(--erp-muted)]">
                      <tr>
                        <th className="px-3 py-2">Invoice</th>
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2 text-right">Allocated</th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.allocations.map(row => (
                        <tr key={row.id} className="border-t border-[var(--erp-hairline)]">
                          <td className="px-3 py-2 font-mono text-[var(--erp-gold)]">{row.invoice_number}</td>
                          <td className="px-3 py-2 font-mono">{row.invoice_date}</td>
                          <td className="px-3 py-2 text-right font-mono">{money(row.allocated_amount)}</td>
                          <td className="px-3 py-2 text-right">
                            {canDelete && row.id ? (
                              <button type="button" className="text-[var(--erp-negative)] font-mono text-[10px]" onClick={() => setPendingAlloc(row)}>Remove</button>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs font-mono text-[var(--erp-muted)]">No allocations — full amount is Advance/Credit.</p>
              )}
            </section>
            {canWrite && num(detail.unallocated_amount) > 0 && (
              <section>
                <h4 className={sectionTitle}>Allocate remaining advance</h4>
                <RequiredLegend />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField label="Invoice" required error={allocMessages.invoice_id}>
                    <select
                      value={allocInvoiceId}
                      onChange={e => {
                        setAllocInvoiceId(e.target.value ? Number(e.target.value) : '');
                        setAllocMessages(prev => clearFieldMessage(prev, 'invoice_id'));
                      }}
                      className={selectClass}
                    >
                      <option value="">Select invoice…</option>
                      {allocInvoices.map(inv => (
                        <option key={inv.id} value={inv.id}>{inv.invoice_number} · due {money(inv.remaining_balance)}</option>
                      ))}
                    </select>
                  </FormField>
                  <TextInput
                    label="Amount"
                    mono
                    required
                    error={allocMessages.allocated_amount}
                    value={allocAmount}
                    onChange={e => {
                      setAllocAmount(e.target.value);
                      setAllocMessages(prev => clearFieldMessage(prev, 'allocated_amount'));
                    }}
                  />
                  <FormField label="Reason" required error={allocMessages.reason}>
                    <select
                      value={allocReasonPreset}
                      onChange={e => {
                        setAllocReasonPreset(e.target.value);
                        setAllocMessages(prev => clearFieldMessage(prev, 'reason'));
                      }}
                      className={selectClass}
                    >
                      {PAYMENT_ADJUSTMENT_REASONS.map(reason => (
                        <option key={reason} value={reason}>{reason}</option>
                      ))}
                      <option value="Other">Other</option>
                    </select>
                  </FormField>
                  <TextInput
                    label="Reference"
                    helper="Optional external reference"
                    value={allocReference}
                    onChange={e => setAllocReference(e.target.value)}
                  />
                  {allocReasonPreset === 'Other' ? (
                    <TextInput
                      label="Custom reason"
                      required
                      error={allocMessages.reason}
                      value={allocReasonOther}
                      onChange={e => {
                        setAllocReasonOther(e.target.value);
                        setAllocMessages(prev => clearFieldMessage(prev, 'reason'));
                      }}
                    />
                  ) : null}
                </div>
                <div className="mt-4 flex justify-end">
                  <button type="button" onClick={() => void submitAdvanceAlloc()} className="px-4 py-2 bg-[var(--erp-gold)] text-[#0F141B] text-xs font-semibold">Allocate</button>
                </div>
              </section>
            )}
            <section>
              <h4 className={sectionTitle}>Adjustment History</h4>
              {(detail.adjustments || []).length ? (
                <div className="overflow-x-auto border border-[var(--erp-hairline)]">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[var(--erp-surface-2)] font-mono text-[10px] uppercase tracking-wider text-[var(--erp-muted)]">
                      <tr>
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2">Invoice</th>
                        <th className="px-3 py-2 text-right">Amount</th>
                        <th className="px-3 py-2">Reason</th>
                        <th className="px-3 py-2">Created By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(detail.adjustments || []).map((row: PaymentAdjustmentRow) => (
                        <tr key={row.id} className="border-t border-[var(--erp-hairline)]">
                          <td className="px-3 py-2 font-mono">{stampDate(row.created_at)}</td>
                          <td className="px-3 py-2 font-mono text-[var(--erp-gold)]">{row.invoice_number}</td>
                          <td className="px-3 py-2 text-right font-mono">{money(row.amount)}</td>
                          <td className="px-3 py-2">{row.reason}</td>
                          <td className="px-3 py-2 font-mono">{row.created_by_name || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs font-mono text-[var(--erp-muted)]">No post-receipt adjustments on this payment.</p>
              )}
            </section>
            {detail.remarks ? <p className="text-sm text-[var(--erp-muted)]">{detail.remarks}</p> : null}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        entityType="payment"
        entityLabel={pendingDelete ? pendingDelete.payment_number : ''}
        title="Delete payment?"
        message={pendingDelete ? `Delete '${pendingDelete.payment_number}'? Payments with allocations must have those allocations removed first.` : ''}
        confirmLabel="Delete"
        confirmTone="critical"
        onCancel={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (!pendingDelete) return;
          try {
            await paymentsApi.remove(pendingDelete.id);
            notifySuccess(`Payment '${pendingDelete.payment_number}' deleted.`);
            setPendingDelete(null);
            setMode('list');
            await load();
          } catch (err) {
            notifyApiError(err);
          }
        }}
      />
      <ConfirmDialog
        open={!!pendingAlloc}
        entityType="allocation"
        entityLabel={pendingAlloc ? (pendingAlloc.invoice_number || 'allocation') : ''}
        title="Remove allocation?"
        message={pendingAlloc ? `Remove ${money(pendingAlloc.allocated_amount)} from ${pendingAlloc.invoice_number}? Invoice status will be recalculated.` : ''}
        confirmLabel="Remove"
        confirmTone="critical"
        onCancel={() => setPendingAlloc(null)}
        onConfirm={async () => {
          if (!pendingAlloc || !detail || !pendingAlloc.id) return;
          try {
            const updated = await paymentsApi.removeAllocation(detail.id, pendingAlloc.id);
            notifySuccess('Allocation removed.');
            setPendingAlloc(null);
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
