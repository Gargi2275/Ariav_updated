import React, { useState } from 'react';
import { useErp } from '../../context/ErpContext';
import { DataTable, Column } from '../../components/common/DataTable';
import { StatusChip } from '../../components/common/StatusChip';
import { ShoppingCart, Download, Printer, Filter, ShieldCheck, Layers } from 'lucide-react';

interface PurchaseRegisterEntry {
  id: string;
  inwardDate: string;
  billNo: string;
  millSupplierName: string;
  gstin: string;
  hsn: string;
  rollsOrLumps: number;
  meters: number;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalBillAmount: number;
  itcEligibility: 'Eligible (2B Matched)' | 'Pending Portal Rec';
  status: 'cleared' | 'posted';
}

export const PurchaseRegisterScreen: React.FC = () => {
  const { financialYear, showFlash } = useErp();
  const [filterItc, setFilterItc] = useState<'all' | 'matched' | 'pending'>('all');

  const [purchases] = useState<PurchaseRegisterEntry[]>([
    {
      id: 'PR-01',
      inwardDate: '2026-09-07',
      billNo: 'MILL/2026/0891',
      millSupplierName: 'Reliance Weaving Mills Ltd',
      gstin: '24AABCR2210M1Z2',
      hsn: '5208',
      rollsOrLumps: 42,
      meters: 21000,
      taxableValue: 840000,
      cgst: 21000,
      sgst: 21000,
      igst: 0,
      totalBillAmount: 882000.00,
      itcEligibility: 'Eligible (2B Matched)',
      status: 'posted'
    },
    {
      id: 'PR-02',
      inwardDate: '2026-09-05',
      billNo: 'TEX/9941',
      millSupplierName: 'Bhilwara Spun Fabrics Ltd',
      gstin: '08AABCB1092P1Z0',
      hsn: '5407',
      rollsOrLumps: 28,
      meters: 14000,
      taxableValue: 560000,
      cgst: 0,
      sgst: 0,
      igst: 28000,
      totalBillAmount: 588000.00,
      itcEligibility: 'Eligible (2B Matched)',
      status: 'cleared'
    },
    {
      id: 'PR-03',
      inwardDate: '2026-09-02',
      billNo: 'KST/2025/112',
      millSupplierName: 'Kalyan Spinning & Weaving Co',
      gstin: '24AABCK5411N1ZQ',
      hsn: '5208',
      rollsOrLumps: 35,
      meters: 17500,
      taxableValue: 717500,
      cgst: 17937.50,
      sgst: 17937.50,
      igst: 0,
      totalBillAmount: 753375.00,
      itcEligibility: 'Eligible (2B Matched)',
      status: 'cleared'
    },
    {
      id: 'PR-04',
      inwardDate: '2026-08-29',
      billNo: 'RADHE/INW/441',
      millSupplierName: 'Radhe Dyeing & Processing',
      gstin: '24AABCR7719L1Z3',
      hsn: '5208',
      rollsOrLumps: 20,
      meters: 10000,
      taxableValue: 390000,
      cgst: 9750,
      sgst: 9750,
      igst: 0,
      totalBillAmount: 409500.00,
      itcEligibility: 'Pending Portal Rec',
      status: 'posted'
    },
    {
      id: 'PR-05',
      inwardDate: '2026-08-25',
      billNo: 'MAH/5521',
      millSupplierName: 'Surat Greige Powerloom Cluster',
      gstin: '24AABCS8812K1Z9',
      hsn: '5208',
      rollsOrLumps: 50,
      meters: 25000,
      taxableValue: 1025000,
      cgst: 25625,
      sgst: 25625,
      igst: 0,
      totalBillAmount: 1076250.00,
      itcEligibility: 'Eligible (2B Matched)',
      status: 'cleared'
    }
  ]);

  const filteredPurchases = purchases.filter(p => {
    if (filterItc === 'matched') return p.itcEligibility.includes('Matched');
    if (filterItc === 'pending') return p.itcEligibility.includes('Pending');
    return true;
  });

  const totalTaxable = filteredPurchases.reduce((sum, p) => sum + p.taxableValue, 0);
  const totalCgst = filteredPurchases.reduce((sum, p) => sum + p.cgst, 0);
  const totalSgst = filteredPurchases.reduce((sum, p) => sum + p.sgst, 0);
  const totalIgst = filteredPurchases.reduce((sum, p) => sum + p.igst, 0);
  const totalGross = filteredPurchases.reduce((sum, p) => sum + p.totalBillAmount, 0);
  const totalMeters = filteredPurchases.reduce((sum, p) => sum + p.meters, 0);
  const totalLumps = filteredPurchases.reduce((sum, p) => sum + p.rollsOrLumps, 0);

  const columns: Column<PurchaseRegisterEntry>[] = [
    {
      header: 'Inward Date',
      accessorKey: 'inwardDate',
      mono: true,
      render: r => <span>{r.inwardDate}</span>
    },
    {
      header: 'Mill Bill No',
      accessorKey: 'billNo',
      mono: true,
      render: r => <span className="font-semibold text-[var(--erp-gold)]">{r.billNo}</span>
    },
    {
      header: 'Mill / Supplier Party Name',
      accessorKey: 'millSupplierName',
      render: r => (
        <div>
          <span className="font-medium text-[var(--erp-text)]">{r.millSupplierName}</span>
          <span className="text-[11px] text-[var(--erp-muted)] block font-mono">
            {r.gstin} • HSN: {r.hsn}
          </span>
        </div>
      )
    },
    {
      header: 'Lumps / Rolls',
      accessorKey: 'rollsOrLumps',
      mono: true,
      align: 'center',
      render: r => <span>{r.rollsOrLumps} rolls</span>
    },
    {
      header: 'Meters Inward',
      accessorKey: 'meters',
      mono: true,
      align: 'right',
      render: r => <span>{r.meters.toLocaleString('en-IN')} m</span>
    },
    {
      header: 'Taxable Value',
      accessorKey: 'taxableValue',
      mono: true,
      align: 'right',
      render: r => <span>₹{r.taxableValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
    },
    {
      header: 'CGST (2.5%)',
      accessorKey: 'cgst',
      mono: true,
      align: 'right',
      render: r => <span>{r.cgst > 0 ? `₹${r.cgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}</span>
    },
    {
      header: 'SGST (2.5%)',
      accessorKey: 'sgst',
      mono: true,
      align: 'right',
      render: r => <span>{r.sgst > 0 ? `₹${r.sgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}</span>
    },
    {
      header: 'IGST (5%)',
      accessorKey: 'igst',
      mono: true,
      align: 'right',
      render: r => <span>{r.igst > 0 ? `₹${r.igst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}</span>
    },
    {
      header: 'Total Bill Value',
      accessorKey: 'totalBillAmount',
      mono: true,
      align: 'right',
      render: r => (
        <span className="font-bold text-[var(--erp-text)]">
          ₹{r.totalBillAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
        </span>
      )
    },
    {
      header: 'ITC GSTR-2B',
      accessorKey: 'itcEligibility',
      align: 'center',
      render: r => (
        <span
          className={`px-2 py-0.5 text-[10px] font-mono border ${
            r.itcEligibility.includes('Matched')
              ? 'border-[var(--erp-positive)]/40 bg-[var(--erp-surface-2)] text-[var(--erp-positive)]'
              : 'border-[var(--erp-gold)]/40 bg-[var(--erp-surface-2)] text-[var(--erp-gold)]'
          }`}
        >
          {r.itcEligibility}
        </span>
      )
    }
  ];

  return (
    <div className="p-6 flex flex-col gap-6 text-left">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--erp-hairline-strong)] pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ShoppingCart className="w-4 h-4 text-[var(--erp-gold)]" />
            <span className="font-mono text-xs text-[var(--erp-gold)]">INWARD GOODS & ITC RECONCILIATION</span>
          </div>
          <h2 className="font-serif text-2xl font-bold text-[var(--erp-text)]">
            Purchase Register & Mill Inward (GSTR-2B)
          </h2>
          <p className="text-xs text-[var(--erp-muted)]">
            Audited register of grey fabric, yarn, and jobwork inward bills with statutory Input Tax Credit verification for {financialYear}.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => showFlash('Purchase Register exported to CSV', 'positive')}
            className="px-3 py-1.5 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] hover:border-[var(--erp-gold)] font-mono text-xs text-[var(--erp-text)] transition-colors flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5 text-[var(--erp-gold)]" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={() => window.print()}
            className="px-3 py-1.5 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] hover:border-[var(--erp-gold)] font-mono text-xs text-[var(--erp-text)] transition-colors flex items-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5 text-[var(--erp-gold)]" />
            <span>Print Register</span>
          </button>
        </div>
      </div>

      {/* Hero Financial Summary Ribbon */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 p-4 bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)]">
        <div>
          <span className="text-[11px] font-mono text-[var(--erp-muted)] block">Total Rolls / Lumps</span>
          <span className="font-mono text-base font-bold text-[var(--erp-text)]">
            {totalLumps} Rolls
          </span>
        </div>
        <div>
          <span className="text-[11px] font-mono text-[var(--erp-muted)] block">Metres Inward</span>
          <span className="font-mono text-base font-bold text-[var(--erp-text)]">
            {totalMeters.toLocaleString('en-IN')} m
          </span>
        </div>
        <div>
          <span className="text-[11px] font-mono text-[var(--erp-muted)] block">Taxable Purchases</span>
          <span className="font-mono text-base font-bold text-[var(--erp-text)]">
            ₹{totalTaxable.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </span>
        </div>
        <div>
          <span className="text-[11px] font-mono text-[var(--erp-muted)] block">ITC CGST+SGST</span>
          <span className="font-mono text-base font-bold text-[var(--erp-gold)]">
            ₹{(totalCgst + totalSgst).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </span>
        </div>
        <div>
          <span className="text-[11px] font-mono text-[var(--erp-muted)] block">ITC IGST</span>
          <span className="font-mono text-base font-bold text-[var(--erp-positive)]">
            ₹{totalIgst.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </span>
        </div>
        <div>
          <span className="text-[11px] font-mono text-[var(--erp-muted)] block">Gross Mill Invoices</span>
          <span className="font-mono text-base font-bold text-[var(--erp-text)]">
            ₹{totalGross.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </span>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-[var(--erp-surface)] border border-[var(--erp-hairline)]">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-[var(--erp-muted)] shrink-0" />
          <span className="text-xs font-mono text-[var(--erp-muted)]">GSTR-2B Reconciliation:</span>
          {(['all', 'matched', 'pending'] as const).map(type => (
            <button
              key={type}
              onClick={() => setFilterItc(type)}
              className={`px-2.5 py-1 text-xs font-mono transition-colors ${
                filterItc === type
                  ? 'bg-[var(--erp-gold)] text-[var(--erp-base)] font-bold'
                  : 'bg-[var(--erp-surface-2)] text-[var(--erp-muted)] hover:text-[var(--erp-text)]'
              }`}
            >
              {type === 'all' ? 'All Inward Bills' : type === 'matched' ? '2B Portal Matched (Eligible)' : 'Pending Reconciliation'}
            </button>
          ))}
        </div>

        <div className="text-xs font-mono text-[var(--erp-muted)]">
          Displaying {filteredPurchases.length} of {purchases.length} Inward Transactions
        </div>
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={filteredPurchases}
        keyExtractor={p => p.id}
        emptyMessage="No mill purchase records matching criteria."
      />
    </div>
  );
};
