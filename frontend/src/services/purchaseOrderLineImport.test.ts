import * as XLSX from 'xlsx';
import {
  MAX_LINE_IMPORT_ROWS,
  isDigitalPoBrand,
  parsePurchaseOrderLines,
  type LineImportProduct,
} from './purchaseOrderLineImport';

const products: LineImportProduct[] = [
  { id: 1, product_code: 'SKU-1', product_name: 'Blue Fabric', category_id: 10 },
];

function file(rows: unknown[][]): File {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'Lines');
  const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
  return new File([bytes], 'lines.xlsx');
}

const valid = await parsePurchaseOrderLines(file([
  ['Product', 'Qty', 'Rate'],
  [' sku-1 ', 2, 10],
]), products);
console.assert(valid.rows.length === 1 && valid.rows[0].product.id === 1, 'valid row should load');
console.assert(valid.rows[0].quantity === '2' && valid.rows[0].rate === '10', 'numeric values should load');

const xlsWorkbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(xlsWorkbook, XLSX.utils.aoa_to_sheet([
  ['Product', 'Qty', 'Rate'],
  ['SKU-1', 1, 5],
]), 'Lines');
const xlsFile = new File([XLSX.write(xlsWorkbook, { type: 'array', bookType: 'xls' })], 'lines.xls');
const xlsResult = await parsePurchaseOrderLines(xlsFile, products);
console.assert(xlsResult.rows.length === 1, 'xls rows should load');

try {
  await parsePurchaseOrderLines(new File(['not an excel workbook'], 'renamed.xlsx'), products);
  throw new Error('corrupted workbook test failed');
} catch (error) {
  console.assert(
    /could not be read|Missing required column/.test(String(error)),
    'corrupted xlsx should show parse error',
  );
}

const invalid = await parsePurchaseOrderLines(file([
  ['Product', 'Qty', 'Rate'],
  ['missing', 1, 2],
  ['SKU-1', 0, 2],
  ['SKU-1', 1, -1],
  ['', '', ''],
]), products);
console.assert(invalid.rows.length === 0 && invalid.skipped.length === 3, 'invalid rows should be reported');

try {
  await parsePurchaseOrderLines(file([['Product', 'Qty'], ['SKU-1', 1]]), products);
  throw new Error('missing header test failed');
} catch (error) {
  console.assert(String(error).includes('Rate'), 'missing header should name the missing column');
}

try {
  await parsePurchaseOrderLines(file([['Product', 'Qty', 'Rate']]), products);
  throw new Error('empty file test failed');
} catch (error) {
  console.assert(String(error).includes('no line items'), 'empty file should be reported');
}

console.assert(MAX_LINE_IMPORT_ROWS === 500, 'row cap should remain explicit');
console.assert(isDigitalPoBrand({ order_method: 'Digital PO' }), 'Digital PO should enable upload mode');
console.assert(!isDigitalPoBrand({ order_method: 'Manual/POR' }), 'Manual/POR should hide upload mode');
console.assert(!isDigitalPoBrand(undefined), 'no brand should hide upload mode');
console.log('purchaseOrderLineImport tests passed');
