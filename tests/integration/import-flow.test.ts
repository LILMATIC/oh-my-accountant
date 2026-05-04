import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { autoImport, previewImport, validateImport, commitImport } from '../../src/server/lib/importService';
import { getDashboardMetrics } from '../../src/server/lib/analytics';
import { getTransactions, resetDbForTests } from '../../src/server/lib/store';

const fixture = (name: string) => readFileSync(`tests/fixtures/${name}`, 'utf8');

beforeEach(() => resetDbForTests());

describe('CSV import integration flow', () => {
  it('previews, validates, partially imports, and updates dashboard', () => {
    const preview = previewImport(fixture('mixed-invalid.csv'), 'mixed-invalid.csv');
    expect(preview.headers).toContain('Date');
    const mapping = { date: 'Date', description: 'Description', amount: 'Amount', vendor: 'Vendor' };
    const validation = validateImport(preview.importId, mapping);
    expect(validation.ok).toBe(true);
    expect(validation.validRowCount).toBe(2);
    const committed = commitImport(preview.importId, mapping, 'spend-positive');
    expect(committed.transactions).toHaveLength(2);
    expect(committed.import?.invalidRowCount).toBe(2);
    expect(getTransactions()).toHaveLength(2);
    expect(getDashboardMetrics().totalSpend).toBe(570);
  });

  it('auto-detects mappings and imports without manual column confirmation', () => {
    const result = autoImport(fixture('mixed-invalid.csv'), 'mixed-invalid.csv');
    expect(result.imported).toBe(true);
    expect(result.mapping).toMatchObject({ date: 'Date', description: 'Description', amount: 'Amount', vendor: 'Vendor' });
    expect(result.transactions).toHaveLength(2);
    expect(getTransactions()).toHaveLength(2);
  });
});
