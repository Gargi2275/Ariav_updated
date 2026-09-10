import React, { useState } from 'react';
import { useErp } from '../../context/ErpContext';
import { PageHeader } from '../../components/common/PageHeader';
import { TextInput, DateInput, PartyPicker } from '../../components/common/FormControls';
import { Undo2, Save, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';

export const MaterialReturnedScreen: React.FC = () => {
  const { parties, items, showFlash, addAuditLog, navigateTo } = useErp();

  const [returnType, setReturnType] = useState<'sales_return' | 'purchase_return'>('sales_return');
  const [returnNo, setReturnNo] = useState('MR-2025-0071');
  const [returnDate, setReturnDate] = useState('2026-09-08');
  const [selectedPartyId, setSelectedPartyId] = useState(parties[0]?.id || 'PT-1001');
  const [originalBillNo, setOriginalBillNo] = useState('INV-2025-1044');
  const [itemId, setItemId] = useState(items[0]?.id || 'IT-001');
  const [rollsReturned, setRollsReturned] = useState('6');
  const [metersReturned, setMetersReturned] = useState('620');
  const [defectReason, setDefectReason] = useState('Reed Marks & Loom Oil Stains');
  const [disposition, setDisposition] = useState<'restock' | 'mill_claim' | 'scrap'>('mill_claim');

  const selectedItem = items.find(i => i.id === itemId);
  const numMeters = parseFloat(metersReturned) || 0;
  const rate = selectedItem?.baseRatePerMeter || 48.5;
  const returnTaxable = numMeters * rate;
  const returnGst = returnTaxable * 0.05;
  const totalClaim = returnTaxable + returnGst;

  const handlePost = (e: React.FormEvent) => {
    e.preventDefault();
    addAuditLog(
      'Recorded Material Return Voucher',
      'Inventory & Returns',
      `Return #${returnNo}: ${metersReturned} meters of ${selectedItem?.sku} returned by party (${defectReason})`,
      'notice'
    );
    showFlash(`Material Return ${returnNo} processed. Inventory adjusted.`, 'positive');
    navigateTo(17); // Can generate Credit Note
  };

  return (
    <div className="p-6 flex flex-col gap-6 text-left">
      {/* Unified Page Header */}
      <PageHeader
        moduleNumber="19"
        section="Core Operations"
        title="Material Returned & Quality Inspection"
        subtitle="Record customer returns, weaving defect inspection and automatic physical yardage reversal."
        actions={
          <div className="flex items-center gap-2 font-mono text-xs">
            <button
              onClick={() => setReturnType('sales_return')}
              className={`px-3 py-1.5 transition-colors cursor-pointer ${
                returnType === 'sales_return'
                  ? 'bg-[var(--erp-gold)] text-[#0F141B] font-semibold'
                  : 'bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-muted)]'
              }`}
            >
              Sales Return (From Customer)
            </button>
            <button
              onClick={() => setReturnType('purchase_return')}
              className={`px-3 py-1.5 transition-colors cursor-pointer ${
                returnType === 'purchase_return'
                  ? 'bg-[var(--erp-gold)] text-[#0F141B] font-semibold'
                  : 'bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-muted)]'
              }`}
            >
              Purchase Return (To Mill)
            </button>
          </div>
        }
      />

      <form onSubmit={handlePost} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] p-5">
          <TextInput
            label="Return Challan #"
            mono
            value={returnNo}
            onChange={e => setReturnNo(e.target.value)}
          />
          <DateInput
            label="Inward Date"
            value={returnDate}
            onChange={e => setReturnDate(e.target.value)}
          />
          <TextInput
            label="Original Invoice / Challan #"
            mono
            value={originalBillNo}
            onChange={e => setOriginalBillNo(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] p-5">
          <PartyPicker
            label="Returning Party"
            selectedPartyId={selectedPartyId}
            onSelect={setSelectedPartyId}
          />

          <div className="flex flex-col gap-1 text-left">
            <label className="text-xs text-[var(--erp-muted)] font-sans">
              Fabric SKU / Description
            </label>
            <select
              value={itemId}
              onChange={e => setItemId(e.target.value)}
              className="px-3 py-2 text-xs font-mono bg-[var(--erp-surface-2)] border border-[var(--erp-hairline-strong)] text-[var(--erp-text)] focus:border-[var(--erp-gold)]"
            >
              {items.map(it => (
                <option key={it.id} value={it.id}>
                  {it.sku} — {it.description}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] p-5">
          <TextInput
            label="Returned Rolls / Taka"
            mono
            value={rollsReturned}
            onChange={e => setRollsReturned(e.target.value)}
          />
          <TextInput
            label="Inspected Meters"
            mono
            value={metersReturned}
            onChange={e => setMetersReturned(e.target.value)}
          />
          <div className="flex flex-col gap-1 text-left">
            <label className="text-xs text-[var(--erp-muted)] font-sans">
              Defect Category
            </label>
            <select
              value={defectReason}
              onChange={e => setDefectReason(e.target.value)}
              className="px-3 py-2 text-xs font-mono bg-[var(--erp-surface-2)] border border-[var(--erp-hairline-strong)] text-[var(--erp-text)] focus:border-[var(--erp-gold)]"
            >
              <option>Reed Marks & Loom Oil Stains</option>
              <option>Warp / Weft Count Mismatch</option>
              <option>Shortage in Stamped Fold Length</option>
              <option>Moisture & Water Transit Damage</option>
              <option>Excess Unsold Stock Return</option>
            </select>
          </div>
          <div className="flex flex-col gap-1 text-left">
            <label className="text-xs text-[var(--erp-muted)] font-sans">
              Inventory Disposition
            </label>
            <select
              value={disposition}
              onChange={e => setDisposition(e.target.value as any)}
              className="px-3 py-2 text-xs font-mono bg-[var(--erp-surface-2)] border border-[var(--erp-hairline-strong)] text-[var(--erp-text)] focus:border-[var(--erp-gold)]"
            >
              <option value="mill_claim">Claim Forward to Weaving Mill</option>
              <option value="restock">Restock to Seconds / Discount Yard</option>
              <option value="scrap">Write Off as Scrap Fabric</option>
            </select>
          </div>
        </div>

        {/* Claim & Valuation Box */}
        <div className="border border-[var(--erp-gold)] bg-[var(--erp-surface-2)] p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="font-mono text-xs space-y-1">
            <span className="text-[var(--erp-gold)] font-medium">
              CLAIM VALUATION • {numMeters} METERS @ ₹{rate.toFixed(2)}/MTR
            </span>
            <div className="text-[var(--erp-muted)]">
              Taxable: ₹{returnTaxable.toLocaleString('en-IN', { minimumFractionDigits: 2 })} • GST Reversal (5%): ₹{returnGst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="text-right">
              <span className="text-xs text-[var(--erp-muted)] font-mono">Total Claim Credit:</span>
              <div className="font-mono text-2xl font-bold text-[var(--erp-text)]">
                ₹{totalClaim.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
            </div>

            <button
              type="submit"
              className="px-6 py-2.5 bg-[var(--erp-gold)] text-[#0F141B] font-mono text-xs font-semibold hover:bg-[var(--erp-gold-soft)] transition-colors flex items-center gap-2"
            >
              <Save className="w-4 h-4" /> Record Physical Inward
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
