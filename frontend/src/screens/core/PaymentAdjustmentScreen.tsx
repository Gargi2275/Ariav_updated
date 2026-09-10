import React, { useState } from 'react';
import { useErp } from '../../context/ErpContext';
import { PageHeader } from '../../components/common/PageHeader';
import { PartyPicker } from '../../components/common/FormControls';
import { Scale, CheckCircle2, ArrowRightLeft, Sparkles, Save } from 'lucide-react';

interface OpenCredit {
  id: string;
  type: 'Receipt' | 'Credit Note';
  refNo: string;
  date: string;
  unadjustedAmount: number;
  allocating: number;
}

interface OpenDebit {
  id: string;
  invNo: string;
  date: string;
  billAmount: number;
  outstandingBalance: number;
  settling: number;
}

export const PaymentAdjustmentScreen: React.FC = () => {
  const { parties, showFlash, addAuditLog } = useErp();
  const [selectedPartyId, setSelectedPartyId] = useState(parties[0]?.id || 'PT-1001');

  const [openCredits, setOpenCredits] = useState<OpenCredit[]>([
    { id: 'CR-1', type: 'Receipt', refNo: 'BR-2025-0982', date: '2026-08-28', unadjustedAmount: 240000, allocating: 240000 },
    { id: 'CR-2', type: 'Credit Note', refNo: 'CN-2025-0118', date: '2026-09-02', unadjustedAmount: 36000, allocating: 36000 },
  ]);

  const [openDebits, setOpenDebits] = useState<OpenDebit[]>([
    { id: 'DB-1', invNo: 'INV-2025-0902', date: '2026-08-15', billAmount: 200000, outstandingBalance: 200000, settling: 200000 },
    { id: 'DB-2', invNo: 'INV-2025-0941', date: '2026-08-20', billAmount: 180000, outstandingBalance: 180000, settling: 76000 },
  ]);

  const totalCreditAllocated = openCredits.reduce((sum, c) => sum + c.allocating, 0);
  const totalDebitSettled = openDebits.reduce((sum, d) => sum + d.settling, 0);
  const isMatch = Math.abs(totalCreditAllocated - totalDebitSettled) < 0.01;

  const handleAutoFifo = () => {
    let pool = openCredits.reduce((s, c) => s + c.unadjustedAmount, 0);
    setOpenCredits(prev => prev.map(c => ({ ...c, allocating: c.unadjustedAmount })));

    setOpenDebits(prev =>
      prev.map(d => {
        if (pool <= 0) return { ...d, settling: 0 };
        const take = Math.min(pool, d.outstandingBalance);
        pool -= take;
        return { ...d, settling: take };
      })
    );
    showFlash('Auto-FIFO allocation applied against oldest open invoices', 'gold');
  };

  const handleCommitReconciliation = () => {
    if (!isMatch) return;
    addAuditLog(
      'Committed Bill-by-Bill Reconciliation',
      'Banking & Cash',
      `Reconciled ₹${totalCreditAllocated.toLocaleString('en-IN')} across invoices INV-2025-0902 and INV-2025-0941`,
      'notice'
    );
    showFlash(`Reconciliation committed for party. Invoices marked knocked-off.`, 'positive');
  };

  return (
    <div className="p-6 flex flex-col gap-6 text-left">
      {/* Unified Page Header */}
      <PageHeader
        moduleNumber="20"
        section="Core Operations"
        title="Payment Adjustment & Bill-by-Bill Settlement"
        subtitle="Match unallocated on-account advance receipts and credit notes against specific pending textile sales invoices."
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={handleAutoFifo}
              className="px-3 py-1.5 border border-[var(--erp-gold)] bg-[var(--erp-gold)]/10 text-[var(--erp-gold)] font-mono text-xs hover:bg-[var(--erp-gold)] hover:text-[#0F141B] transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" /> Auto-FIFO Match
            </button>
            <button
              onClick={handleCommitReconciliation}
              disabled={!isMatch || totalCreditAllocated === 0}
              className="px-4 py-1.5 bg-[var(--erp-gold)] text-[#0F141B] font-mono text-xs font-semibold hover:bg-[var(--erp-gold-soft)] disabled:opacity-40 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" /> Commit Reconciliation
            </button>
          </div>
        }
      />

      <div className="border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] p-5">
        <PartyPicker
          label="Select Account for Bill-by-Bill Settlement"
          selectedPartyId={selectedPartyId}
          onSelect={setSelectedPartyId}
        />
      </div>

      {/* Two-Column Reconciliation Stage */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Open Unadjusted Credits / Receipts */}
        <div className="border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--erp-hairline)]">
            <div>
              <h3 className="font-serif text-sm font-bold text-[var(--erp-text)]">
                1. Unallocated Credits & Advances
              </h3>
              <span className="text-[11px] font-mono text-[var(--erp-muted)]">
                Total Available: ₹{openCredits.reduce((s, c) => s + c.unadjustedAmount, 0).toLocaleString('en-IN')}
              </span>
            </div>
            <span className="px-2 py-0.5 text-xs font-mono bg-[var(--erp-surface-2)] text-[var(--erp-positive)] border border-[var(--erp-positive)]/30">
              Allocating: ₹{totalCreditAllocated.toLocaleString('en-IN')}
            </span>
          </div>

          <div className="space-y-3 font-mono text-xs">
            {openCredits.map(c => (
              <div key={c.id} className="p-3 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] space-y-2">
                <div className="flex justify-between items-center">
                  <div>
                    <span className="font-bold text-[var(--erp-gold)]">{c.refNo}</span>
                    <span className="text-[11px] text-[var(--erp-muted)] block">{c.type} • {c.date}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-[var(--erp-muted)] block">Available Balance</span>
                    <span className="text-xs font-semibold text-[var(--erp-text)]">
                      ₹{c.unadjustedAmount.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>

                <div className="pt-2 border-t border-[var(--erp-hairline)] flex justify-between items-center">
                  <span className="text-[var(--erp-muted)] font-sans">Knock-off Allocation:</span>
                  <div className="flex items-center gap-1">
                    <span>₹</span>
                    <input
                      type="number"
                      value={c.allocating}
                      onChange={e => {
                        const val = parseFloat(e.target.value) || 0;
                        setOpenCredits(prev => prev.map(item => item.id === c.id ? { ...item, allocating: val } : item));
                      }}
                      className="w-28 bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] px-2 py-1 text-right text-xs focus:border-[var(--erp-gold)] text-[var(--erp-text)] font-mono"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Open Unpaid Sales Invoices */}
        <div className="border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--erp-hairline)]">
            <div>
              <h3 className="font-serif text-sm font-bold text-[var(--erp-text)]">
                2. Open Unsettled Sales Invoices
              </h3>
              <span className="text-[11px] font-mono text-[var(--erp-muted)]">
                Total Overdue: ₹{openDebits.reduce((s, d) => s + d.outstandingBalance, 0).toLocaleString('en-IN')}
              </span>
            </div>
            <span className="px-2 py-0.5 text-xs font-mono bg-[var(--erp-surface-2)] text-[var(--erp-gold)] border border-[var(--erp-gold)]/30">
              Settling: ₹{totalDebitSettled.toLocaleString('en-IN')}
            </span>
          </div>

          <div className="space-y-3 font-mono text-xs">
            {openDebits.map(d => (
              <div key={d.id} className="p-3 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] space-y-2">
                <div className="flex justify-between items-center">
                  <div>
                    <span className="font-bold text-[var(--erp-text)]">{d.invNo}</span>
                    <span className="text-[11px] text-[var(--erp-muted)] block">Tax Bill • {d.date}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-[var(--erp-muted)] block">Unpaid Bill Balance</span>
                    <span className="text-xs font-semibold text-[var(--erp-negative)]">
                      ₹{d.outstandingBalance.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>

                <div className="pt-2 border-t border-[var(--erp-hairline)] flex justify-between items-center">
                  <span className="text-[var(--erp-muted)] font-sans">Settled from Credits:</span>
                  <div className="flex items-center gap-1">
                    <span>₹</span>
                    <input
                      type="number"
                      value={d.settling}
                      onChange={e => {
                        const val = parseFloat(e.target.value) || 0;
                        setOpenDebits(prev => prev.map(item => item.id === d.id ? { ...item, settling: val } : item));
                      }}
                      className="w-28 bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] px-2 py-1 text-right text-xs focus:border-[var(--erp-gold)] text-[var(--erp-text)] font-mono"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tally Confirmation Bar */}
      <div className={`p-4 border font-mono text-xs flex flex-col sm:flex-row items-center justify-between gap-4 ${
        isMatch ? 'bg-[var(--erp-positive)]/10 border-[var(--erp-positive)]/40 text-[var(--erp-positive)]' : 'bg-[var(--erp-gold)]/10 border-[var(--erp-gold)]/40 text-[var(--erp-gold)]'
      }`}>
        <div className="flex items-center gap-2">
          {isMatch ? (
            <>
              <CheckCircle2 className="w-4 h-4" />
              <span>Exact Equal Settlement: ₹{totalCreditAllocated.toLocaleString('en-IN')} Credits = ₹{totalDebitSettled.toLocaleString('en-IN')} Invoices Knocked Off</span>
            </>
          ) : (
            <>
              <ArrowRightLeft className="w-4 h-4" />
              <span>Variance: ₹{Math.abs(totalCreditAllocated - totalDebitSettled).toLocaleString('en-IN')} (Credit allocation must match bill settlement)</span>
            </>
          )}
        </div>
        <span className="text-[11px] text-[var(--erp-muted)]">Knock-off reduces age analysis brackets immediately</span>
      </div>
    </div>
  );
};
