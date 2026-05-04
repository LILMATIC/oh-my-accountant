import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseCsv, suggestColumnMapping, validateRows, normalizeAmount, buildTransactions, inferSpendDirection } from '../../src/server/lib/csv';
import { resetDbForTests } from '../../src/server/lib/store';

const fixture = (name: string) => readFileSync(`tests/fixtures/${name}`, 'utf8');

describe('CSV parsing and validation', () => {
  it('reads headers, sample rows, and suggests common mappings', () => {
    const parsed = parseCsv(fixture('happy-path.csv'));
    const mapping = suggestColumnMapping(parsed.headers);
    expect(parsed.headers).toContain('Date');
    expect(parsed.rows).toHaveLength(31);
    expect(mapping).toMatchObject({ date: 'Date', description: 'Description', amount: 'Amount', vendor: 'Vendor' });
  });

  it('requires date, description, and amount mappings', () => {
    const validation = validateRows(fixture('missing-date.csv'), { description: 'Description', amount: 'Amount' });
    expect(validation.ok).toBe(false);
    expect(validation.errors.some((error) => error.message.includes('Date column is required'))).toBe(true);
  });

  it('supports partial import with row-level errors', () => {
    const validation = validateRows(fixture('mixed-invalid.csv'), { date: 'Date', description: 'Description', amount: 'Amount', vendor: 'Vendor' });
    expect(validation.ok).toBe(true);
    expect(validation.validRowCount).toBe(2);
    expect(validation.invalidRowCount).toBe(2);
    expect(validation.errors.map((error) => error.rowNumber)).toEqual([3, 4]);
  });

  it('normalizes positive and negative spend directions', () => {
    expect(normalizeAmount(-120, 'spend-negative')).toEqual({ amount: 120, direction: 'outflow' });
    expect(normalizeAmount(120, 'spend-negative')).toEqual({ amount: 120, direction: 'inflow' });
    expect(normalizeAmount(120, 'spend-positive')).toEqual({ amount: 120, direction: 'outflow' });
    expect(normalizeAmount(-120, 'spend-positive')).toEqual({ amount: 120, direction: 'inflow' });
  });

  it('builds valid transactions and skips invalid rows', () => {
    resetDbForTests();
    const result = buildTransactions({
      csvText: fixture('mixed-invalid.csv'),
      mapping: { date: 'Date', description: 'Description', amount: 'Amount', vendor: 'Vendor' },
      spendDirectionMode: 'spend-positive',
      workspaceId: 'workspace_demo',
      csvImportId: 'import_test'
    });
    expect(result.validation.ok).toBe(true);
    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0].sourceRowNumber).toBe(2);
    expect(result.transactions[1].sourceRowNumber).toBe(5);
  });
});

it('applies settled-spend inclusion rules and merchant categorization evidence', () => {
  resetDbForTests();
  const csvText = [
    'Date,Description,Amount,Vendor,Status,Type,Currency',
    '2026-04-01,OpenAI ChatGPT Team,120,OpenAI,CLEARED,card_spend,USD',
    '2026-04-02,Pending Taxi,45,Taxi Co,PENDING,card_spend,USD',
    '2026-04-03,Founder Deposit,5000,Bank,CLEARED,deposit,USD',
    '2026-04-04,GitHub Refund,-20,GitHub,CLEARED,card_refund,USD'
  ].join('\n');
  const result = buildTransactions({
    csvText,
    mapping: { date: 'Date', description: 'Description', amount: 'Amount', vendor: 'Vendor', status: 'Status', transactionType: 'Type', currency: 'Currency' },
    spendDirectionMode: 'spend-positive',
    workspaceId: 'workspace_demo',
    csvImportId: 'import_rules'
  });
  expect(result.transactions).toHaveLength(2);
  expect(result.transactions[0]).toMatchObject({ categoryName: 'Business software & cloud', subcategory: 'AI, SaaS, cloud, dev tools', categoryRule: 'merchant matched SaaS/cloud/dev-tool rule' });
  expect(result.transactions[1]).toMatchObject({ direction: 'inflow', categoryName: 'Refunds & adjustments' });
});

it('infers negative statement spending when spend-like rows are negative', () => {
  const csvText = [
    'Date,Description,Amount,Type,Status',
    '2026-04-01,Closed Consumption,-25,Consumption,CLOSED',
    '2026-04-02,Payment,200,Payment,CLOSED'
  ].join('\n');
  const parsed = parseCsv(csvText);
  const mapping = suggestColumnMapping(parsed.headers);
  expect(mapping).toMatchObject({ transactionType: 'Type', status: 'Status' });
  expect(inferSpendDirection(csvText, mapping)).toBe('spend-negative');
});

it('excludes USDC and crypto wallet top-ups from spend summaries', () => {
  resetDbForTests();
  const csvText = [
    'Date,Description,Amount,Vendor,Status,Type,Currency',
    '2026-04-10,Topping up USDC wallet,1000,Coinbase,CLEARED,card_spend,USD',
    '2026-04-11,USDC top-up,500,Ramp,CLEARED,purchase,USD',
    '2026-04-12,OpenAI ChatGPT Team,120,OpenAI,CLEARED,card_spend,USD'
  ].join('\n');
  const result = buildTransactions({
    csvText,
    mapping: { date: 'Date', description: 'Description', amount: 'Amount', vendor: 'Vendor', status: 'Status', transactionType: 'Type', currency: 'Currency' },
    spendDirectionMode: 'spend-positive',
    workspaceId: 'workspace_demo',
    csvImportId: 'import_usdc_topup'
  });
  expect(result.transactions).toHaveLength(1);
  expect(result.transactions[0]).toMatchObject({ description: 'OpenAI ChatGPT Team', categoryName: 'Business software & cloud' });
});
