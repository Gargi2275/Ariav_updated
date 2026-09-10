import React, { useState } from 'react';
import { useErp } from '../../context/ErpContext';
import { DataTable, Column } from '../../components/common/DataTable';
import { StatusChip } from '../../components/common/StatusChip';
import { BookOpen, Download, Printer, Filter, Calendar, TrendingUp } from 'lucide-react';

interface SalesRegisterEntry {
  id: string;
  date: string;
  invoiceNo: string;
  partyName: string;
  gstin: string;
  stateCode: string;
  hsn: string;
  meters: number;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalInvoiceAmount: number;
  status: 'cleared' | 'posted';
}

export const SalesRegisterScreen: React.FC = () => {
  const { financialYear, showFlash } = useErp();
  const [selectedMonth, setSelectedMonth] = useState('All');
  const [filterGstType, setFilterGstType] = useState<'all' | 'intra' | 'inter'>('all');

  const [invoices] = useState<SalesRegisterEntry[]>([
    {
      id: 'SR-01',
      date: '2026-09-08',
      invoiceNo: 'INV-2025-1094',
      partyName: 'Sharda Synthetics Pvt Ltd',
      gstin: '24AABCS1429B1Z1',
      stateCode: '24 (Gujarat)',
      hsn: '5208',
      meters: 14500,
      taxableValue: 703250,
      cgst: 17581.25,
      sgst: 17581.25,
      igst: 0,
      totalInvoiceAmount: 738412.50,
      status: 'posted'
    },
    {
      id: 'SR-02',
      date: '2026-09-06',
      invoiceNo: 'INV-2025-1093',
      partyName: 'Marwadi Fashion Fabrics',
      gstin: '08AABCM4921K1ZZ',
      stateCode: '08 (Rajasthan)',
      hsn: '5208',
      meters: 18200,
      taxableValue: 1128400,
      cgst: 0,
      sgst: 0,
      igst: 56420,
      totalInvoiceAmount: 1184820.00,
      status: 'cleared'
    },
    {
      id: 'SR-03',
      date: '2026-09-04',
      invoiceNo: 'INV-2025-1092',
      partyName: 'Arvind Commercial Agency',
      gstin: '24AABCA8912P1ZF',
      stateCode: '24 (Gujarat)',
      hsn: '5208',
      meters: 12000,
      taxableValue: 582000,
      cgst: 14550,
      sgst: 14550,
      igst: 0,
      totalInvoiceAmount: 611100.00,
      status: 'cleared'
    },
    {
      id: 'SR-04',
      date: '2026-08-30',
      invoiceNo: 'INV-2025-1091',
      partyName: 'Patel & Brothers Textiles',
      gstin: '24AABCP4412R1Z8',
      stateCode: '24 (Gujarat)',
      hsn: '5407',
      meters: 9600,
      taxableValue: 403200,
      cgst: 10080,
      sgst: 10080,
      igst: 0,
      totalInvoiceAmount: 423360.00,
      status: 'cleared'
    },
    {
      id: 'SR-05',
      date: '2026-08-28',
      invoiceNo: 'INV-2025-1090',
      partyName: 'Radhe Dyeing & Processing',
      gstin: '24AABCR7719L1Z3',
      stateCode: '24 (Gujarat)',
      hsn: '5208',
      meters: 22000,
      taxableValue: 1067000,
      cgst: 26675,
      sgst: 26675,
      igst: 0,
      totalInvoiceAmount: 1120350.00,
      status: 'cleared'
    },
    {
      id: 'SR-06',
      date: '2026-08-24',
      invoiceNo: 'INV-2025-1089',
      partyName: 'Bombay Rayon Syndicate',
      gstin: '27AABCB9011J1ZK',
      stateCode: '27 (Maharashtra)',
      hsn: '5407',
      meters: 16000,
      taxableValue: 672000,
      cgst: 0,
      sgst: 0,
      igst: 33600,
      totalInvoiceAmount: 705600.00,
      status: 'cleared'
    }
  ]);

  const filteredInvoices = invoices.filter(inv => {
    if (filterGstType === 'intra') return inv.igst === 0;
    if (filterGstType === 'inter') return inv.igst > 0;
    return true;
  });

  const totalTaxable = filteredInvoices.reduce((sum, i) => sum + i.taxableValue, 0);
  const totalCgst = filteredInvoices.reduce((sum, i) => sum + i.cgst, 0);
  const totalSgst = filteredInvoices.reduce((sum, i) => sum + i.sgst, 0);
  const totalIgst = filteredInvoices.reduce((sum, i) => sum + i.igst, 0);
  const totalGross = filteredInvoices.reduce((sum, i) => sum + i.totalInvoiceAmount, 0);
  const totalMeters = filteredInvoices.reduce((sum, i) => sum + i.meters, 0);

  const columns: Column<SalesRegisterEntry>[] = [
    {
      header: 'Date',
      accessorKey: 'date',
      mono: true,
      render: r => <span>{r.date}</span>
    },
    {
      header: 'Invoice No',
      accessorKey: 'invoiceNo',
      mono: true,
      render: r => <span className="font-semibold text-[var(--erp-gold)]">{r.invoiceNo}</span>
    },
    {
      header: 'Debtor Party Name & POS',
      accessorKey: 'partyName',
      render: r => (
        <div>
          <span className="font-medium text-[var(--erp-text)]">{r.partyName}</span>
          <span className="text-[11px] text-[var(--erp-muted)] block font-mono">
            {r.gstin} • {r.stateCode}
          </span>
        </div>
      )
    },
    {
      header: 'HSN',
      accessorKey: 'hsn',
      mono: true,
      align: 'center',
      render: r => <span>{r.hsn}</span>
    },
    {
      header: 'Metres',
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
      header: 'Total Value',
      accessorKey: 'totalInvoiceAmount',
      mono: true,
      align: 'right',
      render: r => (
        <span className="font-bold text-[var(--erp-text)]">
          ₹{r.totalInvoiceAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
        </span>
      )
    },
    {
      header: 'Status',
      accessorKey: 'status',
      align: 'center',
      render: r => <StatusChip status={r.status} label={r.status.toUpperCase()} />
    }
  ];

  return (
    <div className="p-6 flex flex-col gap-6 text-left">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--erp-hairline-strong)] pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <BookOpen className="w-4 h-4 text-[var(--erp-gold)]" />
            <span className="font-mono text-xs text-[var(--erp-gold)]">STATUTORY GST TAX REGISTER</span>
          </div>
          <h2 className="font-serif text-2xl font-bold text-[var(--erp-text)]">
            Sales Tax Register (GSTR-1 Ready)
          </h2>
          <p className="text-xs text-[var(--erp-muted)]">
            Chronological outbound commercial sales invoices with intra-state CGST/SGST and inter-state IGST dispatches for {financialYear}.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => showFlash('Sales Register exported to CSV', 'positive')}
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
          <span className="text-[11px] font-mono text-[var(--erp-muted)] block">Invoiced Yards</span>
          <span className="font-mono text-base font-bold text-[var(--erp-text)]">
            {totalMeters.toLocaleString('en-IN')} m
          </span>
        </div>
        <div>
          <span className="text-[11px] font-mono text-[var(--erp-muted)] block">Taxable Base</span>
          <span className="font-mono text-base font-bold text-[var(--erp-text)]">
            ₹{totalTaxable.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </span>
        </div>
        <div>
          <span className="text-[11px] font-mono text-[var(--erp-muted)] block">CGST (2.5%)</span>
          <span className="font-mono text-base font-bold text-[var(--erp-gold)]">
            ₹{totalCgst.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </span>
        </div>
        <div>
          <span className="text-[11px] font-mono text-[var(--erp-muted)] block">SGST (2.5%)</span>
          <span className="font-mono text-base font-bold text-[var(--erp-gold)]">
            ₹{totalSgst.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </span>
        </div>
        <div>
          <span className="text-[11px] font-mono text-[var(--erp-muted)] block">IGST (5.0%)</span>
          <span className="font-mono text-base font-bold text-[var(--erp-positive)]">
            ₹{totalIgst.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </span>
        </div>
        <div>
          <span className="text-[11px] font-mono text-[var(--erp-muted)] block">Gross Turnover</span>
          <span className="font-mono text-base font-bold text-[var(--erp-text)]">
            ₹{totalGross.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </span>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-[var(--erp-surface)] border border-[var(--erp-hairline)]">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-[var(--erp-muted)] shrink-0" />
          <span className="text-xs font-mono text-[var(--erp-muted)]">GST Type:</span>
          {(['all', 'intra', 'inter'] as const).map(type => (
            <button
              key={type}
              onClick={() => setFilterGstType(type)}
              className={`px-2.5 py-1 text-xs font-mono transition-colors ${
                filterGstType === type
                  ? 'bg-[var(--erp-gold)] text-[var(--erp-base)] font-bold'
                  : 'bg-[var(--erp-surface-2)] text-[var(--erp-muted)] hover:text-[var(--erp-text)]'
              }`}
            >
              {type === 'all' ? 'All Transactions' : type === 'intra' ? 'Intra-State (CGST+SGST)' : 'Inter-State (IGST)'}
            </button>
          ))}
        </div>

        <div className="text-xs font-mono text-[var(--erp-muted)]">
          Displaying {filteredInvoices.length} of {invoices.length} Registered Invoices
        </div>
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={filteredInvoices}
        keyExtractor={i => i.id}
        emptyMessage="No sales invoices found for selected parameters."
      />
    </div>
  );
};
