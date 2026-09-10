import React, { useState } from 'react';
import { useErp } from '../../context/ErpContext';
import { PageHeader } from '../../components/common/PageHeader';
import { DataTable, Column } from '../../components/common/DataTable';
import { StatusChip } from '../../components/common/StatusChip';
import { Sliders, Plus, Truck, Sparkles, Layers, Shield, Check, Save } from 'lucide-react';

interface ParameterItem {
  id: string;
  category: 'Transport Zones' | 'Vehicle Fleet' | 'Quality Grades' | 'Fabric Shades' | 'Sizing Formulas';
  code: string;
  name: string;
  valueOrRate: string;
  leadTimeOrDesc: string;
  status: 'active' | 'inactive';
}

export const ParametersScreen: React.FC = () => {
  const { showFlash, addAuditLog } = useErp();
  const [activeTab, setActiveTab] = useState<'All' | 'Transport Zones' | 'Vehicle Fleet' | 'Quality Grades' | 'Fabric Shades' | 'Sizing Formulas'>('All');
  const [showAddModal, setShowAddModal] = useState(false);

  const [parameters, setParameters] = useState<ParameterItem[]>([
    // Transport Zones
    {
      id: 'PAR-01',
      category: 'Transport Zones',
      code: 'ZN-SRT-RR',
      name: 'Surat Ring Road Textile Hub',
      valueOrRate: 'Local Intra-City',
      leadTimeOrDesc: 'Within 4 Hours (Tempo / Chhakda)',
      status: 'active'
    },
    {
      id: 'PAR-02',
      category: 'Transport Zones',
      code: 'ZN-AMD-NRL',
      name: 'Narol GIDC Processing Corridor',
      valueOrRate: 'Ahmedabad Branch',
      leadTimeOrDesc: 'Next Day Morning Dispatch (260 km)',
      status: 'active'
    },
    {
      id: 'PAR-03',
      category: 'Transport Zones',
      code: 'ZN-BHW-OCT',
      name: 'Bhiwandi Powerloom Terminal',
      valueOrRate: 'Maharashtra Inward',
      leadTimeOrDesc: '24-36 Hours Interstate Transit',
      status: 'active'
    },

    // Vehicle Fleet
    {
      id: 'PAR-04',
      category: 'Vehicle Fleet',
      code: 'GJ-05-BX-4912',
      name: 'Eicher Pro 1049 (Surat Agency Owned)',
      valueOrRate: 'Capacity: 3,500 kg (18,000 mtr)',
      leadTimeOrDesc: 'Driver: Babubhai Patel • GPS Live',
      status: 'active'
    },
    {
      id: 'PAR-05',
      category: 'Vehicle Fleet',
      code: 'GJ-01-CZ-8821',
      name: 'Tata 407 LPT (Ahmedabad Depo)',
      valueOrRate: 'Capacity: 2,800 kg (14,000 mtr)',
      leadTimeOrDesc: 'Contract: Gujarat Logistics Line',
      status: 'active'
    },

    // Quality Grades
    {
      id: 'PAR-06',
      category: 'Quality Grades',
      code: 'GRD-FRESH-A',
      name: 'Grade-A Prime Loom State',
      valueOrRate: '100% Invoice Value',
      leadTimeOrDesc: '0 defects / 100m, 4-point system score < 12',
      status: 'active'
    },
    {
      id: 'PAR-07',
      category: 'Quality Grades',
      code: 'GRD-SEC-SL',
      name: 'Grade-B Minor Reed Marks / SL',
      valueOrRate: '8% Price Concession (CN)',
      leadTimeOrDesc: 'Minor yarn variation, permissible for dyed base',
      status: 'active'
    },
    {
      id: 'PAR-08',
      category: 'Quality Grades',
      code: 'GRD-FENT-REJ',
      name: 'Fents & Rag Cut Pieces',
      valueOrRate: 'By Weight (₹140/kg)',
      leadTimeOrDesc: 'Lengths below 1.5 meters, sold in scrap lots',
      status: 'active'
    },

    // Fabric Shades
    {
      id: 'PAR-09',
      category: 'Fabric Shades',
      code: 'SHD-RFD-01',
      name: 'RFD (Ready For Dyeing)',
      valueOrRate: 'Desized & Bleached Base',
      leadTimeOrDesc: 'Zero oil traces, ready for jet dyeing',
      status: 'active'
    },
    {
      id: 'PAR-10',
      category: 'Fabric Shades',
      code: 'SHD-OPT-WHT',
      name: 'Optical Bright White',
      valueOrRate: 'Bleached + Blueing Agent',
      leadTimeOrDesc: 'Whiteness index > 140 Berger',
      status: 'active'
    },
    {
      id: 'PAR-11',
      category: 'Fabric Shades',
      code: 'SHD-NAT-GREY',
      name: 'Natural Grey Loom-State',
      valueOrRate: 'Raw Weft/Warp',
      leadTimeOrDesc: 'Unprocessed fabric straight from waterjet/airjet looms',
      status: 'active'
    },

    // Sizing Formulas
    {
      id: 'PAR-12',
      category: 'Sizing Formulas',
      code: 'SZ-PVA-12',
      name: 'High-Speed Airjet Sizing PVA Blend',
      valueOrRate: '12% Size Add-on',
      leadTimeOrDesc: 'PVA 1788 + Modified Tapioca Starch + Lubricant Wax',
      status: 'active'
    }
  ]);

  // Modal State
  const [newCat, setNewCat] = useState<ParameterItem['category']>('Transport Zones');
  const [newCode, setNewCode] = useState('ZN-RAK-HUB');
  const [newName, setNewName] = useState('Rajkot Commercial Godown');
  const [newVal, setNewVal] = useState('Saurashtra Route');
  const [newDesc, setNewDesc] = useState('Transit 6 Hours from Surat');

  const filteredItems = parameters.filter(p => {
    if (activeTab === 'All') return true;
    return p.category === activeTab;
  });

  const handleCreateParameter = (e: React.FormEvent) => {
    e.preventDefault();
    const newItem: ParameterItem = {
      id: `PAR-${(parameters.length + 1).toString().padStart(2, '0')}`,
      category: newCat,
      code: newCode,
      name: newName,
      valueOrRate: newVal,
      leadTimeOrDesc: newDesc,
      status: 'active'
    };
    setParameters(prev => [newItem, ...prev]);
    setShowAddModal(false);
    showFlash(`Parameter "${newName}" created successfully`, 'positive');
    addAuditLog('Created System Parameter', 'Parameter Master', `${newCode} (${newCat})`, 'info');
  };

  const columns: Column<ParameterItem>[] = [
    {
      header: 'Category',
      accessorKey: 'category',
      render: p => (
        <span className="px-2 py-0.5 border border-[var(--erp-hairline)] bg-[var(--erp-surface-2)] text-[11px] font-mono text-[var(--erp-gold)]">
          {p.category}
        </span>
      )
    },
    {
      header: 'Code',
      accessorKey: 'code',
      mono: true,
      render: p => <span className="font-semibold text-[var(--erp-text)]">{p.code}</span>
    },
    {
      header: 'Description / Parameter Name',
      accessorKey: 'name',
      render: p => (
        <div>
          <span className="font-medium text-[var(--erp-text)]">{p.name}</span>
          <span className="text-[11px] text-[var(--erp-muted)] block font-mono">{p.leadTimeOrDesc}</span>
        </div>
      )
    },
    {
      header: 'Standard Metric / Value',
      accessorKey: 'valueOrRate',
      mono: true,
      render: p => <span className="text-[var(--erp-text)]">{p.valueOrRate}</span>
    },
    {
      header: 'Status',
      accessorKey: 'status',
      align: 'center',
      render: p => <StatusChip status={p.status === 'active' ? 'cleared' : 'muted'} label={p.status.toUpperCase()} />
    }
  ];

  return (
    <div className="p-6 flex flex-col gap-6 text-left">
      {/* Unified Page Header */}
      <PageHeader
        moduleNumber="25"
        section="Masters"
        title="Parameters & Operational Codes"
        subtitle="Configure logistics dispatch zones, vehicle fleets, loom inspection quality grades, fabric shades, and sizing recipes."
        actions={
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-1.5 bg-[var(--erp-gold)] text-[#0F141B] font-body text-xs font-semibold hover:bg-[var(--erp-gold-soft)] transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Parameter</span>
          </button>
        }
      />

      {/* Parameter Category Selector Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-[var(--erp-hairline)]">
        {(['All', 'Transport Zones', 'Vehicle Fleet', 'Quality Grades', 'Fabric Shades', 'Sizing Formulas'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 text-xs font-mono transition-colors border-b-2 whitespace-nowrap ${
              activeTab === tab
                ? 'border-[var(--erp-gold)] text-[var(--erp-gold)] bg-[var(--erp-surface-2)] font-bold'
                : 'border-transparent text-[var(--erp-muted)] hover:text-[var(--erp-text)]'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={filteredItems}
        keyExtractor={p => p.id}
        emptyMessage="No parameters found in this classification."
      />

      {/* Modal for Add Parameter */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-[var(--erp-hairline)]">
              <h3 className="font-serif text-lg font-bold text-[var(--erp-text)]">
                Add System Parameter Code
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-xs font-mono text-[var(--erp-muted)] hover:text-[var(--erp-text)]"
              >
                ESC
              </button>
            </div>

            <form onSubmit={handleCreateParameter} className="flex flex-col gap-4 text-xs font-mono">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[var(--erp-muted)] mb-1 block">Category</label>
                  <select
                    value={newCat}
                    onChange={e => setNewCat(e.target.value as any)}
                    className="w-full p-2 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] focus:border-[var(--erp-gold)]"
                  >
                    <option value="Transport Zones">Transport Zones</option>
                    <option value="Vehicle Fleet">Vehicle Fleet</option>
                    <option value="Quality Grades">Quality Grades</option>
                    <option value="Fabric Shades">Fabric Shades</option>
                    <option value="Sizing Formulas">Sizing Formulas</option>
                  </select>
                </div>
                <div>
                  <label className="text-[var(--erp-muted)] mb-1 block">Parameter Code</label>
                  <input
                    type="text"
                    value={newCode}
                    onChange={e => setNewCode(e.target.value)}
                    className="w-full p-2 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] focus:border-[var(--erp-gold)]"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-[var(--erp-muted)] mb-1 block">Parameter Name / Identifier</label>
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  className="w-full p-2 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] focus:border-[var(--erp-gold)]"
                  required
                />
              </div>

              <div>
                <label className="text-[var(--erp-muted)] mb-1 block">Standard Metric / Rate / Capacity</label>
                <input
                  type="text"
                  value={newVal}
                  onChange={e => setNewVal(e.target.value)}
                  className="w-full p-2 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] focus:border-[var(--erp-gold)]"
                  required
                />
              </div>

              <div>
                <label className="text-[var(--erp-muted)] mb-1 block">Lead Time / Specifications / Notes</label>
                <input
                  type="text"
                  value={newDesc}
                  onChange={e => setNewDesc(e.target.value)}
                  className="w-full p-2 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] focus:border-[var(--erp-gold)]"
                />
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
                  Save Parameter
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
