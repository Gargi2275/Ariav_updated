import React, { useState } from 'react';
import { useErp } from '../../context/ErpContext';
import { PageHeader } from '../../components/common/PageHeader';
import { TextInput, DateInput, PartyPicker } from '../../components/common/FormControls';
import { LedgerMetricStrip, LedgerMetricItem } from '../../components/common/LedgerMetricStrip';
import { DataTable, Column } from '../../components/common/DataTable';
import { StatusChip } from '../../components/common/StatusChip';
import { InvoiceLineItem } from '../../types/erp';
import {
  Receipt,
  Plus,
  Trash2,
  Printer,
  Save,
  CheckCircle2,
  Search,
  ListOrdered,
  FileCheck,
  Truck
} from 'lucide-react';

interface InvoiceRecord {
  invoiceNo: string;
  invoiceDate: string;
  partyName: string;
  city: string;
  ewayBill: string;
  vehicleNo: string;
  taxableAmount: number;
  gstAmount: number;
  netAmount: number;
  status: 'paid' | 'due soon' | 'overdue';
  overdueDays: number;
}

export const SalesInvoiceScreen: React.FC = () => {
  const { parties, items, showFlash, addAuditLog, navigateTo } = useErp();

  const [activeTab, setActiveTab] = useState<'create' | 'register'>('create');
  const [searchQuery, setSearchQuery] = useState('');

  // Invoice Form State
  const [invoiceNo, setInvoiceNo] = useState('INV-2025-1092');
  const [invoiceDate, setInvoiceDate] = useState('2026-09-08');
  const [ewayBill, setEwayBill] = useState('241984201948');
  const [vehicleNo, setVehicleNo] = useState('GJ-05-BT-4821');
  const [selectedPartyId, setSelectedPartyId] = useState(parties[0]?.id || '');
  const [isInterstate, setIsInterstate] = useState(false);

  const selectedParty = parties.find(p => p.id === selectedPartyId);

  const [lines, setLines] = useState<InvoiceLineItem[]>([
    {
      id: 'L-1',
      itemId: items[0]?.id || 'IT-001',
      itemName: 'Cotton Cambric Grey Fabric 60x60 / 92x88 58"',
      hsn: '52081190',
      quantityMeters: 4200,
      rollsTaka: 42,
      ratePerMeter: 48.50,
      grossAmount: 203700,
      gstPercent: 5,
      gstAmount: 10185,
      netAmount: 213885
    },
    {
      id: 'L-2',
      itemId: items[1]?.id || 'IT-002',
      itemName: 'Cotton Poplin Grey Fabric 40x40 / 100x92 44"',
      hsn: '52081290',
      quantityMeters: 3800,
      rollsTaka: 38,
      ratePerMeter: 38.25,
      grossAmount: 145350,
      gstPercent: 5,
      gstAmount: 7267.50,
      netAmount: 152617.50
    }
  ]);

  // Invoice Register sample data
  const [invoicesList] = useState<InvoiceRecord[]>([
    {
      invoiceNo: 'INV-2025-1088',
      invoiceDate: '2026-08-20',
      partyName: 'Sharda Synthetics Pvt Ltd',
      city: 'Surat',
      ewayBill: '241829304192',
      vehicleNo: 'GJ-05-AB-9821',
      taxableAmount: 485000,
      gstAmount: 24250,
      netAmount: 509250,
      status: 'overdue',
      overdueDays: 19
    },
    {
      invoiceNo: 'INV-2025-1089',
      invoiceDate: '2026-08-28',
      partyName: 'Arvind Commercial Agency',
      city: 'Ahmedabad',
      ewayBill: '241834928104',
      vehicleNo: 'GJ-01-XY-4412',
      taxableAmount: 382500,
      gstAmount: 19125,
      netAmount: 401625,
      status: 'due soon',
      overdueDays: 0
    },
    {
      invoiceNo: 'INV-2025-1090',
      invoiceDate: '2026-09-02',
      partyName: 'Patel & Brothers Textiles',
      city: 'Ahmedabad',
      ewayBill: '241908234812',
      vehicleNo: 'GJ-01-CD-8910',
      taxableAmount: 642000,
      gstAmount: 32100,
      netAmount: 674100,
      status: 'overdue',
      overdueDays: 6
    },
    {
      invoiceNo: 'INV-2025-1091',
      invoiceDate: '2026-09-06',
      partyName: 'Reliance Textile Processors',
      city: 'Narol',
      ewayBill: '241954829104',
      vehicleNo: 'GJ-27-TT-1209',
      taxableAmount: 540000,
      gstAmount: 27000,
      netAmount: 567000,
      status: 'paid',
      overdueDays: 0
    }
  ]);

  const metrics: LedgerMetricItem[] = [
    {
      label: "Today's Invoiced",
      value: '₹18.42 L',
      subValue: '6 Tax Invoices',
      trend: 'up',
      change: '+12.80% vs yday',
      badge: 'GST RULE 46'
    },
    {
      label: 'MTD Gross Sales',
      value: '₹1.48 Cr',
      subValue: '52 Invoices (YTD)',
      trend: 'up',
      change: '+8.20% vs target',
      badge: 'FY 2025-26'
    },
    {
      label: 'Output CGST + SGST',
      value: '₹3.70 L',
      subValue: '2.5% + 2.5% Intra-state',
      trend: 'up',
      change: 'Credited to Ledgers',
      badge: 'STATE TAX'
    },
    {
      label: 'Output IGST',
      value: '₹3.70 L',
      subValue: '5.0% Inter-state supply',
      trend: 'up',
      change: 'E-Way bill verified',
      badge: 'CENTRAL'
    },
    {
      label: 'Pending E-Way Bills',
      value: '2 Dispatches',
      subValue: '₹4.20 L Value',
      trend: 'neutral',
      change: 'Within 24hr window',
      badge: 'DISPATCH'
    },
    {
      label: 'Uncollected Invoices',
      value: '8 Invoices',
      subValue: '₹28.40 L',
      trend: 'down',
      change: 'Over 45 days limit',
      badge: 'OVERDUE'
    }
  ];

  const updateLine = (id: string, field: keyof InvoiceLineItem, value: any) => {
    setLines(prev =>
      prev.map(line => {
        if (line.id === id) {
          const updated = { ...line, [field]: value };
          if (field === 'quantityMeters' || field === 'ratePerMeter' || field === 'gstPercent') {
            const qty = field === 'quantityMeters' ? parseFloat(value) || 0 : line.quantityMeters;
            const rate = field === 'ratePerMeter' ? parseFloat(value) || 0 : line.ratePerMeter;
            const gstP = field === 'gstPercent' ? parseFloat(value) || 0 : line.gstPercent;
            const gross = qty * rate;
            const gst = (gross * gstP) / 100;
            updated.grossAmount = gross;
            updated.gstAmount = gst;
            updated.netAmount = gross + gst;
          }
          return updated;
        }
        return line;
      })
    );
  };

  const addLine = () => {
    const defaultItem = items[2] || items[0];
    const newLine: InvoiceLineItem = {
      id: `L-${Date.now().toString().slice(-4)}`,
      itemId: defaultItem.id,
      itemName: defaultItem.description,
      hsn: defaultItem.hsn,
      quantityMeters: 1000,
      rollsTaka: 10,
      ratePerMeter: defaultItem.baseRatePerMeter,
      grossAmount: 1000 * defaultItem.baseRatePerMeter,
      gstPercent: 5,
      gstAmount: (1000 * defaultItem.baseRatePerMeter * 5) / 100,
      netAmount: 1000 * defaultItem.baseRatePerMeter * 1.05
    };
    setLines(prev => [...prev, newLine]);
  };

  const removeLine = (id: string) => {
    if (lines.length <= 1) return;
    setLines(prev => prev.filter(l => l.id !== id));
  };

  const totalMeters = lines.reduce((acc, l) => acc + l.quantityMeters, 0);
  const totalRolls = lines.reduce((acc, l) => acc + l.rollsTaka, 0);
  const totalTaxable = lines.reduce((acc, l) => acc + l.grossAmount, 0);
  const totalGst = lines.reduce((acc, l) => acc + l.gstAmount, 0);
  const cgst = isInterstate ? 0 : totalGst / 2;
  const sgst = isInterstate ? 0 : totalGst / 2;
  const igst = isInterstate ? totalGst : 0;
  const grandTotal = Math.round(totalTaxable + totalGst);
  const roundOff = (grandTotal - (totalTaxable + totalGst)).toFixed(2);

  const handlePostInvoice = () => {
    addAuditLog(
      'Posted Sales Tax Invoice',
      'Sales Invoicing',
      `Invoice ${invoiceNo} for ₹${grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })} posted to party ledger (${selectedParty?.name})`,
      'notice'
    );
    showFlash(`Invoice ${invoiceNo} posted to Sundry Debtors ledger`, 'positive');
    navigateTo(26); // Go to Ledger Report to see the entry
  };

  const filteredInvoices = invoicesList.filter(inv =>
    inv.invoiceNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
    inv.partyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    inv.ewayBill.includes(searchQuery) ||
    inv.vehicleNo.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const invoiceColumns: Column<InvoiceRecord>[] = [
    {
      header: 'Invoice #',
      accessorKey: 'invoiceNo',
      mono: true,
      width: '130px',
      render: r => (
        <span className="font-mono font-medium text-[var(--erp-gold)]">
          {r.invoiceNo}
        </span>
      )
    },
    {
      header: 'Invoice Date',
      accessorKey: 'invoiceDate',
      mono: true,
      width: '105px'
    },
    {
      header: 'Billed Debtor Party',
      accessorKey: 'partyName',
      render: r => (
        <div>
          <span className="font-body font-medium text-[var(--erp-text)]">{r.partyName}</span>
          <span className="text-[11px] font-mono text-[var(--erp-muted)] block">
            {r.city} &bull; Vehicle: {r.vehicleNo}
          </span>
        </div>
      )
    },
    {
      header: 'E-Way Bill #',
      accessorKey: 'ewayBill',
      mono: true,
      render: r => (
        <span className="font-mono text-xs text-[var(--erp-muted)]">
          {r.ewayBill}
        </span>
      )
    },
    {
      header: 'Taxable (₹)',
      accessorKey: 'taxableAmount',
      align: 'right',
      mono: true,
      sortable: true,
      render: r => (
        <span className="font-mono text-right">
          ₹{r.taxableAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      )
    },
    {
      header: 'GST Output (₹)',
      accessorKey: 'gstAmount',
      align: 'right',
      mono: true,
      render: r => (
        <span className="font-mono text-right text-[var(--erp-muted)]">
          ₹{r.gstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      )
    },
    {
      header: 'Net Total (₹)',
      accessorKey: 'netAmount',
      align: 'right',
      mono: true,
      sortable: true,
      render: r => (
        <span className="font-mono text-right font-semibold text-[var(--erp-text)]">
          ₹{r.netAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      )
    },
    {
      header: 'Status & Aging',
      accessorKey: 'status',
      align: 'center',
      render: r => (
        <StatusChip
          status={r.status}
          label={
            r.status === 'overdue'
              ? `OVERDUE (+${r.overdueDays}d)`
              : r.status === 'due soon'
              ? 'DUE SOON'
              : 'PAID'
          }
        />
      )
    }
  ];

  return (
    <div className="p-6 flex flex-col gap-6 text-left">
      {/* Unified Page Header */}
      <PageHeader
        moduleNumber="12"
        section="Core Operations"
        title="Sales Tax Invoice & Billing Ledger"
        subtitle="Itemized fabric invoicing with HSN verification, automated CGST/SGST/IGST calculation and direct debtor ledger posting."
        actions={
          <div className="flex items-center gap-2">
            {/* Tabs */}
            <div className="flex items-center gap-1.5 font-mono text-xs mr-2">
              <button
                onClick={() => setActiveTab('create')}
                className={`px-3 py-1.5 transition-colors cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'create'
                    ? 'bg-[var(--erp-gold)] text-[#0F141B] font-semibold'
                    : 'bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-muted)] hover:text-[var(--erp-text)]'
                }`}
              >
                <Plus className="w-3.5 h-3.5" /> New Tax Invoice
              </button>
              <button
                onClick={() => setActiveTab('register')}
                className={`px-3 py-1.5 transition-colors cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'register'
                    ? 'bg-[var(--erp-gold)] text-[#0F141B] font-semibold'
                    : 'bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-muted)] hover:text-[var(--erp-text)]'
                }`}
              >
                <ListOrdered className="w-3.5 h-3.5" /> Invoices Register ({invoicesList.length})
              </button>
            </div>

            {activeTab === 'create' && (
              <>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3 py-1.5 border border-[var(--erp-hairline)] bg-[var(--erp-surface-2)] text-xs font-mono text-[var(--erp-text)] hover:border-[var(--erp-gold)] flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 stroke-[1.75] text-[var(--erp-gold)]" /> Print Invoice
                </button>
                <button
                  type="button"
                  onClick={handlePostInvoice}
                  className="px-4 py-1.5 bg-[var(--erp-gold)] text-[#0F141B] text-xs font-mono font-semibold hover:bg-[var(--erp-gold-soft)] flex items-center gap-1.5 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5 stroke-[1.75]" /> Post to Ledger
                </button>
              </>
            )}
          </div>
        }
      />

      {/* Hero Metrics: Horizontal Ledger Metric Strip */}
      <LedgerMetricStrip metrics={metrics} />

      {/* Mode Views */}
      {activeTab === 'create' ? (
        <div className="space-y-6">
          {/* Invoice Header Details */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] p-5">
            <TextInput
              label="Invoice Number"
              mono
              value={invoiceNo}
              onChange={e => setInvoiceNo(e.target.value)}
            />
            <DateInput
              label="Invoice Date"
              value={invoiceDate}
              onChange={e => setInvoiceDate(e.target.value)}
            />
            <TextInput
              label="E-Way Bill Number"
              mono
              value={ewayBill}
              onChange={e => setEwayBill(e.target.value)}
            />
            <TextInput
              label="Dispatch Vehicle Number"
              mono
              value={vehicleNo}
              onChange={e => setVehicleNo(e.target.value)}
            />
          </div>

          {/* Party Details & Place of Supply */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] p-5">
            <div className="md:col-span-2">
              <PartyPicker
                label="Billed Party (Sundry Debtor)"
                selectedPartyId={selectedPartyId}
                onSelect={setSelectedPartyId}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-[var(--erp-muted)] font-body">GST Jurisdiction</label>
              <div className="flex items-center gap-3 mt-2 font-mono text-xs">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="gstType"
                    checked={!isInterstate}
                    onChange={() => setIsInterstate(false)}
                    className="accent-[var(--erp-gold)]"
                  />
                  <span>Intra-State (CGST + SGST)</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="gstType"
                    checked={isInterstate}
                    onChange={() => setIsInterstate(true)}
                    className="accent-[var(--erp-gold)]"
                  />
                  <span>Inter-State (IGST)</span>
                </label>
              </div>
              {selectedParty && (
                <span className="text-[11px] font-mono text-[var(--erp-muted)] mt-1">
                  Party GST: {selectedParty.gstin} &bull; State: {selectedParty.state} (Code 24)
                </span>
              )}
            </div>
          </div>

          {/* Line Items Table (Sharp Cornered) */}
          <div className="border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] overflow-x-auto">
            <table className="w-full text-left border-collapse font-body text-xs">
              <thead className="bg-[var(--erp-surface-2)] border-b-2 border-[var(--erp-hairline-strong)] font-mono text-[11px] text-[var(--erp-muted)] select-none">
                <tr>
                  <th className="px-3.5 py-2.5 border-r border-[var(--erp-hairline)] w-10 text-center font-semibold uppercase tracking-wider">#</th>
                  <th className="px-3.5 py-2.5 border-r border-[var(--erp-hairline)] font-semibold uppercase tracking-wider">Fabric Description</th>
                  <th className="px-3.5 py-2.5 border-r border-[var(--erp-hairline)] w-28 font-semibold uppercase tracking-wider">HSN Code</th>
                  <th className="px-3.5 py-2.5 border-r border-[var(--erp-hairline)] w-24 text-right font-semibold uppercase tracking-wider">Taka / Rolls</th>
                  <th className="px-3.5 py-2.5 border-r border-[var(--erp-hairline)] w-28 text-right font-semibold uppercase tracking-wider">Meters</th>
                  <th className="px-3.5 py-2.5 border-r border-[var(--erp-hairline)] w-28 text-right font-semibold uppercase tracking-wider">Rate (₹)</th>
                  <th className="px-3.5 py-2.5 border-r border-[var(--erp-hairline)] w-32 text-right font-semibold uppercase tracking-wider">Taxable (₹)</th>
                  <th className="px-3.5 py-2.5 border-r border-[var(--erp-hairline)] w-20 text-center font-semibold uppercase tracking-wider">GST %</th>
                  <th className="px-3.5 py-2.5 border-r border-[var(--erp-hairline)] w-32 text-right font-semibold uppercase tracking-wider text-[var(--erp-gold)]">Net Value (₹)</th>
                  <th className="px-3.5 py-2.5 w-12 text-center font-semibold uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--erp-hairline)] font-mono">
                {lines.map((line, idx) => (
                  <tr key={line.id} className="hover:bg-[var(--erp-surface-2)]/50">
                    <td className="px-3.5 py-2 border-r border-[var(--erp-hairline)] text-[var(--erp-muted)]">
                      {idx + 1}
                    </td>
                    <td className="px-3.5 py-2 border-r border-[var(--erp-hairline)] font-body">
                      <input
                        type="text"
                        value={line.itemName}
                        onChange={e => updateLine(line.id, 'itemName', e.target.value)}
                        className="w-full bg-transparent text-[var(--erp-text)] focus:outline-none"
                      />
                    </td>
                    <td className="px-3.5 py-2 border-r border-[var(--erp-hairline)]">
                      <input
                        type="text"
                        value={line.hsn}
                        onChange={e => updateLine(line.id, 'hsn', e.target.value)}
                        className="w-full bg-transparent text-[var(--erp-text)] focus:outline-none text-xs"
                      />
                    </td>
                    <td className="px-3.5 py-2 border-r border-[var(--erp-hairline)] text-right">
                      <input
                        type="number"
                        value={line.rollsTaka}
                        onChange={e => updateLine(line.id, 'rollsTaka', parseInt(e.target.value) || 0)}
                        className="w-full bg-transparent text-[var(--erp-text)] focus:outline-none text-right font-mono"
                      />
                    </td>
                    <td className="px-3.5 py-2 border-r border-[var(--erp-hairline)] text-right">
                      <input
                        type="number"
                        value={line.quantityMeters}
                        onChange={e => updateLine(line.id, 'quantityMeters', e.target.value)}
                        className="w-full bg-transparent text-[var(--erp-text)] focus:outline-none text-right font-mono font-medium"
                      />
                    </td>
                    <td className="px-3.5 py-2 border-r border-[var(--erp-hairline)] text-right">
                      <input
                        type="number"
                        step="0.05"
                        value={line.ratePerMeter}
                        onChange={e => updateLine(line.id, 'ratePerMeter', e.target.value)}
                        className="w-full bg-transparent text-[var(--erp-text)] focus:outline-none text-right font-mono"
                      />
                    </td>
                    <td className="px-3.5 py-2 border-r border-[var(--erp-hairline)] text-right font-semibold text-[var(--erp-text)]">
                      {line.grossAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-3.5 py-2 border-r border-[var(--erp-hairline)] text-center">
                      <select
                        value={line.gstPercent}
                        onChange={e => updateLine(line.id, 'gstPercent', parseFloat(e.target.value))}
                        className="bg-[var(--erp-surface-2)] text-[var(--erp-text)] border border-[var(--erp-hairline)] text-xs rounded-none cursor-pointer"
                      >
                        <option value={5}>5%</option>
                        <option value={12}>12%</option>
                        <option value={18}>18%</option>
                        <option value={0}>0%</option>
                      </select>
                    </td>
                    <td className="px-3.5 py-2 border-r border-[var(--erp-hairline)] text-right font-bold text-[var(--erp-gold)]">
                      {line.netAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-3.5 py-2 text-center">
                      <button
                        onClick={() => removeLine(line.id)}
                        disabled={lines.length <= 1}
                        className="text-[var(--erp-muted)] hover:text-[var(--erp-negative)] disabled:opacity-30 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5 mx-auto stroke-[1.75]" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-[var(--erp-surface-2)] border-t border-[var(--erp-hairline-strong)] font-mono text-xs font-semibold">
                <tr>
                  <td colSpan={3} className="px-3.5 py-2 border-r border-[var(--erp-hairline)]">
                    <button
                      type="button"
                      onClick={addLine}
                      className="text-xs font-body text-[var(--erp-gold)] hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Fabric Line Item
                    </button>
                  </td>
                  <td className="px-3.5 py-2 border-r border-[var(--erp-hairline)] text-right text-[var(--erp-text)]">
                    {totalRolls} Rolls
                  </td>
                  <td className="px-3.5 py-2 border-r border-[var(--erp-hairline)] text-right text-[var(--erp-text)]">
                    {totalMeters.toLocaleString('en-IN')} m
                  </td>
                  <td className="px-3.5 py-2 border-r border-[var(--erp-hairline)] text-right text-[var(--erp-muted)]">
                    Subtotal:
                  </td>
                  <td className="px-3.5 py-2 border-r border-[var(--erp-hairline)] text-right text-[var(--erp-text)]">
                    ₹{totalTaxable.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-3.5 py-2 border-r border-[var(--erp-hairline)] text-center text-[var(--erp-muted)]">&mdash;</td>
                  <td className="px-3.5 py-2 border-r border-[var(--erp-hairline)] text-right text-[var(--erp-gold)]">
                    ₹{(totalTaxable + totalGst).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Tax Breakdown & Grand Running Total */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-4 border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] font-mono text-xs space-y-2">
              <span className="font-display font-bold text-sm text-[var(--erp-text)] block">
                Statutory Declarations (Textile Goods)
              </span>
              <p className="font-body text-[11px] text-[var(--erp-muted)] leading-relaxed">
                We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct. Goods dispatched at buyer's risk. Interest @ 18% per annum will be charged if payment is not made within credit term of {selectedParty?.creditDays || 30} days.
              </p>
              <div className="pt-2 flex items-center gap-2 text-[var(--erp-positive)] font-mono text-xs">
                <CheckCircle2 className="w-4 h-4 stroke-[1.75]" /> GST e-Way Bill IRN Hash Verified &bull; NIC-Portal Sync
              </div>
            </div>

            <div className="border border-[var(--erp-gold)] bg-[var(--erp-surface-2)] p-4 font-mono text-xs space-y-2">
              <div className="flex justify-between text-[var(--erp-muted)]">
                <span>Total Taxable Amount</span>
                <span className="text-[var(--erp-text)]">₹{totalTaxable.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              {!isInterstate ? (
                <>
                  <div className="flex justify-between text-[var(--erp-muted)]">
                    <span>Central GST (CGST @ 2.5%)</span>
                    <span className="text-[var(--erp-text)]">₹{cgst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between text-[var(--erp-muted)]">
                    <span>State GST (SGST @ 2.5%)</span>
                    <span className="text-[var(--erp-text)]">₹{sgst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between text-[var(--erp-muted)]">
                  <span>Integrated GST (IGST @ 5.0%)</span>
                  <span className="text-[var(--erp-text)]">₹{igst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              )}
              <div className="flex justify-between text-[var(--erp-muted)]">
                <span>Round-off Adjustment</span>
                <span>₹{roundOff}</span>
              </div>

              <div className="pt-2 border-t border-[var(--erp-hairline-strong)] flex justify-between items-baseline text-base font-bold text-[var(--erp-text)]">
                <span className="font-display">Final Invoice Net Total</span>
                <span className="font-mono text-2xl text-[var(--erp-gold)]">
                  ₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Invoice Register View */
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="w-3.5 h-3.5 stroke-[1.75] text-[var(--erp-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search by invoice #, party, E-way bill, or vehicle..."
                className="w-full pl-9 pr-3 py-1.5 text-xs font-mono bg-[var(--erp-surface-2)] border border-[var(--erp-hairline-strong)] text-[var(--erp-text)] placeholder-[var(--erp-muted)] focus:outline-none focus:border-[var(--erp-gold)]"
              />
            </div>
            <div className="flex items-center gap-2 text-xs font-mono text-[var(--erp-muted)]">
              <span>Showing {filteredInvoices.length} tax invoice records</span>
            </div>
          </div>

          <DataTable
            columns={invoiceColumns}
            data={filteredInvoices}
            keyExtractor={r => r.invoiceNo}
            rowClassName={r =>
              r.status === 'overdue'
                ? 'bg-[rgba(217,99,90,0.07)] hover:bg-[rgba(217,99,90,0.13)] border-l-2 border-l-[var(--erp-negative)]'
                : r.status === 'due soon'
                ? 'bg-[rgba(201,162,78,0.04)] hover:bg-[rgba(201,162,78,0.09)]'
                : ''
            }
          />
        </div>
      )}
    </div>
  );
};
