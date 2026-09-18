import { Branch, PartyAccount, TextileItem, AuditLogEntry } from '../types/erp';

export const INITIAL_BRANCHES: Branch[] = [
  { id: 'BR-AHM', name: 'Ahmedabad Narol Central', code: 'AHM-01', city: 'Ahmedabad', gstin: '24AAACA1234F1Z8', isHeadOffice: true },
  { id: 'BR-SUR', name: 'Surat Ring Road Textile Mkt', code: 'SUR-02', city: 'Surat', gstin: '24AAACA1234F2Z7', isHeadOffice: false },
  { id: 'BR-RJK', name: 'Rajkot Commercial Hub', code: 'RJK-03', city: 'Rajkot', gstin: '24AAACA1234F3Z6', isHeadOffice: false },
  { id: 'BR-BHL', name: 'Bhilwara Transit Depot', code: 'BHL-04', city: 'Bhilwara', gstin: '08AAACA1234F4Z5', isHeadOffice: false },
];

export const INITIAL_PARTIES: PartyAccount[] = [
  {
    id: 'PT-1001',
    code: 'SHR-041',
    name: 'Sharda Synthetics Pvt Ltd',
    tradeName: 'Sharda Textiles Surat',
    group: 'Sundry Debtors',
    city: 'Surat',
    state: 'Gujarat',
    gstin: '24AABCS8891P1ZV',
    pan: 'AABCS8891P',
    creditLimit: 2500000,
    creditDays: 45,
    broker: 'Jigneshbhai Vora (JV-09)',
    currentBalance: 1482950,
    balanceType: 'Dr'
  },
  {
    id: 'PT-1002',
    code: 'ARV-019',
    name: 'Arvind Commercial Agency',
    tradeName: 'Arvind Depot Ahmedabad',
    group: 'Sundry Debtors',
    city: 'Ahmedabad',
    state: 'Gujarat',
    gstin: '24AAACA4021K1ZZ',
    pan: 'AAACA4021K',
    creditLimit: 5000000,
    creditDays: 30,
    broker: 'Chandrakant Parekh (CP-03)',
    currentBalance: 3120400,
    balanceType: 'Dr'
  },
  {
    id: 'PT-1003',
    code: 'SOM-092',
    name: 'Somnath Weaving Mills',
    tradeName: 'Somnath Textiles Narol',
    group: 'Sundry Creditors',
    city: 'Ahmedabad',
    state: 'Gujarat',
    gstin: '24AAAFS9920M1ZA',
    pan: 'AAAFS9920M',
    creditLimit: 4000000,
    creditDays: 60,
    broker: 'Direct Mill Contract',
    currentBalance: 2740000,
    balanceType: 'Cr'
  },
  {
    id: 'PT-1004',
    code: 'KUB-114',
    name: 'Kuber Dyeing & Printing Mills',
    tradeName: 'Kuber Processors Pandesara',
    group: 'Sundry Creditors',
    city: 'Surat',
    state: 'Gujarat',
    gstin: '24AABFK4512E1ZQ',
    pan: 'AABFK4512E',
    creditLimit: 3500000,
    creditDays: 45,
    broker: 'Mukeshbhai Shah (MS-14)',
    currentBalance: 1894200,
    balanceType: 'Cr'
  },
  {
    id: 'PT-1005',
    code: 'PAT-088',
    name: 'Patel & Brothers Textiles',
    tradeName: 'Patel Cloth Maskati Mkt',
    group: 'Sundry Debtors',
    city: 'Ahmedabad',
    state: 'Gujarat',
    gstin: '24AAPBP8120L1ZP',
    pan: 'AAPBP8120L',
    creditLimit: 1500000,
    creditDays: 21,
    broker: 'Jigneshbhai Vora (JV-09)',
    currentBalance: 642800,
    balanceType: 'Dr'
  },
  {
    id: 'PT-1006',
    code: 'HDF-001',
    name: 'HDFC Bank - Textile Mkt CA 50200049182',
    tradeName: 'HDFC Current A/c Ring Rd',
    group: 'Bank Accounts',
    city: 'Surat',
    state: 'Gujarat',
    gstin: '24HDFCB00001Z9',
    pan: 'AAACH0001H',
    creditLimit: 0,
    creditDays: 0,
    broker: 'None',
    currentBalance: 8419250,
    balanceType: 'Dr'
  },
  {
    id: 'PT-1007',
    code: 'SBI-002',
    name: 'State Bank of India - Narol CA 3819402811',
    tradeName: 'SBI Narol Industrial A/c',
    group: 'Bank Accounts',
    city: 'Ahmedabad',
    state: 'Gujarat',
    gstin: '24SBIN00002Z1',
    pan: 'AAACS0002S',
    creditLimit: 0,
    creditDays: 0,
    broker: 'None',
    currentBalance: 4210600,
    balanceType: 'Dr'
  }
];

