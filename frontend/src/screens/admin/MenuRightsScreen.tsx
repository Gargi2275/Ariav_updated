import React, { useState } from 'react';
import { useErp } from '../../context/ErpContext';
import { PageHeader } from '../../components/common/PageHeader';
import { SlidersHorizontal, Check, ShieldCheck, Save, RotateCcw } from 'lucide-react';

interface PermissionRow {
  module: string;
  category: string;
  admin: { view: boolean; create: boolean; edit: boolean; delete: boolean; post: boolean; approve: boolean };
  branchManager: { view: boolean; create: boolean; edit: boolean; delete: boolean; post: boolean; approve: boolean };
  billingClerk: { view: boolean; create: boolean; edit: boolean; delete: boolean; post: boolean; approve: boolean };
  voucherOperator: { view: boolean; create: boolean; edit: boolean; delete: boolean; post: boolean; approve: boolean };
  externalAuditor: { view: boolean; create: boolean; edit: boolean; delete: boolean; post: boolean; approve: boolean };
}

const INITIAL_PERMISSIONS: PermissionRow[] = [
  {
    module: 'Sales Invoicing & Billing',
    category: 'Core Operations',
    admin: { view: true, create: true, edit: true, delete: true, post: true, approve: true },
    branchManager: { view: true, create: true, edit: true, delete: false, post: true, approve: true },
    billingClerk: { view: true, create: true, edit: true, delete: false, post: false, approve: false },
    voucherOperator: { view: true, create: false, edit: false, delete: false, post: false, approve: false },
    externalAuditor: { view: true, create: false, edit: false, delete: false, post: false, approve: false },
  },
  {
    module: 'Bank & Cash Vouchers',
    category: 'Core Operations',
    admin: { view: true, create: true, edit: true, delete: true, post: true, approve: true },
    branchManager: { view: true, create: true, edit: true, delete: false, post: true, approve: true },
    billingClerk: { view: true, create: false, edit: false, delete: false, post: false, approve: false },
    voucherOperator: { view: true, create: true, edit: true, delete: false, post: false, approve: false },
    externalAuditor: { view: true, create: false, edit: false, delete: false, post: false, approve: false },
  },
  {
    module: 'Double-Entry Journal Entries',
    category: 'Core Operations',
    admin: { view: true, create: true, edit: true, delete: true, post: true, approve: true },
    branchManager: { view: true, create: true, edit: true, delete: false, post: true, approve: false },
    billingClerk: { view: false, create: false, edit: false, delete: false, post: false, approve: false },
    voucherOperator: { view: true, create: true, edit: false, delete: false, post: false, approve: false },
    externalAuditor: { view: true, create: false, edit: false, delete: false, post: false, approve: false },
  },
  {
    module: 'Party & Account Master (KYC)',
    category: 'Masters',
    admin: { view: true, create: true, edit: true, delete: true, post: true, approve: true },
    branchManager: { view: true, create: true, edit: true, delete: false, post: true, approve: false },
    billingClerk: { view: true, create: false, edit: false, delete: false, post: false, approve: false },
    voucherOperator: { view: true, create: false, edit: false, delete: false, post: false, approve: false },
    externalAuditor: { view: true, create: false, edit: false, delete: false, post: false, approve: false },
  },
  {
    module: 'Financial Reports (P&L, Balance Sheet)',
    category: 'Reports',
    admin: { view: true, create: true, edit: true, delete: true, post: true, approve: true },
    branchManager: { view: true, create: false, edit: false, delete: false, post: false, approve: false },
    billingClerk: { view: false, create: false, edit: false, delete: false, post: false, approve: false },
    voucherOperator: { view: false, create: false, edit: false, delete: false, post: false, approve: false },
    externalAuditor: { view: true, create: false, edit: false, delete: false, post: false, approve: false },
  },
  {
    module: 'Year-End Financial Rollover',
    category: 'Admin',
    admin: { view: true, create: true, edit: true, delete: true, post: true, approve: true },
    branchManager: { view: false, create: false, edit: false, delete: false, post: false, approve: false },
    billingClerk: { view: false, create: false, edit: false, delete: false, post: false, approve: false },
    voucherOperator: { view: false, create: false, edit: false, delete: false, post: false, approve: false },
    externalAuditor: { view: false, create: false, edit: false, delete: false, post: false, approve: false },
  }
];

