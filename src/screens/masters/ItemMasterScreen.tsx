import React, { useState } from 'react';
import { useErp } from '../../context/ErpContext';
import { PageHeader } from '../../components/common/PageHeader';
import { DataTable, Column } from '../../components/common/DataTable';
import { StatusChip } from '../../components/common/StatusChip';
import { ErpItem } from '../../types/erp';
import { 
  Package, 
  Plus, 
  Edit2, 
  Search, 
  X, 
  Boxes, 
  FileSpreadsheet, 
  TrendingUp, 
  Layers, 
  Eye, 
  Save, 
  Sparkles,
  CheckCircle2
} from 'lucide-react';

export interface ExtendedItem extends ErpItem {
  category: 'Cotton Grey' | 'Rayon Viscose' | 'Finished Fabric' | 'Yarn' | 'Jacquard';
  widthInches: number;
  stockMeters: number;
  moqMeters: number;
  millOrigin: string;
  status: 'active' | 'discontinued';
}

const INITIAL_EXTENDED_ITEMS: ExtendedItem[] = [
  {
    id: 'IT-001',
    sku: 'COT-GREY-6060',
    description: 'Cotton Grey Cambric Fabric (Loom State)',
    construction: '60s x 60s / 92x88 58" Reed-Pick',
    hsn: '52081200',
    unit: 'Meters',
    baseRatePerMeter: 48.50,
    taxSlabPercent: 5,
    category: 'Cotton Grey',
    widthInches: 58,
    stockMeters: 28400,
    moqMeters: 1000,
    millOrigin: 'Reliance Weaving (Surat)',
    status: 'active'
  },
  {
    id: 'IT-002',
    sku: 'COT-POP-4040',
    description: 'Cotton Poplin Bleached Ready-to-Print',
    construction: '40s x 40s / 100x80 44" High Density',
    hsn: '52082200',
    unit: 'Meters',
    baseRatePerMeter: 58.00,
    taxSlabPercent: 5,
    category: 'Cotton Grey',
    widthInches: 44,
    stockMeters: 18200,
    moqMeters: 1200,
    millOrigin: 'Arvind Mills (Ahmedabad)',
    status: 'active'
  },
  {
    id: 'IT-003',
    sku: 'RAY-SLUB-14',
    description: 'Rayon Viscose Heavy Slub Base',
    construction: '14s Rayon Slub x 14s / 68x56 54"',
    hsn: '54082210',
    unit: 'Meters',
    baseRatePerMeter: 62.00,
    taxSlabPercent: 12,
    category: 'Rayon Viscose',
    widthInches: 54,
    stockMeters: 14600,
    moqMeters: 800,
    millOrigin: 'Radhe Dyeing & Weaving',
    status: 'active'
  },
  {
    id: 'IT-004',
    sku: 'YRN-SPN-30S',
    description: 'Combed Cotton Warp Cone Yarn',
    construction: '30/1 Ne Ring Spun 100% Cotton Autocoro',
    hsn: '52052300',
    unit: 'Kgs',
    baseRatePerMeter: 310.00,
    taxSlabPercent: 5,
    category: 'Yarn',
    widthInches: 0,
    stockMeters: 4200,
    moqMeters: 500,
    millOrigin: 'Saurashtra Spinning Mills',
    status: 'active'
  },
  {
    id: 'IT-005',
    sku: 'JAC-BUTTA-44',
    description: 'Pure Viscose Zari Butta Jacquard',
    construction: 'Zari Weft x 30s Viscose / Electronic Jacquard',
    hsn: '54083300',
    unit: 'Meters',
    baseRatePerMeter: 124.00,
    taxSlabPercent: 12,
    category: 'Jacquard',
    widthInches: 44,
    stockMeters: 8900,
    moqMeters: 600,
    millOrigin: 'Surat Jacquard Park',
    status: 'active'
  },
  {
    id: 'IT-006',
    sku: 'FIN-SATIN-80',
    description: 'Reactive Printed Modal Satin',
    construction: '80s Micro Modal / 140 GSM Silk Luster Finish',
    hsn: '54082400',
    unit: 'Meters',
    baseRatePerMeter: 94.00,
    taxSlabPercent: 12,
    category: 'Finished Fabric',
    widthInches: 56,
    stockMeters: 11200,
    moqMeters: 500,
    millOrigin: 'Narol GIDC Processing Node',
    status: 'active'
  }
];

