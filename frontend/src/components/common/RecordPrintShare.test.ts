import assert from 'node:assert/strict';
import { formatRecordSummary, recordWhatsAppUrl } from './RecordPrintShare';

const fields = [
  { label: 'Party Name', value: 'A&B Traders' },
  { label: 'Mobile', value: '' },
  { label: 'Address', value: 'Main Street, Surat' },
];

assert.equal(
  formatRecordSummary('Party Details', fields),
  'Party Details\n\nParty Name: A&B Traders\nAddress: Main Street, Surat',
);
assert.equal(
  recordWhatsAppUrl('Party Details', fields),
  `https://wa.me/?text=${encodeURIComponent('Party Details\n\nParty Name: A&B Traders\nAddress: Main Street, Surat')}`,
);
