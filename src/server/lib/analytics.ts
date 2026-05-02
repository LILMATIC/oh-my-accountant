import type { DashboardMetrics, RankedSpend, Recommendation, Transaction, UnusualIncrease } from '../../shared/types.js';
import { getTransactions, getWorkspaceId } from './store.js';

const ABSOLUTE_INCREASE_THRESHOLD = 250;
const PERCENT_INCREASE_THRESHOLD = 25;

export function getDashboardMetrics(params: { start?: string; end?: string } = {}): DashboardMetrics {
  const workspaceId = getWorkspaceId();
  const transactions = getTransactions({ start: params.start, end: params.end }, workspaceId).filter((transaction) => transaction.direction === 'outflow');
  const previousTransactions = getPreviousPeriodTransactions(params, workspaceId);
  const totalSpend = sumSpend(transactions);
  const topCategories = rankBy(transactions, (transaction) => transaction.categoryName);
  const topVendors = rankBy(transactions, (transaction) => transaction.vendorName);
  const unusualIncreases = [
    ...findUnusualIncreases('category', transactions, previousTransactions, (transaction) => transaction.categoryName),
    ...findUnusualIncreases('vendor', transactions, previousTransactions, (transaction) => transaction.vendorName)
  ].sort((a, b) => b.absoluteIncrease - a.absoluteIncrease).slice(0, 8);

  return {
    workspaceId,
    dateRange: { start: params.start, end: params.end },
    totalSpend,
    trend: buildMonthlyTrend(transactions),
    topCategories,
    topVendors,
    unusualIncreases,
    burnDrivers: buildRecommendations(totalSpend, topCategories, topVendors, unusualIncreases, transactions),
    generatedAt: new Date().toISOString()
  };
}

export function buildRecommendations(
  totalSpend: number,
  topCategories: RankedSpend[],
  topVendors: RankedSpend[],
  unusualIncreases: UnusualIncrease[],
  transactions: Transaction[]
): Recommendation[] {
  const recommendations: Recommendation[] = [];

  for (const category of topCategories.slice(0, 3)) {
    recommendations.push({
      id: `category-${category.name}`,
      title: `Review ${category.name} spend`,
      rationale: `${category.name} represents ${Math.round(category.shareOfTotal * 100)}% of selected-period spend.`,
      reviewAction: `Check whether the largest ${category.name} costs are still necessary or can be renegotiated.`,
      relatedType: 'category',
      relatedName: category.name,
      estimatedSpend: category.spend
    });
  }

  for (const vendor of topVendors.slice(0, 3)) {
    recommendations.push({
      id: `vendor-${vendor.name}`,
      title: `Review vendor ${vendor.name}`,
      rationale: `${vendor.name} is one of the largest vendors in the selected period.`,
      reviewAction: `Confirm owner, contract need, and cancellation/plan downgrade options for ${vendor.name}.`,
      relatedType: 'vendor',
      relatedName: vendor.name,
      estimatedSpend: vendor.spend
    });
  }

  for (const increase of unusualIncreases.slice(0, 3)) {
    recommendations.push({
      id: `increase-${increase.type}-${increase.name}`,
      title: `Investigate increase in ${increase.name}`,
      rationale: increase.reason,
      reviewAction: `Compare this increase with team changes, tool upgrades, one-time purchases, or billing changes.`,
      relatedType: increase.type,
      relatedName: increase.name,
      estimatedSpend: increase.currentSpend
    });
  }

  const uncategorizedSpend = transactions.filter((transaction) => transaction.categoryName === 'Uncategorized').reduce((sum, transaction) => sum + transaction.amount, 0);
  if (uncategorizedSpend > 0) {
    recommendations.push({
      id: 'data-quality-uncategorized',
      title: 'Clean up uncategorized spend',
      rationale: `There is ${currency(uncategorizedSpend)} in uncategorized spend, which can hide burn drivers.`,
      reviewAction: 'Assign categories and vendors to uncategorized rows before making final burn decisions.',
      relatedType: 'data_quality',
      relatedName: 'Uncategorized',
      estimatedSpend: uncategorizedSpend
    });
  }

  if (recommendations.length === 0 && totalSpend === 0) {
    recommendations.push({
      id: 'no-data',
      title: 'Upload spending data',
      rationale: 'No spending was found for the selected period.',
      reviewAction: 'Upload a CSV or choose a different date range before reviewing burn.',
      relatedType: 'data_quality',
      relatedName: 'No data',
      estimatedSpend: 0
    });
  }

  return dedupeRecommendations(recommendations).slice(0, 8);
}

