/**
 * Run: npx tsx src/services/orderForm.test.ts
 */
import { blocksFromLines, linesFromBlocks, validateBlocks, type OrderLine } from './orderForm.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const saved: OrderLine[] = [
  {
    product_id: 9,
    product_description: 'AI-0100100',
    shade: 'RED',
    quantity: '2.00',
    rate: '100.00',
    quantity_unit: 'Pieces',
    size: '58',
    delivery_from: '2026-11-01',
    delivery_to: '2026-11-15',
    line_remarks: 'Rush',
    form_row_no: 1,
  },
  {
    product_id: 9,
    product_description: 'AI-0100100',
    shade: 'BLUE',
    quantity: '3.00',
    rate: '100.00',
    quantity_unit: 'Pieces',
    size: '58',
    delivery_from: '2026-11-01',
    delivery_to: '2026-11-15',
    line_remarks: 'Rush',
    form_row_no: 1,
  },
];

const blocks = blocksFromLines(saved);
assert(blocks.length === 1, 'same form row is one block');
assert(blocks[0].shades.map(cell => cell.shade).join(',') === 'RED,BLUE', 'shades stay in file order');
const again = linesFromBlocks(blocks);
assert(again.length === 2, 'save writes one line per shade');
assert(again[0].product_id === 9 && again[0].shade === 'RED' && again[0].quantity === '2.00', 'first shade round-trips');
assert(again[1].form_row_no === 1 && again[1].size === '58', 'block fields are copied onto each shade');

const imported = blocksFromLines([
  { ...saved[0], shade: 'A', form_row_no: null, product_id: null, product_description: 'CODE-1' },
  { ...saved[0], shade: 'B', form_row_no: null, product_id: null, product_description: 'CODE-1' },
  { ...saved[0], shade: 'A', form_row_no: null, product_id: null, product_description: 'CODE-2', rate: '50.00' },
]);
assert(imported.length === 2, 'imported lines group by quality, size, price, delivery and remarks');
assert(imported[0].shades.length === 2, 'same quality stays together');

const duplicate = validateBlocks([
  {
    ...blocks[0],
    shades: [
      { shade: 'RED', quantity: '2' },
      { shade: 'red', quantity: '1' },
    ],
  },
]);
assert(Object.values(duplicate).some(message => message.includes('already')), 'duplicate shade in a block is rejected');

const fractional = validateBlocks([{ ...blocks[0], shades: [{ shade: 'RED', quantity: '1.5' }] }]);
assert(Object.values(fractional).some(message => message.includes('whole')), 'pieces must be whole');

const dates = validateBlocks([{
  ...blocks[0],
  shades: [{ shade: 'RED', quantity: '2' }],
  deliveryFrom: '2026-12-02',
  deliveryTo: '2026-12-01',
}]);
assert(Object.values(dates).some(message => message.includes('Delivery To')), 'delivery range is checked');

const across = validateBlocks([
  { ...blocks[0], key: 'a', shades: [{ shade: 'RED', quantity: '2' }] },
  { ...blocks[0], key: 'b', rowNo: 2, shades: [{ shade: 'RED', quantity: '4' }] },
]);
assert(Object.values(across).some(message => message.includes('already')), 'the same quality and shade cannot repeat on the order');

console.log('orderForm tests passed');
