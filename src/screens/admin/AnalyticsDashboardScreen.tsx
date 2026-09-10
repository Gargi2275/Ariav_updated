import React from 'react';
import { useErp } from '../../context/ErpContext';
import { PageHeader } from '../../components/common/PageHeader';
import { LedgerMetricStrip, LedgerMetricItem } from '../../components/common/LedgerMetricStrip';
import { DataTable, Column } from '../../components/common/DataTable';
import { StatusChip } from '../../components/common/StatusChip';
import { ArrowUpRight, TrendingUp, DollarSign, Building, AlertCircle } from 'lucide-react';

interface OverdueAccount {
  partyName: string;
  city: string;
  broker: string;
  outstanding: number;
  creditDays: number;
  overdueDays: number;
  riskStatus: 'critical' | 'notice' | 'normal';
}

export const AnalyticsDashboardScreen: React.FC = () => {
  const { financialYear, selectedBranch, navigateTo } = useErp();

  const metrics: LedgerMetricItem[] = [
    {
      label: 'Gross Turnover',
      value: '₹14.82 Cr',
      subValue: '184.20 Lk Mtr',
      trend: 'up',
      change: '+14.20% vs FY24',
      badge: 'GST VERIFIED'
    },
    {
      label: 'Debtors Outstanding',
      value: '₹3.42 Cr',
      subValue: 'Avg 38.40 Days',
      trend: 'neutral',
      change: '₹42.80 L > 60 days',
      badge: '41 PARTIES'
    },
    {
      label: 'Creditors (Mills)',
      value: '₹2.18 Cr',
      subValue: '18 Mills & Dyers',
      trend: 'down',
      change: '₹28.40 L due this wk',
      badge: '18 MILLS'
    },
    {
      label: 'Liquid Bank Balances',
      value: '₹1.26 Cr',
      subValue: 'SBI + HDFC + Axis',
      trend: 'up',
      change: '+₹14.50 L buffer',
      badge: 'UNENCUMBERED'
    },
    {
      label: 'Fabric Inward (Mtr)',
      value: '4.82 Lk Mtr',
      subValue: 'Cambric / Poplin',
      trend: 'up',
      change: '+0.12 Lk Mtr this wk',
      badge: '60x60 DOMINANT'
    },
    {
      label: 'Agency Brokerage',
      value: '₹29.64 L',
      subValue: '2.00% Flat Comm.',
      trend: 'up',
      change: '₹4.20 L uncollected',
      badge: 'JV / CP BROKERS'
    }
  ];

  const overdueAccounts: OverdueAccount[] = [
    { partyName: 'Sharda Synthetics Pvt Ltd', city: 'Surat', broker: 'Jigneshbhai Vora', outstanding: 1482950, creditDays: 45, overdueDays: 18, riskStatus: 'critical' },
    { partyName: 'Arvind Commercial Agency', city: 'Ahmedabad', broker: 'Chandrakant Parekh', outstanding: 3120400, creditDays: 30, overdueDays: 8, riskStatus: 'notice' },
    { partyName: 'Patel & Brothers Textiles', city: 'Ahmedabad', broker: 'Jigneshbhai Vora', outstanding: 642800, creditDays: 21, overdueDays: 24, riskStatus: 'critical' },
    { partyName: 'Marwadi Fashion Fabrics', city: 'Bhilwara', broker: 'Direct Mill Contract', outstanding: 980000, creditDays: 45, overdueDays: 0, riskStatus: 'normal' },
    { partyName: 'Radhe Dyeing & Processing', city: 'Surat', broker: 'Mukeshbhai Shah', outstanding: 420000, creditDays: 30, overdueDays: 14, riskStatus: 'notice' },
  ];

  const overdueColumns: Column<OverdueAccount>[] = [
    {
      header: 'Debtor Party Name',
      accessorKey: 'partyName',
      render: r => (
        <div>
          <span className="font-body font-medium text-[var(--erp-text)]">{r.partyName}</span>
          <span className="text-[11px] font-mono text-[var(--erp-muted)] block">{r.city} • Broker: {r.broker}</span>
        </div>
      )
    },
    {
      header: 'Outstanding Amount',
      accessorKey: 'outstanding',
      align: 'right',
      mono: true,
      sortable: true,
      render: r => (
        <span className="font-mono font-medium text-right text-[var(--erp-text)] block">
          ₹{r.outstanding.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      )
    },
    {
      header: 'Credit Days',
      accessorKey: 'creditDays',
      align: 'center',
      mono: true,
      render: r => <span className="font-mono">{r.creditDays}d</span>
    },
    {
      header: 'Days Overdue',
      accessorKey: 'overdueDays',
      align: 'center',
      mono: true,
      sortable: true,
      render: r => (
        <span className={`font-mono ${r.overdueDays > 15 ? 'text-[var(--erp-negative)] font-bold' : r.overdueDays > 0 ? 'text-[var(--erp-gold)] font-medium' : 'text-[var(--erp-positive)]'}`}>
          {r.overdueDays === 0 ? 'Current' : `+${r.overdueDays} days`}
        </span>
      )
    },
    {
      header: 'Risk Band',
      accessorKey: 'riskStatus',
      align: 'center',
      render: r => (
        <StatusChip
          status={r.riskStatus === 'critical' ? 'overdue' : r.riskStatus === 'notice' ? 'due soon' : 'within limit'}
          label={r.riskStatus === 'critical' ? 'OVERDUE' : r.riskStatus === 'notice' ? 'DUE SOON' : 'WITHIN LIMIT'}
        />
      )
    }
  ];

  return (
    <div className="p-6 flex flex-col gap-6 text-left">
      {/* Unified Page Header */}
      <PageHeader
        moduleNumber="06"
        section="Admin"
        title="Business Analytics & Position"
        subtitle={`Real-time ledger aggregation across Surat, Ahmedabad, and Rajkot nodes for ${financialYear}.`}
        actions={
          <>
            <button
              onClick={() => navigateTo(27)} // Trial Balance
              className="px-3 py-1.5 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] hover:border-[var(--erp-gold)] font-body text-xs text-[var(--erp-text)] transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <span>Trial Balance</span>
              <ArrowUpRight className="w-3.5 h-3.5 stroke-[1.75] text-[var(--erp-gold)]" />
            </button>
            <button
              onClick={() => navigateTo(28)} // Balance Sheet
              className="px-3 py-1.5 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] hover:border-[var(--erp-gold)] font-body text-xs text-[var(--erp-text)] transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <span>Balance Sheet</span>
              <ArrowUpRight className="w-3.5 h-3.5 stroke-[1.75] text-[var(--erp-gold)]" />
            </button>
          </>
        }
      />

      {/* Hero Metrics: Horizontal Ledger Metric Strip */}
      <LedgerMetricStrip metrics={metrics} />

      {/* Supporting KPI Panels with soft 14px radius */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Branch Split KPI Panel - 14px radius */}
        <div
          className="border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] p-5 rounded-[14px] flex flex-col justify-between"
          style={{ boxShadow: 'var(--erp-shadow)' }}
        >
          <div>
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-[var(--erp-hairline)]">
              <span className="font-display text-sm font-bold text-[var(--erp-text)] flex items-center gap-2">
                <Building className="w-4 h-4 stroke-[1.75] text-[var(--erp-gold)]" />
                Branch Turnover Distribution
              </span>
              <span className="erp-badge erp-badge-gold text-[10px]">3 Active Hubs</span>
            </div>

            <div className="space-y-4 my-2 font-mono text-xs">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-body text-[var(--erp-text)]">Surat Ring Road Textile Mkt</span>
                  <span className="font-mono text-[var(--erp-gold)] font-semibold">₹7.11 Cr (48.0%)</span>
                </div>
                <div className="w-full h-2 bg-[var(--erp-surface-2)] overflow-hidden">
                  <div className="h-full bg-[var(--erp-gold)]" style={{ width: '48%' }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-body text-[var(--erp-text)]">Ahmedabad Narol Central</span>
                  <span className="font-mono text-[var(--erp-positive)] font-semibold">₹5.04 Cr (34.0%)</span>
                </div>
                <div className="w-full h-2 bg-[var(--erp-surface-2)] overflow-hidden">
                  <div className="h-full bg-[var(--erp-positive)]" style={{ width: '34%' }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-body text-[var(--erp-text)]">Rajkot Commercial Hub</span>
                  <span className="font-mono text-[var(--erp-muted)] font-semibold">₹2.67 Cr (18.0%)</span>
                </div>
                <div className="w-full h-2 bg-[var(--erp-surface-2)] overflow-hidden">
                  <div className="h-full bg-[var(--erp-muted)]" style={{ width: '18%' }} />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[var(--erp-hairline)] flex justify-between text-[11px] font-mono text-[var(--erp-muted)]">
            <span>Primary Driver: 60x60 Cambric</span>
            <span>Monthly Run-rate: ₹1.23 Cr</span>
          </div>
        </div>

        {/* Working Capital & Liquidity KPI Panel - 14px radius */}
        <div
          className="border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] p-5 rounded-[14px] flex flex-col justify-between"
          style={{ boxShadow: 'var(--erp-shadow)' }}
        >
          <div>
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-[var(--erp-hairline)]">
              <span className="font-display text-sm font-bold text-[var(--erp-text)] flex items-center gap-2">
                <DollarSign className="w-4 h-4 stroke-[1.75] text-[var(--erp-positive)]" />
                Working Capital Velocity
              </span>
              <span className="erp-badge erp-badge-jade text-[10px]">Ratio: 1.81</span>
            </div>

            <div className="grid grid-cols-2 gap-3 my-2 font-mono text-xs">
              <div className="p-3 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)]">
                <span className="font-body text-[10px] text-[var(--erp-muted)] block uppercase">Debtor Days (DSO)</span>
                <span className="font-mono text-lg font-bold text-[var(--erp-text)]">38.20 Days</span>
                <span className="font-mono text-[10px] text-[var(--erp-positive)] block">Target: &le; 40.00d</span>
              </div>
              <div className="p-3 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)]">
                <span className="font-body text-[10px] text-[var(--erp-muted)] block uppercase">Creditor Days (DPO)</span>
                <span className="font-mono text-lg font-bold text-[var(--erp-text)]">49.60 Days</span>
                <span className="font-mono text-[10px] text-[var(--erp-muted)] block">Net Margin: +11.40d</span>
              </div>
            </div>
            <p className="font-body text-xs text-[var(--erp-muted)] mt-2">
              Liquid assets exceed short-term mill liabilities by ₹1.76 Cr, meeting Gujarat Textile Commission standard guidelines.
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-[var(--erp-hairline)] flex justify-between text-[11px] font-mono text-[var(--erp-muted)]">
            <span>Cash Conversion: 24.50d</span>
            <span>Low Default Risk</span>
          </div>
        </div>

        {/* Textile Quality Composition KPI Panel - 14px radius */}
        <div
          className="border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] p-5 rounded-[14px] flex flex-col justify-between"
          style={{ boxShadow: 'var(--erp-shadow)' }}
        >
          <div>
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-[var(--erp-hairline)]">
              <span className="font-display text-sm font-bold text-[var(--erp-text)] flex items-center gap-2">
                <TrendingUp className="w-4 h-4 stroke-[1.75] text-[var(--erp-gold)]" />
                Textile Category Share
              </span>
              <span className="erp-badge erp-badge-neutral text-[10px]">Meters Basis</span>
            </div>

            <div className="space-y-2.5 my-2 font-mono text-xs">
              <div className="flex items-center justify-between">
                <span className="font-body text-[var(--erp-text)]">Pure Cotton Grey (60x60/40x40)</span>
                <span className="font-mono text-[var(--erp-text)] font-semibold">58.4%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-body text-[var(--erp-text)]">Rayon Print & Dyed Qualities</span>
                <span className="font-mono text-[var(--erp-text)] font-semibold">22.1%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-body text-[var(--erp-text)]">Poly-Viscose Twill Suiting</span>
                <span className="font-mono text-[var(--erp-text)] font-semibold">12.5%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-body text-[var(--erp-text)]">Cotton Yarn & Jacquard Weaves</span>
                <span className="font-mono text-[var(--erp-text)] font-semibold">7.0%</span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[var(--erp-hairline)] flex justify-between text-[11px] font-mono text-[var(--erp-muted)]">
            <span>Avg Realization: ₹51.20/m</span>
            <span>Surat Rate Trend: Steady</span>
          </div>
        </div>
      </div>

      {/* High-Value Overdue Accounts — Sharp-Cornered Data Table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-serif text-lg font-bold text-[var(--erp-text)] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-[var(--erp-negative)]" />
              Debtor Outstanding & Credit Aging
            </h3>
            <p className="text-xs text-[var(--erp-muted)] font-sans">
              Parties requiring broker follow-up or payment hold before dispatching fresh textile orders.
            </p>
          </div>
          <button
            onClick={() => navigateTo(26)} // Go to Party Ledger
            className="text-xs font-mono text-[var(--erp-gold)] hover:underline"
          >
            Open Full Ledger Report →
          </button>
        </div>

        <DataTable
          columns={overdueColumns}
          data={overdueAccounts}
          keyExtractor={r => r.partyName}
          rowClassName={r =>
            r.riskStatus === 'critical' || r.overdueDays > 15
              ? 'bg-[rgba(217,99,90,0.07)] hover:bg-[rgba(217,99,90,0.13)] border-l-2 border-l-[var(--erp-negative)]'
              : r.riskStatus === 'notice'
              ? 'bg-[rgba(201,162,78,0.04)] hover:bg-[rgba(201,162,78,0.09)]'
              : ''
          }
        />
      </div>
    </div>
  );
};
