import React, { useState } from 'react';
import { useErp } from '../../context/ErpContext';
import { PageHeader } from '../../components/common/PageHeader';
import { TextInput, AmountInput, DateInput, PartyPicker } from '../../components/common/FormControls';
import { CreditCard, Save, CheckCircle2, ArrowRight } from 'lucide-react';

export const PaymentVoucherScreen: React.FC = () => {
  const { parties, showFlash, addAuditLog, navigateTo } = useErp();

  const [paymentMode, setPaymentMode] = useState<'bank' | 'cash'>('bank');
  const [voucherNo, setVoucherNo] = useState('BP-2025-0812');
  const [voucherDate, setVoucherDate] = useState('2026-09-08');
  const [selectedPartyId, setSelectedPartyId] = useState('PT-1002'); // Arvind Commercial (Creditor)
  const [sourceAccount, setSourceAccount] = useState('PT-1006'); // HDFC
  const [grossAmount, setGrossAmount] = useState('240000');
  const [chequeRef, setChequeRef] = useState('NEFT-HDFC2609088192');
  const [tdsEnabled, setTdsEnabled] = useState(false);
  const [tdsSection, setTdsSection] = useState('194H'); // 5% Commission
  const [narration, setNarration] = useState('Payment against yarn supply batch invoice #ARN-901');

  const numGross = parseFloat(grossAmount) || 0;
  let tdsPercent = 0;
  if (tdsEnabled) {
    if (tdsSection === '194C') tdsPercent = 2; // Contract/Transporter
    else if (tdsSection === '194H') tdsPercent = 5; // Brokerage
    else if (tdsSection === '194I') tdsPercent = 10; // Rent
    else if (tdsSection === '194J') tdsPercent = 10; // Professional
  }
  const tdsDeduction = (numGross * tdsPercent) / 100;
  const netPayable = numGross - tdsDeduction;

  const handlePost = (e: React.FormEvent) => {
    e.preventDefault();
    addAuditLog(
      `Posted ${paymentMode === 'bank' ? 'Bank' : 'Cash'} Payment Voucher`,
      'Banking & Cash',
      `Disbursed net ₹${netPayable.toLocaleString('en-IN')} (Gross: ₹${numGross.toLocaleString('en-IN')}) via ${paymentMode.toUpperCase()}`,
      'notice'
    );
    showFlash(`Payment Voucher ${voucherNo} posted to Creditor Ledger`, 'positive');
    navigateTo(30); // Cash / Bank book
  };

  return (
    <div className="p-6 flex flex-col gap-6 text-left">
      {/* Unified Page Header */}
      <PageHeader
        moduleNumber="15"
        section="Core Operations"
        title="Bank & Cash Payment Vouchers"
        subtitle="Disburse funds to fabric mills, transporters and brokers with statutory TDS withholding."
        actions={
          <div className="flex items-center gap-2 font-mono text-xs">
            <button
              onClick={() => {
                setPaymentMode('bank');
                setVoucherNo('BP-2025-0812');
              }}
              className={`px-3 py-1.5 transition-colors cursor-pointer ${
                paymentMode === 'bank'
                  ? 'bg-[var(--erp-gold)] text-[#0F141B] font-semibold'
                  : 'bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-muted)]'
              }`}
            >
              Bank Payment (NEFT/Cheque)
            </button>
            <button
              onClick={() => {
                setPaymentMode('cash');
                setVoucherNo('CP-2025-0304');
              }}
              className={`px-3 py-1.5 transition-colors cursor-pointer ${
                paymentMode === 'cash'
                  ? 'bg-[var(--erp-gold)] text-[#0F141B] font-semibold'
                  : 'bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-muted)]'
              }`}
            >
              Cash Payment Voucher
            </button>
          </div>
        }
      />

      <form onSubmit={handlePost} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] p-5">
          <TextInput
            label="Payment Voucher #"
            mono
            value={voucherNo}
            onChange={e => setVoucherNo(e.target.value)}
          />
          <DateInput
            label="Payment Date"
            value={voucherDate}
            onChange={e => setVoucherDate(e.target.value)}
          />
          <div className="flex flex-col gap-1 text-left md:col-span-2">
            <label className="text-xs text-[var(--erp-muted)] font-sans">
              {paymentMode === 'bank' ? 'Disbursing Bank Account' : 'Disbursing Cash Vault'}
            </label>
            {paymentMode === 'bank' ? (
              <select
                value={sourceAccount}
                onChange={e => setSourceAccount(e.target.value)}
                className="px-3 py-2 text-xs font-mono bg-[var(--erp-surface-2)] border border-[var(--erp-hairline-strong)] text-[var(--erp-text)] focus:border-[var(--erp-gold)]"
              >
                <option value="PT-1006">HDFC Bank CA #50200049182 (Surat Ring Road)</option>
                <option value="PT-1007">State Bank of India CA #3819402811 (Narol)</option>
              </select>
            ) : (
              <select
                className="px-3 py-2 text-xs font-mono bg-[var(--erp-surface-2)] border border-[var(--erp-hairline-strong)] text-[var(--erp-text)] focus:border-[var(--erp-gold)]"
              >
                <option>Surat Head Office Cash Drawer</option>
                <option>Ahmedabad Branch Petty Cash</option>
              </select>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] p-5">
          <div className="md:col-span-2">
            <PartyPicker
              label="Beneficiary / Creditor Account"
              selectedPartyId={selectedPartyId}
              onSelect={setSelectedPartyId}
            />
          </div>

          <AmountInput
            label="Gross Bill Amount (₹)"
            value={grossAmount}
            onChange={e => setGrossAmount(e.target.value)}
          />
        </div>

        {paymentMode === 'bank' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] p-5">
            <TextInput
              label="NEFT / RTGS / Cheque Reference"
              mono
              value={chequeRef}
              onChange={e => setChequeRef(e.target.value)}
            />
            <TextInput
              label="Ledger Narration"
              value={narration}
              onChange={e => setNarration(e.target.value)}
            />
          </div>
        )}

        {/* TDS Withholding Accordion/Section */}
        <div className="border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={tdsEnabled}
                onChange={e => setTdsEnabled(e.target.checked)}
                className="w-4 h-4 accent-[var(--erp-gold)]"
              />
              <span className="font-serif text-sm font-bold text-[var(--erp-text)]">
                Deduct Income Tax TDS (Section 194)
              </span>
            </label>
            <span className="font-mono text-xs text-[var(--erp-muted)]">
              Form 26Q Statutory Ledger
            </span>
          </div>

          {tdsEnabled && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 font-mono text-xs">
              <div className="flex flex-col gap-1">
                <label className="text-[var(--erp-muted)]">Income Tax Section</label>
                <select
                  value={tdsSection}
                  onChange={e => setTdsSection(e.target.value)}
                  className="px-3 py-2 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)]"
                >
                  <option value="194H">Sec 194H - Brokerage / Commission (5%)</option>
                  <option value="194C">Sec 194C - Transport / Contractor (2%)</option>
                  <option value="194I">Sec 194I - Rent of Commercial Mill (10%)</option>
                  <option value="194J">Sec 194J - Professional / Audit Fee (10%)</option>
                </select>
              </div>

              <div className="p-3 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] flex flex-col justify-between">
                <span className="text-[var(--erp-muted)]">TDS DEDUCTION AMOUNT</span>
                <span className="text-base font-bold text-[var(--erp-negative)]">
                  - ₹{tdsDeduction.toLocaleString('en-IN', { minimumFractionDigits: 2 })} ({tdsPercent}%)
                </span>
              </div>

              <div className="p-3 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] flex flex-col justify-between">
                <span className="text-[var(--erp-muted)]">TDS PAYABLE LEDGER</span>
                <span className="text-xs text-[var(--erp-text)]">TDS Payable A/c (Entity Books)</span>
              </div>
            </div>
          )}
        </div>

        {/* Final Payment Summary & Post Action */}
        <div className="border border-[var(--erp-gold)] bg-[var(--erp-surface-2)] p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="font-mono text-xs text-[var(--erp-gold)] font-medium">
              DISBURSEMENT MANDATE
            </span>
            <div className="font-mono text-xs text-[var(--erp-muted)]">
              Gross: ₹{numGross.toLocaleString('en-IN')} {tdsEnabled && `• Less TDS: ₹${tdsDeduction.toLocaleString('en-IN')}`}
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="text-right">
              <span className="text-xs text-[var(--erp-muted)] font-mono">Net Payout:</span>
              <div className="font-mono text-2xl font-bold text-[var(--erp-text)]">
                ₹{netPayable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
            </div>

            <button
              type="submit"
              className="px-6 py-2.5 bg-[var(--erp-gold)] text-[#0F141B] font-mono text-xs font-semibold hover:bg-[var(--erp-gold-soft)] transition-colors flex items-center gap-2"
            >
              <Save className="w-4 h-4" /> Authorize & Post Payment
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
