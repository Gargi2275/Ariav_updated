import { paymentInvoiceSummary, paymentModeFields } from './paymentsApi';

const allocations = [
  { invoice_id: 1, invoice_number: 'INV-1', allocated_amount: '10.00' },
  { invoice_id: 2, invoice_number: 'INV-2', allocated_amount: '20.00' },
];

if (paymentInvoiceSummary({ allocations }) !== 'INV-1 +1 more') {
  throw new Error('invoice summary should show the first invoice and remaining count');
}
if (paymentInvoiceSummary({ allocations: [] }) !== 'Unallocated') {
  throw new Error('empty allocations should be unallocated');
}
if (!paymentModeFields('Cheque').showInstrument || !paymentModeFields('Cheque').showDepositAccount) {
  throw new Error('cheque mode should show instrument and deposit fields');
}
if (paymentModeFields('Cash').showPayerBank || paymentModeFields('Cash').showDepositAccount) {
  throw new Error('cash mode should hide bank detail fields');
}
if (!paymentModeFields('NEFT').showPayerBank || !paymentModeFields('NEFT').showDepositAccount) {
  throw new Error('online mode should show payer bank and deposit account');
}

console.log('payment display tests passed');
