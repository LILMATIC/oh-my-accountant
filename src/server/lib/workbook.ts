import writeExcelFile from 'write-excel-file/node';
import type { CsvImport, Transaction } from '../../shared/types.js';
import { getDashboardMetrics } from './analytics.js';
import { decideInclusion } from './categorization.js';
import { normalizeAmount, parseCsv } from './csv.js';
import { loadDb } from './store.js';

type CellValue = string | number | Date | boolean | null;
type SheetData = CellValue[][];

type Sheet = {
  sheet: string;
  data: SheetData;
};

export async function buildCategorizedSpendWorkbook() {
  const db = loadDb();
  const transactions = db.transactions.slice().sort((a, b) => a.date.localeCompare(b.date) || a.description.localeCompare(b.description));
  const spendRows = transactions.filter((transaction) => transaction.direction === 'outflow');
  const refundRows = transactions.filter((transaction) => transaction.direction === 'inflow');
  const metrics = getDashboardMetrics();
  const importsById = new Map(db.imports.map((csvImport) => [csvImport.id, csvImport]));
  const multipleCards = new Set(transactions.map((transaction) => transaction.account).filter(Boolean)).size > 1;
  const allExtractedActivity = buildAllExtractedActivity(db.imports);

  const sheets: Sheet[] = [
    { sheet: 'Summary', data: buildSummarySheet(db.imports, allExtractedActivity.length - 1, spendRows, refundRows, metrics) },
    { sheet: 'Category Summary', data: buildGroupedSheet(spendRows, 'category') },
    { sheet: 'Monthly Category', data: buildMonthlyCategorySheet(spendRows) },
    { sheet: 'Merchant Summary', data: buildGroupedSheet(spendRows, 'merchant') },
    { sheet: 'Categorized Spend', data: buildCategorizedSpendSheet(transactions, importsById) }
  ];

  if (multipleCards) sheets.push({ sheet: 'Card Summary', data: buildCardSummarySheet(spendRows) });
  sheets.push({ sheet: 'All Extracted Activity', data: allExtractedActivity });

  return writeExcelFile(sheets).toBuffer();
}

function buildSummarySheet(imports: CsvImport[], sourceRows: number, spendRows: Transaction[], refundRows: Transaction[], metrics: ReturnType<typeof getDashboardMetrics>): SheetData {
  const topCategory = metrics.topCategories[0];
  return [
    ['AI Accountant Categorized Spend Workbook', null],
    ['Basis', 'Settled/closed/cleared spending only. Cancelled authorizations, deposits/topups, withdrawals, swaps, cashback/referral rows, pending rows, hold releases, and zero-dollar rows are excluded when status/type evidence is present.'],
    ['Source files', imports.map((item) => item.fileName).join(', ') || 'None'],
    ['Source rows extracted', sourceRows],
    ['Categorized spend rows', spendRows.length],
    ['Refund / adjustment rows', refundRows.length],
    ['Gross spend', metrics.grossSpend],
    ['Refunds / adjustments', metrics.refundsAndAdjustments],
    ['Net spend', metrics.netSpend],
    ['Top category', topCategory ? `${topCategory.name} (${formatMoney(topCategory.spend)})` : 'No data'],
    [null, null],
    ['Clean summary', null],
    ...metrics.summaryHighlights.map((highlight) => [highlight, null] as CellValue[]),
    [null, null],
    ['Top categories', 'Total USD'],
    ...metrics.topCategories.slice(0, 8).map((category) => [category.name, category.spend] as CellValue[])
  ];
}

function buildGroupedSheet(transactions: Transaction[], mode: 'category' | 'merchant'): SheetData {
  const groups = new Map<string, { transactions: number; total: number; category?: string }>();
  for (const transaction of transactions) {
    const key = mode === 'category' ? transaction.categoryName : transaction.vendorName;
    const current = groups.get(key) ?? { transactions: 0, total: 0, category: transaction.categoryName };
    current.transactions += 1;
    current.total += transaction.amount;
    groups.set(key, current);
  }

  const rows = [...groups.entries()].sort((a, b) => b[1].total - a[1].total);
  const header = mode === 'category' ? ['Suggested Category', 'Transactions', 'Total USD', 'Avg USD'] : ['Merchant / Description', 'Suggested Category', 'Transactions', 'Total USD'];
  return [
    header,
    ...rows.map(([name, group]) => mode === 'category'
      ? [name, group.transactions, roundMoney(group.total), roundMoney(group.total / group.transactions)]
      : [name, group.category ?? '', group.transactions, roundMoney(group.total)])
  ];
}

