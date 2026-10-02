import React, { useState } from 'react';
import { useErp } from '../../context/ErpContext';
import { PageHeader } from '../../components/common/PageHeader';
import { DataTable, Column } from '../../components/common/DataTable';
import { StatusChip } from '../../components/common/StatusChip';
import { OperatorApprovalRequest } from '../../types/erp';
import { Radio, Check, X, ShieldAlert, Sparkles } from 'lucide-react';
import { MasterLoading } from '../masters/MasterStatus';

export const ApprovalQueueScreen: React.FC = () => {
  const { approvalQueue, approvalQueueLoaded, approveRequest, rejectRequest, selectedBranch } = useErp();
  const [revealedOtp, setRevealedOtp] = useState<{ id: string; otp: string; operator: string } | null>(null);

  const handleApprove = async (req: OperatorApprovalRequest) => {
    const otp = await approveRequest(req.id);
    if (otp) setRevealedOtp({ id: req.id, otp, operator: req.operatorName });
  };

  const pendingCount = approvalQueue.filter(r => r.status === 'pending').length;

  const columns: Column<OperatorApprovalRequest>[] = [
    {
      header: 'Ticket ID',
      accessorKey: 'id',
      mono: true,
      sortable: true,
      width: '110px',
      render: r => <span className="font-mono text-[var(--erp-gold)] font-medium">{r.id}</span>
    },
    {
      header: 'Operator & Node',
      accessorKey: 'operatorName',
      render: r => (
        <div>
          <div className="font-medium text-[var(--erp-text)]">{r.operatorName}</div>
          <div className="font-mono text-[11px] text-[var(--erp-muted)]">
            {r.operatorCode} • {r.branch}
          </div>
        </div>
      )
    },
    {
      header: 'Action / Authorization Requested',
      accessorKey: 'actionRequested',
      render: r => (
        <span className="text-xs text-[var(--erp-text)] font-sans">
          {r.actionRequested}
        </span>
      )
    },
    {
      header: 'Terminal IP',
      accessorKey: 'terminalIp',
      mono: true,
      width: '130px',
    },
    {
      header: 'Time',
      accessorKey: 'timestamp',
      mono: true,
      width: '100px',
    },
    {
      header: 'Status',
      accessorKey: 'status',
      width: '120px',
      render: r => <StatusChip status={r.status} />
    },
    {
      header: 'Verbal OTP Token',
      render: r => (
        r.verbalOtp ? (
          <span className="font-mono px-2 py-1 bg-[var(--erp-gold)]/10 text-[var(--erp-gold)] border border-[var(--erp-gold)]/30 text-xs font-semibold">
            {r.verbalOtp}
          </span>
        ) : (
          <span className="text-xs font-mono text-[var(--erp-muted)]">—</span>
        )
      )
    },
    {
      header: 'Action',
      align: 'right',
      width: '160px',
      render: r => (
        r.status === 'pending' ? (
          <div className="flex items-center justify-end gap-1.5">
            <button
              onClick={() => handleApprove(r)}
              className="px-2.5 py-1 bg-[var(--erp-positive)]/15 border border-[var(--erp-positive)]/40 hover:bg-[var(--erp-positive)] text-white text-xs font-mono transition-colors flex items-center gap-1"
              title="Authorize and generate verbal code"
            >
              <Check className="w-3.5 h-3.5" /> Approve
            </button>
            <button
              onClick={() => rejectRequest(r.id)}
              className="px-2 py-1 bg-[var(--erp-negative)]/15 border border-[var(--erp-negative)]/40 hover:bg-[var(--erp-negative)] text-white text-xs font-mono transition-colors"
              title="Reject request"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <span className="text-xs font-mono text-[var(--erp-muted)]">Resolved</span>
        )
      )
    }
  ];

  return (
    <div className="p-6 flex flex-col gap-6 text-left">
      {/* Unified Page Header */}
      <PageHeader
        moduleNumber="05"
        section="Admin"
        title="Live Operator Approval Queue"
        subtitle="Real-time branch authorization requests requiring partner sign-off and verbal OTP clearance."
        actions={
          <div className="flex items-center gap-3 font-mono text-xs">
            <span className="px-3 py-1.5 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)]">
              Pending: <strong className="text-[var(--erp-gold)]">{pendingCount}</strong>
            </span>
            <span className="px-3 py-1.5 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-muted)]">
              Node: {selectedBranch.code}
            </span>
          </div>
        }
      />

      {/* Signature Motion Moment: Golden Verbal OTP Reveal Card */}
      {revealedOtp && (
        <div className="p-5 border-2 border-[var(--erp-gold)] bg-[var(--erp-surface-2)] text-left relative animate-in slide-in-from-top-4 duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-[var(--erp-gold)]/20 border border-[var(--erp-gold)] flex items-center justify-center text-[var(--erp-gold)]">
                <Sparkles className="w-6 h-6 animate-spin" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-[var(--erp-gold)] font-semibold">
                    VERBAL OTP CLEARED • TICKET {revealedOtp.id}
                  </span>
                </div>
                <h3 className="font-serif text-lg font-bold text-[var(--erp-text)]">
                  Read this code verbally to {revealedOtp.operator}:
                </h3>
                <p className="text-xs text-[var(--erp-muted)] font-mono">
                  Token expires in 300 seconds • Single-use cryptographic seal
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="px-6 py-2 bg-[var(--erp-base)] border border-[var(--erp-gold)] text-3xl font-mono font-bold tracking-[0.25em] text-[var(--erp-gold)] select-all shadow-inner">
                {revealedOtp.otp}
              </div>
              <button
                onClick={() => setRevealedOtp(null)}
                className="p-2 text-[var(--erp-muted)] hover:text-[var(--erp-text)] border border-[var(--erp-hairline)]"
                title="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sharp-Cornered Queue Table */}
      {approvalQueueLoaded ? (
        <DataTable
          columns={columns}
          data={approvalQueue}
          keyExtractor={r => r.id}
          emptyMessage="No pending operator approval tickets in queue."
        />
      ) : (
        <MasterLoading label="Loading approval queue…" rows={5} />
      )}

      {/* Bottom Notes */}
      <div className="p-3 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] flex items-center justify-between text-xs text-[var(--erp-muted)] font-mono">
        <span className="flex items-center gap-1.5">
          <ShieldAlert className="w-4 h-4 text-[var(--erp-gold)]" />
          High-value discounts and invoice deletions trigger mandatory verbal authorization
        </span>
        <span>ISO 27001 Financial Safeguard</span>
      </div>
    </div>
  );
};
