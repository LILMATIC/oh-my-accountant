import { describe, expect, it, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { createFixtureImport } from '../../src/server/lib/importService';
import { getDashboardMetrics } from '../../src/server/lib/analytics';
import { resetDbForTests, updateTransactionLabels, getTransactions } from '../../src/server/lib/store';

const fixture = (name: string) => readFileSync(`tests/fixtures/${name}`, 'utf8');

beforeEach(() => resetDbForTests());

describe('dashboard analytics', () => {
  it('calculates spend by period, category, vendor, and unusual increases', () => {
    createFixtureImport(fixture('happy-path.csv'), { date: 'Date', description: 'Description', amount: 'Amount', account: 'Account', category: 'Category', vendor: 'Vendor', memo: 'Memo' }, 'spend-positive');
    const metrics = getDashboardMetrics({ start: '2026-03-01', end: '2026-03-31' });
    expect(metrics.totalSpend).toBe(12484);
    expect(metrics.topCategories[0].name).toBe('Payroll & Contractors');
    expect(metrics.topVendors[0].name).toBe('Gusto');
    expect(metrics.unusualIncreases.some((increase) => increase.name === 'AWS')).toBe(true);
    expect(metrics.burnDrivers.length).toBeGreaterThan(0);
  });

  it('recalculates metrics after category/vendor edits', () => {
    createFixtureImport(fixture('minimal.csv'), { date: 'date', description: 'description', amount: 'amount' }, 'spend-positive');
    const transaction = getTransactions().find((item) => item.description.includes('OpenAI'))!;
    updateTransactionLabels({ transactionId: transaction.id, categoryName: 'AI Software', vendorName: 'OpenAI' });
    const metrics = getDashboardMetrics();
    expect(metrics.topCategories.some((category) => category.name === 'AI Software')).toBe(true);
    expect(metrics.topVendors.some((vendor) => vendor.name === 'OpenAI')).toBe(true);
  });
});
