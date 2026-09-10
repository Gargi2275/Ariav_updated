import React, { useState } from 'react';
import { useErp } from '../../context/ErpContext';
import { PageHeader } from '../../components/common/PageHeader';
import { 
  FolderTree, 
  ChevronRight, 
  ChevronDown, 
  Search, 
  Folder, 
  FileCode, 
  Plus, 
  CheckCircle2, 
  Scale, 
  X, 
  Save, 
  Maximize2, 
  Minimize2,
  Filter,
  DollarSign
} from 'lucide-react';

export interface AccountNode {
  code: string;
  name: string;
  nature: 'Debit' | 'Credit';
  balance: number;
  category: 'Assets' | 'Liabilities' | 'Revenue' | 'Expenses';
  children?: AccountNode[];
}

const INITIAL_TREE: AccountNode[] = [
  {
    code: '1000',
    name: 'ASSETS',
    nature: 'Debit',
    balance: 84200000,
    category: 'Assets',
    children: [
      {
        code: '1100',
        name: 'Current Assets',
        nature: 'Debit',
        balance: 62400000,
        category: 'Assets',
        children: [
          {
            code: '1110',
            name: 'Cash & Liquid Bank Balances',
            nature: 'Debit',
            balance: 12600000,
            category: 'Assets',
            children: [
              { code: '1111', name: 'HDFC Bank CA #50200049182 (Surat)', nature: 'Debit', balance: 8420000, category: 'Assets' },
              { code: '1112', name: 'State Bank of India CA #3819402811 (Narol)', nature: 'Debit', balance: 3840000, category: 'Assets' },
              { code: '1115', name: 'Petty Cash Till (Surat Head Office)', nature: 'Debit', balance: 340000, category: 'Assets' },
            ]
          },
          {
            code: '1120',
            name: 'Sundry Debtors (Textile Buyers)',
            nature: 'Debit',
            balance: 39400000,
            category: 'Assets',
            children: [
              { code: '1121', name: 'Sharda Synthetics Pvt Ltd (Surat)', nature: 'Debit', balance: 1482950, category: 'Assets' },
              { code: '1122', name: 'Patel & Brothers Textiles (Ahmedabad)', nature: 'Debit', balance: 642800, category: 'Assets' },
              { code: '1123', name: 'Marwadi Fashion Fabrics (Bhilwara)', nature: 'Debit', balance: 980000, category: 'Assets' },
              { code: '1124', name: 'Radhika Rayon Prints (Mumbai Depot)', nature: 'Debit', balance: 1240000, category: 'Assets' },
            ]
          },
          {
            code: '1130',
            name: 'Finished & Grey Fabric Inventory',
            nature: 'Debit',
            balance: 6800000,
            category: 'Assets',
            children: [
              { code: '1131', name: 'Grey Cambric 60x60 Stock Yard', nature: 'Debit', balance: 4120000, category: 'Assets' },
              { code: '1132', name: 'Rayon Viscose Stock Yard', nature: 'Debit', balance: 2680000, category: 'Assets' },
            ]
          },
          {
            code: '1140',
            name: 'GST Input Tax Credit (ITC Pool)',
            nature: 'Debit',
            balance: 3600000,
            category: 'Assets',
            children: [
              { code: '1141', name: 'CGST Input Tax Credit A/c', nature: 'Debit', balance: 1800000, category: 'Assets' },
              { code: '1142', name: 'SGST Input Tax Credit A/c', nature: 'Debit', balance: 1800000, category: 'Assets' },
            ]
          }
        ]
      },
      {
        code: '1200',
        name: 'Fixed & Long-Term Assets',
        nature: 'Debit',
        balance: 21800000,
        category: 'Assets',
        children: [
          { code: '1210', name: 'Ring Road Commercial Office Premises', nature: 'Debit', balance: 18500000, category: 'Assets' },
          { code: '1220', name: 'Depot Warehouse Fixtures & Racks', nature: 'Debit', balance: 3300000, category: 'Assets' },
        ]
      }
    ]
  },
  {
    code: '2000',
    name: 'LIABILITIES & EQUITY',
    nature: 'Credit',
    balance: 84200000,
    category: 'Liabilities',
    children: [
      {
        code: '2100',
        name: 'Current Liabilities',
        nature: 'Credit',
        balance: 31800000,
        category: 'Liabilities',
        children: [
          {
            code: '2110',
            name: 'Sundry Creditors (Weaving Mills & Dyers)',
            nature: 'Credit',
            balance: 21800000,
            category: 'Liabilities',
            children: [
              { code: '2111', name: 'Arvind Commercial Agency (Ahmedabad)', nature: 'Credit', balance: 3120400, category: 'Liabilities' },
              { code: '2112', name: 'Radhe Dyeing & Processing Mills', nature: 'Credit', balance: 1420000, category: 'Liabilities' },
              { code: '2113', name: 'Reliance Weaving Industries (Surat)', nature: 'Credit', balance: 4200000, category: 'Liabilities' },
            ]
          },
          {
            code: '2120',
            name: 'Statutory Duties & Taxes Payable',
            nature: 'Credit',
            balance: 10000000,
            category: 'Liabilities',
            children: [
              { code: '2121', name: 'GST Output Tax Payable (CGST/SGST)', nature: 'Credit', balance: 8400000, category: 'Liabilities' },
              { code: '2122', name: 'TDS Payable (Sec 194H Brokerage)', nature: 'Credit', balance: 1600000, category: 'Liabilities' },
            ]
          }
        ]
      },
      {
        code: '2200',
        name: 'Partner Capital Accounts',
        nature: 'Credit',
        balance: 52400000,
        category: 'Liabilities',
        children: [
          { code: '2201', name: 'Paresh Patel Partner Capital A/c (60%)', nature: 'Credit', balance: 31440000, category: 'Liabilities' },
          { code: '2202', name: 'Ramesh Patel Partner Capital A/c (40%)', nature: 'Credit', balance: 20960000, category: 'Liabilities' },
        ]
      }
    ]
  },
  {
    code: '3000',
    name: 'REVENUE & TRADING INFLOWS',
    nature: 'Credit',
    balance: 148200000,
    category: 'Revenue',
    children: [
      { code: '3100', name: 'Sales of Grey Cotton & Cambric Fabrics', nature: 'Credit', balance: 118560000, category: 'Revenue' },
      { code: '3200', name: 'Agency Trading Brokerage Commission', nature: 'Credit', balance: 29640000, category: 'Revenue' }
    ]
  },
  {
    code: '4000',
    name: 'EXPENSES & PRODUCTION COSTS',
    nature: 'Debit',
    balance: 105400000,
    category: 'Expenses',
    children: [
      { code: '4100', name: 'Fabric Inward Freight & Cartage', nature: 'Debit', balance: 6420000, category: 'Expenses' },
      { code: '4200', name: 'Brokerage & Sub-Agency Disbursed', nature: 'Debit', balance: 14800000, category: 'Expenses' },
      { code: '4300', name: 'Loom Inspection & Mending Wages', nature: 'Debit', balance: 3820000, category: 'Expenses' },
      { code: '4400', name: 'Depot Power & Administrative Overheads', nature: 'Debit', balance: 2860000, category: 'Expenses' }
    ]
  }
];

