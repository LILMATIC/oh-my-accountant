import type { ColumnKey, ColumnMapping, ImportError, PreviewResult, SpendDirectionMode, Transaction, ValidationResult } from '../../shared/types.js';
import { createId, nowIso } from './ids.js';
import { categorizeSpend, decideInclusion, inferVendor } from './categorization.js';
import { getOrCreateCategory, getOrCreateVendor } from './store.js';

const REQUIRED_COLUMNS: ColumnKey[] = ['date', 'description', 'amount'];
const ALL_COLUMNS: ColumnKey[] = ['date', 'description', 'amount', 'account', 'category', 'vendor', 'memo', 'status', 'transactionType', 'currency'];
const HEADER_SYNONYMS: Record<ColumnKey, string[]> = {
  date: ['date', 'transaction date', 'posted date', 'created date', 'timestamp'],
  description: ['description', 'details', 'transaction', 'name', 'payee', 'merchant description'],
  amount: ['amount', 'value', 'total', 'debit', 'credit', 'amount usd', 'usd amount'],
  account: ['account', 'bank account', 'card', 'cardholder', 'source account'],
  category: ['category', 'merchant category', 'original category', 'spend category', 'mcc'],
  vendor: ['vendor', 'merchant', 'supplier', 'payee', 'merchant name'],
  memo: ['memo', 'notes', 'note', 'comment'],
  status: ['status', 'state', 'transaction status'],
  transactionType: ['transaction type', 'type', 'activity type'],
  currency: ['currency', 'original currency']
};

export type ParsedCsv = {
  headers: string[];
  rows: Record<string, string>[];
};

export function parseCsv(csvText: string): ParsedCsv {
  const rows: string[][] = [];
  let current = '';
  let row: string[] = [];
  let inQuotes = false;

  const pushCell = () => {
    row.push(current);
    current = '';
  };
  const pushRow = () => {
    if (row.length > 0 || current.length > 0) {
      pushCell();
      rows.push(row);
      row = [];
    }
  };

  for (let index = 0; index < csvText.length; index += 1) {
    const char = csvText[index];
    const next = csvText[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      pushCell();
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1;
      pushRow();
      continue;
    }

    current += char;
  }
  pushRow();

  const nonEmptyRows = rows.filter((cells) => cells.some((cell) => cell.trim() !== ''));
  if (nonEmptyRows.length === 0) return { headers: [], rows: [] };

  const headers = nonEmptyRows[0].map((header) => header.trim());
  const dataRows = nonEmptyRows.slice(1).map((cells) =>
    headers.reduce<Record<string, string>>((record, header, index) => {
      record[header] = (cells[index] ?? '').trim();
      return record;
    }, {})
  );

  return { headers, rows: dataRows };
}

export function suggestColumnMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const normalizedHeaders = headers.map((header) => ({ raw: header, normalized: normalizeHeader(header) }));

  for (const column of ALL_COLUMNS) {
    const synonyms = HEADER_SYNONYMS[column];
    const match = normalizedHeaders.find(({ normalized }) => synonyms.includes(normalized));
    if (match) mapping[column] = match.raw;
  }

  return mapping;
}

export function createPreview(csvText: string): PreviewResult {
  const parsed = parseCsv(csvText);
  return {
    importId: createId('import'),
    headers: parsed.headers,
    sampleRows: parsed.rows.slice(0, 5),
    suggestedMapping: suggestColumnMapping(parsed.headers),
    rowCount: parsed.rows.length
  };
}


