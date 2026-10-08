/**
 * Run: npx tsx src/components/common/FileDropZone.test.tsx
 */
import { fileMatchesAccept } from './FileDropZone';

const accept = '.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel';
const excelXlsx = new File(['xlsx'], 'lines.xlsx', {
  type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
});
const excelXls = new File(['xls'], 'lines.xls', { type: 'application/vnd.ms-excel' });
const csv = new File(['a,b'], 'lines.csv', { type: 'text/csv' });
const pdf = new File(['pdf'], 'lines.pdf', { type: 'application/pdf' });
const txt = new File(['text'], 'lines.txt', { type: 'text/plain' });

console.assert(fileMatchesAccept(excelXlsx, accept), 'xlsx picker/drop should be accepted');
console.assert(fileMatchesAccept(excelXls, accept), 'xls picker/drop should be accepted');
console.assert(!fileMatchesAccept(csv, accept), 'csv picker/drop should be rejected');
console.assert(!fileMatchesAccept(pdf, accept), 'pdf picker/drop should be rejected');
console.assert(!fileMatchesAccept(txt, accept), 'txt picker/drop should be rejected');
console.log('fileDropZone Excel acceptance tests passed');
