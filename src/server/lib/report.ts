import type { DashboardMetrics } from '../../shared/types.js';
import { DECISION_SUPPORT_DISCLAIMER } from './ai.js';
import { getDashboardMetrics } from './analytics.js';
import { createId, nowIso } from './ids.js';
import { getWorkspaceId, saveReport } from './store.js';

export function generateReport(params: { start?: string; end?: string }) {
  const metrics = getDashboardMetrics(params);
  const contentMarkdown = renderReport(metrics);
  return saveReport({
    id: createId('report'),
    workspaceId: getWorkspaceId(),
    dateRangeStart: params.start,
    dateRangeEnd: params.end,
    contentMarkdown,
    sourceMetrics: metrics,
    createdAt: nowIso()
  });
}

export function renderReport(metrics: DashboardMetrics) {
  const range = `${metrics.dateRange.start ?? 'all available data'} to ${metrics.dateRange.end ?? 'today'}`;
  const lines = [
    '# Burn Reduction Report',
    '',
    `Date range: ${range}`,
    `Total spend: ${currency(metrics.totalSpend)}`,
    '',
    '## Burn trend',
    metrics.trend.length > 0 ? metrics.trend.map((point) => `- ${point.period}: ${currency(point.spend)}`).join('\n') : '- No spend trend available.',
    '',
    '## Top categories',
    metrics.topCategories.length > 0 ? metrics.topCategories.slice(0, 5).map((item) => `- ${item.name}: ${currency(item.spend)} (${item.transactionCount} transactions)`).join('\n') : '- No category spend found.',
    '',
    '## Top vendors',
    metrics.topVendors.length > 0 ? metrics.topVendors.slice(0, 5).map((item) => `- ${item.name}: ${currency(item.spend)} (${item.transactionCount} transactions)`).join('\n') : '- No vendor spend found.',
    '',
    '## Unusual increases',
    metrics.unusualIncreases.length > 0 ? metrics.unusualIncreases.slice(0, 5).map((item) => `- ${item.name}: ${item.reason}`).join('\n') : '- No unusual increases above the MVP thresholds were found.',
    '',
    '## Recommended review actions',
    metrics.burnDrivers.length > 0 ? metrics.burnDrivers.slice(0, 6).map((item) => `- ${item.title}: ${item.reviewAction}`).join('\n') : '- Upload more data or select a broader period to generate recommendations.',
    '',
    `_${DECISION_SUPPORT_DISCLAIMER}_`
  ];

  return lines.join('\n');
}

function currency(amount: number) {
  return `$${Math.round(amount).toLocaleString('en-US')}`;
}
