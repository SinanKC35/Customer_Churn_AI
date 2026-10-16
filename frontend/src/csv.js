/** A small CSV parser supporting quoted commas, newlines and escaped quotes. */
export const COLUMNS = [
  'tenure', 'monthly_charges', 'senior_citizen', 'contract', 'internet_service',
  'payment_method', 'tech_support', 'online_security', 'paperless_billing',
];
export const MAX_BATCH_ROWS = 500;

export function parseCSV(source) {
  const text = source.replace(/^\uFEFF/, '');
  if (!text.trim()) throw new Error('The CSV file is empty.');
  const rows = [];
  let line = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        value += '"';
        i += 1;
      } else if (c === '"') quoted = false;
      else value += c;
    } else if (c === '"') {
      if (value !== '') throw new Error('Malformed CSV: unexpected quotation mark.');
      quoted = true;
    } else if (c === ',') {
      line.push(value);
      value = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i += 1;
      line.push(value);
      if (line.some((cell) => cell.trim() !== '')) rows.push(line);
      line = [];
      value = '';
    } else value += c;
  }
  if (quoted) throw new Error('Malformed CSV: unclosed quotation mark.');
  line.push(value);
  if (line.some((cell) => cell.trim() !== '')) rows.push(line);
  if (rows.length < 2) throw new Error('CSV must contain a header and at least one customer.');
  return rows;
}

export function parseCustomers(source) {
  const [headers, ...records] = parseCSV(source);
  const names = headers.map((name) => name.trim());
  if (new Set(names).size !== names.length) throw new Error('CSV contains duplicate column names.');
  const missing = COLUMNS.filter((name) => !names.includes(name));
  if (missing.length) throw new Error(`Missing CSV columns: ${missing.join(', ')}`);
  if (records.length > MAX_BATCH_ROWS) {
    throw new Error(`Maximum ${MAX_BATCH_ROWS} customers per file. Split your file into smaller batches.`);
  }
  return records.map((record, index) => {
    if (record.length !== names.length) throw new Error(`CSV row ${index + 2} has ${record.length} cells, expected ${names.length}.`);
    const obj = Object.fromEntries(names.map((name, i) => [name, record[i].trim()]));
    if (!/^\d+$/.test(obj.tenure) || !/^(0|1)$/.test(obj.senior_citizen) ||
        obj.monthly_charges === '' || !Number.isFinite(Number(obj.monthly_charges))) {
      throw new Error(`Row ${index + 2}: invalid tenure, senior_citizen or monthly_charges.`);
    }
    return {
      tenure: Number(obj.tenure),
      monthly_charges: Number(obj.monthly_charges),
      senior_citizen: Number(obj.senior_citizen),
      ...Object.fromEntries(COLUMNS.slice(3).map((name) => [name, obj[name]])),
    };
  });
}

function csvCell(v) {
  const text = String(v ?? '');
  // Avoid formula execution when opened in a spreadsheet program.
  const safe = /^[\s]*[=+@\-\t\r]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function exportCSV(headers, records) {
  return [headers.join(','), ...records.map((row) => row.map(csvCell).join(','))].join('\r\n') + '\r\n';
}

export function downloadCSV(filename, content) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const element = document.createElement('a');
  element.href = url;
  element.download = filename;
  document.body.appendChild(element);
  element.click();
  element.remove();
  URL.revokeObjectURL(url);
}

export const TEMPLATE = exportCSV(COLUMNS, [
  [24, 79.5, 0, 'Month-to-month', 'Fiber optic', 'Electronic check', 'No', 'No', 'Yes'],
  [60, 45.0, 0, 'Two year', 'No', 'Credit card (automatic)', 'No internet service', 'No internet service', 'No'],
]);
