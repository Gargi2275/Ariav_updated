import React, { useState } from 'react';
import { useErp } from '../../context/ErpContext';
import { PageHeader } from '../../components/common/PageHeader';
import { DataTable, Column } from '../../components/common/DataTable';
import { StatusChip } from '../../components/common/StatusChip';
import { TextInput } from '../../components/common/FormControls';
import { Branch } from '../../types/erp';
import { Building, Plus, Edit2, X, MapPin } from 'lucide-react';

export const BranchMasterScreen: React.FC = () => {
  const { branches, showFlash, addAuditLog } = useErp();

  const [branchList, setBranchList] = useState<Branch[]>(branches);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Partial<Branch> | null>(null);

  const handleOpenCreate = () => {
    setEditingBranch({
      id: `BR-0${branchList.length + 1}`,
      code: 'BHAVNAGAR-HUB',
      name: 'Bhavnagar Textile Trade Center',
      city: 'Bhavnagar',
      address: 'Shop 104, Madhav Complex, High Court Road',
      gstin: '24AABCA8491M1Z2',
      phone: '+91 278 2481029',
      isHeadOffice: false
    });
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBranch || !editingBranch.name) return;

    const exists = branchList.some(b => b.id === editingBranch.id);
    if (exists) {
      setBranchList(prev => prev.map(b => (b.id === editingBranch.id ? (editingBranch as Branch) : b)));
      addAuditLog('Updated Branch Master Node', 'Masters & Accounts', `Updated branch ${editingBranch.name}`, 'notice');
      showFlash(`Branch ${editingBranch.name} updated`, 'positive');
    } else {
      setBranchList(prev => [...prev, editingBranch as Branch]);
      addAuditLog('Registered New Branch Node', 'Masters & Accounts', `Added branch ${editingBranch.name}`, 'info');
      showFlash(`New Branch ${editingBranch.name} activated`, 'positive');
    }
    setIsModalOpen(false);
  };

  const columns: Column<Branch>[] = [
    {
      header: 'Code',
      accessorKey: 'code',
      mono: true,
      width: '140px',
      render: r => <span className="font-mono text-[var(--erp-gold)] font-medium">{r.code}</span>
    },
    {
      header: 'Branch Office Title',
      accessorKey: 'name',
      render: r => (
        <div>
          <span className="font-medium text-[var(--erp-text)]">{r.name}</span>
          {r.isHeadOffice && (
            <span className="ml-2 px-1.5 py-0.5 text-[9px] font-mono bg-[var(--erp-gold)] text-[#0F141B] font-semibold">
              HEAD OFFICE
            </span>
          )}
          <span className="text-[11px] font-mono text-[var(--erp-muted)] flex items-center gap-1 mt-0.5">
            <MapPin className="w-3 h-3 text-[var(--erp-gold)]" />
            {r.address}
          </span>
        </div>
      )
    },
    {
      header: 'City',
      accessorKey: 'city',
      width: '120px',
    },
    {
      header: 'Branch GSTIN',
      accessorKey: 'gstin',
      mono: true,
      width: '160px',
    },
    {
      header: 'Phone / Terminal EPABX',
      accessorKey: 'phone',
      mono: true,
      width: '140px',
    },
    {
      header: 'Status',
      align: 'center',
      width: '90px',
      render: () => <StatusChip status="cleared" label="ONLINE" />
    },
    {
      header: 'Edit',
      align: 'right',
      width: '70px',
      render: r => (
        <button
          onClick={() => {
            setEditingBranch({ ...r });
            setIsModalOpen(true);
          }}
          className="p-1 text-[var(--erp-muted)] hover:text-[var(--erp-gold)]"
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
        moduleNumber="24"
        section="Masters"
        title="Branch Master & Regional Network Nodes"
        subtitle="Configure regional textile depots, GSTIN branch registrations, and distributed server endpoint synchronization."
        actions={
          <button
            onClick={handleOpenCreate}
            className="px-4 py-1.5 bg-[var(--erp-gold)] text-[#0F141B] font-mono text-xs font-semibold hover:bg-[var(--erp-gold-soft)] transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> Add Regional Branch
          </button>
        }
      />

      <DataTable
        columns={columns}
        data={branchList}
        keyExtractor={r => r.id}
      />

      {isModalOpen && editingBranch && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-xl bg-[var(--erp-surface)] border border-[var(--erp-gold)] shadow-2xl p-6 space-y-5 animate-in zoom-in-95 duration-150 text-left">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--erp-hairline)]">
              <div>
                <span className="font-mono text-xs text-[var(--erp-gold)]">{editingBranch.id}</span>
                <h3 className="font-serif text-lg font-bold text-[var(--erp-text)]">
                  Regional Branch Configuration
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-[var(--erp-muted)] hover:text-[var(--erp-text)] border border-[var(--erp-hairline)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <TextInput
                  label="Branch Code Identifier"
                  mono
                  value={editingBranch.code || ''}
                  onChange={e => setEditingBranch({ ...editingBranch, code: e.target.value.toUpperCase() })}
                  required
                />
                <TextInput
                  label="Branch Operating City"
                  value={editingBranch.city || ''}
                  onChange={e => setEditingBranch({ ...editingBranch, city: e.target.value })}
                  required
                />
              </div>

              <TextInput
                label="Full Branch Trade Title"
                value={editingBranch.name || ''}
                onChange={e => setEditingBranch({ ...editingBranch, name: e.target.value })}
                required
              />

              <TextInput
                label="Physical Depot Address"
                value={editingBranch.address || ''}
                onChange={e => setEditingBranch({ ...editingBranch, address: e.target.value })}
                required
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <TextInput
                  label="Branch GSTIN"
                  mono
                  value={editingBranch.gstin || ''}
                  onChange={e => setEditingBranch({ ...editingBranch, gstin: e.target.value.toUpperCase() })}
                />
                <TextInput
                  label="EPABX / Phone Line"
                  mono
                  value={editingBranch.phone || ''}
                  onChange={e => setEditingBranch({ ...editingBranch, phone: e.target.value })}
                />
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
                  Save Branch Master
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
