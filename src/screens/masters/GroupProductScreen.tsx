import React, { useState } from 'react';
import { useErp } from '../../context/ErpContext';
import { PageHeader } from '../../components/common/PageHeader';
import { DataTable, Column } from '../../components/common/DataTable';
import { StatusChip } from '../../components/common/StatusChip';
import { FolderTree, Plus, Filter, Tag, Layers, Search, CheckCircle2 } from 'lucide-react';

interface ProductGroup {
  id: string;
  code: string;
  category: 'Greige' | 'Yarn' | 'Finished Fabric' | 'Processing';
  groupName: string;
  standardConstruction: string;
  hsnChapter: string;
  gsmRange: string;
  activeSkusCount: number;
  avgRatePerMeter: number;
  status: 'active' | 'archived';
}

export const GroupProductScreen: React.FC = () => {
  const { showFlash, addAuditLog } = useErp();
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  const [groups, setGroups] = useState<ProductGroup[]>([
    {
      id: 'GRP-01',
      code: 'GRP-CAMB-60',
      category: 'Greige',
      groupName: 'Cambric Premium Greige',
      standardConstruction: '60s Warp x 60s Weft / 92x88',
      hsnChapter: '5208.11',
      gsmRange: '72 - 78 GSM',
      activeSkusCount: 18,
      avgRatePerMeter: 48.50,
      status: 'active'
    },
    {
      id: 'GRP-02',
      code: 'GRP-POPL-40',
      category: 'Greige',
      groupName: 'Poplin Heavy Reed',
      standardConstruction: '40s Warp x 40s Weft / 132x72',
      hsnChapter: '5208.12',
      gsmRange: '115 - 125 GSM',
      activeSkusCount: 12,
      avgRatePerMeter: 62.00,
      status: 'active'
    },
    {
      id: 'GRP-03',
      code: 'GRP-VOIL-80',
      category: 'Greige',
      groupName: 'Swiss Voile Superfine',
      standardConstruction: '80s Warp x 80s Weft / 100x100',
      hsnChapter: '5208.19',
      gsmRange: '55 - 62 GSM',
      activeSkusCount: 9,
      avgRatePerMeter: 74.50,
      status: 'active'
    },
    {
      id: 'GRP-04',
      code: 'GRP-RAYN-140',
      category: 'Greige',
      groupName: 'Viscose Rayon Plain Weave',
      standardConstruction: '30s Rayon x 30s Rayon / 68x64',
      hsnChapter: '5407.82',
      gsmRange: '135 - 145 GSM',
      activeSkusCount: 24,
      avgRatePerMeter: 42.00,
      status: 'active'
    },
    {
      id: 'GRP-05',
      code: 'GRP-YARN-60C',
      category: 'Yarn',
      groupName: 'Compact Combed Cotton Yarn',
      standardConstruction: '60/1 Ne Ring Spun',
      hsnChapter: '5205.24',
      gsmRange: 'Count 60s',
      activeSkusCount: 6,
      avgRatePerMeter: 365.00,
      status: 'active'
    },
    {
      id: 'GRP-06',
      code: 'GRP-DYE-CAMB',
      category: 'Finished Fabric',
      groupName: 'Mill Dyed Cambric Solid',
      standardConstruction: 'Reactive Dye / Mercerised Finish',
      hsnChapter: '5208.32',
      gsmRange: '75 - 80 GSM',
      activeSkusCount: 32,
      avgRatePerMeter: 68.00,
      status: 'active'
    },
    {
      id: 'GRP-07',
      code: 'GRP-PRT-DIGI',
      category: 'Finished Fabric',
      groupName: 'Digital Printed Pure Satin',
      standardConstruction: 'Kyocera Print / 80 GSM Base',
      hsnChapter: '5208.52',
      gsmRange: '80 - 85 GSM',
      activeSkusCount: 15,
      avgRatePerMeter: 94.00,
      status: 'active'
    }
  ]);

  // Form State
  const [newCode, setNewCode] = useState('GRP-TWLL-50');
  const [newName, setNewName] = useState('Cotton Twill Heavy Weave');
  const [newCat, setNewCat] = useState<'Greige' | 'Yarn' | 'Finished Fabric' | 'Processing'>('Greige');
  const [newConstruction, setNewConstruction] = useState('30s x 20s / 108x56 2/1 Twill');
  const [newHsn, setNewHsn] = useState('5208.13');
  const [newGsm, setNewGsm] = useState('180 - 195 GSM');
  const [newRate, setNewRate] = useState('58.00');

  const filteredGroups = groups.filter(g => {
    const matchesCat = filterCategory === 'all' || g.category === filterCategory;
    const matchesSearch = g.groupName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          g.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          g.standardConstruction.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const handleAddGroup = (e: React.FormEvent) => {
    e.preventDefault();
    const newGroup: ProductGroup = {
      id: `GRP-0${groups.length + 1}`,
      code: newCode,
      category: newCat,
      groupName: newName,
      standardConstruction: newConstruction,
      hsnChapter: newHsn,
      gsmRange: newGsm,
      activeSkusCount: 1,
      avgRatePerMeter: parseFloat(newRate) || 0,
      status: 'active'
    };
    setGroups(prev => [newGroup, ...prev]);
    setShowAddModal(false);
    showFlash(`Product Group "${newName}" created successfully`, 'positive');
    addAuditLog('Created Product Group', 'Master Settings', `${newCode} - ${newName}`, 'info');
  };

  const columns: Column<ProductGroup>[] = [
    {
      header: 'Group Code',
      accessorKey: 'code',
      mono: true,
      render: g => <span className="font-semibold text-[var(--erp-gold)]">{g.code}</span>
    },
    {
      header: 'Category',
      accessorKey: 'category',
      render: g => (
        <span className="px-2 py-0.5 border border-[var(--erp-hairline)] bg-[var(--erp-surface-2)] text-[11px] font-mono text-[var(--erp-muted)]">
          {g.category}
        </span>
      )
    },
    {
      header: 'Group Name & Weave Spec',
      accessorKey: 'groupName',
      render: g => (
        <div>
          <span className="font-semibold text-[var(--erp-text)]">{g.groupName}</span>
          <span className="text-[11px] text-[var(--erp-muted)] block font-mono">{g.standardConstruction}</span>
        </div>
      )
    },
    {
      header: 'HSN Chapter',
      accessorKey: 'hsnChapter',
      mono: true,
      align: 'center',
      render: g => <span>{g.hsnChapter}</span>
    },
    {
      header: 'GSM Band',
      accessorKey: 'gsmRange',
      mono: true,
      align: 'center',
      render: g => <span>{g.gsmRange}</span>
    },
    {
      header: 'Linked SKUs',
      accessorKey: 'activeSkusCount',
      mono: true,
      align: 'right',
      render: g => <span>{g.activeSkusCount} items</span>
    },
    {
      header: 'Base Rate / Mtr',
      accessorKey: 'avgRatePerMeter',
      mono: true,
      align: 'right',
      render: g => (
        <span className="font-mono font-medium text-right text-[var(--erp-text)] block">
          ₹{g.avgRatePerMeter.toFixed(2)}
        </span>
      )
    },
    {
      header: 'Status',
      accessorKey: 'status',
      align: 'center',
      render: g => <StatusChip status={g.status === 'active' ? 'cleared' : 'muted'} label={g.status.toUpperCase()} />
    }
  ];

  return (
    <div className="p-6 flex flex-col gap-6 text-left">
      {/* Unified Page Header */}
      <PageHeader
        moduleNumber="22"
        section="Masters"
        title="Group Product Master"
        subtitle="Categorize yarn counts, greige constructions, warp/weft specifications, and finished fabric classification trees."
        actions={
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-1.5 bg-[var(--erp-gold)] text-[#0F141B] font-body text-xs font-semibold hover:bg-[var(--erp-gold-soft)] transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Product Group</span>
          </button>
        }
      />

      {/* KPI Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 border border-[var(--erp-hairline)] bg-[var(--erp-surface)]">
          <span className="text-xs font-mono text-[var(--erp-muted)] block">Total Defined Groups</span>
          <span className="font-mono text-xl font-bold text-[var(--erp-text)]">{groups.length}</span>
        </div>
        <div className="p-4 border border-[var(--erp-hairline)] bg-[var(--erp-surface)]">
          <span className="text-xs font-mono text-[var(--erp-muted)] block">Greige Fabric Groups</span>
          <span className="font-mono text-xl font-bold text-[var(--erp-gold)]">
            {groups.filter(g => g.category === 'Greige').length}
          </span>
        </div>
        <div className="p-4 border border-[var(--erp-hairline)] bg-[var(--erp-surface)]">
          <span className="text-xs font-mono text-[var(--erp-muted)] block">Active SKU Directory</span>
          <span className="font-mono text-xl font-bold text-[var(--erp-positive)]">
            {groups.reduce((acc, g) => acc + g.activeSkusCount, 0)} SKUs
          </span>
        </div>
        <div className="p-4 border border-[var(--erp-hairline)] bg-[var(--erp-surface)]">
          <span className="text-xs font-mono text-[var(--erp-muted)] block">HSN Classification</span>
          <span className="font-mono text-xl font-bold text-[var(--erp-text)]">5208 / 5407</span>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-[var(--erp-surface)] border border-[var(--erp-hairline)]">
        <div className="flex items-center gap-2 overflow-x-auto">
          <Filter className="w-4 h-4 text-[var(--erp-muted)] shrink-0" />
          {['all', 'Greige', 'Yarn', 'Finished Fabric'].map(cat => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={`px-2.5 py-1 text-xs font-mono transition-colors ${
                filterCategory === cat
                  ? 'bg-[var(--erp-gold)] text-[var(--erp-base)] font-bold'
                  : 'bg-[var(--erp-surface-2)] text-[var(--erp-muted)] hover:text-[var(--erp-text)]'
              }`}
            >
              {cat === 'all' ? 'All Categories' : cat}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-[var(--erp-muted)] absolute left-2.5 top-2.5" />
          <input
            type="text"
            placeholder="Search group, code or weave..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-8 pr-3 py-1.5 text-xs font-mono bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] focus:outline-none focus:border-[var(--erp-gold)] w-64"
          />
        </div>
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={filteredGroups}
        keyExtractor={g => g.id}
        emptyMessage="No product groups found matching criteria."
      />

      {/* Modal for Add Product Group */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-[var(--erp-hairline)]">
              <h3 className="font-serif text-lg font-bold text-[var(--erp-text)]">
                Create New Product Group
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-xs font-mono text-[var(--erp-muted)] hover:text-[var(--erp-text)]"
              >
                ESC
              </button>
            </div>

            <form onSubmit={handleAddGroup} className="flex flex-col gap-4 text-xs font-mono">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[var(--erp-muted)] mb-1 block">Group Code</label>
                  <input
                    type="text"
                    value={newCode}
                    onChange={e => setNewCode(e.target.value)}
                    className="w-full p-2 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] focus:border-[var(--erp-gold)]"
                    required
                  />
                </div>
                <div>
                  <label className="text-[var(--erp-muted)] mb-1 block">Category</label>
                  <select
                    value={newCat}
                    onChange={e => setNewCat(e.target.value as any)}
                    className="w-full p-2 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] focus:border-[var(--erp-gold)]"
                  >
                    <option value="Greige">Greige Fabric</option>
                    <option value="Yarn">Yarn</option>
                    <option value="Finished Fabric">Finished Fabric</option>
                    <option value="Processing">Processing</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[var(--erp-muted)] mb-1 block">Group Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  className="w-full p-2 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] focus:border-[var(--erp-gold)]"
                  required
                />
              </div>

              <div>
                <label className="text-[var(--erp-muted)] mb-1 block">Standard Construction / Weave</label>
                <input
                  type="text"
                  value={newConstruction}
                  onChange={e => setNewConstruction(e.target.value)}
                  className="w-full p-2 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] focus:border-[var(--erp-gold)]"
                  required
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[var(--erp-muted)] mb-1 block">HSN Chapter</label>
                  <input
                    type="text"
                    value={newHsn}
                    onChange={e => setNewHsn(e.target.value)}
                    className="w-full p-2 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] focus:border-[var(--erp-gold)]"
                    required
                  />
                </div>
                <div>
                  <label className="text-[var(--erp-muted)] mb-1 block">GSM Band</label>
                  <input
                    type="text"
                    value={newGsm}
                    onChange={e => setNewGsm(e.target.value)}
                    className="w-full p-2 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] focus:border-[var(--erp-gold)]"
                  />
                </div>
                <div>
                  <label className="text-[var(--erp-muted)] mb-1 block">Base Rate / Mtr</label>
                  <input
                    type="number"
                    step="0.1"
                    value={newRate}
                    onChange={e => setNewRate(e.target.value)}
                    className="w-full p-2 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] focus:border-[var(--erp-gold)]"
                    required
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--erp-hairline)] mt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-[var(--erp-hairline)] text-[var(--erp-muted)] hover:text-[var(--erp-text)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[var(--erp-gold)] text-[var(--erp-base)] font-bold hover:bg-[var(--erp-gold-soft)]"
                >
                  Save Group
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
