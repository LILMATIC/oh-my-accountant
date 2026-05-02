import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { answerQuestion } from '../../src/server/lib/ai';
import { getDashboardMetrics } from '../../src/server/lib/analytics';
import { commitImport, previewImport } from '../../src/server/lib/importService';
import { generateReport } from '../../src/server/lib/report';
import { getTransactions, resetDbForTests, updateTransactionLabels } from '../../src/server/lib/store';

const fixture = (name: string) => readFileSync(`tests/fixtures/${name}`, 'utf8');

beforeEach(() => resetDbForTests());

describe('core MVP smoke flow', () => {
  it('imports CSV, edits transaction labels, answers AI question, and generates report', async () => {
    const preview = previewImport(fixture('happy-path.csv'), 'happy-path.csv');
    const mapping = { date: 'Date', description: 'Description', amount: 'Amount', account: 'Account', category: 'Category', vendor: 'Vendor', memo: 'Memo' };
    const imported = commitImport(preview.importId, mapping, 'spend-positive');
    expect(imported.transactions.length).toBeGreaterThan(30);

    const mystery = getTransactions({ search: 'Mystery' })[0];
    updateTransactionLabels({ transactionId: mystery.id, categoryName: 'Software', vendorName: 'Mystery SaaS' });

    const metrics = getDashboardMetrics({ start: '2026-03-01', end: '2026-03-31' });
    expect(metrics.totalSpend).toBeGreaterThan(12000);
    expect(metrics.topCategories.some((category) => category.name === 'Software')).toBe(true);

    const ai = await answerQuestion({ question: 'Which vendors increased the most?', start: '2026-03-01', end: '2026-03-31' });
    expect(ai.answer).toContain('unusual increases');
    expect(ai.referencedData.unusualIncreases.length).toBeGreaterThan(0);

    const report = generateReport({ start: '2026-03-01', end: '2026-03-31' });
    expect(report.contentMarkdown).toContain('Burn Reduction Report');
    expect(report.contentMarkdown).toContain('This is decision support');
  });
});
