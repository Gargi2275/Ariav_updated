import React, { useState } from 'react';
import { useErp } from '../../context/ErpContext';
import { PageHeader } from '../../components/common/PageHeader';
import { TextInput, AmountInput, DateInput, PartyPicker } from '../../components/common/FormControls';
import { FileDropZone, formatFileSize } from '../../components/common/FileDropZone';
import { LedgerMetricStrip, LedgerMetricItem } from '../../components/common/LedgerMetricStrip';
import { DataTable, Column } from '../../components/common/DataTable';
import { StatusChip } from '../../components/common/StatusChip';
import {
  ShoppingBag,
  FileUp,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Layers,
  Search,
  ListOrdered,
  Plus
} from 'lucide-react';

interface ValidationError {
  row: number;
  field: string;
  value: string;
  message: string;
}

interface OrderRecord {
  orderNo: string;
  orderDate: string;
  deliveryDate: string;
  partyName: string;
  city: string;
  fabricSku: string;
  fabricName: string;
  meters: number;
  ratePerMeter: number;
  broker: string;
  status: 'dispatched' | 'due soon' | 'overdue' | 'within limit';
  delayDays: number;
}

export const OrderFormScreen: React.FC = () => {
  const { parties, items, showFlash, addAuditLog } = useErp();
  const [mode, setMode] = useState<'single' | 'register' | 'bulk'>('single');
  const [searchQuery, setSearchQuery] = useState('');

  // Single Order Form State
  const [orderNo, setOrderNo] = useState('SO-2025-1083');
  const [orderDate, setOrderDate] = useState('2026-09-08');
  const [deliveryDate, setDeliveryDate] = useState('2026-09-22');
  const [partyId, setPartyId] = useState(parties[0]?.id || '');
  const [itemId, setItemId] = useState(items[0]?.id || '');
  const [quantityMeters, setQuantityMeters] = useState('12000');
  const [ratePerMeter, setRatePerMeter] = useState('48.50');
  const [broker, setBroker] = useState('Jigneshbhai Vora (JV-09)');
  const [brokerCommission, setBrokerCommission] = useState('2.0');
  const [paymentTerms, setPaymentTerms] = useState('45 Days PDC');

  // Bulk Import State
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [totalRowsProcessed, setTotalRowsProcessed] = useState(0);
  const [validRowsCount, setValidRowsCount] = useState(0);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [importedFilename, setImportedFilename] = useState('');
  const [bulkFile, setBulkFile] = useState<File | null>(null);

  // Sample Orders Register
  const [ordersList, setOrdersList] = useState<OrderRecord[]>([
    {
      orderNo: 'SO-2025-1077',
      orderDate: '2026-09-01',
      deliveryDate: '2026-09-05',
      partyName: 'Sharda Synthetics Pvt Ltd',
      city: 'Surat',
      fabricSku: 'SKU-CAM-6060',
      fabricName: 'Cotton Cambric 60x60 (92x88)',
      meters: 24000,
      ratePerMeter: 48.50,
      broker: 'Jigneshbhai Vora',
      status: 'overdue',
      delayDays: 3
    },
    {
      orderNo: 'SO-2025-1078',
      orderDate: '2026-09-02',
      deliveryDate: '2026-09-10',
      partyName: 'Arvind Commercial Agency',
      city: 'Ahmedabad',
      fabricSku: 'SKU-POP-4040',
      fabricName: 'Cotton Poplin 40x40 (100x92)',
      meters: 18000,
      ratePerMeter: 38.25,
      broker: 'Chandrakant Parekh',
      status: 'due soon',
      delayDays: 0
    },
    {
      orderNo: 'SO-2025-1079',
      orderDate: '2026-09-03',
      deliveryDate: '2026-09-18',
      partyName: 'Reliance Textile Processors',
      city: 'Narol',
      fabricSku: 'SKU-RAY-DYED',
      fabricName: 'Rayon 30x30 Plain Dyed',
      meters: 30000,
      ratePerMeter: 54.00,
      broker: 'Jigneshbhai Vora',
      status: 'within limit',
      delayDays: 0
    },
    {
      orderNo: 'SO-2025-1080',
      orderDate: '2026-08-28',
      deliveryDate: '2026-09-04',
      partyName: 'Patel & Brothers Textiles',
      city: 'Ahmedabad',
      fabricSku: 'SKU-CAM-6060',
      fabricName: 'Cotton Cambric 60x60 (92x88)',
      meters: 14000,
      ratePerMeter: 49.00,
      broker: 'Jigneshbhai Vora',
      status: 'overdue',
      delayDays: 4
    },
    {
      orderNo: 'SO-2025-1081',
      orderDate: '2026-09-04',
      deliveryDate: '2026-09-08',
      partyName: 'Gujarat Co-op Textile Mill',
      city: 'Rajkot',
      fabricSku: 'SKU-PV-TWILL',
      fabricName: 'Poly-Viscose Twill Suiting',
      meters: 15000,
      ratePerMeter: 62.50,
      broker: 'Mukeshbhai Shah',
      status: 'dispatched',
      delayDays: 0
    },
    {
      orderNo: 'SO-2025-1082',
      orderDate: '2026-09-05',
      deliveryDate: '2026-09-20',
      partyName: 'Radha Krishna Prints',
      city: 'Jetpur',
      fabricSku: 'SKU-JAC-WEAVE',
      fabricName: 'Cotton Jacquard Grey Weave',
      meters: 8500,
      ratePerMeter: 78.00,
      broker: 'Direct Booking',
      status: 'within limit',
      delayDays: 0
    }
  ]);

  const metrics: LedgerMetricItem[] = [
    {
      label: 'Active Contracts',
      value: '184 Orders',
      subValue: '184.20 Lk Mtr',
      trend: 'up',
      change: '+14.20% vs MTD',
      badge: 'BOOKED'
    },
    {
      label: 'Pending Dispatch',
      value: '64 Orders',
      subValue: '48.20 Lk Mtr',
      trend: 'neutral',
      change: 'Surat & Narol Hubs',
      badge: 'QUEUE'
    },
    {
      label: 'Overdue Delivery',
      value: '4 Orders',
      subValue: '38,000 Mtr',
      trend: 'down',
      change: 'Mill follow-up urgent',
      badge: 'OVERDUE'
    },
    {
      label: 'Dispatched Today',
      value: '18 Trucks',
      subValue: '42,800 Mtr',
      trend: 'up',
      change: 'LR & E-Way linked',
      badge: 'TRANSIT'
    },
    {
      label: 'Avg Realization',
      value: '₹48.50 / m',
      subValue: '60x60 Cambric Std',
      trend: 'up',
      change: '+₹1.25 vs Q1',
      badge: 'INDEX'
    },
    {
      label: 'Entity Brokerage',
      value: '₹9.64 L',
      subValue: '2.00% Flat Rate',
      trend: 'neutral',
      change: '₹1.80 L pending pay',
      badge: 'COMMISSION'
    }
  ];

  const numMeters = parseFloat(quantityMeters) || 0;
  const numRate = parseFloat(ratePerMeter) || 0;
  const grossTotal = numMeters * numRate;
  const commAmount = (grossTotal * (parseFloat(brokerCommission) || 0)) / 100;

  const handleSingleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const selectedP = parties.find(p => p.id === partyId);
    const selectedI = items.find(i => i.id === itemId);

    const newRecord: OrderRecord = {
      orderNo,
      orderDate,
      deliveryDate,
      partyName: selectedP?.name || 'Textile Trader',
      city: selectedP?.city || 'Surat',
      fabricSku: selectedI?.sku || 'SKU-GEN-01',
      fabricName: selectedI?.description || 'Textile Grey Goods',
      meters: numMeters,
      ratePerMeter: numRate,
      broker: broker.split('(')[0].trim(),
      status: 'within limit',
      delayDays: 0
    };

    setOrdersList(prev => [newRecord, ...prev]);
    addAuditLog(
      'Booked Textile Order',
      'Order Booking',
      `Order ${orderNo} for ₹${grossTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })} (${numMeters.toLocaleString('en-IN')} meters)`,
      'info'
    );
    showFlash(`Order ${orderNo} registered successfully`, 'positive');
    setOrderNo(`SO-2025-${Math.floor(1084 + Math.random() * 50)}`);
  };

  const handleSimulateBulkImport = (filename = 'ahmedabad_mill_bulk_orders_50mb.json', _size = '48.9 MB') => {
    setImportedFilename(filename);
    setIsProcessing(true);
    setUploadProgress(0);
    setValidationErrors([]);

    const interval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsProcessing(false);
          setTotalRowsProcessed(1420);
          setValidRowsCount(1417);
          setValidationErrors([
            { row: 14, field: 'Party Code', value: 'SHR-UNKNOWN', message: 'Import failed — row missing valid Gujarat GSTIN party account' },
            { row: 82, field: 'Loom Width', value: '92"', message: 'Import failed — width exceeds Gujarat weaving limit of 72"' },
            { row: 105, field: 'Base Rate', value: '₹0.00', message: 'Import failed — zero rate entered for 60x60 Cambric quality' }
          ]);
          addAuditLog('Bulk 50MB JSON Ingestion', 'Order Booking', `Processed 1,420 textile order rows from ${filename}`, 'notice');
          showFlash('Bulk dataset parsed: 1,417 valid rows ready, 3 errors isolated', 'gold');
          return 100;
        }
        return prev + 20;
      });
    }, 300);
  };

  const filteredOrders = ordersList.filter(o =>
    o.orderNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
    o.partyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    o.fabricName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    o.broker.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const orderColumns: Column<OrderRecord>[] = [
    {
      header: 'Order Voucher #',
      accessorKey: 'orderNo',
      mono: true,
      width: '130px',
      render: r => (
        <span className="font-mono font-medium text-[var(--erp-gold)]">
          {r.orderNo}
        </span>
      )
    },
    {
      header: 'Contract Date',
      accessorKey: 'orderDate',
      mono: true,
      width: '105px'
    },
    {
      header: 'Billing Party & City',
      accessorKey: 'partyName',
      render: r => (
        <div>
          <span className="font-body font-medium text-[var(--erp-text)]">{r.partyName}</span>
          <span className="text-[11px] font-mono text-[var(--erp-muted)] block">
            {r.city} &bull; Broker: {r.broker}
          </span>
        </div>
      )
    },
    {
      header: 'Fabric Quality',
      accessorKey: 'fabricName',
      render: r => (
        <div>
          <span className="font-body text-xs text-[var(--erp-text)]">{r.fabricName}</span>
          <span className="text-[11px] font-mono text-[var(--erp-muted)] block">{r.fabricSku}</span>
        </div>
      )
    },
    {
      header: 'Meters',
      accessorKey: 'meters',
      align: 'right',
      mono: true,
      sortable: true,
      render: r => (
        <span className="font-mono text-right font-medium">
          {r.meters.toLocaleString('en-IN')} m
        </span>
      )
    },
    {
      header: 'Agreed Rate',
      accessorKey: 'ratePerMeter',
      align: 'right',
      mono: true,
      render: r => (
        <span className="font-mono text-right">
          ₹{r.ratePerMeter.toFixed(2)}
        </span>
      )
    },
    {
      header: 'Gross Value (₹)',
      align: 'right',
      mono: true,
      sortable: true,
      render: r => (
        <span className="font-mono text-right font-semibold text-[var(--erp-text)]">
          ₹{(r.meters * r.ratePerMeter).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      )
    },
    {
      header: 'Delivery Due',
      accessorKey: 'deliveryDate',
      align: 'center',
      mono: true,
      render: r => (
        <span className={`font-mono ${r.status === 'overdue' ? 'text-[var(--erp-negative)] font-bold' : ''}`}>
          {r.deliveryDate}
          {r.delayDays > 0 && <span className="text-[10px] block">+{r.delayDays}d delay</span>}
        </span>
      )
    },
    {
      header: 'Dispatch Risk Band',
      accessorKey: 'status',
      align: 'center',
      render: r => (
        <StatusChip
          status={r.status}
          label={
            r.status === 'overdue'
              ? 'OVERDUE'
              : r.status === 'due soon'
              ? 'DUE SOON'
              : r.status === 'dispatched'
              ? 'DISPATCHED'
              : 'WITHIN LIMIT'
          }
        />
      )
    }
  ];

  return (
    <div className="p-6 flex flex-col gap-6 text-left">
      {/* Unified Page Header */}
      <PageHeader
        moduleNumber="11"
        section="Core Operations"
        title="Order Booking & Bulk Stream Ingestion"
        subtitle="Direct sales order booking, active contract register, and high-speed 50MB JSON dataset intake from mills."
        actions={
          <div className="flex items-center gap-2 font-mono text-xs">
            <button
              onClick={() => setMode('single')}
              className={`px-3 py-1.5 transition-colors cursor-pointer flex items-center gap-1.5 ${
                mode === 'single'
                  ? 'bg-[var(--erp-gold)] text-[#0F141B] font-semibold'
                  : 'bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-muted)] hover:text-[var(--erp-text)]'
              }`}
            >
              <Plus className="w-3.5 h-3.5" /> Single Order Form
            </button>
            <button
              onClick={() => setMode('register')}
              className={`px-3 py-1.5 transition-colors cursor-pointer flex items-center gap-1.5 ${
                mode === 'register'
                  ? 'bg-[var(--erp-gold)] text-[#0F141B] font-semibold'
                  : 'bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-muted)] hover:text-[var(--erp-text)]'
              }`}
            >
              <ListOrdered className="w-3.5 h-3.5" /> Orders Register ({ordersList.length})
            </button>
            <button
              onClick={() => setMode('bulk')}
              className={`px-3 py-1.5 transition-colors cursor-pointer flex items-center gap-1.5 ${
                mode === 'bulk'
                  ? 'bg-[var(--erp-gold)] text-[#0F141B] font-semibold'
                  : 'bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-muted)] hover:text-[var(--erp-text)]'
              }`}
            >
              <FileUp className="w-3.5 h-3.5" /> Bulk 50MB Import
            </button>
          </div>
        }
      />

      {/* Hero Metrics: Horizontal Ledger Metric Strip */}
      <LedgerMetricStrip metrics={metrics} />

      {/* Main Mode Views */}
      {mode === 'single' && (
        <form onSubmit={handleSingleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] p-5">
            <TextInput
              label="Sales Order Voucher #"
              mono
              value={orderNo}
              onChange={e => setOrderNo(e.target.value)}
              required
            />
            <DateInput
              label="Contract Date"
              value={orderDate}
              onChange={e => setOrderDate(e.target.value)}
            />
            <DateInput
              label="Delivery Commitment Date"
              value={deliveryDate}
              onChange={e => setDeliveryDate(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] p-5">
            <PartyPicker
              label="Billing Party (Debtor Mill / Wholesaler)"
              selectedPartyId={partyId}
              onSelect={setPartyId}
            />

            <div className="flex flex-col gap-1 text-left">
              <label className="text-xs font-normal text-[var(--erp-muted)] font-body">
                Intermediary Textile Broker
              </label>
              <select
                value={broker}
                onChange={e => setBroker(e.target.value)}
                className="px-3 py-2 text-sm font-mono bg-[var(--erp-surface-2)] border border-[var(--erp-hairline-strong)] text-[var(--erp-text)] focus:outline-none focus:border-[var(--erp-gold)] cursor-pointer rounded-none"
              >
                <option>Jigneshbhai Vora (JV-09)</option>
                <option>Chandrakant B. Parekh (CP-03)</option>
                <option>Mukeshbhai Shah (MS-14)</option>
                <option>Direct Mill Booking (No Brokerage)</option>
              </select>
            </div>
          </div>

          <div className="border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] p-5 space-y-4">
            <h3 className="font-display text-sm font-bold text-[var(--erp-text)]">
              Fabric Specifications & Commercial Terms
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="flex flex-col gap-1 text-left md:col-span-2">
                <label className="text-xs font-normal text-[var(--erp-muted)] font-body">
                  Fabric SKU / Catalogue Item
                </label>
                <select
                  value={itemId}
                  onChange={e => {
                    setItemId(e.target.value);
                    const selected = items.find(it => it.id === e.target.value);
                    if (selected) setRatePerMeter(selected.baseRatePerMeter.toFixed(2));
                  }}
                  className="px-3 py-2 text-sm font-body bg-[var(--erp-surface-2)] border border-[var(--erp-hairline-strong)] text-[var(--erp-text)] focus:outline-none focus:border-[var(--erp-gold)] cursor-pointer rounded-none"
                >
                  {items.map(it => (
                    <option key={it.id} value={it.id}>
                      {it.sku} &mdash; {it.description} ({it.construction})
                    </option>
                  ))}
                </select>
              </div>

              <TextInput
                label="Contract Quantity (Meters)"
                mono
                value={quantityMeters}
                onChange={e => setQuantityMeters(e.target.value)}
              />

              <AmountInput
                label="Agreed Rate / Meter"
                value={ratePerMeter}
                onChange={e => setRatePerMeter(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              <TextInput
                label="Payment Terms"
                value={paymentTerms}
                onChange={e => setPaymentTerms(e.target.value)}
              />
              <TextInput
                label="Brokerage Accrual %"
                mono
                value={brokerCommission}
                onChange={e => setBrokerCommission(e.target.value)}
              />
              <div className="p-3 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] flex flex-col justify-between text-right">
                <span className="text-[10px] text-[var(--erp-muted)] font-mono uppercase">BROKERAGE COMMISSION</span>
                <span className="font-mono text-base font-semibold text-[var(--erp-gold)]">
                  ₹{commAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          {/* Running Contract Ledger Summary */}
          <div className="border border-[var(--erp-gold)] bg-[var(--erp-surface-2)] p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <span className="font-mono text-xs text-[var(--erp-gold)] font-medium">
                CONTRACT VALUATION SUMMARY
              </span>
              <div className="font-body text-xs text-[var(--erp-muted)] mt-0.5">
                {numMeters.toLocaleString('en-IN')} Meters @ ₹{numRate.toFixed(2)}/mtr &bull; Standard GST 5% applies upon invoicing
              </div>
            </div>

            <div className="flex items-center gap-6">
              <div className="text-right">
                <span className="text-xs text-[var(--erp-muted)] font-mono">Gross Total Value:</span>
                <div className="font-mono text-2xl font-bold text-[var(--erp-text)]">
                  ₹{grossTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>

              <button
                type="submit"
                className="px-6 py-2.5 bg-[var(--erp-gold)] text-[#0F141B] font-mono text-xs font-semibold hover:bg-[var(--erp-gold-soft)] transition-colors flex items-center gap-2 cursor-pointer"
              >
                Commit Order Contract <ArrowRight className="w-4 h-4 stroke-[1.75]" />
              </button>
            </div>
          </div>
        </form>
      )}

      {mode === 'register' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="w-3.5 h-3.5 stroke-[1.75] text-[var(--erp-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search by order #, mill party, broker, or fabric quality..."
                className="w-full pl-9 pr-3 py-1.5 text-xs font-mono bg-[var(--erp-surface-2)] border border-[var(--erp-hairline-strong)] text-[var(--erp-text)] placeholder-[var(--erp-muted)] focus:outline-none focus:border-[var(--erp-gold)]"
              />
            </div>
            <div className="flex items-center gap-2 text-xs font-mono text-[var(--erp-muted)]">
              <span>Showing {filteredOrders.length} active textile contracts</span>
            </div>
          </div>

          <DataTable
            columns={orderColumns}
            data={filteredOrders}
            keyExtractor={r => r.orderNo}
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

      {mode === 'bulk' && (
        <div className="space-y-6">
          <div className="border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="font-display text-lg font-bold text-[var(--erp-text)]">
                  50MB High-Speed Bulk Order Ingestion Stream
                </h3>
                <p className="font-body text-xs text-[var(--erp-muted)]">
                  Stream massive batch booking catalogs exported from Ahmedabad and Surat weaving consortiums.
                </p>
              </div>

              <button
                type="button"
                onClick={() => handleSimulateBulkImport('sample_gujarat_agency_orders_50mb.json', '48.9 MB')}
                className="px-3.5 py-1.5 border border-[var(--erp-gold)] bg-[var(--erp-gold)]/10 text-[var(--erp-gold)] font-mono text-xs hover:bg-[var(--erp-gold)] hover:text-[#0F141B] transition-colors flex items-center gap-2 cursor-pointer"
              >
                <Layers className="w-3.5 h-3.5 stroke-[1.75]" /> Load Sample 50MB Mill Dataset (1,420 Rows)
              </button>
            </div>

            <FileDropZone
              label="Drop 50MB Bulk JSON File"
              helper="Drag & drop orders dataset (.json) or click to browse up to 50MB"
              accept=".json,application/json"
              file={bulkFile}
              onChange={next => {
                setBulkFile(next);
                if (next) handleSimulateBulkImport(next.name, formatFileSize(next.size));
              }}
            />

            {isProcessing && (
              <div className="p-4 bg-[var(--erp-surface-2)] border border-[var(--erp-gold)] space-y-2 animate-in fade-in">
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-[var(--erp-gold)] font-medium">
                    Streaming & parsing JSON chunks for {importedFilename}...
                  </span>
                  <span className="text-[var(--erp-text)] font-bold">{uploadProgress}%</span>
                </div>
                <div className="w-full h-2 bg-[var(--erp-surface)] overflow-hidden">
                  <div className="h-full bg-[var(--erp-gold)] transition-all duration-200" style={{ width: `${uploadProgress}%` }} />
                </div>
                <span className="text-[10px] font-mono text-[var(--erp-muted)]">
                  Validating GSTIN party IDs &bull; Checking fabric construction schemas &bull; Verifying credit limits
                </span>
              </div>
            )}
          </div>

          {/* Validation Report */}
          {totalRowsProcessed > 0 && !isProcessing && (
            <div className="border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-[var(--erp-hairline)]">
                <div>
                  <h4 className="font-display text-base font-bold text-[var(--erp-text)]">
                    Ingestion Verification Report
                  </h4>
                  <div className="flex items-center gap-4 text-xs font-mono mt-1">
                    <span className="text-[var(--erp-text)]">Total: {totalRowsProcessed} Rows</span>
                    <span className="text-[var(--erp-positive)] font-semibold">Valid: {validRowsCount} Rows</span>
                    <span className="text-[var(--erp-negative)] font-semibold">Errors: {validationErrors.length} Rows</span>
                  </div>
                </div>

                <button
                  onClick={() => {
                    showFlash(`Successfully committed ${validRowsCount} orders into active ledger`, 'positive');
                    addAuditLog('Committed Bulk Orders', 'Order Booking', `Committed ${validRowsCount} orders from bulk JSON stream`, 'info');
                  }}
                  className="px-4 py-2 bg-[var(--erp-positive)] text-white font-mono text-xs font-semibold hover:bg-[#2f9372] transition-colors flex items-center gap-2 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4 stroke-[1.75]" /> Commit {validRowsCount} Valid Orders to Database
                </button>
              </div>

              {/* Per-Row Validation Error Table with plain operator language */}
              <div>
                <span className="text-xs font-body text-[var(--erp-negative)] mb-2 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 stroke-[1.75]" />
                  Isolated validation discrepancies requiring operator action:
                </span>

                <div className="border border-[var(--erp-hairline-strong)] overflow-hidden">
                  <table className="w-full text-left font-mono text-xs">
                    <thead className="bg-[var(--erp-surface-2)] border-b-2 border-[var(--erp-hairline-strong)] text-[11px] text-[var(--erp-muted)] select-none">
                      <tr>
                        <th className="px-3 py-2.5 font-semibold uppercase tracking-wider border-r border-[var(--erp-hairline)] w-24">Row #</th>
                        <th className="px-3 py-2.5 font-semibold uppercase tracking-wider border-r border-[var(--erp-hairline)]">Payload Field</th>
                        <th className="px-3 py-2.5 font-semibold uppercase tracking-wider border-r border-[var(--erp-hairline)]">Ingested Value</th>
                        <th className="px-3 py-2.5 font-semibold uppercase tracking-wider text-[var(--erp-negative)]">Operator Action Needed</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--erp-hairline)]">
                      {validationErrors.map(err => (
                        <tr key={err.row} className="bg-[rgba(217,99,90,0.06)] hover:bg-[rgba(217,99,90,0.12)]">
                          <td className="px-3 py-2 text-[var(--erp-gold)] font-bold">Row {err.row}</td>
                          <td className="px-3 py-2 text-[var(--erp-text)]">{err.field}</td>
                          <td className="px-3 py-2 text-[var(--erp-muted)]">{err.value}</td>
                          <td className="px-3 py-2 text-[var(--erp-negative)] font-body">{err.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
