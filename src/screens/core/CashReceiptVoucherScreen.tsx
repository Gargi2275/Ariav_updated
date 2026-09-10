import React, { useState } from 'react';
import { useErp } from '../../context/ErpContext';
import { PageHeader } from '../../components/common/PageHeader';
import { TextInput, DateInput, PartyPicker } from '../../components/common/FormControls';
import { Coins, Save, CheckCircle2, AlertCircle } from 'lucide-react';

interface Denomination {
  value: number;
  count: number;
}

export const CashReceiptVoucherScreen: React.FC = () => {
  const { parties, showFlash, addAuditLog, navigateTo } = useErp();

  const [voucherNo, setVoucherNo] = useState('CR-2025-0419');
  const [voucherDate, setVoucherDate] = useState('2026-09-08');
  const [selectedPartyId, setSelectedPartyId] = useState(parties[4]?.id || 'PT-1005'); // Patel & Brothers
  const [targetCashAccount, setTargetCashAccount] = useState('Ahmedabad Branch Petty Cash Vault');
  const [narration, setNarration] = useState('Cash collection against Surat dispatch grey fabric delivery challan #881');

  const [denominations, setDenominations] = useState<Denomination[]>([
    { value: 500, count: 84 },
    { value: 200, count: 20 },
    { value: 100, count: 40 },
    { value: 50, count: 20 },
    { value: 20, count: 10 },
    { value: 10, count: 20 },
  ]);

  const updateDenom = (val: number, count: number) => {
    setDenominations(prev =>
      prev.map(d => (d.value === val ? { ...d, count: Math.max(0, count) } : d))
    );
  };

  const totalCalculatedCash = denominations.reduce((acc, d) => acc + d.value * d.count, 0);

  const handlePost = (e: React.FormEvent) => {
    e.preventDefault();
    addAuditLog(
      'Posted Cash Receipt Voucher',
      'Banking & Cash',
      `Voucher ${voucherNo}: ₹${totalCalculatedCash.toLocaleString('en-IN')} cash received into ${targetCashAccount}`,
      'notice'
    );
    showFlash(`Cash Receipt ${voucherNo} posted into Daybook`, 'positive');
    navigateTo(35); // Bank & Cash Book
  };

  return (
    <div className="p-6 flex flex-col gap-6 text-left">
      {/* Unified Page Header */}
      <PageHeader
        moduleNumber="14"
        section="Core Operations"
        title="Cash Receipt Voucher & Vault Inflow"
        subtitle="Physical bank notes counter and instant ledger credit for counter collections and driver advances."
        actions={
          <button
            onClick={handlePost}
            className="px-4 py-1.5 bg-[var(--erp-gold)] text-[#0F141B] font-mono text-xs font-semibold hover:bg-[var(--erp-gold-soft)] flex items-center gap-1.5 cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" /> Post Cash Voucher
          </button>
        }
      />

      <form onSubmit={handlePost} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] p-5">
          <TextInput
            label="Cash Voucher #"
            mono
            value={voucherNo}
            onChange={e => setVoucherNo(e.target.value)}
          />
          <DateInput
            label="Transaction Date"
            value={voucherDate}
            onChange={e => setVoucherDate(e.target.value)}
          />
          <div className="flex flex-col gap-1 text-left">
            <label className="text-xs text-[var(--erp-muted)] font-sans">
              Deposit Cash Vault / Ledger
            </label>
            <select
              value={targetCashAccount}
              onChange={e => setTargetCashAccount(e.target.value)}
              className="px-3 py-2 text-xs font-mono bg-[var(--erp-surface-2)] border border-[var(--erp-hairline-strong)] text-[var(--erp-text)] focus:border-[var(--erp-gold)]"
            >
              <option>Ahmedabad Branch Petty Cash Vault</option>
              <option>Surat Ring Road Counter Cash Drawer</option>
              <option>Rajkot Commercial Depot Cash Chest</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] p-5">
          <PartyPicker
            label="Received From Party"
            selectedPartyId={selectedPartyId}
            onSelect={setSelectedPartyId}
          />
          <TextInput
            label="Transaction Purpose & Narration"
            value={narration}
            onChange={e => setNarration(e.target.value)}
          />
        </div>

        {/* Currency Denomination Counter Table */}
        <div className="border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-[var(--erp-hairline)] pb-3">
            <div>
              <h3 className="font-serif text-base font-bold text-[var(--erp-text)]">
                Physical Currency Denomination Breakdown
              </h3>
              <p className="text-xs text-[var(--erp-muted)] font-sans">
                Count notes physically present in cashier's till to prevent cashbook discrepancies.
              </p>
            </div>
            <div className="text-right font-mono">
              <span className="text-xs text-[var(--erp-muted)]">Verified Total Cash:</span>
              <div className="text-2xl font-bold text-[var(--erp-gold)]">
                ₹{totalCalculatedCash.toLocaleString('en-IN')}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 font-mono text-xs">
            {denominations.map(d => (
              <div
                key={d.value}
                className="p-3 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] flex flex-col justify-between"
              >
                <div className="flex justify-between items-center text-[var(--erp-muted)] mb-2">
                  <span className="font-bold text-[var(--erp-text)] text-sm">₹{d.value}</span>
                  <span className="text-[10px]">Note</span>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center gap-1">
                    <span className="text-[var(--erp-muted)]">×</span>
                    <input
                      type="number"
                      min={0}
                      value={d.count}
                      onChange={e => updateDenom(d.value, parseInt(e.target.value) || 0)}
                      className="w-full bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] px-2 py-1 text-right text-xs focus:border-[var(--erp-gold)] text-[var(--erp-text)]"
                    />
                  </div>

                  <div className="text-right text-[11px] text-[var(--erp-gold)] pt-1 border-t border-[var(--erp-hairline)]">
                    = ₹{(d.value * d.count).toLocaleString('en-IN')}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="p-3 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] flex items-center justify-between text-xs font-mono text-[var(--erp-muted)]">
            <span className="flex items-center gap-1.5 text-[var(--erp-positive)]">
              <CheckCircle2 className="w-3.5 h-3.5" /> Cashier Till Tally Verified
            </span>
            <span>Subject to Gujarat Cash Transaction Ceiling (Section 269ST &lt; ₹2,00,000)</span>
          </div>
        </div>
      </form>
    </div>
  );
};
