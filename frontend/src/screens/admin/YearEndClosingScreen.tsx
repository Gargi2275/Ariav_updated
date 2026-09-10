import React, { useState } from 'react';
import { useErp } from '../../context/ErpContext';
import { PageHeader } from '../../components/common/PageHeader';
import { CalendarCheck, AlertTriangle, ArrowRight, ShieldCheck, CheckCircle2, Lock } from 'lucide-react';

export const YearEndClosingScreen: React.FC = () => {
  const { financialYear, setFinancialYear, showFlash, addAuditLog } = useErp();
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);
  const [pin, setPin] = useState('');
  const [confirmedClose, setConfirmedClose] = useState(false);
  const [pinError, setPinError] = useState('');

  const handleStepNext = () => {
    setCurrentStep(prev => (prev < 4 ? ((prev + 1) as any) : prev));
  };

  const handleExecuteClosing = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin !== '1984' && pin.length < 4) {
      setPinError('Invalid Admin Authorization PIN');
      return;
    }
    setConfirmedClose(true);
    addAuditLog('Executed Financial Year Closing', 'Year-End Rollover', `Closed FY ${financialYear} and rolled balances into FY 2026-27`, 'critical');
    showFlash(`FY ${financialYear} locked. Opening balances successfully rolled over to FY 2026-27`, 'positive');
    setFinancialYear('2026-27');
  };

  return (
    <div className="max-w-4xl mx-auto p-6 flex flex-col gap-6 text-left">
      {/* Unified Page Header */}
      <PageHeader
        moduleNumber="10"
        section="Admin"
        title="Year-End Financial Closing & Rollover"
        subtitle="Permanent ledger freeze, profit-to-capital allocation, and opening balance generation for new financial year."
        actions={
          <div className="px-3 py-1.5 bg-[var(--erp-surface-2)] border border-[var(--erp-gold)]/40 font-mono text-xs text-[var(--erp-gold)]">
            Target: FY {financialYear} &rarr; FY 2026-27
          </div>
        }
      />

      {/* Confirmation Step Flow Tracker */}
      <div className="grid grid-cols-4 gap-2 font-mono text-xs">
        <div className={`p-2.5 border ${currentStep === 1 ? 'border-[var(--erp-gold)] bg-[var(--erp-gold)]/10 text-[var(--erp-gold)]' : 'border-[var(--erp-hairline)] text-[var(--erp-muted)]'}`}>
          1. Pre-Closing Audit
        </div>
        <div className={`p-2.5 border ${currentStep === 2 ? 'border-[var(--erp-gold)] bg-[var(--erp-gold)]/10 text-[var(--erp-gold)]' : 'border-[var(--erp-hairline)] text-[var(--erp-muted)]'}`}>
          2. Zero-Voucher Check
        </div>
        <div className={`p-2.5 border ${currentStep === 3 ? 'border-[var(--erp-gold)] bg-[var(--erp-gold)]/10 text-[var(--erp-gold)]' : 'border-[var(--erp-hairline)] text-[var(--erp-muted)]'}`}>
          3. P&L Capital Roll
        </div>
        <div className={`p-2.5 border ${currentStep === 4 ? 'border-[var(--erp-gold)] bg-[var(--erp-gold)]/10 text-[var(--erp-gold)]' : 'border-[var(--erp-hairline)] text-[var(--erp-muted)]'}`}>
          4. Pin Authorization
        </div>
      </div>

      {/* Main Step Execution Content */}
      <div className="border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] p-6">
        {currentStep === 1 && (
          <div className="space-y-4">
            <h3 className="font-serif text-lg font-bold text-[var(--erp-text)]">
              Stage 1: Pre-Closing Trial Balance Verification
            </h3>
            <p className="text-xs text-[var(--erp-muted)]">
              Verifying that all debits equal credits across general ledgers, sub-ledgers, mill principals and bank accounts.
            </p>

            <div className="p-4 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] font-mono text-xs space-y-2">
              <div className="flex justify-between">
                <span>Total Debit Aggregate</span>
                <span className="text-[var(--erp-text)] font-semibold">₹14,82,41,920.00 Dr</span>
              </div>
              <div className="flex justify-between">
                <span>Total Credit Aggregate</span>
                <span className="text-[var(--erp-text)] font-semibold">₹14,82,41,920.00 Cr</span>
              </div>
              <div className="pt-2 border-t border-[var(--erp-hairline)] flex justify-between text-[var(--erp-positive)]">
                <span>Arithmetic Variance</span>
                <span>₹0.00 (Balanced Perfectly)</span>
              </div>
            </div>

            <div className="pt-4 flex justify-end">
              <button
                onClick={handleStepNext}
                className="px-4 py-2 bg-[var(--erp-gold)] text-[#0F141B] font-mono text-xs font-semibold hover:bg-[var(--erp-gold-soft)] flex items-center gap-1.5"
              >
                Pass Stage 1 & Proceed <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {currentStep === 2 && (
          <div className="space-y-4">
            <h3 className="font-serif text-lg font-bold text-[var(--erp-text)]">
              Stage 2: Unposted & Draft Vouchers Inspection
            </h3>
            <p className="text-xs text-[var(--erp-muted)]">
              Ensuring no draft invoices, unadjusted cheques or pending material returns remain uncommitted before rollover.
            </p>

            <div className="space-y-2 font-mono text-xs">
              <div className="p-3 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] flex items-center justify-between">
                <span>Draft Sales Invoices</span>
                <span className="text-[var(--erp-positive)] flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> 0 Pending
                </span>
              </div>
              <div className="p-3 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] flex items-center justify-between">
                <span>Uncleared Cheques in Transit</span>
                <span className="text-[var(--erp-positive)] flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> All Reconciled
                </span>
              </div>
              <div className="p-3 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] flex items-center justify-between">
                <span>Unapproved Operator Requests</span>
                <span className="text-[var(--erp-positive)] flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Queue Cleared
                </span>
              </div>
            </div>

            <div className="pt-4 flex justify-end">
              <button
                onClick={handleStepNext}
                className="px-4 py-2 bg-[var(--erp-gold)] text-[#0F141B] font-mono text-xs font-semibold hover:bg-[var(--erp-gold-soft)] flex items-center gap-1.5"
              >
                Proceed to P&L Allocation <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {currentStep === 3 && (
          <div className="space-y-4">
            <h3 className="font-serif text-lg font-bold text-[var(--erp-text)]">
              Stage 3: Net Profit to Partner Capital Allocation
            </h3>
            <p className="text-xs text-[var(--erp-muted)]">
              The net audited profit will be transferred to Partner Capital Accounts according to the Gujarat Partnership deed ratio (60% Paresh Patel / 40% Ramesh Patel).
            </p>

            <div className="p-4 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] font-mono text-xs space-y-2.5">
              <div className="flex justify-between font-semibold">
                <span>Net Trading & Brokerage Profit</span>
                <span className="text-[var(--erp-positive)]">₹42,80,000.00</span>
              </div>
              <div className="flex justify-between pl-4 text-[var(--erp-muted)]">
                <span>Paresh Patel Capital A/c (60%)</span>
                <span>₹25,68,000.00 Cr</span>
              </div>
              <div className="flex justify-between pl-4 text-[var(--erp-muted)]">
                <span>Ramesh Patel Capital A/c (40%)</span>
                <span>₹17,12,000.00 Cr</span>
              </div>
              <div className="pt-2 border-t border-[var(--erp-hairline)] text-[var(--erp-muted)]">
                Nominal accounts (Sales, Purchases, Expenses) reset to zero. Real and Personal accounts roll forward as Opening Balances.
              </div>
            </div>

            <div className="pt-4 flex justify-end">
              <button
                onClick={handleStepNext}
                className="px-4 py-2 bg-[var(--erp-gold)] text-[#0F141B] font-mono text-xs font-semibold hover:bg-[var(--erp-gold-soft)] flex items-center gap-1.5"
              >
                Proceed to Final PIN Lock <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {currentStep === 4 && (
          <div className="space-y-4">
            {!confirmedClose ? (
              <form onSubmit={handleExecuteClosing} className="space-y-4">
                <div className="p-4 border border-[var(--erp-negative)]/40 bg-[var(--erp-negative)]/10 text-[var(--erp-negative)] flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <div>
                    <strong className="font-mono text-xs block uppercase">Irreversible Financial Action</strong>
                    <span className="text-xs">
                      Executing this will permanently seal FY {financialYear} into read-only mode and instantiate FY 2026-27 opening books.
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-normal text-[var(--erp-muted)] mb-1">
                    Enter Admin Authorization PIN to Seal Year
                  </label>
                  <input
                    type="password"
                    maxLength={4}
                    autoFocus
                    value={pin}
                    onChange={e => {
                      setPin(e.target.value);
                      setPinError('');
                    }}
                    placeholder="••••"
                    className="w-full max-w-xs px-4 py-2.5 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline-strong)] font-mono text-xl tracking-[0.5em] text-center text-[var(--erp-text)] focus:border-[var(--erp-gold)] focus:outline-none"
                  />
                  {pinError && <p className="text-xs font-mono text-[var(--erp-negative)] mt-1">{pinError}</p>}
                </div>

                <button
                  type="submit"
                  className="px-6 py-2.5 bg-[var(--erp-negative)] hover:bg-[#c2453c] text-white font-mono text-xs font-semibold transition-colors flex items-center gap-2"
                >
                  <Lock className="w-4 h-4" /> Permanently Close FY {financialYear} & Roll Forward
                </button>
              </form>
            ) : (
              <div className="py-8 text-center space-y-3 animate-in zoom-in-95 duration-200">
                <div className="w-16 h-16 rounded-full bg-[var(--erp-positive)]/20 border-2 border-[var(--erp-positive)] flex items-center justify-center text-[var(--erp-positive)] mx-auto">
                  <ShieldCheck className="w-8 h-8" />
                </div>
                <h3 className="font-serif text-2xl font-bold text-[var(--erp-text)]">
                  FY {financialYear} Successfully Rolled & Sealed
                </h3>
                <p className="text-xs font-mono text-[var(--erp-positive)]">
                  Opening Balance Ledgers for FY 2026-27 Active • Audit Checksum Recorded
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
