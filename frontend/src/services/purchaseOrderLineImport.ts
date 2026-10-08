import * as XLSX from 'xlsx';
import type { BrandRow } from './brandsApi';
import type { ProductRow } from './productsApi';

export const MAX_LINE_IMPORT_BYTES = 2 * 1024 * 1024;
export const MAX_LINE_IMPORT_ROWS = 500;
export const LINE_IMPORT_HEADERS = ['Product', 'Qty', 'Rate'] as const;

export type LineImportProduct = Pick<ProductRow, 'id' | 'product_code' | 'product_name' | 'category_id'>;

export interface ParsedLineImport {
  rows: Array<{ product: LineImportProduct; quantity: string; rate: string }>;
  skipped: Array<{ rowNumber: number; reason: string }>;
}

export function isDigitalPoBrand(brand?: Pick<BrandRow, 'order_method'>): boolean {
  return brand?.order_method === 'Digital PO';
}

function cellText(value: unknown): string {
  return value === null || value === undefined ? '' : String(value).trim();
}

function normalise(value: unknown): string {
  return cellText(value).toLocaleLowerCase();
}

function numeric(value: unknown): number | null {
  const text = cellText(value);
  if (!text || !Number.isFinite(Number(text))) return null;
  return Number(text);
}

function findProduct(value: unknown, products: LineImportProduct[]): LineImportProduct | undefined {
  const wanted = normalise(value);
  return products.find(product => (
    normalise(product.product_code) === wanted || normalise(product.product_name) === wanted
  ));
}

export async function parsePurchaseOrderLines(
  file: File,
  products: LineImportProduct[],
): Promise<ParsedLineImport> {
  if (file.size > MAX_LINE_IMPORT_BYTES) {
    throw new Error('The file is too large. Choose a file no larger than 2 MB.');
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const extension = file.name.toLocaleLowerCase().split('.').pop();
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  const isOle = bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
  if ((extension === 'xlsx' && !isZip) || (extension === 'xls' && !isOle)) {
    throw new Error('The file could not be read. Check that it is a valid Excel file.');
  }

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(bytes, { type: 'array', cellDates: false });
  } catch {
    throw new Error('The file could not be read. Check that it is a valid Excel file.');
  }
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('The file could not be read. Check that it is a valid Excel file.');
  const sheet = workbook.Sheets[sheetName];
  const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: true });
  if (!records.length) throw new Error('The file has no line items.');

  const headerKeys = Object.keys(records[0]);
  const headerByName = new Map(headerKeys.map(key => [normalise(key), key]));
  const missing = LINE_IMPORT_HEADERS.filter(header => !headerByName.has(normalise(header)));
  if (missing.length) {
    throw new Error(`Missing required column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}.`);
  }
  if (records.length > MAX_LINE_IMPORT_ROWS) {
    throw new Error(`The file contains ${records.length} rows. The maximum is ${MAX_LINE_IMPORT_ROWS}.`);
  }

  const productKey = headerByName.get('product') as string;
  const qtyKey = headerByName.get('qty') as string;
  const rateKey = headerByName.get('rate') as string;
  const rows: ParsedLineImport['rows'] = [];
  const skipped: ParsedLineImport['skipped'] = [];

  records.forEach((record, index) => {
    const rowNumber = index + 2;
    const productValue = record[productKey];
    const qtyValue = record[qtyKey];
    const rateValue = record[rateKey];
    if (!cellText(productValue) && !cellText(qtyValue) && !cellText(rateValue)) return;

    const product = findProduct(productValue, products);
    const quantity = numeric(qtyValue);
    const rate = numeric(rateValue);
    const reasons: string[] = [];
    if (!product) reasons.push(`unknown product "${cellText(productValue) || '(blank)'}"`);
    if (quantity === null || quantity <= 0) reasons.push('Qty must be a number greater than 0');
    if (rate === null || rate < 0) reasons.push('Rate must be a number greater than or equal to 0');
    if (reasons.length) {
      skipped.push({ rowNumber, reason: reasons.join('; ') });
      return;
    }
    rows.push({
      product,
      quantity: String(quantity),
      rate: String(rate),
    });
  });

  if (!rows.length && !skipped.length) throw new Error('The file has no line items.');
  return { rows, skipped };
}
