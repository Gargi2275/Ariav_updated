export type ThemeMode = 'dark' | 'light';

export type UserRole = 'admin' | 'operator';

export type ScreenCategory = 'Auth' | 'Admin' | 'Core Operations' | 'Masters' | 'Reports';

export interface ScreenDefinition {
  id: number;
  slug: string;
  title: string;
  category: ScreenCategory;
  subtitle: string;
  iconName: string;
  shortcut?: string;
}

export const ERP_SCREENS: ScreenDefinition[] = [
  // Auth
  { id: 1, slug: 'login', title: 'Dual Login Gate', category: 'Auth', subtitle: 'Admin PIN / Operator Live Request', iconName: 'Shield', shortcut: '1' },
  { id: 2, slug: 'operator-waiting', title: 'Operator Terminal Hold', category: 'Auth', subtitle: 'Real-time Approval Polling', iconName: 'Clock', shortcut: '2' },
  { id: 3, slug: 'verbal-otp', title: 'Verbal OTP Gate', category: 'Auth', subtitle: '5-Minute Expiry Countdown', iconName: 'LockKeyhole', shortcut: '3' },
  { id: 4, slug: 'pin-setup', title: 'Admin PIN Provisioning', category: 'Auth', subtitle: 'Secure Keypad & Recovery Email', iconName: 'KeyRound', shortcut: '4' },
  
  // Admin
  { id: 5, slug: 'approval-queue', title: 'Live Approval Queue', category: 'Admin', subtitle: 'Operator Requests & Verbal OTP Reveal', iconName: 'Radio', shortcut: '5' },
  { id: 6, slug: 'analytics', title: 'Business Analytics & Position', category: 'Admin', subtitle: 'Sales, Collections, Branch Split & Brokers', iconName: 'TrendingUp', shortcut: '6' },
  { id: 7, slug: 'menu-rights', title: 'Menu Rights / Role Permissions', category: 'Admin', subtitle: 'Granular Read/Write/Post Matrix', iconName: 'SlidersHorizontal', shortcut: '7' },
  { id: 8, slug: 'audit-log', title: 'Forensic Audit Log', category: 'Admin', subtitle: 'User Actions, IP Address & Chronological Trail', iconName: 'FileText', shortcut: '8' },
  { id: 9, slug: 'backup', title: 'Backup Trigger & History', category: 'Admin', subtitle: 'Manual Snapshots & Point-in-Time Restore', iconName: 'HardDrive', shortcut: '9' },
  { id: 10, slug: 'year-end-closing', title: 'Year-End Closing Flow', category: 'Admin', subtitle: 'Checklist, Rollover Preview & Archive Lock', iconName: 'CalendarCheck', shortcut: '10' },

  // Core Operations
  { id: 11, slug: 'order-booking', title: 'Order Form & Bulk JSON Import', category: 'Core Operations', subtitle: 'Single Entry + 50MB Bulk JSON Stream', iconName: 'ShoppingBag', shortcut: '11' },
  { id: 12, slug: 'sales-invoice', title: 'Sales Tax Invoice', category: 'Core Operations', subtitle: 'Line Items, GST Split & Running Totals', iconName: 'Receipt', shortcut: '12' },
  { id: 13, slug: 'bank-receipt', title: 'Bank Receipt Voucher', category: 'Core Operations', subtitle: 'Cheque/NEFT/RTGS & Invoice Allocation', iconName: 'Landmark', shortcut: '13' },
  { id: 14, slug: 'cash-receipt', title: 'Cash Receipt Voucher', category: 'Core Operations', subtitle: 'Denomination Counter & Vault Balance', iconName: 'Coins', shortcut: '14' },
  { id: 15, slug: 'payments', title: 'Bank & Cash Payment Voucher', category: 'Core Operations', subtitle: 'Bank & Petty Cash Disbursements', iconName: 'CreditCard', shortcut: '15' },
  { id: 16, slug: 'journal-entry', title: 'Double-Entry Journal', category: 'Core Operations', subtitle: 'Live Debit = Credit Equality Balance Check', iconName: 'Scale', shortcut: '16' },
  { id: 17, slug: 'credit-note', title: 'Credit Note Generator', category: 'Core Operations', subtitle: 'Rate Differences, Commercial Concession & Tax', iconName: 'FileSpreadsheet', shortcut: '17' },
  { id: 18, slug: 'debit-note', title: 'Debit Note Generator', category: 'Core Operations', subtitle: 'Mill Rejections, Fabric Defect & Short Metres', iconName: 'FileMinus', shortcut: '18' },
  { id: 19, slug: 'material-returned', title: 'Material Returned (RTV)', category: 'Core Operations', subtitle: 'Fabric Inspection & Replacement vs Credit', iconName: 'Undo2', shortcut: '19' },
  { id: 20, slug: 'payment-adjustment', title: 'Payment Adjustment', category: 'Core Operations', subtitle: 'Bill-by-Bill FIFO Reconciliation', iconName: 'CheckCheck', shortcut: '20' },

  // Masters
  { id: 21, slug: 'item-master', title: 'Item Master Catalogue', category: 'Masters', subtitle: 'SKU, Description, HSN, Base Price & GST Slab', iconName: 'Boxes', shortcut: '21' },
  { id: 22, slug: 'group-product', title: 'Group Product Master', category: 'Masters', subtitle: 'Yarn, Greige Weaves, GSM Bands & Classification', iconName: 'FolderTree', shortcut: '22' },
  { id: 23, slug: 'party-master', title: 'Account / Party Master', category: 'Masters', subtitle: 'GSTIN, PAN, Credit Limit, Broker & Branches', iconName: 'Users', shortcut: '23' },
  { id: 24, slug: 'branch-master', title: 'Branch Master', category: 'Masters', subtitle: 'Multi-Branch Gujarat Commercial Hubs', iconName: 'Building', shortcut: '24' },
  { id: 25, slug: 'parameters', title: 'Parameters & Operational Codes', category: 'Masters', subtitle: 'Logistics Zones, Fleet, Grades, Shades & Sizing', iconName: 'Sliders', shortcut: '25' },
  { id: 26, slug: 'chart-of-accounts', title: 'Chart of Accounts', category: 'Masters', subtitle: 'Hierarchical Indented General Ledger Tree', iconName: 'Layers', shortcut: '26' },
  { id: 27, slug: 'tax-slabs', title: 'Tax Slab Master', category: 'Masters', subtitle: 'Statutory GST Rates, CGST/SGST/IGST & Cess', iconName: 'Percent', shortcut: '27' },
  { id: 28, slug: 'broker-master', title: 'Broker Master', category: 'Masters', subtitle: 'Commission Rate, Active Status & Linked Accounts', iconName: 'UserCheck', shortcut: '28' },

  // Reports
  { id: 29, slug: 'sales-register', title: 'Sales Register', category: 'Reports', subtitle: 'GSTR-1 Tax Invoicing, Intra/Inter GST & HSN', iconName: 'BookOpen', shortcut: '29' },
  { id: 30, slug: 'purchase-register', title: 'Purchase Register', category: 'Reports', subtitle: 'Mill Inward, ITC GSTR-2B Matching & Rolls', iconName: 'ShoppingCart', shortcut: '30' },
  { id: 31, slug: 'ledger-report', title: 'Ledger Report (Party & GL)', category: 'Reports', subtitle: 'Continuous Running Balance & Print Sheet', iconName: 'BookCopy', shortcut: '31' },
  { id: 32, slug: 'trial-balance', title: 'Trial Balance Audit', category: 'Reports', subtitle: 'Debit/Credit Totals & One-Click Drilldown', iconName: 'Scale', shortcut: '32' },
  { id: 33, slug: 'balance-sheet', title: 'Balance Sheet', category: 'Reports', subtitle: 'Assets & Liabilities, Current vs Previous FY', iconName: 'Landmark', shortcut: '33' },
  { id: 34, slug: 'profit-loss', title: 'Profit & Loss Statement', category: 'Reports', subtitle: 'Trading Revenue, COGS, Expenses & Net Profit', iconName: 'TrendingUp', shortcut: '34' },
  { id: 35, slug: 'bank-cash-book', title: 'Bank Book & Cash Book', category: 'Reports', subtitle: 'Contra Entries & Daily Closing Balance', iconName: 'Wallet', shortcut: '35' },
];