export const ItemMasterScreen: React.FC = () => {
  const { showFlash, addAuditLog } = useErp();

  const [itemList, setItemList] = useState<ExtendedItem[]>(INITIAL_EXTENDED_ITEMS);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Partial<ExtendedItem> | null>(null);
  const [inspectingItem, setInspectingItem] = useState<ExtendedItem | null>(null);

  const filteredItems = itemList.filter(i => {
    const matchCat = categoryFilter === 'All' || i.category === categoryFilter;
    const matchSearch =
      i.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      i.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      i.hsn.includes(searchTerm) ||
      i.construction.toLowerCase().includes(searchTerm.toLowerCase());
    return matchCat && matchSearch;
  });

  const totalYardage = itemList.reduce((acc, i) => acc + (i.unit === 'Meters' ? i.stockMeters : 0), 0);
  const totalStockValuation = itemList.reduce((acc, i) => acc + (i.stockMeters * i.baseRatePerMeter), 0);
  const avgRate = itemList.length > 0 ? itemList.reduce((acc, i) => acc + i.baseRatePerMeter, 0) / itemList.length : 0;

  const handleOpenCreate = () => {
    setEditingItem({
      id: `IT-${Math.floor(100 + Math.random() * 900)}`,
      sku: 'COT-TWILL-40',
      description: 'Cotton Twill Weave 2/1 Heavy',
      construction: '40s x 30s / 104x58 58"',
      hsn: '52081300',
      unit: 'Meters',
      baseRatePerMeter: 54.00,
      taxSlabPercent: 5,
      category: 'Cotton Grey',
      widthInches: 58,
      stockMeters: 5000,
      moqMeters: 1000,
      millOrigin: 'Surat Ring Road Weaving',
      status: 'active'
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (item: ExtendedItem) => {
    setEditingItem({ ...item });
    setIsModalOpen(true);
  };

  const handleSaveItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem || !editingItem.sku) return;

    const exists = itemList.some(i => i.id === editingItem.id);
    if (exists) {
      setItemList(prev => prev.map(i => (i.id === editingItem.id ? (editingItem as ExtendedItem) : i)));
      addAuditLog('Updated Item Master Fabric SKU', 'Item Master', `Updated SKU ${editingItem.sku}`, 'notice');
      showFlash(`SKU ${editingItem.sku} updated`, 'positive');
    } else {
      setItemList(prev => [editingItem as ExtendedItem, ...prev]);
      addAuditLog('Registered New Fabric SKU', 'Item Master', `Registered SKU ${editingItem.sku}`, 'info');
      showFlash(`New SKU ${editingItem.sku} registered`, 'positive');
    }
    setIsModalOpen(false);
  };

  const handleToggleStatus = (id: string) => {
    setItemList(prev =>
      prev.map(i => {
        if (i.id === id) {
          const nextStatus = i.status === 'active' ? 'discontinued' : 'active';
          showFlash(`SKU ${i.sku} status toggled to ${nextStatus.toUpperCase()}`, 'gold');
          return { ...i, status: nextStatus };
        }
        return i;
      })
    );
  };

  const columns: Column<ExtendedItem>[] = [
    {
      header: 'Item ID',
      accessorKey: 'id',
      mono: true,
      width: '85px',
      render: r => <span className="font-mono text-[var(--erp-gold)] font-medium">{r.id}</span>
    },
    {
      header: 'Fabric SKU Code',
      accessorKey: 'sku',
      mono: true,
      width: '160px',
      render: r => (
        <div>
          <span className="font-mono text-sm font-bold text-[var(--erp-text)]">{r.sku}</span>
          <span className="text-[10px] font-mono text-[var(--erp-gold)] block">{r.category}</span>
        </div>
      )
    },
    {
      header: 'Description & Construction Specs',
      accessorKey: 'description',
      render: r => (
        <div>
          <span className="font-body font-medium text-[var(--erp-text)]">{r.description}</span>
          <span className="text-[11px] font-mono text-[var(--erp-muted)] block">
            Specs: {r.construction} • Width: {r.widthInches > 0 ? `${r.widthInches}"` : 'N/A'}
          </span>
        </div>
      )
    },
    {
      header: 'HSN / GST',
      accessorKey: 'hsn',
      mono: true,
      width: '120px',
      render: r => (
        <div>
          <span className="font-mono text-xs text-[var(--erp-text)]">{r.hsn}</span>
          <span className="text-[10px] font-mono text-[var(--erp-gold)] block">
            GST: {r.taxSlabPercent}%
          </span>
        </div>
      )
    },
    {
      header: 'Base Rate',
      accessorKey: 'baseRatePerMeter',
      align: 'right',
      mono: true,
      width: '110px',
      render: r => (
        <span className="font-mono font-semibold text-right text-[var(--erp-text)] block">
          ₹{r.baseRatePerMeter.toFixed(2)}/{r.unit === 'Meters' ? 'm' : 'kg'}
        </span>
      )
    },
    {
      header: 'Stock Level',
      accessorKey: 'stockMeters',
      align: 'right',
      mono: true,
      width: '120px',
      render: r => (
        <div className="text-right">
          <span className="font-mono text-xs text-[var(--erp-positive)] font-bold block">
            {r.stockMeters.toLocaleString('en-IN')} {r.unit}
          </span>
          <span className="text-[10px] font-mono text-[var(--erp-muted)]">
            Val: ₹{((r.stockMeters * r.baseRatePerMeter) / 100000).toFixed(2)} L
          </span>
        </div>
      )
    },
    {
      header: 'Status',
      align: 'center',
      width: '90px',
      render: r => (
        <button
          onClick={() => handleToggleStatus(r.id)}
          className="cursor-pointer"
          title="Toggle status"
        >
          <StatusChip status={r.status === 'active' ? 'cleared' : 'muted'} label={r.status.toUpperCase()} />
        </button>
      )
    },
    {
      header: 'Actions',
      align: 'right',
      width: '90px',
      render: r => (
        <div className="flex items-center justify-end gap-1.5">
          <button
            onClick={() => setInspectingItem(r)}
            className="p-1 text-[var(--erp-muted)] hover:text-[var(--erp-gold)] transition-colors cursor-pointer"
            title="Inspect Details"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => handleOpenEdit(r)}
            className="p-1 text-[var(--erp-muted)] hover:text-[var(--erp-gold)] transition-colors cursor-pointer"
            title="Edit Item"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )
    }
  ];

  return (
    <div className="p-6 flex flex-col gap-6 text-left">
      {/* Unified Page Header */}
      <PageHeader
        moduleNumber="21"
        section="Masters"
        title="Item Master & Quality Catalogue"
        subtitle="Fabric SKU registry, loom warp/weft construction specifications, statutory HSN codes, base rates, and inventory thresholds."
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => showFlash('Item catalogue exported to CSV/Excel format', 'gold')}
              className="px-3 py-1.5 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] hover:border-[var(--erp-gold)] font-mono text-xs text-[var(--erp-text)] flex items-center gap-1.5 cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-[var(--erp-gold)]" /> Export CSV
            </button>
            <button
              onClick={handleOpenCreate}
              className="px-4 py-1.5 bg-[var(--erp-gold)] text-[#0F141B] font-body text-xs font-semibold hover:bg-[var(--erp-gold-soft)] transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> New Fabric SKU
            </button>
          </div>
        }
      />

      {/* KPI Overview Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-3.5 border border-[var(--erp-hairline)] bg-[var(--erp-surface)]">
          <span className="text-[11px] font-mono text-[var(--erp-muted)] block">ACTIVE FABRIC SKUS</span>
          <span className="font-mono text-lg font-bold text-[var(--erp-text)]">{itemList.length} Styles</span>
        </div>
        <div className="p-3.5 border border-[var(--erp-hairline)] bg-[var(--erp-surface)]">
          <span className="text-[11px] font-mono text-[var(--erp-muted)] block">TOTAL STOCK YARDAGE</span>
          <span className="font-mono text-lg font-bold text-[var(--erp-gold)]">
            {(totalYardage / 100000).toFixed(2)} Lakh Mtr
          </span>
        </div>
        <div className="p-3.5 border border-[var(--erp-hairline)] bg-[var(--erp-surface)]">
          <span className="text-[11px] font-mono text-[var(--erp-muted)] block">STOCK VALUATION (AT BASE)</span>
          <span className="font-mono text-lg font-bold text-[var(--erp-positive)]">
            ₹{(totalStockValuation / 100000).toFixed(2)} Lakh
          </span>
        </div>
        <div className="p-3.5 border border-[var(--erp-hairline)] bg-[var(--erp-surface)]">
          <span className="text-[11px] font-mono text-[var(--erp-muted)] block">AVERAGE REALIZATION / MTR</span>
          <span className="font-mono text-lg font-bold text-[var(--erp-text)]">
            ₹{avgRate.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Category Pills & Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] p-3">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 text-[var(--erp-muted)] absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search SKU code, description, HSN or reed-pick..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] focus:border-[var(--erp-gold)] focus:outline-none font-mono"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0 font-mono text-xs">
          {(['All', 'Cotton Grey', 'Rayon Viscose', 'Finished Fabric', 'Yarn', 'Jacquard'] as const).map(cat => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1 border whitespace-nowrap transition-colors cursor-pointer ${
                categoryFilter === cat
                  ? 'bg-[var(--erp-surface-2)] border-[var(--erp-gold)] text-[var(--erp-gold)] font-bold'
                  : 'bg-[var(--erp-surface)] border-[var(--erp-hairline)] text-[var(--erp-muted)] hover:text-[var(--erp-text)]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Data Table */}
      <DataTable
        columns={columns}
        data={filteredItems}
        keyExtractor={r => r.id}
      />

      {/* Detail Inspection Drawer Modal */}
      {inspectingItem && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] p-6 shadow-2xl animate-in zoom-in-95 duration-150 text-left">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-[var(--erp-hairline)]">
              <div>
                <span className="font-mono text-[10px] text-[var(--erp-gold)] uppercase tracking-wider block">
                  TEXTILE SKU SPECIFICATION SHEET
                </span>
                <h3 className="font-display text-lg font-bold text-[var(--erp-text)]">
                  {inspectingItem.sku}
                </h3>
              </div>
              <button
                onClick={() => setInspectingItem(null)}
                className="p-1 text-[var(--erp-muted)] hover:text-[var(--erp-text)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 font-mono text-xs">
              <div className="p-3 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)]">
                <span className="text-[var(--erp-muted)] block text-[11px]">Item Description</span>
                <span className="font-body text-sm font-semibold text-[var(--erp-text)]">
                  {inspectingItem.description}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-2.5 border border-[var(--erp-hairline)] bg-[var(--erp-surface-2)]">
                  <span className="text-[var(--erp-muted)] text-[10px] block">CONSTRUCTION SPECS</span>
                  <span className="font-semibold text-[var(--erp-text)]">{inspectingItem.construction}</span>
                </div>
                <div className="p-2.5 border border-[var(--erp-hairline)] bg-[var(--erp-surface-2)]">
                  <span className="text-[var(--erp-muted)] text-[10px] block">WIDTH (INCHES)</span>
                  <span className="font-semibold text-[var(--erp-text)]">{inspectingItem.widthInches}" Inches</span>
                </div>
                <div className="p-2.5 border border-[var(--erp-hairline)] bg-[var(--erp-surface-2)]">
                  <span className="text-[var(--erp-muted)] text-[10px] block">HSN CODE</span>
                  <span className="font-semibold text-[var(--erp-text)]">{inspectingItem.hsn}</span>
                </div>
                <div className="p-2.5 border border-[var(--erp-hairline)] bg-[var(--erp-surface-2)]">
                  <span className="text-[var(--erp-muted)] text-[10px] block">STATUTORY GST SLAB</span>
                  <span className="font-semibold text-[var(--erp-gold)]">{inspectingItem.taxSlabPercent}% GST</span>
                </div>
                <div className="p-2.5 border border-[var(--erp-hairline)] bg-[var(--erp-surface-2)]">
                  <span className="text-[var(--erp-muted)] text-[10px] block">BASE RATE / UNIT</span>
                  <span className="font-semibold text-[var(--erp-text)]">₹{inspectingItem.baseRatePerMeter.toFixed(2)}</span>
                </div>
                <div className="p-2.5 border border-[var(--erp-hairline)] bg-[var(--erp-surface-2)]">
                  <span className="text-[var(--erp-muted)] text-[10px] block">CURRENT PHYSICAL STOCK</span>
                  <span className="font-semibold text-[var(--erp-positive)]">{inspectingItem.stockMeters.toLocaleString('en-IN')} {inspectingItem.unit}</span>
                </div>
              </div>

              <div className="p-3 bg-[var(--erp-surface-2)]/60 border border-[var(--erp-hairline)] flex justify-between items-center">
                <span className="text-[var(--erp-muted)]">Estimated Yard Stock Value:</span>
                <span className="font-bold text-[var(--erp-gold)] text-sm">
                  ₹{(inspectingItem.stockMeters * inspectingItem.baseRatePerMeter).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={() => {
                    const it = inspectingItem;
                    setInspectingItem(null);
                    handleOpenEdit(it);
                  }}
                  className="px-4 py-1.5 bg-[var(--erp-gold)] text-[#0F141B] font-body text-xs font-semibold hover:bg-[var(--erp-gold-soft)] cursor-pointer flex items-center gap-1.5"
                >
                  <Edit2 className="w-3.5 h-3.5" /> Edit Fabric SKU
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit SKU Modal */}
      {isModalOpen && editingItem && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="w-full max-w-2xl bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] p-6 shadow-2xl animate-in zoom-in-95 duration-150 text-left">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-[var(--erp-hairline)]">
              <div className="flex items-center gap-2">
                <Boxes className="w-4 h-4 text-[var(--erp-gold)]" />
                <h3 className="font-display text-base font-bold text-[var(--erp-text)]">
                  {editingItem.id && itemList.some(i => i.id === editingItem.id) ? 'Modify Fabric SKU' : 'Register New Fabric SKU'}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-[var(--erp-muted)] hover:text-[var(--erp-text)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveItem} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block font-mono text-xs text-[var(--erp-muted)] mb-1">
                    Fabric SKU Code *
                  </label>
                  <input
                    type="text"
                    required
                    value={editingItem.sku || ''}
                    onChange={e => setEditingItem({ ...editingItem, sku: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs font-mono bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] focus:border-[var(--erp-gold)] focus:outline-none"
                    placeholder="e.g. COT-GREY-6060"
                  />
                </div>

                <div>
                  <label className="block font-mono text-xs text-[var(--erp-muted)] mb-1">
                    Category Classification
                  </label>
                  <select
                    value={editingItem.category || 'Cotton Grey'}
                    onChange={e => setEditingItem({ ...editingItem, category: e.target.value as any })}
                    className="w-full px-3 py-1.5 text-xs font-mono bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] focus:border-[var(--erp-gold)] focus:outline-none"
                  >
                    <option value="Cotton Grey">Cotton Grey</option>
                    <option value="Rayon Viscose">Rayon Viscose</option>
                    <option value="Finished Fabric">Finished Fabric</option>
                    <option value="Yarn">Yarn</option>
                    <option value="Jacquard">Jacquard</option>
                  </select>
                </div>

                <div>
                  <label className="block font-mono text-xs text-[var(--erp-muted)] mb-1">
                    HSN Tariff Code *
                  </label>
                  <input
                    type="text"
                    required
                    value={editingItem.hsn || ''}
                    onChange={e => setEditingItem({ ...editingItem, hsn: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs font-mono bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] focus:border-[var(--erp-gold)] focus:outline-none"
                    placeholder="e.g. 52081200"
                  />
                </div>
              </div>

              <div>
                <label className="block font-mono text-xs text-[var(--erp-muted)] mb-1">
                  Full Fabric Trade Description *
                </label>
                <input
                  type="text"
                  required
                  value={editingItem.description || ''}
                  onChange={e => setEditingItem({ ...editingItem, description: e.target.value })}
                  className="w-full px-3 py-1.5 text-xs font-body bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] focus:border-[var(--erp-gold)] focus:outline-none"
                  placeholder="e.g. Pure Cotton Cambric Loom State Grey Fabric"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-mono text-xs text-[var(--erp-muted)] mb-1">
                    Warp/Weft Construction Specs
                  </label>
                  <input
                    type="text"
                    value={editingItem.construction || ''}
                    onChange={e => setEditingItem({ ...editingItem, construction: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs font-mono bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] focus:border-[var(--erp-gold)] focus:outline-none"
                    placeholder="e.g. 60s x 60s / 92x88 58''"
                  />
                </div>

                <div>
                  <label className="block font-mono text-xs text-[var(--erp-muted)] mb-1">
                    Width (Inches)
                  </label>
                  <input
                    type="number"
                    value={editingItem.widthInches ?? 58}
                    onChange={e => setEditingItem({ ...editingItem, widthInches: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-1.5 text-xs font-mono bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] focus:border-[var(--erp-gold)] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 p-3 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)]">
                <div>
                  <label className="block font-mono text-[11px] text-[var(--erp-muted)] mb-1">
                    Base Rate (₹)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={editingItem.baseRatePerMeter ?? 50}
                    onChange={e => setEditingItem({ ...editingItem, baseRatePerMeter: parseFloat(e.target.value) || 0 })}
                    className="w-full px-2 py-1 text-xs font-mono bg-[var(--erp-surface)] border border-[var(--erp-hairline)] text-[var(--erp-text)]"
                  />
                </div>

                <div>
                  <label className="block font-mono text-[11px] text-[var(--erp-muted)] mb-1">
                    GST Rate (%)
                  </label>
                  <select
                    value={editingItem.taxSlabPercent ?? 5}
                    onChange={e => setEditingItem({ ...editingItem, taxSlabPercent: parseFloat(e.target.value) || 5 })}
                    className="w-full px-2 py-1 text-xs font-mono bg-[var(--erp-surface)] border border-[var(--erp-hairline)] text-[var(--erp-text)]"
                  >
                    <option value="0">0% (Exempt)</option>
                    <option value="5">5% (Fabrics)</option>
                    <option value="12">12% (Processed)</option>
                    <option value="18">18% (GTA/Service)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-mono text-[11px] text-[var(--erp-muted)] mb-1">
                    Stock Quantity
                  </label>
                  <input
                    type="number"
                    value={editingItem.stockMeters ?? 0}
                    onChange={e => setEditingItem({ ...editingItem, stockMeters: parseFloat(e.target.value) || 0 })}
                    className="w-full px-2 py-1 text-xs font-mono bg-[var(--erp-surface)] border border-[var(--erp-hairline)] text-[var(--erp-text)]"
                  />
                </div>

                <div>
                  <label className="block font-mono text-[11px] text-[var(--erp-muted)] mb-1">
                    Unit
                  </label>
                  <select
                    value={editingItem.unit || 'Meters'}
                    onChange={e => setEditingItem({ ...editingItem, unit: e.target.value })}
                    className="w-full px-2 py-1 text-xs font-mono bg-[var(--erp-surface)] border border-[var(--erp-hairline)] text-[var(--erp-text)]"
                  >
                    <option value="Meters">Meters</option>
                    <option value="Kgs">Kgs</option>
                    <option value="Bales">Bales</option>
                    <option value="Taka">Taka</option>
                  </select>
                </div>
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
                  <Save className="w-3.5 h-3.5" /> Save SKU Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
