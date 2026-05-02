import type { AiReferencedData, DashboardMetrics } from '../../shared/types.js';
import { createId, nowIso } from './ids.js';
import { getDashboardMetrics } from './analytics.js';
import { getTransactions, getWorkspaceId, saveAiConversation } from './store.js';

export const DECISION_SUPPORT_DISCLAIMER = 'This is decision support, not accounting, legal, or tax advice.';

type AiProviderRequest = {
  question: string;
  context: AiReferencedData;
};

type AiProvider = {
  name: string;
  generateAnswer(request: AiProviderRequest): Promise<string>;
};

export function buildAiContext(question: string, metrics: DashboardMetrics): AiReferencedData {
  const searchTerms = question.toLowerCase().split(/\W+/).filter((term) => term.length > 2);
  const relevantTransactions = getTransactions({ start: metrics.dateRange.start, end: metrics.dateRange.end }, metrics.workspaceId)
    .filter((transaction) => transaction.direction === 'outflow')
    .filter((transaction) => {
      const text = `${transaction.description} ${transaction.categoryName} ${transaction.vendorName}`.toLowerCase();
      return searchTerms.length === 0 || searchTerms.some((term) => text.includes(term));
    })
    .slice(0, 12)
    .map((transaction) => ({
      date: transaction.date,
      description: transaction.description,
      amount: transaction.amount,
      categoryName: transaction.categoryName,
      vendorName: transaction.vendorName
    }));

  return {
    dateRange: metrics.dateRange,
    totalSpend: metrics.totalSpend,
    topCategories: metrics.topCategories.slice(0, 5),
    topVendors: metrics.topVendors.slice(0, 5),
    unusualIncreases: metrics.unusualIncreases.slice(0, 5),
    recommendationCandidates: metrics.burnDrivers.slice(0, 5),
    relevantTransactions
  };
}

export async function answerQuestion(params: { question: string; start?: string; end?: string }) {
  const workspaceId = getWorkspaceId();
  const metrics = getDashboardMetrics({ start: params.start, end: params.end });
  const referencedData = buildAiContext(params.question, metrics);
  const provider = getAiProvider();
  const answer = await provider.generateAnswer({ question: params.question, context: referencedData });
  const conversation = saveAiConversation({
    id: createId('chat'),
    workspaceId,
    question: params.question,
    answer,
    referencedData,
    createdAt: nowIso()
  });
  return conversation;
}

function getAiProvider(): AiProvider {
  // Decision needed: real hosted AI provider/model. MVP defaults to a deterministic
  // local provider so tests are stable and no browser code ever sees provider keys.
  return mockFinancialAssistantProvider;
}

const mockFinancialAssistantProvider: AiProvider = {
  name: 'deterministic-mvp-provider',
  async generateAnswer({ question, context }) {
    return buildDeterministicAnswer(question, context);
  }
};

function buildDeterministicAnswer(question: string, context: AiReferencedData) {
  const lower = question.toLowerCase();
  const lines: string[] = [];

  if (context.totalSpend === 0) {
    return `I do not see spending data for this date range yet. Upload a CSV or choose a different period before making burn decisions. ${DECISION_SUPPORT_DISCLAIMER}`;
  }

  lines.push(`For the selected period, total spend is ${currency(context.totalSpend)}.`);

  if (lower.includes('increase') || lower.includes('changed') || lower.includes('most')) {
    if (context.unusualIncreases.length > 0) {
      lines.push('The clearest unusual increases are:');
      for (const increase of context.unusualIncreases.slice(0, 3)) {
        lines.push(`- ${increase.name}: ${currency(increase.currentSpend)} now vs ${currency(increase.previousSpend)} before (${increase.reason})`);
      }
    } else {
      lines.push('I do not see unusual increases above the MVP thresholds for this period.');
    }
  } else if (lower.includes('software')) {
    const software = context.topCategories.find((category) => category.name.toLowerCase().includes('software'));
    if (software) lines.push(`Software spend is ${currency(software.spend)} across ${software.transactionCount} transactions.`);
    const softwareVendors = context.topVendors.filter((vendor) => /openai|slack|github|notion|figma|linear/i.test(vendor.name));
    if (softwareVendors.length > 0) lines.push(`Software-like vendors to review: ${softwareVendors.map((vendor) => `${vendor.name} (${currency(vendor.spend)})`).join(', ')}.`);
  } else {
    lines.push('Top categories:');
    for (const category of context.topCategories.slice(0, 3)) lines.push(`- ${category.name}: ${currency(category.spend)} (${Math.round(category.shareOfTotal * 100)}% of spend)`);
    lines.push('Top vendors:');
    for (const vendor of context.topVendors.slice(0, 3)) lines.push(`- ${vendor.name}: ${currency(vendor.spend)}`);
  }

  if (context.recommendationCandidates.length > 0) {
    lines.push('Recommended review actions:');
    for (const recommendation of context.recommendationCandidates.slice(0, 3)) lines.push(`- ${recommendation.reviewAction}`);
  }

  lines.push(DECISION_SUPPORT_DISCLAIMER);
  return lines.join('\n');
}

function currency(amount: number) {
  return `$${Math.round(amount).toLocaleString('en-US')}`;
}
