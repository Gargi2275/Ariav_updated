import React, { useState } from 'react';
import { useErp } from '../../context/ErpContext';
import { PageHeader } from '../../components/common/PageHeader';
import { TextInput, AmountInput, DateInput, PartyPicker } from '../../components/common/FormControls';
import { FileMinus, Save, ArrowRight, Layers } from 'lucide-react';

export const DebitNoteScreen: React.FC = () => {
  const { parties, showFlash, addAuditLog, navigateTo } = useErp();

  const [noteNo, setNoteNo] = useState('DN-2025-0089');
  const [noteDate, setNoteDate] = useState('2026-09-08');
  const [originalBillNo, setOriginalBillNo] = useState('MILL/2026/0891');
  const [originalBillDate, setOriginalBillDate] = useState('2026-09-02');
  const [selectedSupplierId, setSelectedSupplierId] = useState(parties[1]?.id || 'PT-1002');
  const [reasonCode, setReasonCode] = useState('Weft Slub Defect & Length Shortage in Grey Lumps');
  const [taxableAdjustment, setTaxableAdjustment] = useState('42500');
  const [gstRate, setGstRate] = useState('5');
  const [narration, setNarration] = useState('Debit Note raised on Reliance Weaving Mills for 850 meters rejection in 40x40 Poplin lot at agreed rate ₹50.00/meter');

  const numTaxable = parseFloat(taxableAdjustment) || 0;
  const numGstRate = parseFloat(gstRate) || 0;
  const gstAmount = (numTaxable * numGstRate) / 100;
  const totalDebitAmount = numTaxable + gstAmount;

  const handlePost = (e: React.FormEvent) => {
    e.preventDefault();
    addAuditLog(
      'Posted Supplier Debit Note',
      'Mill Purchases',
      `Debit Note ${noteNo} for ₹${totalDebitAmount.toLocaleString('en-IN')} against ${originalBillNo}`,
      'notice'
    );
    showFlash(`Debit Note ${noteNo} posted against Mill Bill ${originalBillNo}`, 'positive');
    navigateTo(44);
  };

  return (
    <div className="p-6 flex flex-col gap-6 text-left">
      {/* Unified Page Header */}
      <PageHeader
        moduleNumber="18"
        section="Core Operations"
        title="Debit Note Generator (Supplier Purchases Reversal)"
        subtitle="Raise formal debit notes to mills and weavers for short delivery, fabric defects, and unapproved price hikes."
        actions={
          <span className="px-3 py-1 font-mono text-xs border border-[var(--erp-hairline)] bg-[var(--erp-surface-2)] text-[var(--erp-gold)]">
            GST TYPE: PURCHASES REVERSAL
          </span>
        }
      />

      <form onSubmit={handlePost} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Form */}
        <div className="lg:col-span-2 flex flex-col gap-5 p-6 border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)]">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <TextInput
              label="Debit Note No"
              value={noteNo}
              onChange={e => setNoteNo(e.target.value)}
              mono
              required
            />
            <DateInput
              label="Debit Note Date"
              value={noteDate}
              onChange={e => setNoteDate(e.target.value)}
              required
            />
            <div>
              <label className="block text-xs font-medium text-[var(--erp-muted)] mb-1">
                Reason Classification
              </label>
              <select
                value={reasonCode}
                onChange={e => setReasonCode(e.target.value)}
                className="w-full h-10 px-3 py-2 text-xs font-mono bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] focus:border-[var(--erp-gold)] rounded-none"
              >
                <option value="Weft Slub Defect & Length Shortage in Grey Lumps">Fabric Defects & Weave Holes</option>
                <option value="Mill Rate Correction Settlement">Mill Rate Correction Settlement</option>
                <option value="Transit Damage Deduction">Transit Damage Deduction</option>
                <option value="Short Metres in Lump Yardage">Short Metres in Lump Yardage</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <PartyPicker
              label="Supplier / Mill Account (Creditor)"
              selectedId={selectedSupplierId}
              onSelect={setSelectedSupplierId}
              required
            />
            <div className="grid grid-cols-2 gap-2">
              <TextInput
                label="Original Mill Bill No"
                value={originalBillNo}
                onChange={setOriginalBillNo}
                mono
                required
              />
              <DateInput
                label="Original Bill Date"
                value={originalBillDate}
                onChange={setOriginalBillDate}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <AmountInput
              label="Taxable Adjustment Base (₹)"
              value={taxableAdjustment}
              onChange={setTaxableAdjustment}
              required
            />
            <div>
              <label className="block text-xs font-medium text-[var(--erp-muted)] mb-1">
                GST Reversal Slab
              </label>
              <select
                value={gstRate}
                onChange={e => setGstRate(e.target.value)}
                className="w-full h-10 px-3 py-2 text-xs font-mono bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] focus:border-[var(--erp-gold)] rounded-none"
              >
                <option value="5">5% (Intra-State 2.5% + 2.5% or IGST 5%)</option>
                <option value="12">12% (Processed Manmade Filaments)</option>
                <option value="18">18% (Yarn Sizing / Jobwork)</option>
                <option value="0">0% (Nil Rated Exempt Grey)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--erp-muted)] mb-1">
              Statutory Narration / Mill Correspondence Reference
            </label>
            <textarea
              rows={3}
              value={narration}
              onChange={e => setNarration(e.target.value)}
              className="w-full p-3 text-xs font-mono bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] focus:border-[var(--erp-gold)] rounded-none"
              required
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--erp-hairline)]">
            <button
              type="submit"
              className="px-6 py-2.5 bg-[var(--erp-gold)] hover:bg-[var(--erp-gold-soft)] text-[var(--erp-base)] font-mono text-xs font-bold transition-colors flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              <span>Post Supplier Debit Note</span>
            </button>
          </div>
        </div>

        {/* Right 1 Col: Financial Impact Summary */}
        <div className="flex flex-col gap-4">
          <div className="p-5 border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)]">
            <h3 className="font-serif text-sm font-bold text-[var(--erp-text)] pb-2 mb-3 border-b border-[var(--erp-hairline)]">
              Debit Note Tax Breakdown
            </h3>

            <div className="space-y-2.5 font-mono text-xs">
              <div className="flex justify-between text-[var(--erp-muted)]">
                <span>Taxable Amount:</span>
                <span className="text-[var(--erp-text)]">₹{numTaxable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between text-[var(--erp-muted)]">
                <span>GST ({numGstRate}%):</span>
                <span className="text-[var(--erp-gold)]">₹{gstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="border-t border-[var(--erp-hairline)] pt-2 flex justify-between font-bold text-sm text-[var(--erp-text)]">
                <span>Total Debit Note:</span>
                <span className="text-[var(--erp-negative)]">₹{totalDebitAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>

            <div className="mt-4 p-3 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[11px] font-mono text-[var(--erp-muted)]">
              Accounting Effect: Dr. Mill Supplier A/c by ₹{totalDebitAmount.toLocaleString('en-IN')} (reducing payable) and Cr. Purchase Return / Reversal A/c.
            </div>
          </div>
        </div>
      </form>
    </div>
  );
};
