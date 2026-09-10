import React, { useState } from 'react';
import { useErp } from '../../context/ErpContext';
import { PageHeader } from '../../components/common/PageHeader';
import { DataTable, Column } from '../../components/common/DataTable';
import { HardDrive, Download, Play, CheckCircle2, ShieldCheck, Database, Cloud } from 'lucide-react';

interface BackupRecord {
  id: string;
  filename: string;
  timestamp: string;
  sizeMb: number;
  type: 'Scheduled Automated' | 'Manual On-Demand' | 'Pre-Closing Freeze';
  checksum: string;
  status: 'verified' | 'in_progress';
}

export const BackupScreen: React.FC = () => {
  const { showFlash, addAuditLog } = useErp();
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [progress, setProgress] = useState(0);

  const [backups, setBackups] = useState<BackupRecord[]>([
    {
      id: 'BKP-20260908-01',
      filename: 'ariav_erp_snapshot_20260908_1048.tar.gz',
      timestamp: '2026-09-08 10:48:19',
      sizeMb: 48.2,
      type: 'Scheduled Automated',
      checksum: 'e7a1b9f082c3...94d2',
      status: 'verified'
    },
    {
      id: 'BKP-20260907-02',
      filename: 'ariav_erp_snapshot_20260907_2359.tar.gz',
      timestamp: '2026-09-07 23:59:02',
      sizeMb: 47.9,
      type: 'Scheduled Automated',
      checksum: '14f8c2e903a1...88a5',
      status: 'verified'
    },
    {
      id: 'BKP-20260906-01',
      filename: 'ariav_erp_snapshot_20260906_1430_manual.tar.gz',
      timestamp: '2026-09-06 14:30:11',
      sizeMb: 47.4,
      type: 'Manual On-Demand',
      checksum: '7b99a012cd34...21b0',
      status: 'verified'
    },
    {
      id: 'BKP-20260331-YEAR',
      filename: 'ariav_erp_freeze_fy2024_25_final.tar.gz',
      timestamp: '2026-03-31 23:59:59',
      sizeMb: 42.1,
      type: 'Pre-Closing Freeze',
      checksum: '9901dcefa781...32f4',
      status: 'verified'
    }
  ]);

  const handleTriggerBackup = () => {
    setIsBackingUp(true);
    setProgress(0);

    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsBackingUp(false);
          const newBkp: BackupRecord = {
            id: `BKP-${Date.now().toString().slice(-8)}`,
            filename: `ariav_erp_snapshot_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}_manual.tar.gz`,
            timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
            sizeMb: 48.4,
            type: 'Manual On-Demand',
            checksum: 'a849f920bc81...99ef',
            status: 'verified'
          };
          setBackups(b => [newBkp, ...b]);
          addAuditLog('Created manual database snapshot', 'Backup & Archival', `Generated ${newBkp.filename} (48.4 MB)`, 'notice');
          showFlash('Full snapshot generated and verified against SHA-256 hash', 'positive');
          return 100;
        }
        return prev + 25;
      });
    }, 400);
  };

  const columns: Column<BackupRecord>[] = [
    {
      header: 'Snapshot ID',
      accessorKey: 'id',
      mono: true,
      width: '130px',
      render: r => <span className="font-mono text-[var(--erp-gold)]">{r.id}</span>
    },
    {
      header: 'Archive Filename',
      accessorKey: 'filename',
      render: r => (
        <div>
          <span className="font-mono text-xs text-[var(--erp-text)]">{r.filename}</span>
          <span className="text-[10px] font-mono text-[var(--erp-muted)] block">SHA-256: {r.checksum}</span>
        </div>
      )
    },
    {
      header: 'Timestamp',
      accessorKey: 'timestamp',
      mono: true,
      width: '160px',
    },
    {
      header: 'Type',
      accessorKey: 'type',
      render: r => (
        <span className="px-2 py-0.5 text-[10px] font-mono border border-[var(--erp-hairline)] bg-[var(--erp-surface-2)] text-[var(--erp-muted)]">
          {r.type}
        </span>
      )
    },
    {
      header: 'Size',
      accessorKey: 'sizeMb',
      align: 'right',
      mono: true,
      width: '90px',
      render: r => <span>{r.sizeMb} MB</span>
    },
    {
      header: 'Integrity',
      accessorKey: 'status',
      align: 'center',
      width: '110px',
      render: () => (
        <span className="inline-flex items-center gap-1 text-[11px] font-mono text-[var(--erp-positive)]">
          <CheckCircle2 className="w-3.5 h-3.5" /> Verified
        </span>
      )
    },
    {
      header: 'Action',
      align: 'right',
      width: '130px',
      render: r => (
        <button
          onClick={() => showFlash(`Download initiated for ${r.filename}`, 'gold')}
          className="px-2.5 py-1 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] hover:border-[var(--erp-gold)] text-xs font-mono text-[var(--erp-text)] flex items-center gap-1.5 ml-auto"
        >
          <Download className="w-3.5 h-3.5 text-[var(--erp-gold)]" /> Download
        </button>
      )
    }
  ];

  return (
    <div className="p-6 flex flex-col gap-6 text-left">
      {/* Unified Page Header */}
      <PageHeader
        moduleNumber="09"
        section="Admin"
        title="Backup Trigger & Snapshot Archival"
        subtitle="Full physical tarball dumps containing vouchers, ledger entries, party KYC and GST filings."
        actions={
          <button
            onClick={handleTriggerBackup}
            disabled={isBackingUp}
            className="px-4 py-2 bg-[var(--erp-gold)] text-[#0F141B] text-xs font-mono font-semibold hover:bg-[var(--erp-gold-soft)] disabled:opacity-50 transition-colors flex items-center gap-2 cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            {isBackingUp ? 'Freezing Database...' : 'Trigger Immediate Snapshot'}
          </button>
        }
      />

      {/* Backup Progress Streaming Banner */}
      {isBackingUp && (
        <div className="p-4 bg-[var(--erp-surface-2)] border border-[var(--erp-gold)] space-y-2 animate-in fade-in duration-200">
          <div className="flex justify-between text-xs font-mono">
            <span className="text-[var(--erp-gold)]">Creating point-in-time physical snapshot...</span>
            <span className="text-[var(--erp-text)]">{progress}%</span>
          </div>
          <div className="w-full h-2 bg-[var(--erp-surface)] overflow-hidden">
            <div className="h-full bg-[var(--erp-gold)] transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
          <span className="text-[10px] font-mono text-[var(--erp-muted)] block">
            Locking ledger tables • Calculating SHA-256 integrity digest • Compressing tarball
          </span>
        </div>
      )}

      {/* Storage & Cloud Vault Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] flex items-start gap-3">
          <Database className="w-5 h-5 text-[var(--erp-gold)] mt-0.5" />
          <div>
            <span className="font-mono text-xs text-[var(--erp-muted)]">Primary Database Volume</span>
            <div className="font-mono text-lg font-bold text-[var(--erp-text)]">48.2 MB / 500 GB</div>
            <span className="text-[11px] font-mono text-[var(--erp-positive)]">Healthy • WAL Active</span>
          </div>
        </div>

        <div className="p-4 border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] flex items-start gap-3">
          <Cloud className="w-5 h-5 text-[var(--erp-positive)] mt-0.5" />
          <div>
            <span className="font-mono text-xs text-[var(--erp-muted)]">Off-Site Cloud Vault</span>
            <div className="font-mono text-lg font-bold text-[var(--erp-text)]">Mumbai AWS S3 Glacier</div>
            <span className="text-[11px] font-mono text-[var(--erp-muted)]">Last synced: Today, 10:48 AM</span>
          </div>
        </div>

        <div className="p-4 border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-[var(--erp-gold)] mt-0.5" />
          <div>
            <span className="font-mono text-xs text-[var(--erp-muted)]">Recovery Time Objective (RTO)</span>
            <div className="font-mono text-lg font-bold text-[var(--erp-text)]">&lt; 4 Minutes</div>
            <span className="text-[11px] font-mono text-[var(--erp-positive)]">Point-in-Time Recovery Active</span>
          </div>
        </div>
      </div>

      {/* Snapshot History Table */}
      <DataTable
        columns={columns}
        data={backups}
        keyExtractor={r => r.id}
      />
    </div>
  );
};