export function inferSpendDirection(csvText: string, mapping: ColumnMapping): SpendDirectionMode {
  const parsed = parseCsv(csvText);
  const evidence = { positiveSpendLike: 0, negativeSpendLike: 0, positiveTotal: 0, negativeTotal: 0 };

  for (const row of parsed.rows) {
    const amountHeader = mapping.amount;
    if (!amountHeader) continue;
    const amount = parseAmount(readMapped(row, amountHeader));
    if (!Number.isFinite(amount) || amount === 0) continue;

    if (amount > 0) evidence.positiveTotal += Math.abs(amount);
    else evidence.negativeTotal += Math.abs(amount);

    const transactionText = `${readMapped(row, mapping.transactionType)} ${readMapped(row, mapping.status)} ${readMapped(row, mapping.description)}`;
    if (/\b(card_spend|consumption|purchase|sale|debit|charge|authorization fee)\b/i.test(transactionText)) {
      if (amount > 0) evidence.positiveSpendLike += Math.abs(amount);
      else evidence.negativeSpendLike += Math.abs(amount);
    }
  }

  if (evidence.negativeSpendLike > evidence.positiveSpendLike) return 'spend-negative';
  if (evidence.positiveSpendLike > evidence.negativeSpendLike) return 'spend-positive';
  if (evidence.negativeTotal > evidence.positiveTotal * 2) return 'spend-negative';
  return 'spend-positive';
}

export function validateRows(csvText: string, mapping: ColumnMapping): ValidationResult {
  const parsed = parseCsv(csvText);
  const errors: ImportError[] = [];

  if (parsed.headers.length === 0) {
    return { ok: false, rowCount: 0, validRowCount: 0, invalidRowCount: 0, errors: [{ message: 'The CSV file is empty.' }] };
  }

  for (const required of REQUIRED_COLUMNS) {
    if (!mapping[required]) {
      errors.push({ field: required, message: `The ${label(required)} column is required.` });
    }
  }

  if (errors.length > 0) {
    return { ok: false, rowCount: parsed.rows.length, validRowCount: 0, invalidRowCount: parsed.rows.length, errors };
  }

  let validRowCount = 0;
  for (const [index, row] of parsed.rows.entries()) {
    const rowNumber = index + 2;
    const rowErrors = validateRow(row, mapping, rowNumber);
    if (rowErrors.length === 0) validRowCount += 1;
    errors.push(...rowErrors);
  }

  return {
    ok: validRowCount > 0,
    rowCount: parsed.rows.length,
    validRowCount,
    invalidRowCount: errors.filter((error) => error.rowNumber).length,
    errors: validRowCount > 0 ? errors : [{ message: 'No valid transaction rows were found.' }, ...errors]
  };
}

export function buildTransactions(params: {
  csvText: string;
  mapping: ColumnMapping;
  spendDirectionMode: SpendDirectionMode;
  workspaceId: string;
  csvImportId: string;
}): { transactions: Transaction[]; validation: ValidationResult } {
  const validation = validateRows(params.csvText, params.mapping);
  const parsed = parseCsv(params.csvText);
  if (!validation.ok) return { transactions: [], validation };

  const invalidRows = new Set(validation.errors.map((error) => error.rowNumber).filter(Boolean));
  const transactions = parsed.rows
    .map((row, index) => ({ row, sourceRowNumber: index + 2 }))
    .filter(({ sourceRowNumber }) => !invalidRows.has(sourceRowNumber))
    .map(({ row, sourceRowNumber }) => rowToTransaction({ ...params, row, sourceRowNumber }))
    .filter((transaction): transaction is Transaction => transaction !== null);

  return { transactions, validation };
}

