export type QuantityUnit = 'Pieces' | 'Meters';

export type ShadeCell = {
  shade: string;
  quantity: string;
};

export type QualitySelection = {
  productName: string;
  productCode: string;
  collection: string;
  exMill: string;
  listName: string;
  effectiveFrom: string;
  rateSource: string;
  shades: string[];
};

export type OrderBlock = {
  key: string;
  rowNo: number;
  productId: number | null;
  quality: string;
  selection: QualitySelection | null;
  shades: ShadeCell[];
  size: string;
  unit: QuantityUnit;
  price: string;
  deliveryFrom: string;
  deliveryTo: string;
  remarks: string;
};

export type OrderLine = {
  product_id: number | null;
  product_description: string;
  shade: string;
  quantity: string;
  rate: string | null;
  quantity_unit: QuantityUnit;
  size: string;
  delivery_from: string | null;
  delivery_to: string | null;
  line_remarks: string;
  form_row_no: number | null;
};

function amount(value: unknown): string {
  if (value == null || value === '') return '';
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(2) : String(value).trim();
}

function quantity(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export const MAX_QUANTITY = 99999;
export const MAX_PRICE = 999999;
export const MAX_SIZE_LENGTH = 40;
export const MAX_REMARKS_LENGTH = 240;

/** Keeps only digits and one decimal point, with the given decimals and whole digits. */
export function cleanAmount(value: string, decimals: number, wholeDigits: number): string {
  const stripped = value.replace(/[^\d.]/g, '');
  const [whole = '', ...rest] = stripped.split('.');
  const head = whole.slice(0, wholeDigits);
  if (decimals <= 0 || !stripped.includes('.')) return head;
  return `${head}.${rest.join('').slice(0, decimals)}`;
}

export function isWholeQuantity(value: string): boolean {
  const number = quantity(value);
  return number > 0 && Math.abs(number - Math.round(number)) < 1e-9;
}

export function emptyBlock(rowNo: number): OrderBlock {
  return {
    key: `block-${rowNo}-${Math.random().toString(16).slice(2)}`,
    rowNo,
    productId: null,
    quality: '',
    selection: null,
    shades: [],
    size: '',
    unit: 'Pieces',
    price: '',
    deliveryFrom: '',
    deliveryTo: '',
    remarks: '',
  };
}

function qualityKey(productId: number | null, quality: string): string {
  if (productId) return `product:${productId}`;
  return `text:${quality.trim().toLowerCase()}`;
}

function legacyKey(line: OrderLine): string {
  return [
    qualityKey(line.product_id, line.product_description),
    line.size,
    line.rate ?? '',
    line.delivery_from ?? '',
    line.delivery_to ?? '',
    line.line_remarks,
  ].join('|');
}

export function blocksFromLines(lines: OrderLine[]): OrderBlock[] {
  const groups: { key: string; rowNo: number | null; lines: OrderLine[] }[] = [];
  const indexByKey = new Map<string, number>();
  lines.forEach(line => {
    const key = line.form_row_no ? `row:${line.form_row_no}` : `legacy:${legacyKey(line)}`;
    const existing = indexByKey.get(key);
    if (existing === undefined) {
      indexByKey.set(key, groups.length);
      groups.push({ key, rowNo: line.form_row_no, lines: [line] });
      return;
    }
    groups[existing].lines.push(line);
  });
  return groups.map((group, index) => {
    const first = group.lines[0];
    const shades = group.lines.map(line => ({
      shade: line.shade,
      quantity: amount(line.quantity).replace(/\.00$/, '') || String(line.quantity),
    }));
    return {
      key: group.key,
      rowNo: group.rowNo || index + 1,
      productId: first.product_id,
      quality: first.product_description,
      selection: null,
      shades: shades.length ? shades : [{ shade: '', quantity: '' }],
      size: first.size,
      unit: first.quantity_unit === 'Meters' ? 'Meters' : 'Pieces',
      price: first.rate == null ? '' : amount(first.rate),
      deliveryFrom: first.delivery_from || '',
      deliveryTo: first.delivery_to || '',
      remarks: first.line_remarks,
    };
  });
}

export function linesFromBlocks(blocks: OrderBlock[]): OrderLine[] {
  const lines: OrderLine[] = [];
  blocks.forEach((block, index) => {
    const rowNo = block.rowNo || index + 1;
    block.shades.forEach(cell => {
      if (!cell.shade.trim() && !(quantity(cell.quantity) > 0)) return;
      lines.push({
        product_id: block.productId,
        product_description: block.quality.trim(),
        shade: cell.shade.trim(),
        quantity: quantity(cell.quantity).toFixed(2),
        rate: block.price.trim() === '' ? null : quantity(block.price).toFixed(2),
        quantity_unit: block.unit,
        size: block.size.trim(),
        delivery_from: block.deliveryFrom || null,
        delivery_to: block.deliveryTo || null,
        line_remarks: block.remarks.trim(),
        form_row_no: rowNo,
      });
    });
  });
  return lines;
}

export function validateBlocks(blocks: OrderBlock[]): Record<string, string> {
  const messages: Record<string, string> = {};
  const seen = new Map<string, string>();
  blocks.forEach(block => {
    const prefix = `block_${block.key}`;
    if (!block.quality.trim()) messages[`${prefix}_quality`] = 'Quality is required.';
    const filled = block.shades.filter(cell => cell.shade.trim() || quantity(cell.quantity) > 0);
    const positive = filled.filter(cell => quantity(cell.quantity) > 0);
    if (!positive.length) messages[`${prefix}_shades`] = 'Choose at least one shade and enter the pieces.';
    const shadesInBlock = new Set<string>();
    filled.forEach((cell, shadeIndex) => {
      if (!cell.shade.trim()) {
        messages[`${prefix}_shade_${shadeIndex}`] = 'Shade is required.';
        return;
      }
      const shadeKey = cell.shade.trim().toLowerCase();
      if (shadesInBlock.has(shadeKey)) messages[`${prefix}_shade_${shadeIndex}`] = 'This shade is already in this quality.';
      shadesInBlock.add(shadeKey);
      if (!(quantity(cell.quantity) > 0)) {
        messages[`${prefix}_qty_${shadeIndex}`] = block.unit === 'Meters' ? 'Enter meters greater than 0.' : 'Enter pieces greater than 0.';
      } else if (quantity(cell.quantity) > MAX_QUANTITY) {
        messages[`${prefix}_qty_${shadeIndex}`] = `Enter no more than ${MAX_QUANTITY.toLocaleString('en-IN')}.`;
      } else if (block.unit === 'Pieces' && !isWholeQuantity(cell.quantity)) {
        messages[`${prefix}_qty_${shadeIndex}`] = 'Pieces must be a whole number.';
      }
      const pair = `${qualityKey(block.productId, block.quality)}|${shadeKey}`;
      if (seen.has(pair)) messages[`${prefix}_shade_${shadeIndex}`] = 'This shade is already on this quality.';
      seen.set(pair, block.key);
    });
    const price = block.price.trim();
    if (price) {
      const value = Number(price);
      if (!/^\d+(\.\d{1,2})?$/.test(price) || !Number.isFinite(value)) {
        messages[`${prefix}_price`] = 'Enter a price such as 879 or 879.50.';
      } else if (value <= 0) {
        messages[`${prefix}_price`] = 'Price must be greater than 0.';
      } else if (value > MAX_PRICE) {
        messages[`${prefix}_price`] = `Price cannot be more than ${MAX_PRICE.toLocaleString('en-IN')}.`;
      }
    }
    if (block.size.trim().length > MAX_SIZE_LENGTH) messages[`${prefix}_size`] = `Size can be at most ${MAX_SIZE_LENGTH} characters.`;
    if (block.remarks.trim().length > MAX_REMARKS_LENGTH) messages[`${prefix}_remarks`] = `Remarks can be at most ${MAX_REMARKS_LENGTH} characters.`;
    if (block.deliveryFrom && block.deliveryTo && block.deliveryTo < block.deliveryFrom) {
      messages[`${prefix}_delivery`] = 'Delivery To cannot be before Delivery From.';
    }
  });
  if (!blocks.length) messages.lines = 'Add at least one quality.';
  return messages;
}

export function blockTotal(block: OrderBlock): number {
  return block.shades.reduce((total, cell) => total + quantity(cell.quantity), 0);
}
