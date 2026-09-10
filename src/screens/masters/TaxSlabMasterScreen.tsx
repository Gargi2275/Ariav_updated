import React, { useState } from 'react';
import { useErp } from '../../context/ErpContext';
import { PageHeader } from '../../components/common/PageHeader';
import { DataTable, Column } from '../../components/common/DataTable';
import { StatusChip } from '../../components/common/StatusChip';
import { 
  Percent, 
  Plus, 
  ShieldCheck, 
  CheckCircle2, 
  Edit2, 
  Calculator, 
  ArrowRightLeft, 
  Search, 
  X, 
  Save, 
  BookOpen,
  Info,
  Layers,
  Scale
} from 'lucide-react';

export interface TaxSlab {
  id: string;
  code: string;
  name: string;
  totalGstPercent: number;
  cgstPercent: number;
  sgstPercent: number;
  igstPercent: number;
  cessPercent: number;
  hsnCoverage: string;
  statutoryNotification: string;
  effectiveFrom: string;
  rcmApplicable: boolean;
  status: 'active' | 'archived';
}

const INITIAL_SLABS: TaxSlab[] = [
  {
    id: 'TS-01',
    code: 'GST-05-TEX',
    name: 'Textile Fabric & Grey Cotton Goods',
    totalGstPercent: 5,
    cgstPercent: 2.5,
    sgstPercent: 2.5,
    igstPercent: 5.0,
    cessPercent: 0,
    hsnCoverage: '5208, 5209, 5407, 5513 (Woven Fabrics)',
    statutoryNotification: 'Notification 1/2017 - Central Tax (Rate)',
    effectiveFrom: '01/07/2017',
    rcmApplicable: false,
    status: 'active'
  },
  {
    id: 'TS-02',
    code: 'GST-12-TEX',
    name: 'Processed & Finished Man-Made Textiles',
    totalGstPercent: 12,
    cgstPercent: 6.0,
    sgstPercent: 6.0,
    igstPercent: 12.0,
    cessPercent: 0,
    hsnCoverage: '5408, 5801, 6001 (Knitted & Jacquard)',
    statutoryNotification: 'Notification 14/2021 - Integrated Tax',
    effectiveFrom: '01/01/2022',
    rcmApplicable: false,
    status: 'active'
  },
  {
    id: 'TS-03',
    code: 'GST-18-SRV',
    name: 'Brokerage, Commission & Depot Logistics',
    totalGstPercent: 18,
    cgstPercent: 9.0,
    sgstPercent: 9.0,
    igstPercent: 18.0,
    cessPercent: 0,
    hsnCoverage: 'SAC 9961 (Brokerage), SAC 9965 (GTA Freight)',
    statutoryNotification: 'Notification 11/2017 - Services Tax',
    effectiveFrom: '01/07/2017',
    rcmApplicable: true,
    status: 'active'
  },
  {
    id: 'TS-04',
    code: 'GST-00-EXM',
    name: 'Raw Cotton Ginned & Agriculture Seeds',
    totalGstPercent: 0,
    cgstPercent: 0,
    sgstPercent: 0,
    igstPercent: 0,
    cessPercent: 0,
    hsnCoverage: '5201 (Raw Cotton Bales), 5202 (Cotton Waste)',
    statutoryNotification: 'Notification 2/2017 - Exempt Goods',
    effectiveFrom: '01/07/2017',
    rcmApplicable: false,
    status: 'active'
  },
  {
    id: 'TS-05',
    code: 'GST-28-LUX',
    name: 'High-Value Metallic & Technical Zari Goods',
    totalGstPercent: 28,
    cgstPercent: 14.0,
    sgstPercent: 14.0,
    igstPercent: 28.0,
    cessPercent: 0,
    hsnCoverage: '5809 (Woven Fabrics of Metal Thread)',
    statutoryNotification: 'Notification 1/2017 - Sched. IV',
    effectiveFrom: '01/07/2017',
    rcmApplicable: false,
    status: 'active'
  }
];

