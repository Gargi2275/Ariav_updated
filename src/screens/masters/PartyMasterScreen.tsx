import React, { useState } from 'react';
import { useErp } from '../../context/ErpContext';
import { PageHeader } from '../../components/common/PageHeader';
import { DataTable, Column } from '../../components/common/DataTable';
import { StatusChip } from '../../components/common/StatusChip';
import { TextInput, AmountInput } from '../../components/common/FormControls';
import { Party } from '../../types/erp';
import { Users, Plus, Edit2, Search, Building2, Check, X, ShieldCheck, FileText, Download } from 'lucide-react';

export const PartyMasterScreen: React.FC = () => {
  const { parties, showFlash, addAuditLog, navigateTo } = useErp();

  const [partyList, setPartyList] = useState<Party[]>(parties);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingParty, setEditingParty] = useState<Partial<Party> | null>(null);

  const filteredParties = partyList.filter(p => {
    const matchSearch =
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.gstin.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.city.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.brokerTag.toLowerCase().includes(searchTerm.toLowerCase());
    const matchType = filterType === 'all' || p.type === filterType;
    return matchSearch && matchType;
  });

  const handleOpenCreate = () => {
    setEditingParty({
      id: `PT-${Math.floor(1008 + Math.random() * 90)}`,
      name: '',
      type: 'debtor',
      gstin: '24AAAAA0000A1Z5',
      pan: 'AAAAA0000A',
      city: 'Surat',
      state: 'Gujarat',
      creditLimit: 2500000,
      creditDays: 45,
      brokerTag: 'Jigneshbhai Vora',
      branches: ['Surat Ring Road Textile Mkt'],
      status: 'active'
    });
    setIsModalOpen(true);
  };

  const handleSaveParty = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingParty || !editingParty.name) return;

    const exists = partyList.some(p => p.id === editingParty.id);
    if (exists) {
      setPartyList(prev => prev.map(p => (p.id === editingParty.id ? (editingParty as Party) : p)));
      addAuditLog('Updated Party Master KYC', 'Masters & Accounts', `Updated party account ${editingParty.name}`, 'notice');
      showFlash(`Party ${editingParty.name} updated`, 'positive');
    } else {
      setPartyList(prev => [editingParty as Party, ...prev]);
      addAuditLog('Registered New Master Party', 'Masters & Accounts', `Created party account ${editingParty.name}`, 'info');
      showFlash(`New Party ${editingParty.name} registered`, 'positive');
    }
    setIsModalOpen(false);
  };

  const columns: Column<Party>[] = [
    {
      header: 'Code',
      accessorKey: 'id',
      mono: true,
      width: '90px',
      render: r => <span className="font-mono text-[var(--erp-gold)]">{r.id}</span>
    },
    {
      header: 'Party Trade Name',
      accessorKey: 'name',
      render: r => (
        <div>
          <span className="font-medium text-[var(--erp-text)]">{r.name}</span>
          <span className="text-[11px] font-mono text-[var(--erp-muted)] block">
            {r.city}, {r.state} • PAN: {r.pan}
          </span>
        </div>
      )
    },
    {
      header: 'GSTIN',
      accessorKey: 'gstin',
      mono: true,
      width: '160px',
    },
    {
      header: 'Account Classification',
      accessorKey: 'type',
      width: '110px',
      render: r => (
        <span className="px-2 py-0.5 text-[10px] font-mono uppercase bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)]">
          {r.type}
        </span>
      )
    },
    {
      header: 'Credit Limit & Days',
      accessorKey: 'creditLimit',
      align: 'right',
      mono: true,
      render: r => (
        <div>
          <span className="text-xs font-semibold text-[var(--erp-text)]">
            ₹{(r.creditLimit / 100000).toFixed(1)} L
          </span>
          <span className="text-[10px] text-[var(--erp-muted)] block font-mono">
            {r.creditDays} days grace
          </span>
        </div>
      )
    },
    {
      header: 'Broker Tag',
      accessorKey: 'brokerTag',
      render: r => <span className="text-xs text-[var(--erp-muted)]">{r.brokerTag}</span>
    },
    {
      header: 'Branch Linkage',
      render: r => (
        <div className="flex flex-wrap gap-1">
          {r.branches.map(b => (
            <span key={b} className="px-1.5 py-0.5 text-[9px] font-mono bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-muted)]">
              {b.split(' ')[0]}
            </span>
          ))}
        </div>
      )
    },
    {
      header: 'Status',
      accessorKey: 'status',
      align: 'center',
      width: '90px',
      render: r => <StatusChip status={r.status === 'active' ? 'cleared' : 'pending'} label={r.status.toUpperCase()} />
    },
    {
      header: 'Actions',
      align: 'right',
      width: '90px',
      render: r => (
        <div className="flex items-center justify-end gap-1.5">
          <button
            onClick={() => {
              showFlash(`Opening Statement for ${r.name}`, 'gold');
              navigateTo(31);
            }}
            className="p-1 text-[var(--erp-muted)] hover:text-[var(--erp-gold)] transition-colors cursor-pointer"
            title="Drilldown to Ledger (Module #31)"
          >
            <FileText className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              setEditingParty({ ...r });
              setIsModalOpen(true);
            }}
            className="p-1 text-[var(--erp-muted)] hover:text-[var(--erp-gold)] transition-colors cursor-pointer"
            title="Edit Party KYC"
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
        moduleNumber="23"
        section="Masters"
        title="Party & Customer Master Registry"
        subtitle="Gujarat textile accounts, GSTIN verification, credit limits, assigned brokers, and multi-branch linkages."
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => showFlash('Party KYC directory exported to auditor format', 'gold')}
              className="px-3 py-1.5 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] hover:border-[var(--erp-gold)] font-mono text-xs text-[var(--erp-text)] flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-[var(--erp-gold)]" /> Export KYC
            </button>
            <button
              onClick={handleOpenCreate}
              className="px-4 py-1.5 bg-[var(--erp-gold)] text-[#0F141B] font-body text-xs font-semibold hover:bg-[var(--erp-gold-soft)] transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Create Party Master
            </button>
          </div>
        }
      />

      {/* Filter Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] p-3">
        <div className="relative sm:col-span-2">
          <Search className="w-4 h-4 text-[var(--erp-muted)] absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search party name, GSTIN, PAN or broker..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] focus:border-[var(--erp-gold)] focus:outline-none"
          />
        </div>

        <div>
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="w-full px-3 py-1.5 text-xs font-mono bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] focus:border-[var(--erp-gold)] focus:outline-none"
          >
            <option value="all">All Account Types</option>
            <option value="debtor">Sundry Debtors (Buyers)</option>
            <option value="creditor">Sundry Creditors (Mills/Yarn)</option>
            <option value="bank">Bank Accounts</option>
          </select>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={filteredParties}
        keyExtractor={r => r.id}
      />

      {/* Party KYC Edit / Create Modal */}
      {isModalOpen && editingParty && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-[var(--erp-surface)] border border-[var(--erp-gold)] shadow-2xl p-6 space-y-5 animate-in zoom-in-95 duration-150 text-left">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--erp-hairline)]">
              <div>
                <span className="font-mono text-xs text-[var(--erp-gold)]">{editingParty.id}</span>
                <h3 className="font-serif text-lg font-bold text-[var(--erp-text)]">
                  Party Master Account Setup
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-[var(--erp-muted)] hover:text-[var(--erp-text)] border border-[var(--erp-hairline)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveParty} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <TextInput
                  label="Legal Trade Name"
                  value={editingParty.name || ''}
                  onChange={e => setEditingParty({ ...editingParty, name: e.target.value })}
                  required
                />
                <div className="flex flex-col gap-1 text-left">
                  <label className="text-xs text-[var(--erp-muted)] font-sans">Account Classification</label>
                  <select
                    value={editingParty.type}
                    onChange={e => setEditingParty({ ...editingParty, type: e.target.value as any })}
                    className="px-3 py-2 text-xs font-mono bg-[var(--erp-surface-2)] border border-[var(--erp-hairline-strong)] text-[var(--erp-text)] focus:border-[var(--erp-gold)]"
                  >
                    <option value="debtor">Sundry Debtor (Textile Wholesaler / Buyer)</option>
                    <option value="creditor">Sundry Creditor (Weaving Mill / Dyer)</option>
                    <option value="bank">Bank / Financial Institution</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <TextInput
                  label="GSTIN (State 24 Gujarat)"
                  mono
                  value={editingParty.gstin || ''}
                  onChange={e => setEditingParty({ ...editingParty, gstin: e.target.value.toUpperCase() })}
                  required
                />
                <TextInput
                  label="Income Tax PAN"
                  mono
                  value={editingParty.pan || ''}
                  onChange={e => setEditingParty({ ...editingParty, pan: e.target.value.toUpperCase() })}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <TextInput
                  label="City / Market"
                  value={editingParty.city || ''}
                  onChange={e => setEditingParty({ ...editingParty, city: e.target.value })}
                />
                <AmountInput
                  label="Credit Limit (₹)"
                  value={editingParty.creditLimit?.toString() || '0'}
                  onChange={e => setEditingParty({ ...editingParty, creditLimit: parseFloat(e.target.value) || 0 })}
                />
                <TextInput
                  label="Credit Grace Period (Days)"
                  mono
                  value={editingParty.creditDays?.toString() || '30'}
                  onChange={e => setEditingParty({ ...editingParty, creditDays: parseInt(e.target.value) || 0 })}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <TextInput
                  label="Default Broker Tag"
                  value={editingParty.brokerTag || ''}
                  onChange={e => setEditingParty({ ...editingParty, brokerTag: e.target.value })}
                />
                <div className="p-3 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-xs font-mono text-[var(--erp-positive)] flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4" /> GSTIN Validated with Gujarat GSTN Portal
                </div>
              </div>

              <div className="pt-4 border-t border-[var(--erp-hairline)] flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-[var(--erp-hairline)] text-xs font-mono text-[var(--erp-muted)] hover:text-[var(--erp-text)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[var(--erp-gold)] text-[#0F141B] text-xs font-mono font-semibold hover:bg-[var(--erp-gold-soft)]"
                >
                  Save Party Master
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
