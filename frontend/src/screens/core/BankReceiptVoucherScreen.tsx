import React, { useState } from 'react';
import { useErp } from '../../context/ErpContext';
import { PageHeader } from '../../components/common/PageHeader';
import { TextInput, AmountInput, DateInput, PartyPicker } from '../../components/common/FormControls';
import { Landmark, Save, CheckCircle2, FileText, Check } from 'lucide-react';

interface PendingInvoice {
  invoiceNo: string;
  invoiceDate: string;
  originalAmount: number;
  unpaidBalance: number;
  allocatedAmount: number;
  selected: boolean;
}

export const BankReceiptVoucherScreen: React.FC = () => {
  const { parties, showFlash, addAuditLog, navigateTo } = useErp();

  const [voucherNo, setVoucherNo] = useState('BR-2025-1049');
  const [voucherDate, setVoucherDate] = useState('2026-09-08');
  const [clearingDate, setClearingDate] = useState('2026-09-10');
  const [bankAccount, setBankAccount] = useState('PT-1006'); // HDFC
  const [selectedPartyId, setSelectedPartyId] = useState('PT-1001'); // Sharda
  const [chequeNo, setChequeNo] = useState('491028');
  const [drawnOnBank, setDrawnOnBank] = useState('ICICI Bank, Ring Road Surat');
  const [totalReceiptAmount, setTotalReceiptAmount] = useState('480000');
  const [narration, setNarration] = useState('Cheque received against fabric dispatch bill INV-2025-0792');

  const [pendingInvoices, setPendingInvoices] = useState<PendingInvoice[]>([
    {
      invoiceNo: 'INV-2025-0792',
      invoiceDate: '2026-08-14',
      originalAmount: 512000,
      unpaidBalance: 480000,
      allocatedAmount: 480000,
      selected: true
    },
    {
      invoiceNo: 'INV-2025-0814',
      invoiceDate: '2026-08-22',
      originalAmount: 340000,
      unpaidBalance: 340000,
      allocatedAmount: 0,
      selected: false
    },
    {
      invoiceNo: 'INV-2025-0899',
      invoiceDate: '2026-09-02',
      originalAmount: 662950,
      unpaidBalance: 662950,
      allocatedAmount: 0,
      selected: false
    }
  ]);

  const toggleInvoice = (invNo: string) => {
    setPendingInvoices(prev =>
      prev.map(inv => {
        if (inv.invoiceNo === invNo) {
          const newSelected = !inv.selected;
          return {
            ...inv,
            selected: newSelected,
            allocatedAmount: newSelected ? inv.unpaidBalance : 0
          };
        }
        return inv;
      })
    );
  };

  const updateAllocatedAmount = (invNo: string, val: number) => {
    setPendingInvoices(prev =>
      prev.map(inv => {
        if (inv.invoiceNo === invNo) {
          return {
            ...inv,
            allocatedAmount: val,
            selected: val > 0
          };
        }
        return inv;
      })
    );
  };

  const totalAllocated = pendingInvoices.reduce((sum, inv) => sum + (inv.selected ? inv.allocatedAmount : 0), 0);
  const numReceipt = parseFloat(totalReceiptAmount) || 0;
  const unadjustedBalance = numReceipt - totalAllocated;

  const handlePost = (e: React.FormEvent) => {
    e.preventDefault();
    addAuditLog(
      'Posted Bank Receipt Voucher',
      'Banking & Cash',
      `Voucher ${voucherNo}: Deposited ₹${numReceipt.toLocaleString('en-IN')} (Cheque #${chequeNo}) into HDFC Current A/c`,
      'notice'
    );
    showFlash(`Bank Receipt ${voucherNo} posted. Bank book updated.`, 'positive');
    navigateTo(30); // Go to Bank & Cash Book
  };

  return (
    <div className="p-6 flex flex-col gap-6 text-left">
      {/* Unified Page Header */}
      <PageHeader
        moduleNumber="13"
        section="Core Operations"
        title="Bank Receipt & Cheque Clearing"
        subtitle="Record cheque/RTGS collections, clearing status and bill-by-bill invoice knocked-off entries."
        actions={
          <button
            onClick={handlePost}
            className="px-4 py-1.5 bg-[var(--erp-gold)] text-[#0F141B] font-mono text-xs font-semibold hover:bg-[var(--erp-gold-soft)] flex items-center gap-1.5 cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" /> Post Bank Receipt
          </button>
        }
      />

      <form onSubmit={handlePost} className="space-y-6">
        {/* Voucher Metadata */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] p-5">
          <TextInput
            label="Voucher Reference #"
            mono
            value={voucherNo}
            onChange={e => setVoucherNo(e.target.value)}
          />
          <DateInput
            label="Voucher Date"
            value={voucherDate}
            onChange={e => setVoucherDate(e.target.value)}
          />
          <DateInput
            label="Expected Clearing Date"
            value={clearingDate}
            onChange={e => setClearingDate(e.target.value)}
          />
          <div className="flex flex-col gap-1 text-left">
            <label className="text-xs text-[var(--erp-muted)] font-sans">
              Entity Depositing Bank
            </label>
            <select
              value={bankAccount}
              onChange={e => setBankAccount(e.target.value)}
              className="px-3 py-2 text-xs font-mono bg-[var(--erp-surface-2)] border border-[var(--erp-hairline-strong)] text-[var(--erp-text)] focus:border-[var(--erp-gold)]"
            >
              <option value="PT-1006">HDFC CA 50200049182 (Surat Ring Rd)</option>
              <option value="PT-1007">SBI CA 3819402811 (Ahmedabad Narol)</option>
            </select>
          </div>
        </div>

        {/* Remitting Party & Instrument */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] p-5">
          <div className="md:col-span-2">
            <PartyPicker
              label="Remitting Debtor Party"
              selectedPartyId={selectedPartyId}
              onSelect={setSelectedPartyId}
            />
          </div>

          <AmountInput
            label="Cheque / RTGS Amount"
            value={totalReceiptAmount}
            onChange={e => setTotalReceiptAmount(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] p-5">
          <TextInput
            label="Cheque # / UTR Reference"
            mono
            value={chequeNo}
            onChange={e => setChequeNo(e.target.value)}
          />
          <TextInput
            label="Drawn on Bank & Branch"
            value={drawnOnBank}
            onChange={e => setDrawnOnBank(e.target.value)}
          />
          <TextInput
            label="Ledger Narration"
            value={narration}
            onChange={e => setNarration(e.target.value)}
          />
        </div>

        {/* Pending-Invoice Picker Table */}
        <div className="border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-serif text-base font-bold text-[var(--erp-text)] flex items-center gap-2">
              <FileText className="w-4 h-4 text-[var(--erp-gold)]" />
              Pending Invoice Knock-Off Allocation
            </h3>
            <span className="font-mono text-xs text-[var(--erp-muted)]">
              Allocated: ₹{totalAllocated.toLocaleString('en-IN')} / ₹{numReceipt.toLocaleString('en-IN')}
            </span>
          </div>

          <div className="border border-[var(--erp-hairline-strong)] overflow-x-auto">
            <table className="w-full text-left font-mono text-xs border-collapse">
              <thead className="bg-[var(--erp-surface-2)] border-b-2 border-[var(--erp-hairline-strong)] text-[11px] text-[var(--erp-muted)] select-none">
                <tr>
                  <th className="px-3 py-2.5 text-center w-12 font-semibold uppercase tracking-wider border-r border-[var(--erp-hairline)]">Match</th>
                  <th className="px-3 py-2.5 border-r border-[var(--erp-hairline)] font-semibold uppercase tracking-wider">Invoice Ref #</th>
                  <th className="px-3 py-2.5 border-r border-[var(--erp-hairline)] font-semibold uppercase tracking-wider">Invoice Date</th>
                  <th className="px-3 py-2.5 border-r border-[var(--erp-hairline)] text-right font-semibold uppercase tracking-wider">Bill Value</th>
                  <th className="px-3 py-2.5 border-r border-[var(--erp-hairline)] text-right font-semibold uppercase tracking-wider text-[var(--erp-negative)]">Pending Balance</th>
                  <th className="px-3 py-2.5 text-right font-semibold uppercase tracking-wider text-[var(--erp-gold)]">Knock-off Allocation (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--erp-hairline)]">
                {pendingInvoices.map(inv => (
                  <tr key={inv.invoiceNo} className="hover:bg-[var(--erp-surface-2)]/50">
                    <td className="px-3 py-2 text-center">
                      <div
                        onClick={() => toggleInvoice(inv.invoiceNo)}
                        className={`w-4 h-4 mx-auto border cursor-pointer flex items-center justify-center ${
                          inv.selected
                            ? 'bg-[var(--erp-positive)] border-[var(--erp-positive)] text-white'
                            : 'border-[var(--erp-hairline-strong)]'
                        }`}
                      >
                        {inv.selected && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                    </td>
                    <td className="px-3 py-2 border-r border-[var(--erp-hairline)] text-[var(--erp-gold)] font-medium">
                      {inv.invoiceNo}
                    </td>
                    <td className="px-3 py-2 border-r border-[var(--erp-hairline)] text-[var(--erp-muted)]">
                      {inv.invoiceDate}
                    </td>
                    <td className="px-3 py-2 border-r border-[var(--erp-hairline)] text-right text-[var(--erp-text)]">
                      ₹{inv.originalAmount.toLocaleString('en-IN')}
                    </td>
                    <td className="px-3 py-2 border-r border-[var(--erp-hairline)] text-right text-[var(--erp-negative)]">
                      ₹{inv.unpaidBalance.toLocaleString('en-IN')}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        disabled={!inv.selected}
                        value={inv.allocatedAmount}
                        onChange={e => updateAllocatedAmount(inv.invoiceNo, parseFloat(e.target.value) || 0)}
                        className="w-32 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] px-2 py-1 text-right font-mono text-xs focus:border-[var(--erp-gold)] text-[var(--erp-text)] disabled:opacity-30"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col sm:flex-row justify-between items-center text-xs font-mono pt-2">
            <span className={unadjustedBalance === 0 ? 'text-[var(--erp-positive)] flex items-center gap-1' : 'text-[var(--erp-gold)]'}>
              {unadjustedBalance === 0 ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" /> Fully Adjusted against Bills
                </>
              ) : (
                `Advance / On-Account Balance: ₹${unadjustedBalance.toLocaleString('en-IN')}`
              )}
            </span>
            <span className="text-[var(--erp-muted)]">PDC Status: In Vault Pending Bank Deposition</span>
          </div>
        </div>
      </form>
    </div>
  );
};