export const TaxSlabMasterScreen: React.FC = () => {
  const { showFlash, addAuditLog } = useErp();

  const [slabs, setSlabs] = useState<TaxSlab[]>(INITIAL_SLABS);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTab, setSelectedTab] = useState<'slabs' | 'rcm' | 'calculator'>('slabs');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSlab, setEditingSlab] = useState<Partial<TaxSlab> | null>(null);

  // Live GST Tax Calculator State
  const [calcAssessableVal, setCalcAssessableVal] = useState<number>(100000);
  const [calcSlabCode, setCalcSlabCode] = useState<string>('GST-05-TEX');
  const [calcTxType, setCalcTxType] = useState<'intra' | 'inter'>('intra');

  const selectedCalcSlab = slabs.find(s => s.code === calcSlabCode) || slabs[0];
  const calcCgstAmount = calcTxType === 'intra' ? (calcAssessableVal * selectedCalcSlab.cgstPercent) / 100 : 0;
  const calcSgstAmount = calcTxType === 'intra' ? (calcAssessableVal * selectedCalcSlab.sgstPercent) / 100 : 0;
  const calcIgstAmount = calcTxType === 'inter' ? (calcAssessableVal * selectedCalcSlab.igstPercent) / 100 : 0;
  const calcTotalTax = calcCgstAmount + calcSgstAmount + calcIgstAmount;
  const calcTotalInvoice = calcAssessableVal + calcTotalTax;

  const filteredSlabs = slabs.filter(s =>
    s.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.hsnCoverage.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleOpenCreate = () => {
    setEditingSlab({
      id: `TS-0${slabs.length + 1}`,
      code: 'GST-05-SPEC',
      name: 'Custom Fabric Special Tariff Slab',
      totalGstPercent: 5,
      cgstPercent: 2.5,
      sgstPercent: 2.5,
      igstPercent: 5.0,
      cessPercent: 0,
      hsnCoverage: '5208.11, 5208.12',
      statutoryNotification: 'Notification 1/2017 - Central Tax',
      effectiveFrom: '01/04/2026',
      rcmApplicable: false,
      status: 'active'
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (slab: TaxSlab) => {
    setEditingSlab({ ...slab });
    setIsModalOpen(true);
  };

  const handleSaveSlab = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSlab || !editingSlab.code || !editingSlab.name) return;

    const exists = slabs.some(s => s.id === editingSlab.id);
    if (exists) {
      setSlabs(prev => prev.map(s => (s.id === editingSlab.id ? (editingSlab as TaxSlab) : s)));
      addAuditLog('Updated GST Tariff Slab', 'Masters & Tax', `Updated tax slab ${editingSlab.code}`, 'notice');
      showFlash(`Tariff Slab ${editingSlab.code} updated`, 'positive');
    } else {
      setSlabs(prev => [...prev, editingSlab as TaxSlab]);
      addAuditLog('Created New GST Tariff Slab', 'Masters & Tax', `Created tax slab ${editingSlab.code} (${editingSlab.totalGstPercent}%)`, 'info');
      showFlash(`New Tariff Slab ${editingSlab.code} activated`, 'positive');
    }
    setIsModalOpen(false);
  };

  const handleToggleStatus = (id: string) => {
    setSlabs(prev =>
      prev.map(s => {
        if (s.id === id) {
          const nextStatus = s.status === 'active' ? 'archived' : 'active';
          showFlash(`Slab ${s.code} marked as ${nextStatus.toUpperCase()}`, 'gold');
          return { ...s, status: nextStatus };
        }
        return s;
      })
    );
  };

  const columns: Column<TaxSlab>[] = [
    {
      header: 'Tariff Code',
      accessorKey: 'code',
      mono: true,
      width: '130px',
      render: r => <span className="font-mono text-[var(--erp-gold)] font-medium">{r.code}</span>
    },
    {
      header: 'Slab Title & Scope',
      accessorKey: 'name',
      render: r => (
        <div>
          <span className="font-body font-medium text-[var(--erp-text)]">{r.name}</span>
          <span className="text-[11px] font-mono text-[var(--erp-muted)] block">
            HSN Coverage: {r.hsnCoverage}
          </span>
        </div>
      )
    },
    {
      header: 'Total GST',
      accessorKey: 'totalGstPercent',
      align: 'center',
      mono: true,
      width: '90px',
      render: r => (
        <span className="font-mono font-bold text-[var(--erp-gold)] text-sm px-2 py-0.5 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)]">
          {r.totalGstPercent}%
        </span>
      )
    },
    {
      header: 'CGST',
      accessorKey: 'cgstPercent',
      align: 'center',
      mono: true,
      width: '80px',
      render: r => <span className="font-mono text-xs">{r.cgstPercent}%</span>
    },
    {
      header: 'SGST',
      accessorKey: 'sgstPercent',
      align: 'center',
      mono: true,
      width: '80px',
      render: r => <span className="font-mono text-xs">{r.sgstPercent}%</span>
    },
    {
      header: 'IGST',
      accessorKey: 'igstPercent',
      align: 'center',
      mono: true,
      width: '80px',
      render: r => <span className="font-mono text-xs">{r.igstPercent}%</span>
    },
    {
      header: 'RCM',
      align: 'center',
      width: '70px',
      render: r => (
        <span className={`text-[10px] font-mono px-1.5 py-0.5 border ${
          r.rcmApplicable 
            ? 'bg-[var(--erp-surface-2)] border-[var(--erp-gold)] text-[var(--erp-gold)]' 
            : 'border-[var(--erp-hairline)] text-[var(--erp-muted)]'
        }`}>
          {r.rcmApplicable ? 'YES' : 'NO'}
        </span>
      )
    },
    {
      header: 'Statutory Gazette Law',
      accessorKey: 'statutoryNotification',
      render: r => <span className="text-xs font-mono text-[var(--erp-muted)]">{r.statutoryNotification}</span>
    },
    {
      header: 'Status',
      align: 'center',
      width: '90px',
      render: r => (
        <button
          onClick={() => handleToggleStatus(r.id)}
          className="cursor-pointer"
          title="Click to toggle status"
        >
          <StatusChip status={r.status === 'active' ? 'cleared' : 'muted'} label={r.status.toUpperCase()} />
        </button>
      )
    },
    {
      header: 'Actions',
      align: 'right',
      width: '80px',
      render: r => (
        <button
          onClick={() => handleOpenEdit(r)}
          className="p-1 text-[var(--erp-muted)] hover:text-[var(--erp-gold)] transition-colors cursor-pointer"
          title="Edit Slab"
        >
          <Edit2 className="w-3.5 h-3.5" />
        </button>
      )
    }
  ];

  return (
    <div className="p-6 flex flex-col gap-6 text-left">
      {/* Unified Page Header */}
      <PageHeader
        moduleNumber="27"
        section="Masters"
        title="Tax Slab & GST Schedule Master"
        subtitle="Statutory GST rates, CGST/SGST/IGST splits, Reverse Charge Mechanism (RCM) rules, and textile HSN tariffs."
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => showFlash('Tax slab configuration verified against CBIC Portal', 'gold')}
              className="px-3 py-1.5 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] hover:border-[var(--erp-gold)] font-mono text-xs text-[var(--erp-text)] flex items-center gap-1.5 cursor-pointer"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-[var(--erp-gold)]" /> CBIC Gazette Verified
            </button>
            <button
              onClick={handleOpenCreate}
              className="px-4 py-1.5 bg-[var(--erp-gold)] text-[#0F141B] font-body text-xs font-semibold hover:bg-[var(--erp-gold-soft)] transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> New Tax Slab
            </button>
          </div>
        }
      />

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center justify-between border-b border-[var(--erp-hairline-strong)]">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setSelectedTab('slabs')}
            className={`px-4 py-2 text-xs font-mono transition-colors flex items-center gap-2 border-b-2 ${
              selectedTab === 'slabs'
                ? 'border-[var(--erp-gold)] text-[var(--erp-gold)] bg-[var(--erp-surface-2)] font-semibold'
                : 'border-transparent text-[var(--erp-muted)] hover:text-[var(--erp-text)]'
            }`}
          >
            <Percent className="w-3.5 h-3.5" />
            <span>Statutory Tariff Slabs ({slabs.length})</span>
          </button>
          <button
            onClick={() => setSelectedTab('calculator')}
            className={`px-4 py-2 text-xs font-mono transition-colors flex items-center gap-2 border-b-2 ${
              selectedTab === 'calculator'
                ? 'border-[var(--erp-gold)] text-[var(--erp-gold)] bg-[var(--erp-surface-2)] font-semibold'
                : 'border-transparent text-[var(--erp-muted)] hover:text-[var(--erp-text)]'
            }`}
          >
            <Calculator className="w-3.5 h-3.5" />
            <span>Live GST Split Simulator</span>
          </button>
          <button
            onClick={() => setSelectedTab('rcm')}
            className={`px-4 py-2 text-xs font-mono transition-colors flex items-center gap-2 border-b-2 ${
              selectedTab === 'rcm'
                ? 'border-[var(--erp-gold)] text-[var(--erp-gold)] bg-[var(--erp-surface-2)] font-semibold'
                : 'border-transparent text-[var(--erp-muted)] hover:text-[var(--erp-text)]'
            }`}
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
            <span>Reverse Charge (RCM) Rules</span>
          </button>
        </div>

        <div className="hidden sm:flex items-center gap-3 font-mono text-[11px] text-[var(--erp-muted)] pr-2">
          <span>Active FY: 2025-26</span>
          <span>•</span>
          <span className="text-[var(--erp-positive)] flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> E-Invoicing v1.04 Compatible
          </span>
        </div>
      </div>

      {selectedTab === 'slabs' && (
        <>
          {/* Search bar */}
          <div className="relative bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] p-3">
            <Search className="w-4 h-4 text-[var(--erp-muted)] absolute left-6 top-5" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search tax tariff by code, description, or textile HSN chapter..."
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] focus:border-[var(--erp-gold)] focus:outline-none font-mono"
            />
          </div>

          {/* Slabs Data Table */}
          <DataTable
            columns={columns}
            data={filteredSlabs}
            keyExtractor={r => r.id}
          />
        </>
      )}

      {selectedTab === 'calculator' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Inputs Card */}
          <div className="lg:col-span-6 bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] p-6 flex flex-col gap-5">
            <div className="border-b border-[var(--erp-hairline)] pb-3">
              <h3 className="font-display text-base font-bold text-[var(--erp-text)]">
                Textile Invoice GST Calculator Simulator
              </h3>
              <p className="font-body text-xs text-[var(--erp-muted)]">
                Simulate exact statutory tax splits for intra-state (Gujarat local) and inter-state dispatches.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block font-mono text-xs text-[var(--erp-muted)] mb-1">
                  Assessable / Taxable Fabric Amount (₹)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-sm font-mono text-[var(--erp-muted)]">₹</span>
                  <input
                    type="number"
                    value={calcAssessableVal}
                    onChange={e => setCalcAssessableVal(parseFloat(e.target.value) || 0)}
                    className="w-full pl-8 pr-3 py-2 text-sm font-mono bg-[var(--erp-surface-2)] border border-[var(--erp-hairline-strong)] text-[var(--erp-text)] focus:border-[var(--erp-gold)] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-mono text-xs text-[var(--erp-muted)] mb-1">
                  Applicable GST Tariff Slab
                </label>
                <select
                  value={calcSlabCode}
                  onChange={e => setCalcSlabCode(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono bg-[var(--erp-surface-2)] border border-[var(--erp-hairline-strong)] text-[var(--erp-text)] focus:border-[var(--erp-gold)] focus:outline-none"
                >
                  {slabs.map(s => (
                    <option key={s.id} value={s.code}>
                      {s.code} • {s.name} ({s.totalGstPercent}%)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-mono text-xs text-[var(--erp-muted)] mb-1">
                  Supply Destination & Jurisdiction
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setCalcTxType('intra')}
                    className={`p-3 text-left border cursor-pointer transition-colors ${
                      calcTxType === 'intra'
                        ? 'border-[var(--erp-gold)] bg-[var(--erp-surface-2)] text-[var(--erp-text)]'
                        : 'border-[var(--erp-hairline)] bg-[var(--erp-surface)] text-[var(--erp-muted)] hover:border-[var(--erp-gold-soft)]'
                    }`}
                  >
                    <span className="font-mono text-xs font-bold block text-[var(--erp-gold)]">
                      Intra-State (Gujarat Local)
                    </span>
                    <span className="font-body text-[11px] text-[var(--erp-muted)]">
                      CGST ({selectedCalcSlab.cgstPercent}%) + SGST ({selectedCalcSlab.sgstPercent}%)
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCalcTxType('inter')}
                    className={`p-3 text-left border cursor-pointer transition-colors ${
                      calcTxType === 'inter'
                        ? 'border-[var(--erp-gold)] bg-[var(--erp-surface-2)] text-[var(--erp-text)]'
                        : 'border-[var(--erp-hairline)] bg-[var(--erp-surface)] text-[var(--erp-muted)] hover:border-[var(--erp-gold-soft)]'
                    }`}
                  >
                    <span className="font-mono text-xs font-bold block text-[var(--erp-gold)]">
                      Inter-State (Outside Gujarat)
                    </span>
                    <span className="font-body text-[11px] text-[var(--erp-muted)]">
                      IGST ({selectedCalcSlab.igstPercent}%)
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Right Calculation Receipt Breakdown */}
          <div className="lg:col-span-6 bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] p-6 flex flex-col justify-between">
            <div>
              <div className="border-b border-[var(--erp-hairline)] pb-3 flex items-center justify-between">
                <div>
                  <span className="font-mono text-[10px] text-[var(--erp-gold)] uppercase tracking-wider block">
                    TAX AUDIT COMPUTATION
                  </span>
                  <h4 className="font-display text-base font-bold text-[var(--erp-text)]">
                    Estimated Tax Invoice Total
                  </h4>
                </div>
                <span className="font-mono text-xs px-2 py-0.5 bg-[var(--erp-surface-2)] border border-[var(--erp-gold)] text-[var(--erp-gold)]">
                  {selectedCalcSlab.code}
                </span>
              </div>

              <div className="divide-y divide-[var(--erp-hairline)] mt-4 font-mono text-xs">
                <div className="py-2.5 flex justify-between">
                  <span className="text-[var(--erp-muted)]">Taxable Goods Value</span>
                  <span className="text-[var(--erp-text)] font-semibold">
                    ₹{calcAssessableVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>

                {calcTxType === 'intra' ? (
                  <>
                    <div className="py-2.5 flex justify-between">
                      <span className="text-[var(--erp-muted)]">
                        Central GST (CGST @ {selectedCalcSlab.cgstPercent}%)
                      </span>
                      <span className="text-[var(--erp-gold)] font-medium">
                        + ₹{calcCgstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="py-2.5 flex justify-between">
                      <span className="text-[var(--erp-muted)]">
                        State GST (SGST @ {selectedCalcSlab.sgstPercent}%)
                      </span>
                      <span className="text-[var(--erp-gold)] font-medium">
                        + ₹{calcSgstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="py-2.5 flex justify-between">
                    <span className="text-[var(--erp-muted)]">
                      Integrated GST (IGST @ {selectedCalcSlab.igstPercent}%)
                    </span>
                    <span className="text-[var(--erp-gold)] font-medium">
                      + ₹{calcIgstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                )}

                <div className="py-3 flex justify-between bg-[var(--erp-surface-2)] px-3 mt-2 border border-[var(--erp-hairline)] font-bold">
                  <span className="text-[var(--erp-text)]">Total GST Accrual:</span>
                  <span className="text-[var(--erp-gold)]">
                    ₹{calcTotalTax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="py-3 flex justify-between bg-[var(--erp-surface)] px-3 mt-2 border border-[var(--erp-gold)] text-sm font-bold">
                  <span className="text-[var(--erp-text)] font-display">Net Invoice Receivable:</span>
                  <span className="text-[var(--erp-gold)]">
                    ₹{calcTotalInvoice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-4 p-3 bg-[var(--erp-surface-2)]/60 border border-[var(--erp-hairline)] flex items-center gap-2 text-[11px] font-body text-[var(--erp-muted)]">
              <Info className="w-4 h-4 text-[var(--erp-gold)] shrink-0" />
              <span>
                Statutory Gazette notification: {selectedCalcSlab.statutoryNotification}. Effective from {selectedCalcSlab.effectiveFrom}.
              </span>
            </div>
          </div>
        </div>
      )}

      {selectedTab === 'rcm' && (
        <div className="bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] p-6 space-y-6">
          <div className="border-b border-[var(--erp-hairline)] pb-3">
            <h3 className="font-display text-base font-bold text-[var(--erp-text)]">
              Reverse Charge Mechanism (RCM) Textile Statutory Mandates
            </h3>
            <p className="font-body text-xs text-[var(--erp-muted)]">
              Under GST Section 9(3) & 9(4), tax liability shifts to the recipient buyer under specific conditions.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 border border-[var(--erp-hairline)] bg-[var(--erp-surface-2)]">
              <span className="font-mono text-xs text-[var(--erp-gold)] font-semibold block mb-1">
                RULE 1: RAW COTTON INWARD
              </span>
              <h4 className="font-display text-sm font-bold text-[var(--erp-text)] mb-2">
                Raw Cotton Bales from Agriculturists
              </h4>
              <p className="font-body text-xs text-[var(--erp-muted)] leading-relaxed">
                Purchases of raw seed cotton (Kapas) directly from farmers/agriculturists attract 5% GST under RCM. The purchasing agency must deposit tax via cash ledger and claim ITC in GSTR-3B.
              </p>
              <span className="inline-block mt-3 text-[10px] font-mono bg-[var(--erp-surface)] px-2 py-0.5 border border-[var(--erp-hairline)] text-[var(--erp-text)]">
                Notif. 4/2017 - Central Tax (Rate)
              </span>
            </div>

            <div className="p-4 border border-[var(--erp-hairline)] bg-[var(--erp-surface-2)]">
              <span className="font-mono text-xs text-[var(--erp-gold)] font-semibold block mb-1">
                RULE 2: GOODS TRANSPORT (GTA)
              </span>
              <h4 className="font-display text-sm font-bold text-[var(--erp-text)] mb-2">
                Freight & Tempo Transport (SAC 9965)
              </h4>
              <p className="font-body text-xs text-[var(--erp-muted)] leading-relaxed">
                When GTA transporters do not charge 12% forward charge GST, the recipient mill/agency must discharge 5% RCM GST on all lorry receipts (Bilty) and freight vouchers exceeding statutory thresholds.
              </p>
              <span className="inline-block mt-3 text-[10px] font-mono bg-[var(--erp-surface)] px-2 py-0.5 border border-[var(--erp-hairline)] text-[var(--erp-text)]">
                Notif. 13/2017 - Central Tax (Rate)
              </span>
            </div>

            <div className="p-4 border border-[var(--erp-hairline)] bg-[var(--erp-surface-2)]">
              <span className="font-mono text-xs text-[var(--erp-gold)] font-semibold block mb-1">
                RULE 3: BROKERAGE & UNREGISTERED
              </span>
              <h4 className="font-display text-sm font-bold text-[var(--erp-text)] mb-2">
                Sub-broker Intermediaries
              </h4>
              <p className="font-body text-xs text-[var(--erp-muted)] leading-relaxed">
                Sub-commission and commercial intermediary fees paid to individuals or non-registered brokers require TDS deduction under Section 194H at 5% plus statutory reverse tax review.
              </p>
              <span className="inline-block mt-3 text-[10px] font-mono bg-[var(--erp-surface)] px-2 py-0.5 border border-[var(--erp-hairline)] text-[var(--erp-text)]">
                SAC 9961 / Sec 194H Income Tax
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Modal for Add/Edit Tax Slab */}
      {isModalOpen && editingSlab && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="w-full max-w-xl bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] p-6 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-[var(--erp-hairline)]">
              <div className="flex items-center gap-2">
                <Percent className="w-4 h-4 text-[var(--erp-gold)]" />
                <h3 className="font-display text-base font-bold text-[var(--erp-text)]">
                  {editingSlab.id && slabs.some(s => s.id === editingSlab.id) ? 'Modify Tax Slab' : 'Create New GST Tariff Slab'}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-[var(--erp-muted)] hover:text-[var(--erp-text)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveSlab} className="space-y-4 text-left">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-mono text-xs text-[var(--erp-muted)] mb-1">
                    Tariff Code
                  </label>
                  <input
                    type="text"
                    required
                    value={editingSlab.code || ''}
                    onChange={e => setEditingSlab({ ...editingSlab, code: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs font-mono bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] focus:border-[var(--erp-gold)] focus:outline-none"
                    placeholder="e.g. GST-05-TEX"
                  />
                </div>
                <div>
                  <label className="block font-mono text-xs text-[var(--erp-muted)] mb-1">
                    Total GST Percentage (%)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={editingSlab.totalGstPercent ?? 5}
                    onChange={e => {
                      const total = parseFloat(e.target.value) || 0;
                      setEditingSlab({
                        ...editingSlab,
                        totalGstPercent: total,
                        cgstPercent: total / 2,
                        sgstPercent: total / 2,
                        igstPercent: total
                      });
                    }}
                    className="w-full px-3 py-1.5 text-xs font-mono bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] focus:border-[var(--erp-gold)] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-mono text-xs text-[var(--erp-muted)] mb-1">
                  Slab Title & Description
                </label>
                <input
                  type="text"
                  required
                  value={editingSlab.name || ''}
                  onChange={e => setEditingSlab({ ...editingSlab, name: e.target.value })}
                  className="w-full px-3 py-1.5 text-xs font-body bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] focus:border-[var(--erp-gold)] focus:outline-none"
                  placeholder="e.g. Woven Cotton Fabrics & Grey Weaves"
                />
              </div>

              <div className="grid grid-cols-3 gap-3 p-3 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)]">
                <div>
                  <label className="block font-mono text-[11px] text-[var(--erp-muted)] mb-1">CGST (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editingSlab.cgstPercent ?? 2.5}
                    onChange={e => setEditingSlab({ ...editingSlab, cgstPercent: parseFloat(e.target.value) || 0 })}
                    className="w-full px-2 py-1 text-xs font-mono bg-[var(--erp-surface)] border border-[var(--erp-hairline)] text-[var(--erp-text)]"
                  />
                </div>
                <div>
                  <label className="block font-mono text-[11px] text-[var(--erp-muted)] mb-1">SGST (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editingSlab.sgstPercent ?? 2.5}
                    onChange={e => setEditingSlab({ ...editingSlab, sgstPercent: parseFloat(e.target.value) || 0 })}
                    className="w-full px-2 py-1 text-xs font-mono bg-[var(--erp-surface)] border border-[var(--erp-hairline)] text-[var(--erp-text)]"
                  />
                </div>
                <div>
                  <label className="block font-mono text-[11px] text-[var(--erp-muted)] mb-1">IGST (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editingSlab.igstPercent ?? 5}
                    onChange={e => setEditingSlab({ ...editingSlab, igstPercent: parseFloat(e.target.value) || 0 })}
                    className="w-full px-2 py-1 text-xs font-mono bg-[var(--erp-surface)] border border-[var(--erp-hairline)] text-[var(--erp-text)]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-mono text-xs text-[var(--erp-muted)] mb-1">
                  HSN / Tariff Head Coverage
                </label>
                <input
                  type="text"
                  value={editingSlab.hsnCoverage || ''}
                  onChange={e => setEditingSlab({ ...editingSlab, hsnCoverage: e.target.value })}
                  className="w-full px-3 py-1.5 text-xs font-mono bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] focus:border-[var(--erp-gold)] focus:outline-none"
                  placeholder="e.g. 5208, 5209, 5407 (Woven Fabrics)"
                />
              </div>

              <div>
                <label className="block font-mono text-xs text-[var(--erp-muted)] mb-1">
                  Statutory Notification & Gazette Reference
                </label>
                <input
                  type="text"
                  value={editingSlab.statutoryNotification || ''}
                  onChange={e => setEditingSlab({ ...editingSlab, statutoryNotification: e.target.value })}
                  className="w-full px-3 py-1.5 text-xs font-mono bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] focus:border-[var(--erp-gold)] focus:outline-none"
                  placeholder="e.g. Notification 1/2017 - Central Tax (Rate)"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="rcmCheck"
                  checked={editingSlab.rcmApplicable || false}
                  onChange={e => setEditingSlab({ ...editingSlab, rcmApplicable: e.target.checked })}
                  className="accent-[var(--erp-gold)] cursor-pointer"
                />
                <label htmlFor="rcmCheck" className="text-xs font-mono text-[var(--erp-text)] cursor-pointer select-none">
                  Reverse Charge Mechanism (RCM) applies to this slab
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--erp-hairline)]">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-1.5 border border-[var(--erp-hairline)] text-xs font-mono text-[var(--erp-muted)] hover:text-[var(--erp-text)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[var(--erp-gold)] text-[#0F141B] font-body text-xs font-semibold hover:bg-[var(--erp-gold-soft)] transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" /> Save Tariff Slab
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
