import React, { useState } from 'react';
import { useErp } from '../../context/ErpContext';
import { PageHeader } from '../../components/common/PageHeader';
import { DataTable, Column } from '../../components/common/DataTable';
import { StatusChip } from '../../components/common/StatusChip';
import { TextInput } from '../../components/common/FormControls';
import { UserCheck, Plus, Edit2, X } from 'lucide-react';

interface BrokerRecord {
  id: string;
  name: string;
  firmName: string;
  commissionRate: number;
  pan: string;
  mobile: string;
  city: string;
  linkedPartiesCount: number;
  linkedParties: string[];
  ytdTurnoverBrokered: number;
  ytdBrokerageAccrued: number;
  status: 'active' | 'suspended';
}

export const BrokerMasterScreen: React.FC = () => {
  const { showFlash, addAuditLog } = useErp();

  const [brokers, setBrokers] = useState<BrokerRecord[]>([
    {
      id: 'BRK-JV09',
      name: 'Jigneshbhai Vora',
      firmName: 'J. Vora Commercial Agency',
      commissionRate: 2.0,
      pan: 'ABCDE1234F',
      mobile: '+91 98250 18492',
      city: 'Surat',
      linkedPartiesCount: 14,
      linkedParties: ['Sharda Synthetics', 'Patel & Brothers', 'Radhe Dyeing'],
      ytdTurnoverBrokered: 71200000,
      ytdBrokerageAccrued: 1424000,
      status: 'active'
    },
    {
      id: 'BRK-CP03',
      name: 'Chandrakant B. Parekh',
      firmName: 'C. Parekh & Sons Yarn Brokers',
      commissionRate: 1.5,
      pan: 'BCDEF2345G',
      mobile: '+91 98980 44219',
      city: 'Ahmedabad',
      linkedPartiesCount: 9,
      linkedParties: ['Arvind Commercial Agency', 'Marwadi Fashion'],
      ytdTurnoverBrokered: 48900000,
      ytdBrokerageAccrued: 733500,
      status: 'active'
    },
    {
      id: 'BRK-MS14',
      name: 'Mukeshbhai Shah',
      firmName: 'Shah Fabrics Intermediary',
      commissionRate: 2.0,
      pan: 'CDEFG3456H',
      mobile: '+91 94260 77102',
      city: 'Rajkot',
      linkedPartiesCount: 6,
      linkedParties: ['Saurashtra Weaving Coop'],
      ytdTurnoverBrokered: 28100000,
      ytdBrokerageAccrued: 562000,
      status: 'active'
    }
  ]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBroker, setEditingBroker] = useState<Partial<BrokerRecord> | null>(null);

  const handleOpenCreate = () => {
    setEditingBroker({
      id: `BRK-N${Math.floor(10 + Math.random() * 80)}`,
      name: '',
      firmName: '',
      commissionRate: 2.0,
      pan: '',
      mobile: '+91 ',
      city: 'Surat',
      linkedPartiesCount: 0,
      linkedParties: [],
      ytdTurnoverBrokered: 0,
      ytdBrokerageAccrued: 0,
      status: 'active'
    });
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBroker || !editingBroker.name) return;

    const exists = brokers.some(b => b.id === editingBroker.id);
    if (exists) {
      setBrokers(prev => prev.map(b => (b.id === editingBroker.id ? (editingBroker as BrokerRecord) : b)));
      addAuditLog('Updated Broker Master', 'Masters & Accounts', `Updated broker ${editingBroker.name}`, 'notice');
      showFlash(`Broker ${editingBroker.name} updated`, 'positive');
    } else {
      setBrokers(prev => [editingBroker as BrokerRecord, ...prev]);
      addAuditLog('Registered New Broker Master', 'Masters & Accounts', `Registered broker ${editingBroker.name}`, 'info');
      showFlash(`Broker ${editingBroker.name} registered`, 'positive');
    }
    setIsModalOpen(false);
  };

  const columns: Column<BrokerRecord>[] = [
    {
      header: 'Code',
      accessorKey: 'id',
      mono: true,
      width: '90px',
      render: r => <span className="font-mono text-[var(--erp-gold)]">{r.id}</span>
    },
    {
      header: 'Broker Name & Firm',
      accessorKey: 'name',
      render: r => (
        <div>
          <span className="font-medium text-[var(--erp-text)]">{r.name}</span>
          <span className="text-[11px] font-mono text-[var(--erp-muted)] block">
            {r.firmName} • {r.city} • {r.mobile}
          </span>
        </div>
      )
    },
    {
      header: 'Rate %',
      accessorKey: 'commissionRate',
      align: 'center',
      mono: true,
      width: '80px',
      render: r => <span className="font-bold text-[var(--erp-gold)]">{r.commissionRate}%</span>
    },
    {
      header: 'Linked Parties',
      render: r => (
        <div>
          <span className="font-mono text-xs text-[var(--erp-text)] font-semibold block">
            {r.linkedPartiesCount} Accounts
          </span>
          <span className="text-[11px] text-[var(--erp-muted)] truncate block max-w-xs">
            {r.linkedParties.join(', ')}
          </span>
        </div>
      )
    },
    {
      header: 'Brokered Turnover',
      accessorKey: 'ytdTurnoverBrokered',
      align: 'right',
      mono: true,
      render: r => <span>₹{(r.ytdTurnoverBrokered / 100000).toFixed(1)} L</span>
    },
    {
      header: 'Accrued Brokerage',
      accessorKey: 'ytdBrokerageAccrued',
      align: 'right',
      mono: true,
      render: r => <span className="text-[var(--erp-gold)] font-semibold">₹{(r.ytdBrokerageAccrued / 1000).toFixed(0)} K</span>
    },
    {
      header: 'Status',
      accessorKey: 'status',
      align: 'center',
      width: '90px',
      render: r => <StatusChip status={r.status === 'active' ? 'cleared' : 'rejected'} label={r.status.toUpperCase()} />
    },
    {
      header: 'Edit',
      align: 'right',
      width: '70px',
      render: r => (
        <button
          onClick={() => {
            setEditingBroker({ ...r });
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
        moduleNumber="28"
        section="Masters"
        title="Broker & Intermediary Master"
        subtitle="Brokerage percentage configurations, turnover tracking and client party linkages across textile markets."
        actions={
          <button
            onClick={handleOpenCreate}
            className="px-4 py-1.5 bg-[var(--erp-gold)] text-[#0F141B] font-mono text-xs font-semibold hover:bg-[var(--erp-gold-soft)] transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> Register New Broker
          </button>
        }
      />

      <DataTable
        columns={columns}
        data={brokers}
        keyExtractor={r => r.id}
      />

      {isModalOpen && editingBroker && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-xl bg-[var(--erp-surface)] border border-[var(--erp-gold)] shadow-2xl p-6 space-y-5 animate-in zoom-in-95 duration-150 text-left">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--erp-hairline)]">
              <div>
                <span className="font-mono text-xs text-[var(--erp-gold)]">{editingBroker.id}</span>
                <h3 className="font-serif text-lg font-bold text-[var(--erp-text)]">
                  Broker Commission Account
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
                  label="Broker Full Name"
                  value={editingBroker.name || ''}
                  onChange={e => setEditingBroker({ ...editingBroker, name: e.target.value })}
                  required
                />
                <TextInput
                  label="Firm / Agency Name"
                  value={editingBroker.firmName || ''}
                  onChange={e => setEditingBroker({ ...editingBroker, firmName: e.target.value })}
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <TextInput
                  label="Standard Comm. Rate %"
                  mono
                  value={editingBroker.commissionRate?.toString() || '2.0'}
                  onChange={e => setEditingBroker({ ...editingBroker, commissionRate: parseFloat(e.target.value) || 0 })}
                />
                <TextInput
                  label="Income Tax PAN"
                  mono
                  value={editingBroker.pan || ''}
                  onChange={e => setEditingBroker({ ...editingBroker, pan: e.target.value.toUpperCase() })}
                />
                <TextInput
                  label="Operating City"
                  value={editingBroker.city || 'Surat'}
                  onChange={e => setEditingBroker({ ...editingBroker, city: e.target.value })}
                />
              </div>

              <TextInput
                label="Primary Contact Mobile"
                mono
                value={editingBroker.mobile || ''}
                onChange={e => setEditingBroker({ ...editingBroker, mobile: e.target.value })}
              />

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
                  Save Broker Master
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