export type VoucherStatus = 'pending' | 'cleared' | 'posted' | 'rejected' | 'balanced' | 'active';

export interface Branch {
  id: string;
  name: string;
  code: string;
  city: string;
  address?: string;
  phone?: string;
  gstin: string;
  isHeadOffice: boolean;
}

export interface OperatorApprovalRequest {
  id: string;
  operatorName: string;
  operatorCode: string;
  branch: string;
  terminalIp: string;
  actionRequested: string;
  timestamp: string;
  status: 'pending' | 'approved' | 'rejected';
  verbalOtp?: string;
  expiresInSeconds?: number;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  user: string;
  role: string;
  action: string;
  module: string;
  ipAddress: string;
  details: string;
  severity: 'info' | 'notice' | 'critical';
}

export interface Party {
  id: string;
  name: string;
  type: 'debtor' | 'creditor' | 'bank';
  gstin: string;
  pan: string;
  city: string;
  state: string;
  creditLimit: number;
  creditDays: number;
  brokerTag: string;
  branches: string[];
  status: 'active' | 'inactive';
}

export interface ErpItem {
  id: string;
  sku: string;
  description: string;
  hsn: string;
  construction: string;
  unit: string;
  baseRatePerMeter: number;
  taxSlabPercent: number;
}

export interface PartyAccount {
  id: string;
  code: string;
  name: string;
  tradeName: string;
  group: 'Sundry Debtors' | 'Sundry Creditors' | 'Mill Principals' | 'Brokers' | 'Bank Accounts';
  city: string;
  state: string;
  gstin: string;
  pan: string;
  creditLimit: number;
  creditDays: number;
  broker: string;
  currentBalance: number;
  balanceType: 'Dr' | 'Cr';
}

export interface TextileItem {
  id: string;
  sku: string;
  description: string;
  category: 'Grey Fabric' | 'Yarn' | 'Finished Fabric' | 'Processed Jacquard';
  construction: string; // e.g. 60x60 / 92x88
  widthInches: number;
  hsn: string;
  baseRatePerMeter: number;
  packingUnit: 'Meters' | 'Bales' | 'Taka' | 'Kgs';
  stockQuantity: number;
}

export interface InvoiceLineItem {
  id: string;
  itemId: string;
  itemName: string;
  hsn: string;
  quantityMeters: number;
  rollsTaka: number;
  ratePerMeter: number;
  grossAmount: number;
  gstPercent: number;
  gstAmount: number;
  netAmount: number;
}

export interface JournalLine {
  id: string;
  accountId: string;
  accountName: string;
  debit: number;
  credit: number;
  narration: string;
}