function buildMonthlyCategorySheet(transactions: Transaction[]): SheetData {
  const months = [...new Set(transactions.map((transaction) => transaction.date.slice(0, 7)))].sort();
  const categories = [...new Set(transactions.map((transaction) => transaction.categoryName))].sort();
  return [
    ['Suggested Category', ...months, 'Total USD'],
    ...categories.map((category) => {
      const values = months.map((month) => roundMoney(transactions.filter((transaction) => transaction.categoryName === category && transaction.date.startsWith(month)).reduce((sum, transaction) => sum + transaction.amount, 0)));
      return [category, ...values, roundMoney(values.reduce((sum, value) => sum + value, 0))];
    })
  ];
}

function buildCardSummarySheet(transactions: Transaction[]): SheetData {
  const groups = new Map<string, { transactions: number; total: number }>();
  for (const transaction of transactions) {
    const key = `${transaction.account ?? 'Unknown card'}|${transaction.categoryName}`;
    const current = groups.get(key) ?? { transactions: 0, total: 0 };
    current.transactions += 1;
    current.total += transaction.amount;
    groups.set(key, current);
  }
  return [
    ['Card', 'Suggested Category', 'Transactions', 'Total USD'],
    ...[...groups.entries()].sort((a, b) => b[1].total - a[1].total).map(([key, group]) => {
      const [card, category] = key.split('|');
      return [card, category, group.transactions, roundMoney(group.total)];
    })
  ];
}

function buildCategorizedSpendSheet(transactions: Transaction[], importsById: Map<string, CsvImport>): SheetData {
  return [
    ['date', 'month', 'card', 'description', 'status', 'transaction_type', 'statement_amount_usd', 'spend_amount_usd', 'currency', 'original_category', 'suggested_category', 'subcategory', 'category_rule', 'source_file'],
    ...transactions.map((transaction) => [
      transaction.date,
      transaction.date.slice(0, 7),
      transaction.account ?? '',
      transaction.description,
      transaction.status ?? '',
      transaction.transactionType ?? '',
      transaction.direction === 'inflow' ? -transaction.amount : transaction.amount,
      transaction.direction === 'outflow' ? transaction.amount : -transaction.amount,
      transaction.currency ?? 'USD',
      transaction.originalCategory ?? '',
      transaction.categoryName,
      transaction.subcategory,
      transaction.categoryRule,
      importsById.get(transaction.csvImportId)?.fileName ?? transaction.csvImportId
    ] as CellValue[])
  ];
}

function buildAllExtractedActivity(imports: CsvImport[]): SheetData {
  const rows: SheetData = [['source_file', 'source_row_number', 'inclusion_decision', 'raw_activity_json']];
  for (const csvImport of imports) {
    const parsed = parseCsv(csvImport.csvText);
    for (const [index, row] of parsed.rows.entries()) {
      rows.push([csvImport.fileName, index + 2, explainInclusion(csvImport, row), JSON.stringify(row)]);
    }
  }
  return rows;
}

function explainInclusion(csvImport: CsvImport, row: Record<string, string>) {
  const mapping = csvImport.columnMapping;
  if (!mapping?.amount || !mapping.description || !mapping.date) return 'not evaluated: import mapping incomplete';
  const rawAmount = parseAmount(readMapped(row, mapping.amount));
  if (Number.isNaN(rawAmount)) return 'excluded invalid amount';
  const { amount, direction } = normalizeAmount(rawAmount, csvImport.spendDirectionMode ?? 'spend-positive');
  const decision = decideInclusion({
    status: readMapped(row, mapping.status),
    transactionType: readMapped(row, mapping.transactionType),
    direction,
    amount,
    description: readMapped(row, mapping.description)
  });
  return decision.included ? `included: ${decision.reason}` : decision.reason;
}

function readMapped(row: Record<string, string>, header?: string) {
  return header ? (row[header] ?? '').trim() : '';
}

function parseAmount(value: string): number {
  const cleaned = value.replace(/[$,\s]/g, '').replace(/^\((.*)\)$/, '-$1');
  return Number.parseFloat(cleaned);
}

function roundMoney(amount: number) {
  return Math.round(amount * 100) / 100;
}

function formatMoney(amount: number) {
  return `$${Math.round(amount).toLocaleString('en-US')}`;
}
