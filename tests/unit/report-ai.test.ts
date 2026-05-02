import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { answerQuestion, buildAiContext, DECISION_SUPPORT_DISCLAIMER } from '../../src/server/lib/ai';
import { getDashboardMetrics } from '../../src/server/lib/analytics';
import { createFixtureImport } from '../../src/server/lib/importService';
import { generateReport } from '../../src/server/lib/report';
import { loadDb, resetDbForTests } from '../../src/server/lib/store';

const fixture = (name: string) => readFileSync(`tests/fixtures/${name}`, 'utf8');

beforeEach(() => resetDbForTests());

describe('AI and report generation', () => {
  it('uses an allowlisted AI context and persists referenced data', async () => {
    createFixtureImport(fixture('happy-path.csv'), { date: 'Date', description: 'Description', amount: 'Amount', account: 'Account', category: 'Category', vendor: 'Vendor', memo: 'Memo' }, 'spend-positive');
    const metrics = getDashboardMetrics({ start: '2026-03-01', end: '2026-03-31' });
    const context = buildAiContext('Where can we reduce burn?', metrics);
    expect(Object.keys(context).sort()).toEqual(['dateRange', 'recommendationCandidates', 'relevantTransactions', 'topCategories', 'topVendors', 'totalSpend', 'unusualIncreases'].sort());
    expect(context.relevantTransactions.length).toBeLessThanOrEqual(12);
    const conversation = await answerQuestion({ question: 'Where can we reduce burn?', start: '2026-03-01', end: '2026-03-31' });
    expect(conversation.answer).toContain(DECISION_SUPPORT_DISCLAIMER);
    expect(conversation.answer).toContain('Top categories');
    expect(loadDb().aiConversations[0].referencedData.totalSpend).toBe(metrics.totalSpend);
  });

  it('generates a markdown report with required sections and disclaimer', () => {
    createFixtureImport(fixture('happy-path.csv'), { date: 'Date', description: 'Description', amount: 'Amount', account: 'Account', category: 'Category', vendor: 'Vendor', memo: 'Memo' }, 'spend-positive');
    const report = generateReport({ start: '2026-03-01', end: '2026-03-31' });
    expect(report.contentMarkdown).toContain('# Burn Reduction Report');
    expect(report.contentMarkdown).toContain('## Top categories');
    expect(report.contentMarkdown).toContain('## Top vendors');
    expect(report.contentMarkdown).toContain('## Recommended review actions');
    expect(report.contentMarkdown).toContain(DECISION_SUPPORT_DISCLAIMER);
  });
});
