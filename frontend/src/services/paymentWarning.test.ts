import { paymentDuplicateWarningText } from './paymentsApi';

const warning = paymentDuplicateWarningText('Similar payment already exists: PAY-001.');
if (warning !== 'Similar payment already exists: PAY-001.') {
  throw new Error('duplicate warning should be shown unchanged');
}
if (paymentDuplicateWarningText('   ') !== '') {
  throw new Error('blank duplicate warnings should not be shown');
}

console.log('payment warning tests passed');
