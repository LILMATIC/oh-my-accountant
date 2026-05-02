import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseCsv, suggestColumnMapping, validateRows, normalizeAmount, buildTransactions } from '../../src/server/lib/csv';
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