export const ChartOfAccountsScreen: React.FC = () => {
  const { showFlash, addAuditLog } = useErp();
  const [treeData, setTreeData] = useState<AccountNode[]>(INITIAL_TREE);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterNature, setFilterNature] = useState<'All' | 'Debit' | 'Credit'>('All');
  
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({
    '1000': true,
    '1100': true,
    '1110': true,
    '1120': true,
    '2000': true,
    '2100': true,
    '2110': true,
    '3000': true,
    '4000': true,
  });

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedParentCode, setSelectedParentCode] = useState('1120');
  const [newAccountCode, setNewAccountCode] = useState('1125');
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountNature, setNewAccountNature] = useState<'Debit' | 'Credit'>('Debit');
  const [newAccountBalance, setNewAccountBalance] = useState<number>(0);

  const toggleNode = (code: string) => {
    setExpandedNodes(prev => ({ ...prev, [code]: !prev[code] }));
  };

  const handleExpandAll = () => {
    const allCodes: Record<string, boolean> = {};
    const traverse = (nodes: AccountNode[]) => {
      nodes.forEach(n => {
        allCodes[n.code] = true;
        if (n.children) traverse(n.children);
      });
    };
    traverse(treeData);
    setExpandedNodes(allCodes);
  };

  const handleCollapseAll = () => {
    setExpandedNodes({});
  };

  const handleOpenAddModal = (parentCode?: string) => {
    if (parentCode) setSelectedParentCode(parentCode);
    setNewAccountCode(`GL-${Math.floor(1000 + Math.random() * 9000)}`);
    setNewAccountName('');
    setNewAccountBalance(0);
    setIsAddModalOpen(true);
  };

  const handleCreateAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccountName || !newAccountCode) return;

    const newNode: AccountNode = {
      code: newAccountCode,
      name: newAccountName,
      nature: newAccountNature,
      balance: newAccountBalance,
      category: newAccountNature === 'Debit' ? 'Assets' : 'Liabilities'
    };

    // Recursive helper to insert child under selectedParentCode
    const insertChild = (nodes: AccountNode[]): AccountNode[] => {
      return nodes.map(node => {
        if (node.code === selectedParentCode) {
          return {
            ...node,
            children: node.children ? [...node.children, newNode] : [newNode]
          };
        }
        if (node.children) {
          return { ...node, children: insertChild(node.children) };
        }
        return node;
      });
    };

    setTreeData(prev => insertChild(prev));
    setExpandedNodes(prev => ({ ...prev, [selectedParentCode]: true }));
    setIsAddModalOpen(false);
    addAuditLog('Created General Ledger Head', 'Chart of Accounts', `Added ${newAccountCode} - ${newAccountName}`, 'info');
    showFlash(`Ledger Head ${newAccountName} added under ${selectedParentCode}`, 'positive');
  };

  const renderNode = (node: AccountNode, depth = 0) => {
    const isExpanded = !!expandedNodes[node.code];
    const hasChildren = node.children && node.children.length > 0;

    const matchesSearch =
      searchTerm === '' ||
      node.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      node.code.includes(searchTerm);

    const matchesNature = filterNature === 'All' || node.nature === filterNature;

    if (!matchesSearch && !hasChildren) return null;
    if (!matchesNature && !hasChildren) return null;

    return (
      <div key={node.code} className="text-left select-none">
        <div
          className={`flex items-center justify-between py-2 px-3 hover:bg-[var(--erp-surface-2)] transition-colors border-b border-[var(--erp-hairline)]/50 group ${
            depth === 0 ? 'bg-[var(--erp-surface-2)]/60 font-semibold' : ''
          }`}
          style={{ paddingLeft: `${depth * 20 + 12}px` }}
        >
          <div 
            onClick={() => hasChildren && toggleNode(node.code)}
            className="flex items-center gap-2 cursor-pointer flex-1"
          >
            {hasChildren ? (
              <span className="text-[var(--erp-muted)]">
                {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-[var(--erp-gold)]" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </span>
            ) : (
              <span className="w-3.5 h-3.5" />
            )}

            {hasChildren ? (
              <Folder className="w-3.5 h-3.5 text-[var(--erp-gold)] shrink-0" />
            ) : (
              <FileCode className="w-3.5 h-3.5 text-[var(--erp-muted)] shrink-0" />
            )}

            <span className="font-mono text-xs text-[var(--erp-gold)] font-medium">
              {node.code}
            </span>

            <span className={`text-xs ${depth === 0 ? 'font-display text-sm font-bold text-[var(--erp-text)]' : 'font-body font-medium text-[var(--erp-text)]'}`}>
              {node.name}
            </span>
          </div>

          <div className="flex items-center gap-4 font-mono text-xs">
            <span className={`text-[10px] uppercase px-1.5 py-0.5 border ${
              node.nature === 'Debit' 
                ? 'border-[var(--erp-positive)]/40 text-[var(--erp-positive)]' 
                : 'border-[var(--erp-gold)]/40 text-[var(--erp-gold)]'
            }`}>
              {node.nature}
            </span>
            <span className="text-right w-36 font-medium text-[var(--erp-text)]">
              ₹{(node.balance / 100000).toLocaleString('en-IN', { minimumFractionDigits: 2 })} L
            </span>
            {hasChildren && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenAddModal(node.code);
                }}
                className="opacity-0 group-hover:opacity-100 p-1 text-[var(--erp-muted)] hover:text-[var(--erp-gold)] transition-opacity"
                title={`Add Sub-account under ${node.code}`}
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {hasChildren && isExpanded && (
          <div>
            {node.children!.map(child => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-6 flex flex-col gap-6 text-left">
      {/* Unified Page Header */}
      <PageHeader
        moduleNumber="26"
        section="Masters"
        title="Chart of Accounts & Ledger Hierarchy"
        subtitle="Hierarchical categorization of Assets, Liabilities, Incomes and Expenses under Gujarat commercial textile standards."
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={handleExpandAll}
              className="px-2.5 py-1.5 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] hover:border-[var(--erp-gold)] text-xs font-mono text-[var(--erp-text)] flex items-center gap-1.5 cursor-pointer"
              title="Expand All Nodes"
            >
              <Maximize2 className="w-3.5 h-3.5 text-[var(--erp-gold)]" /> Expand All
            </button>
            <button
              onClick={handleCollapseAll}
              className="px-2.5 py-1.5 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] hover:border-[var(--erp-gold)] text-xs font-mono text-[var(--erp-text)] flex items-center gap-1.5 cursor-pointer"
              title="Collapse All Nodes"
            >
              <Minimize2 className="w-3.5 h-3.5 text-[var(--erp-muted)]" /> Collapse
            </button>
            <button
              onClick={() => handleOpenAddModal('1100')}
              className="px-4 py-1.5 bg-[var(--erp-gold)] text-[#0F141B] font-body text-xs font-semibold hover:bg-[var(--erp-gold-soft)] transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Add Ledger Head
            </button>
          </div>
        }
      />

      {/* Equality & Metrics Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-3.5 border border-[var(--erp-hairline)] bg-[var(--erp-surface)]">
          <span className="text-[11px] font-mono text-[var(--erp-muted)] block">TOTAL ASSETS (DR)</span>
          <span className="font-mono text-lg font-bold text-[var(--erp-positive)]">₹8.42 Cr</span>
        </div>
        <div className="p-3.5 border border-[var(--erp-hairline)] bg-[var(--erp-surface)]">
          <span className="text-[11px] font-mono text-[var(--erp-muted)] block">TOTAL LIABILITIES (CR)</span>
          <span className="font-mono text-lg font-bold text-[var(--erp-gold)]">₹8.42 Cr</span>
        </div>
        <div className="p-3.5 border border-[var(--erp-hairline)] bg-[var(--erp-surface)]">
          <span className="text-[11px] font-mono text-[var(--erp-muted)] block">ANNUAL REVENUE (FY25)</span>
          <span className="font-mono text-lg font-bold text-[var(--erp-text)]">₹14.82 Cr</span>
        </div>
        <div className="p-3.5 border border-[var(--erp-hairline)] bg-[var(--erp-surface)] flex items-center justify-between">
          <div>
            <span className="text-[11px] font-mono text-[var(--erp-muted)] block">TRIAL EQUALITY</span>
            <span className="font-mono text-xs font-bold text-[var(--erp-positive)] flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> 100% Balanced (0.00 Variance)
            </span>
          </div>
          <Scale className="w-5 h-5 text-[var(--erp-gold)]" />
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] p-3">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 text-[var(--erp-muted)] absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Filter chart of accounts by code (e.g., 1121) or title..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] focus:border-[var(--erp-gold)] focus:outline-none font-mono"
          />
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto font-mono text-xs">
          <span className="text-[var(--erp-muted)]">Nature:</span>
          {(['All', 'Debit', 'Credit'] as const).map(n => (
            <button
              key={n}
              onClick={() => setFilterNature(n)}
              className={`px-3 py-1 border transition-colors cursor-pointer ${
                filterNature === n
                  ? 'bg-[var(--erp-surface-2)] border-[var(--erp-gold)] text-[var(--erp-gold)] font-bold'
                  : 'bg-[var(--erp-surface)] border-[var(--erp-hairline)] text-[var(--erp-muted)]'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Hierarchical Tree Container */}
      <div className="border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] overflow-hidden">
        <div className="bg-[var(--erp-surface-2)] border-b border-[var(--erp-hairline-strong)] px-4 py-2.5 font-mono text-xs text-[var(--erp-muted)] flex justify-between">
          <span>ACCOUNT HEAD & HIERARCHICAL CODE TREE</span>
          <div className="flex items-center gap-12">
            <span>NATURE</span>
            <span className="w-36 text-right">BALANCE (₹ IN LAKHS)</span>
            <span className="w-4" />
          </div>
        </div>

        <div className="divide-y divide-[var(--erp-hairline)]">
          {treeData.map(node => renderNode(node, 0))}
        </div>
      </div>

      {/* Add Ledger Head Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] p-6 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-[var(--erp-hairline)]">
              <div className="flex items-center gap-2">
                <FolderTree className="w-4 h-4 text-[var(--erp-gold)]" />
                <h3 className="font-display text-base font-bold text-[var(--erp-text)]">
                  Add General Ledger Account Head
                </h3>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 text-[var(--erp-muted)] hover:text-[var(--erp-text)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateAccount} className="space-y-4 text-left">
              <div>
                <label className="block font-mono text-xs text-[var(--erp-muted)] mb-1">
                  Parent Account Group
                </label>
                <select
                  value={selectedParentCode}
                  onChange={e => setSelectedParentCode(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs font-mono bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] focus:border-[var(--erp-gold)] focus:outline-none"
                >
                  <option value="1110">1110 • Cash & Liquid Bank Balances</option>
                  <option value="1120">1120 • Sundry Debtors (Textile Buyers)</option>
                  <option value="1130">1130 • Finished & Grey Fabric Inventory</option>
                  <option value="1200">1200 • Fixed & Long-Term Assets</option>
                  <option value="2110">2110 • Sundry Creditors (Weaving Mills)</option>
                  <option value="2120">2120 • Statutory Duties & Taxes Payable</option>
                  <option value="3000">3000 • Revenue & Trading Inflows</option>
                  <option value="4000">4000 • Expenses & Production Costs</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-mono text-xs text-[var(--erp-muted)] mb-1">
                    Account Code
                  </label>
                  <input
                    type="text"
                    required
                    value={newAccountCode}
                    onChange={e => setNewAccountCode(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs font-mono bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] focus:border-[var(--erp-gold)] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-mono text-xs text-[var(--erp-muted)] mb-1">
                    Nature of Account
                  </label>
                  <select
                    value={newAccountNature}
                    onChange={e => setNewAccountNature(e.target.value as 'Debit' | 'Credit')}
                    className="w-full px-3 py-1.5 text-xs font-mono bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] focus:border-[var(--erp-gold)] focus:outline-none"
                  >
                    <option value="Debit">Debit (Dr)</option>
                    <option value="Credit">Credit (Cr)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-mono text-xs text-[var(--erp-muted)] mb-1">
                  Account Name / Title
                </label>
                <input
                  type="text"
                  required
                  value={newAccountName}
                  onChange={e => setNewAccountName(e.target.value)}
                  placeholder="e.g. Surat Commercial Bank OD A/c"
                  className="w-full px-3 py-1.5 text-xs font-body bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] focus:border-[var(--erp-gold)] focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-mono text-xs text-[var(--erp-muted)] mb-1">
                  Opening Ledger Balance (₹)
                </label>
                <input
                  type="number"
                  value={newAccountBalance}
                  onChange={e => setNewAccountBalance(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-1.5 text-xs font-mono bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] focus:border-[var(--erp-gold)] focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--erp-hairline)]">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-1.5 border border-[var(--erp-hairline)] text-xs font-mono text-[var(--erp-muted)] hover:text-[var(--erp-text)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[var(--erp-gold)] text-[#0F141B] font-body text-xs font-semibold hover:bg-[var(--erp-gold-soft)] transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" /> Save Ledger Head
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