export const MenuRightsScreen: React.FC = () => {
  const { showFlash, addAuditLog } = useErp();
  const [selectedRole, setSelectedRole] = useState<'admin' | 'branchManager' | 'billingClerk' | 'voucherOperator' | 'externalAuditor'>('billingClerk');
  const [matrix, setMatrix] = useState<PermissionRow[]>(INITIAL_PERMISSIONS);

  const roleTitles = {
    admin: 'Partner / Admin',
    branchManager: 'Branch Manager',
    billingClerk: 'Billing Clerk (OP-04)',
    voucherOperator: 'Voucher Operator',
    externalAuditor: 'Chartered Accountant / Auditor'
  };

  const togglePerm = (moduleIndex: number, permKey: 'view' | 'create' | 'edit' | 'delete' | 'post' | 'approve') => {
    setMatrix(prev =>
      prev.map((row, idx) => {
        if (idx === moduleIndex) {
          return {
            ...row,
            [selectedRole]: {
              ...row[selectedRole],
              [permKey]: !row[selectedRole][permKey]
            }
          };
        }
        return row;
      })
    );
  };

  const handleSave = () => {
    addAuditLog('Role Matrix Updated', 'Menu Rights', `Updated permission policies for ${roleTitles[selectedRole]}`, 'notice');
    showFlash(`Permissions for ${roleTitles[selectedRole]} saved to terminal policy`, 'positive');
  };

  return (
    <div className="p-6 flex flex-col gap-6 text-left">
      {/* Unified Page Header */}
      <PageHeader
        moduleNumber="07"
        section="Admin"
        title="Menu Rights & Role Permissions Matrix"
        subtitle="Configure read, write, post, and authorization privileges for all terminal users across Gujarat branches."
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMatrix(INITIAL_PERMISSIONS)}
              className="px-3 py-1.5 border border-[var(--erp-hairline)] bg-[var(--erp-surface-2)] text-xs font-mono text-[var(--erp-muted)] hover:text-[var(--erp-text)] flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reset
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-1.5 bg-[var(--erp-gold)] text-[#0F141B] text-xs font-mono font-semibold hover:bg-[var(--erp-gold-soft)] flex items-center gap-1.5 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" /> Commit Rights
            </button>
          </div>
        }
      />

      {/* Role Selection Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto border-b border-[var(--erp-hairline)] pb-2 font-mono text-xs">
        {(Object.keys(roleTitles) as Array<keyof typeof roleTitles>).map(roleKey => (
          <button
            key={roleKey}
            onClick={() => setSelectedRole(roleKey)}
            className={`px-3 py-1.5 transition-colors whitespace-nowrap ${
              selectedRole === roleKey
                ? 'bg-[var(--erp-gold)] text-[#0F141B] font-semibold'
                : 'bg-[var(--erp-surface)] border border-[var(--erp-hairline)] text-[var(--erp-muted)] hover:text-[var(--erp-text)]'
            }`}
          >
            {roleTitles[roleKey]}
          </button>
        ))}
      </div>

      {/* Permissions Table */}
      <div className="border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] overflow-x-auto">
        <table className="w-full text-left border-collapse font-sans text-xs">
          <thead className="bg-[var(--erp-surface-2)] border-b-2 border-[var(--erp-hairline-strong)] font-mono text-[11px] text-[var(--erp-muted)] select-none">
            <tr>
              <th className="px-4 py-3 border-r border-[var(--erp-hairline)] font-semibold uppercase tracking-wider text-[var(--erp-text)]">Functional ERP Module</th>
              <th className="px-4 py-3 border-r border-[var(--erp-hairline)] font-semibold uppercase tracking-wider">Category</th>
              <th className="px-3 py-3 border-r border-[var(--erp-hairline)] text-center font-semibold uppercase tracking-wider">Read / View</th>
              <th className="px-3 py-3 border-r border-[var(--erp-hairline)] text-center font-semibold uppercase tracking-wider">Draft Create</th>
              <th className="px-3 py-3 border-r border-[var(--erp-hairline)] text-center font-semibold uppercase tracking-wider">Modify / Edit</th>
              <th className="px-3 py-3 border-r border-[var(--erp-hairline)] text-center font-semibold uppercase tracking-wider">Hard Delete</th>
              <th className="px-3 py-3 border-r border-[var(--erp-hairline)] text-center font-semibold uppercase tracking-wider">Post to Ledger</th>
              <th className="px-3 py-3 text-center font-semibold uppercase tracking-wider text-[var(--erp-gold)]">Authorize Override</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--erp-hairline)]">
            {matrix.map((row, idx) => {
              const currentPerm = row[selectedRole];
              return (
                <tr key={idx} className="hover:bg-[var(--erp-surface-2)]/50 transition-colors">
                  <td className="px-4 py-3 border-r border-[var(--erp-hairline)] font-medium text-[var(--erp-text)]">
                    {row.module}
                  </td>
                  <td className="px-4 py-3 border-r border-[var(--erp-hairline)] font-mono text-[11px] text-[var(--erp-muted)]">
                    {row.category}
                  </td>
                  {(['view', 'create', 'edit', 'delete', 'post', 'approve'] as const).map(pKey => (
                    <td
                      key={pKey}
                      onClick={() => togglePerm(idx, pKey)}
                      className="px-3 py-3 border-r last:border-r-0 border-[var(--erp-hairline)] text-center cursor-pointer hover:bg-[var(--erp-surface-2)] select-none"
                    >
                      <div className="flex items-center justify-center">
                        <div
                          className={`w-4 h-4 border flex items-center justify-center transition-colors ${
                            currentPerm[pKey]
                              ? 'bg-[var(--erp-positive)] border-[var(--erp-positive)] text-white'
                              : 'border-[var(--erp-hairline-strong)] bg-transparent'
                          }`}
                        >
                          {currentPerm[pKey] && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                      </div>
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="p-3 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] flex items-center justify-between text-xs font-mono text-[var(--erp-muted)]">
        <span className="flex items-center gap-1.5 text-[var(--erp-positive)]">
          <ShieldCheck className="w-4 h-4" /> Policy Enforced on All REST API & Terminal RPC Endpoints
        </span>
        <span>Version: Policy-2026.09</span>
      </div>
    </div>
  );
};
