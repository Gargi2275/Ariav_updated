import React, { useState } from 'react';
import { useErp } from '../../context/ErpContext';
import { PageHeader } from '../../components/common/PageHeader';
import { TextInput, AmountInput, DateInput, PartyPicker } from '../../components/common/FormControls';
import { FileDiff, Save, ArrowRight } from 'lucide-react';

export const CreditDebitNoteScreen: React.FC = () => {
  const { parties, showFlash, addAuditLog, navigateTo } = useErp();

  const [noteType, setNoteType] = useState<'credit' | 'debit'>('credit');
  const [noteNo, setNoteNo] = useState('CN-2025-0142');
  const [noteDate, setNoteDate] = useState('2026-09-08');
  const [originalInvoiceNo, setOriginalInvoiceNo] = useState('INV-2025-1092');
  const [originalInvoiceDate, setOriginalInvoiceDate] = useState('2026-09-01');
  const [selectedPartyId, setSelectedPartyId] = useState(parties[0]?.id || 'PT-1001');
  const [reasonCode, setReasonCode] = useState('Rate Difference in 60x60 Cambric');
  const [taxableAdjustment, setTaxableAdjustment] = useState('36000');
  const [gstRate, setGstRate] = useState('5');
  const [narration, setNarration] = useState('Credit allowed for rate difference @ ₹3.00/meter on 12,000 meters grey fabric as per Surat market settlement');

  const numTaxable = parseFloat(taxableAdjustment) || 0;
  const numGstRate = parseFloat(gstRate) || 0;
  const gstAmount = (numTaxable * numGstRate) / 100;
  const totalNoteAmount = numTaxable + gstAmount;

  const handlePost = (e: React.FormEvent) => {
    e.preventDefault();
    const typeLabel = noteType === 'credit' ? 'Credit Note' : 'Debit Note';
    addAuditLog(
      `Posted GST ${typeLabel}`,
      'Sales Invoicing',
      `Note ${noteNo} for ₹${totalNoteAmount.toLocaleString('en-IN')} against ${originalInvoiceNo}`,
      'notice'
    );
    showFlash(`${typeLabel} ${noteNo} posted against ${originalInvoiceNo}`, 'positive');
    navigateTo(26); // Go to Party Ledger
  };

  return (
    <div className="p-6 flex flex-col gap-6 text-left">
      {/* Unified Page Header */}
      <PageHeader
        moduleNumber="17"
        section="Core Operations"
        title="Credit & Debit Note Generator"
        subtitle="Issue statutory tax credit/debit notes for textile rate differences, yardage shortage, and quality claims."
        actions={
          <div className="flex items-center gap-2 font-mono text-xs">
            <button
              onClick={() => {
                setNoteType('credit');
                setNoteNo('CN-2025-0142');
              }}
              className={`px-3 py-1.5 transition-colors cursor-pointer ${
                noteType === 'credit'
                  ? 'bg-[var(--erp-gold)] text-[#0F141B] font-semibold'
                  : 'bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-muted)]'
              }`}
            >
              Credit Note (Customer)
            </button>
            <button
              onClick={() => {
                setNoteType('debit');
                setNoteNo('DN-2025-0089');
              }}
              className={`px-3 py-1.5 transition-colors cursor-pointer ${
                noteType === 'debit'
                  ? 'bg-[var(--erp-gold)] text-[#0F141B] font-semibold'
                  : 'bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-muted)]'
              }`}
            >
              Debit Note (Supplier Mill)
            </button>
          </div>
        }
      />

      <form onSubmit={handlePost} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] p-5">
          <TextInput
            label={`${noteType === 'credit' ? 'Credit' : 'Debit'} Note Reference #`}
            mono
            value={noteNo}
            onChange={e => setNoteNo(e.target.value)}
          />
          <DateInput
            label="Note Date"
            value={noteDate}
            onChange={e => setNoteDate(e.target.value)}
          />
          <TextInput
            label="Original Tax Invoice #"
            mono
            value={originalInvoiceNo}
            onChange={e => setOriginalInvoiceNo(e.target.value)}
          />
          <DateInput
            label="Original Invoice Date"
            value={originalInvoiceDate}
            onChange={e => setOriginalInvoiceDate(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] p-5">
          <PartyPicker
            label={noteType === 'credit' ? 'Customer Account (Debtor)' : 'Supplier Account (Creditor)'}
            selectedPartyId={selectedPartyId}
            onSelect={setSelectedPartyId}
          />

          <div className="flex flex-col gap-1 text-left">
            <label className="text-xs text-[var(--erp-muted)] font-sans">
              Statutory Reason for Adjustment
            </label>
            <select
              value={reasonCode}
              onChange={e => setReasonCode(e.target.value)}
              className="px-3 py-2 text-xs font-mono bg-[var(--erp-surface-2)] border border-[var(--erp-hairline-strong)] text-[var(--erp-text)] focus:border-[var(--erp-gold)]"
            >
              <option>Rate Difference in 60x60 Cambric</option>
              <option>Shortage in Meterage / Taka Length</option>
              <option>Quality Defect / Weaving Slub Discount</option>
              <option>Year-End Volume Turnover Rebate</option>
              <option>Defective Grey Fabric Returned</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] p-5">
          <AmountInput
            label="Taxable Value of Adjustment (₹)"
            value={taxableAdjustment}
            onChange={e => setTaxableAdjustment(e.target.value)}
          />

          <div className="flex flex-col gap-1 text-left">
            <label className="text-xs text-[var(--erp-muted)] font-sans">
              Reversal GST Rate
            </label>
            <select
              value={gstRate}
              onChange={e => setGstRate(e.target.value)}
              className="px-3 py-2 text-xs font-mono bg-[var(--erp-surface-2)] border border-[var(--erp-hairline-strong)] text-[var(--erp-text)] focus:border-[var(--erp-gold)]"
            >
              <option value="5">5% (CGST 2.5% + SGST 2.5%)</option>
              <option value="12">12% (CGST 6% + SGST 6%)</option>
              <option value="18">18% (Services/Brokerage)</option>
              <option value="0">0% (Exempt)</option>
            </select>
          </div>

          <TextInput
            label="Formal Ledger Narration"
            value={narration}
            onChange={e => setNarration(e.target.value)}
          />
        </div>

        {/* Note Valuation & Ledger Impact Banner */}
        <div className="border border-[var(--erp-gold)] bg-[var(--erp-surface-2)] p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="font-mono text-xs space-y-1">
            <span className="text-[var(--erp-gold)] font-medium">
              GST SUMMARY • {noteType.toUpperCase()} NOTE
            </span>
            <div className="text-[var(--erp-muted)]">
              Taxable: ₹{numTaxable.toLocaleString('en-IN')} • GST Impact: ₹{gstAmount.toLocaleString('en-IN')}
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="text-right">
              <span className="text-xs text-[var(--erp-muted)] font-mono">Net Adjusted Value:</span>
              <div className="font-mono text-2xl font-bold text-[var(--erp-text)]">
                ₹{totalNoteAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
            </div>

            <button
              type="submit"
              className="px-6 py-2.5 bg-[var(--erp-gold)] text-[#0F141B] font-mono text-xs font-semibold hover:bg-[var(--erp-gold-soft)] transition-colors flex items-center gap-2"
            >
              <Save className="w-4 h-4" /> Commit {noteType === 'credit' ? 'Credit' : 'Debit'} Note
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