export const INITIAL_ITEMS: TextileItem[] = [
  {
    id: 'IT-001',
    sku: 'GRY-6060-58',
    description: 'Cotton Cambric Grey Fabric 60x60 / 92x88 58"',
    category: 'Grey Fabric',
    construction: '60s x 60s / 92 x 88',
    widthInches: 58,
    hsn: '52081190',
    baseRatePerMeter: 48.50,
    packingUnit: 'Meters',
    stockQuantity: 42800
  },
  {
    id: 'IT-002',
    sku: 'GRY-4040-44',
    description: 'Cotton Poplin Grey Fabric 40x40 / 100x92 44"',
    category: 'Grey Fabric',
    construction: '40s x 40s / 100 x 92',
    widthInches: 44,
    hsn: '52081290',
    baseRatePerMeter: 38.25,
    packingUnit: 'Meters',
    stockQuantity: 61400
  },
  {
    id: 'IT-003',
    sku: 'FIN-RAY-14K',
    description: 'Heavy Rayon Dyed & Discharge Print 14kg 44"',
    category: 'Finished Fabric',
    construction: '30s Rayon x 30s Rayon',
    widthInches: 44,
    hsn: '54075200',
    baseRatePerMeter: 62.00,
    packingUnit: 'Taka',
    stockQuantity: 18900
  },
  {
    id: 'IT-004',
    sku: 'FIN-PLY-TWL',
    description: 'Poly-Cotton Micro Twill Suiting Finish 58"',
    category: 'Finished Fabric',
    construction: '80/2 PV x 80/2 PV',
    widthInches: 58,
    hsn: '55151100',
    baseRatePerMeter: 94.00,
    packingUnit: 'Meters',
    stockQuantity: 12500
  },
  {
    id: 'IT-005',
    sku: 'YRN-30C-WARP',
    description: '100% Cotton Carded Cone Yarn 30s AutoConed',
    category: 'Yarn',
    construction: '30s Ne Single Warp Quality',
    widthInches: 0,
    hsn: '52051210',
    baseRatePerMeter: 245.00, // per kg
    packingUnit: 'Kgs',
    stockQuantity: 8400
  },
  {
    id: 'IT-006',
    sku: 'JAC-BRO-MET',
    description: 'Brocade Metallic Jacquard Loom Fabric 54"',
    category: 'Processed Jacquard',
    construction: '75D Poly x 150D Zari',
    widthInches: 54,
    hsn: '54078400',
    baseRatePerMeter: 128.50,
    packingUnit: 'Meters',
    stockQuantity: 9150
  }
];

export const INITIAL_AUDIT_LOGS: AuditLogEntry[] = [
  {
    id: 'AUD-8910',
    timestamp: '2026-09-08 11:41:20',
    user: 'Bhargav Akshaya (Admin)',
    role: 'Managing Partner',
    action: 'Approved verbal OTP for Operator #OP-02',
    module: 'Security Gate',
    ipAddress: '10.0.4.11',
    details: 'Verbal security code [315-772] verified via live admin terminal',
    severity: 'info'
  },
  {
    id: 'AUD-8909',
    timestamp: '2026-09-08 11:34:02',
    user: 'Bhavin V. Joshi (OP-04)',
    role: 'Branch Accountant',
    action: 'Attempted invoice deletion above ₹2,00,000 limit',
    module: 'Sales Invoicing',
    ipAddress: '192.168.10.42',
    details: 'System triggered mandatory Dual-Authorization workflow REQ-901',
    severity: 'critical'
  },
  {
    id: 'AUD-8908',
    timestamp: '2026-09-08 11:12:45',
    user: 'Dharmesh K. Panchal (OP-07)',
    role: 'Voucher Operator',
    action: 'Posted Bank Receipt #BR-2025-1049',
    module: 'Banking & Cash',
    ipAddress: '192.168.1.18',
    details: 'Cheque No. 491028 HDFC Surat ₹4,80,000 against INV-2025-0792',
    severity: 'notice'
  },
  {
    id: 'AUD-8907',
    timestamp: '2026-09-08 10:48:19',
    user: 'System Cron',
    role: 'Automated Daemon',
    action: 'Point-in-Time Hot Snapshot Completed',
    module: 'Database Storage',
    ipAddress: '127.0.0.1',
    details: 'Snapshot aria_erp_prod_snapshot_20260908.tar.gz (48.2 MB) verified',
    severity: 'info'
  },
  {
    id: 'AUD-8906',
    timestamp: '2026-09-08 10:15:33',
    user: 'Bhargav Akshaya (Admin)',
    role: 'Managing Partner',
    action: 'Modified Credit Limit for Sharda Synthetics',
    module: 'Account Master',
    ipAddress: '10.0.4.11',
    details: 'Credit limit increased from ₹20,00,000 to ₹25,00,000 on broker note JV-09',
    severity: 'notice'
  }
];