function rankBy(transactions: Transaction[], keyFn: (transaction: Transaction) => string): RankedSpend[] {
  const total = sumSpend(transactions);
  const groups = new Map<string, { spend: number; transactionCount: number }>();
  for (const transaction of transactions) {
    const key = keyFn(transaction) || 'Unknown';
    const current = groups.get(key) ?? { spend: 0, transactionCount: 0 };
    current.spend += transaction.amount;
    current.transactionCount += 1;
    groups.set(key, current);
  }

  return [...groups.entries()]
    .map(([name, group]) => ({ name, spend: roundMoney(group.spend), transactionCount: group.transactionCount, shareOfTotal: total > 0 ? group.spend / total : 0 }))
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 10);
}

function buildMonthlyTrend(transactions: Transaction[]) {
  const groups = new Map<string, number>();
  for (const transaction of transactions) {
    const period = transaction.date.slice(0, 7);
    groups.set(period, (groups.get(period) ?? 0) + transaction.amount);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([period, spend]) => ({ period, spend: roundMoney(spend) }));
}

function findUnusualIncreases(
  type: 'category' | 'vendor',
  current: Transaction[],
  previous: Transaction[],
  keyFn: (transaction: Transaction) => string
): UnusualIncrease[] {
  const currentGroups = sumBy(current, keyFn);
  const previousGroups = sumBy(previous, keyFn);
  const increases: UnusualIncrease[] = [];

  for (const [name, currentSpend] of currentGroups.entries()) {
    const previousSpend = previousGroups.get(name) ?? 0;
    const absoluteIncrease = currentSpend - previousSpend;
    const percentIncrease = previousSpend > 0 ? (absoluteIncrease / previousSpend) * 100 : null;
    const passesPercent = percentIncrease === null ? currentSpend >= ABSOLUTE_INCREASE_THRESHOLD : percentIncrease >= PERCENT_INCREASE_THRESHOLD;
    if (absoluteIncrease >= ABSOLUTE_INCREASE_THRESHOLD && passesPercent) {
      increases.push({
        type,
        name,
        currentSpend: roundMoney(currentSpend),
        previousSpend: roundMoney(previousSpend),
        absoluteIncrease: roundMoney(absoluteIncrease),
        percentIncrease: percentIncrease === null ? null : Math.round(percentIncrease),
        reason: previousSpend === 0
          ? `${name} is new spending above ${currency(ABSOLUTE_INCREASE_THRESHOLD)}.`
          : `${name} increased by ${currency(absoluteIncrease)} (${Math.round(percentIncrease ?? 0)}%) versus the previous comparable period.`
      });
    }
  }

  return increases;
}

function getPreviousPeriodTransactions(params: { start?: string; end?: string }, workspaceId: string) {
  if (!params.start || !params.end) return [];
  const start = new Date(params.start);
  const end = new Date(params.end);
  const duration = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
  const previousEnd = new Date(start);
  previousEnd.setDate(previousEnd.getDate() - 1);
  const previousStart = new Date(previousEnd);
  previousStart.setDate(previousStart.getDate() - duration + 1);
  return getTransactions({ start: isoDate(previousStart), end: isoDate(previousEnd) }, workspaceId).filter((transaction) => transaction.direction === 'outflow');
}

function sumBy(transactions: Transaction[], keyFn: (transaction: Transaction) => string) {
  const groups = new Map<string, number>();
  for (const transaction of transactions) groups.set(keyFn(transaction), (groups.get(keyFn(transaction)) ?? 0) + transaction.amount);
  return groups;
}

function sumSpend(transactions: Transaction[]) {
  return roundMoney(transactions.reduce((sum, transaction) => sum + transaction.amount, 0));
}

function roundMoney(amount: number) {
  return Math.round(amount * 100) / 100;
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function currency(amount: number) {
  return `$${Math.round(amount).toLocaleString('en-US')}`;
}

function dedupeRecommendations(recommendations: Recommendation[]) {
  return [...new Map(recommendations.map((recommendation) => [recommendation.id, recommendation])).values()];
}
