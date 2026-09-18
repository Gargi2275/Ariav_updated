import React, { useState } from 'react';
import { useErp } from '../../context/ErpContext';
import { PageHeader } from '../../components/common/PageHeader';
import { DataTable, Column } from '../../components/common/DataTable';
import { AuditLogEntry } from '../../types/erp';
import { FileText, Search, Shield, Filter, Download } from 'lucide-react';

export const AuditLogScreen: React.FC = () => {
  const { auditLogs } = useErp();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [selectedUser, setSelectedUser] = useState<string>('all');

  const filteredLogs = auditLogs.filter(log => {
    const matchesSearch =
      log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.details.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.ipAddress.includes(searchTerm) ||
      log.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSeverity = selectedSeverity === 'all' || log.severity === selectedSeverity;
    const matchesUser = selectedUser === 'all' || log.user.includes(selectedUser);
    return matchesSearch && matchesSeverity && matchesUser;
  });

  const columns: Column<AuditLogEntry>[] = [
    {
      header: 'Audit ID',
      accessorKey: 'id',
      mono: true,
      width: '100px',
      render: r => <span className="font-mono text-[var(--erp-gold)]">{r.id}</span>
    },
    {
      header: 'Timestamp',
      accessorKey: 'timestamp',
      mono: true,
      sortable: true,
      width: '160px',
      render: r => <span className="text-xs font-mono text-[var(--erp-muted)]">{r.timestamp}</span>
    },
    {
      header: 'User & Role',
      accessorKey: 'user',
      render: r => (
        <div>
          <span className="font-medium text-[var(--erp-text)]">{r.user}</span>
          <span className="text-[11px] font-mono text-[var(--erp-muted)] block">{r.role}</span>
        </div>
      )
    },
    {
      header: 'Action Taken',
      accessorKey: 'action',
      render: r => <span className="font-medium text-[var(--erp-text)]">{r.action}</span>
    },
    {
      header: 'Module',
      accessorKey: 'module',
      render: r => (
        <span className="px-2 py-0.5 text-[11px] font-mono bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)]">
          {r.module}
        </span>
      )
    },
    {
      header: 'Terminal IP',
      accessorKey: 'ipAddress',
      mono: true,
      width: '120px'
    },
    {
      header: 'Forensic Details',
      accessorKey: 'details',
      render: r => <span className="text-xs text-[var(--erp-muted)] font-mono">{r.details}</span>
    },
    {
      header: 'Severity',
      accessorKey: 'severity',
      align: 'center',
      width: '100px',
      render: r => {
        let badgeColor = 'bg-[var(--erp-positive)]/10 text-[var(--erp-positive)] border-[var(--erp-positive)]/30';
        if (r.severity === 'critical') badgeColor = 'bg-[var(--erp-negative)]/10 text-[var(--erp-negative)] border-[var(--erp-negative)]/30';
        if (r.severity === 'notice') badgeColor = 'bg-[var(--erp-gold)]/10 text-[var(--erp-gold)] border-[var(--erp-gold)]/30';
        return (
          <span className={`px-2 py-0.5 text-[10px] font-mono uppercase border ${badgeColor}`}>
            {r.severity}
          </span>
        );
      }
    }
  ];

  return (
    <div className="p-6 flex flex-col gap-6 text-left">
      {/* Unified Page Header */}
      <PageHeader
        moduleNumber="08"
        section="Admin"
        title="Forensic Audit Trail & Terminal Logs"
        subtitle="Every transaction, delete attempt, override authorization and configuration event is cryptographically sealed."
        actions={
          <button
            onClick={() => alert('Exporting signed audit archive (.CSV + SHA256 checksum)...')}
            className="px-3.5 py-1.5 border border-[var(--erp-hairline)] bg-[var(--erp-surface-2)] hover:border-[var(--erp-gold)] text-xs font-mono text-[var(--erp-text)] flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-[var(--erp-gold)]" />
            Export Audit Archive
          </button>
        }
      />

      {/* Filter Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] p-3">
        <div className="relative sm:col-span-2">
          <Search className="w-4 h-4 text-[var(--erp-muted)] absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search action, forensic details, or IP..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] focus:outline-none focus:border-[var(--erp-gold)]"
          />
        </div>

        <div>
          <select
            value={selectedSeverity}
            onChange={e => setSelectedSeverity(e.target.value)}
            className="w-full px-3 py-1.5 text-xs font-mono bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] focus:outline-none focus:border-[var(--erp-gold)]"
          >
            <option value="all">All Severities</option>
            <option value="info">Info</option>
            <option value="notice">Notice</option>
            <option value="critical">Critical</option>
          </select>
        </div>

        <div>
          <select
            value={selectedUser}
            onChange={e => setSelectedUser(e.target.value)}
            className="w-full px-3 py-1.5 text-xs font-mono bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] focus:outline-none focus:border-[var(--erp-gold)]"
          >
            <option value="all">All Personnel</option>
            <option value="Bhargav Akshaya">Bhargav Akshaya (Admin)</option>
            <option value="Bhavin V. Joshi">Bhavin Joshi (OP-04)</option>
            <option value="Dharmesh K. Panchal">Dharmesh Panchal (OP-07)</option>
            <option value="System Cron">System Automated</option>
          </select>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={filteredLogs}
        keyExtractor={r => r.id}
        emptyMessage="No matching audit records found."
      />
    </div>
  );
};
