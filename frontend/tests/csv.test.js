import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV, parseCustomers, exportCSV, COLUMNS, TEMPLATE } from '../src/csv.js';

test('parses the exact demo template', () => {
  const result = parseCustomers(TEMPLATE);
  assert.equal(result.length, 2);
  assert.equal(result[0].monthly_charges, 79.5);
  assert.equal(result[1].contract, 'Two year');
});

test('handles quoted commas and embedded newlines', () => {
  const result = parseCSV('name,message\r\n"Doe, Jane","first\nsecond"\r\n');
  assert.deepEqual(result, [['name', 'message'], ['Doe, Jane', 'first\nsecond']]);
});

test('rejects missing headers and invalid row types', () => {
  assert.throws(() => parseCustomers('a,b\n1,2'), /Missing CSV columns/);
  const bad = TEMPLATE.replace('24,79.5,0,', 'xx,79.5,0,');
  assert.throws(() => parseCustomers(bad), /Row 2/);
});

test('rejects oversized batch before network request', () => {
  const header = COLUMNS.join(',');
  const row = '24,79.5,0,Month-to-month,Fiber optic,Electronic check,No,No,Yes';
  assert.throws(() => parseCustomers([header, ...Array(501).fill(row)].join('\n')), /Maximum 500/);
});

test('sanitizes CSV formula injection during export', () => {
  const result = exportCSV(['value'], [['=SUM(1,2)'], ['+cmd'], ['-5'], ['@evil']]);
  assert.match(result, /'=SUM/);
  assert.match(result, /'\+cmd/);
  assert.match(result, /'-5/);
  assert.match(result, /'@evil/);
});