function rowToTransaction(params: {
  row: Record<string, string>;
  mapping: ColumnMapping;
  spendDirectionMode: SpendDirectionMode;
  workspaceId: string;
  csvImportId: string;
  sourceRowNumber: number;
}): Transaction | null {
  const get = (key: ColumnKey) => readMapped(params.row, params.mapping[key]);
  const rawAmount = parseAmount(get('amount'));
  const { amount, direction } = normalizeAmount(rawAmount, params.spendDirectionMode);
  const description = get('description');
  const originalCategory = get('category');
  const vendorName = get('vendor') || inferVendor(description);
  const status = get('status');
  const transactionType = get('transactionType');
  const inclusion = decideInclusion({ status, transactionType, direction, amount, description });
  if (!inclusion.included) return null;
  const categorization = direction === 'inflow'
    ? { categoryName: 'Refunds & adjustments', subcategory: 'Refund or credit', categoryRule: inclusion.reason }
    : categorizeSpend({ description, vendor: vendorName, originalCategory, transactionType });
  const category = getOrCreateCategory(params.workspaceId, categorization.categoryName, categorization.categoryRule.includes('retained imported') ? 'imported' : 'auto_suggested');
  const vendor = getOrCreateVendor(params.workspaceId, vendorName, get('vendor') ? 'imported' : 'auto_suggested');
  const createdAt = nowIso();

  return {
    id: createId('txn'),
    workspaceId: params.workspaceId,
    csvImportId: params.csvImportId,
    date: normalizeDate(get('date')),
    description,
    amount,
    direction,
    account: get('account') || undefined,
    categoryId: category.id,
    categoryName: category.name,
    categorySource: category.source,
    originalCategory: originalCategory || undefined,
    subcategory: categorization.subcategory,
    categoryRule: categorization.categoryRule,
    vendorId: vendor.id,
    vendorName: vendor.name,
    vendorSource: vendor.source,
    memo: get('memo') || undefined,
    status: status || undefined,
    transactionType: transactionType || undefined,
    currency: get('currency') || undefined,
    sourceRowNumber: params.sourceRowNumber,
    rawRow: params.row,
    createdAt,
    updatedAt: createdAt
  };
}

function validateRow(row: Record<string, string>, mapping: ColumnMapping, rowNumber: number): ImportError[] {
  const errors: ImportError[] = [];
  const dateValue = readMapped(row, mapping.date);
  const descriptionValue = readMapped(row, mapping.description);
  const amountValue = readMapped(row, mapping.amount);

  if (!dateValue) errors.push({ rowNumber, field: 'date', message: `Row ${rowNumber} is missing a date.` });
  else if (!isValidDate(dateValue)) errors.push({ rowNumber, field: 'date', message: `Row ${rowNumber} has an invalid date: ${dateValue}.`, rawValue: dateValue });

  if (!descriptionValue) errors.push({ rowNumber, field: 'description', message: `Row ${rowNumber} is missing a description.` });

  if (!amountValue) errors.push({ rowNumber, field: 'amount', message: `Row ${rowNumber} is missing an amount.` });
  else if (Number.isNaN(parseAmount(amountValue))) errors.push({ rowNumber, field: 'amount', message: `Row ${rowNumber} has an invalid amount: ${amountValue}.`, rawValue: amountValue });

  return errors;
}

export function normalizeAmount(rawAmount: number, mode: SpendDirectionMode): { amount: number; direction: 'outflow' | 'inflow' | 'unknown' } {
  if (rawAmount === 0) return { amount: 0, direction: 'unknown' };
  if (mode === 'spend-negative') {
    return rawAmount < 0 ? { amount: Math.abs(rawAmount), direction: 'outflow' } : { amount: rawAmount, direction: 'inflow' };
  }
  return rawAmount > 0 ? { amount: rawAmount, direction: 'outflow' } : { amount: Math.abs(rawAmount), direction: 'inflow' };
}

function parseAmount(value: string): number {
  const cleaned = value.replace(/[$,\s]/g, '').replace(/^\((.*)\)$/, '-$1');
  return Number.parseFloat(cleaned);
}

function normalizeDate(value: string) {
  return new Date(value).toISOString().slice(0, 10);
}

function isValidDate(value: string) {
  const time = new Date(value).getTime();
  return Number.isFinite(time);
}

function readMapped(row: Record<string, string>, header?: string) {
  return header ? (row[header] ?? '').trim() : '';
}

function normalizeHeader(header: string) {
  return header.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
}

function label(key: ColumnKey) {
  return key.charAt(0).toUpperCase() + key.slice(1);
}

export function normalizeVendorName(name: string) {
  return name
    .toLowerCase()
    .replace(/[*#][a-z0-9 -]+/gi, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}
