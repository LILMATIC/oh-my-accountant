import type { MoneyDirection } from '../../shared/types.js';

export type CategorizationInput = {
  description: string;
  vendor?: string;
  originalCategory?: string;
  transactionType?: string;
};

export type CategorizationResult = {
  categoryName: string;
  subcategory: string;
  categoryRule: string;
};

export type InclusionInput = {
  status?: string;
  transactionType?: string;
  direction: MoneyDirection;
  amount: number;
  description?: string;
};

export type InclusionDecision = {
  included: boolean;
  reason: string;
};

type CategoryRule = {
  categoryName: string;
  subcategory: string;
  pattern: RegExp;
  reason: string;
};

const CATEGORY_RULES: CategoryRule[] = [
  {
    categoryName: 'Business software & cloud',
    subcategory: 'AI, SaaS, cloud, dev tools',
    pattern: /\b(ovh|cloudflare|github|google digital|google cloud|gcp|aws|amazon web|azure|figma|slack|notion|claude|anthropic|openai|chatgpt|pagerduty|railway|neon|docusign|envio|pinata|alchemy|1password|godaddy|vercel|netlify|linear|software|saas)\b/i,
    reason: 'merchant matched SaaS/cloud/dev-tool rule'
  },
  {
    categoryName: 'Payroll & Contractors',
    subcategory: 'Payroll, contractor, HR platform',
    pattern: /\b(payroll|gusto|deel|rippling|contractor|salary|freelance|upwork)\b/i,
    reason: 'merchant/description matched payroll or contractor rule'
  },
  {
    categoryName: 'Professional services',
    subcategory: 'Consulting, workspace, business services',
    pattern: /\b(consulting|management|business services|fast five|wework|workspace|law|legal|accounting|bookkeeping)\b/i,
    reason: 'merchant/MCC text matched professional-services rule'
  },
  {
    categoryName: 'Dining & cafes',
    subcategory: 'Restaurants, cafes, bakeries',
    pattern: /\b(restaurant|fast food|bakery|starbucks|coffee|cafe|mcdonald|dining|food service)\b/i,
    reason: 'merchant/MCC text matched dining rule'
  },
  {
    categoryName: 'Groceries & convenience',
    subcategory: 'Grocery, supermarket, convenience',
    pattern: /\b(grocery|convenience|supermarket|food stores|mart|market)\b/i,
    reason: 'merchant/MCC text matched grocery/convenience rule'
  },
  {
    categoryName: 'Travel & lodging',
    subcategory: 'Hotels and lodging',
    pattern: /\b(hotel|lodging|airbnb|marriott|hilton|hyatt)\b/i,
    reason: 'merchant/MCC text matched lodging rule'
  },
  {
    categoryName: 'Travel & transportation',
    subcategory: 'Air, rideshare, transit, taxi',
    pattern: /\b(air|airline|asiana|delta|united|hotel|taxi|uber|lyft|t-money|mta|lirr|bus|travel|flight|train|subway)\b/i,
    reason: 'merchant/MCC text matched travel/transportation rule'
  },
  {
    categoryName: 'Marketing & ads',
    subcategory: 'Paid acquisition and campaigns',
    pattern: /\b(ads|advertising|marketing|google ads|facebook|meta ads|linkedin ads|campaign)\b/i,
    reason: 'merchant/description matched marketing or advertising rule'
  },
  {
    categoryName: 'Shopping & retail',
    subcategory: 'Retail, department, apparel',
    pattern: /\b(department store|apparel|specialty retail|starfield|retail|shopping|store|amazon marketplace)\b/i,
    reason: 'merchant/MCC text matched retail rule'
  },
  {
    categoryName: 'Health & personal care',
    subcategory: 'Healthcare, pharmacy, personal care',
    pattern: /\b(health|pharmacy|medical|clinic|personal care|wellness)\b/i,
    reason: 'merchant/MCC text matched health/personal-care rule'
  },
  {
    categoryName: 'Books & learning',
    subcategory: 'Books, courses, education',
    pattern: /\b(book|learning|course|education|udemy|coursera|oreilly)\b/i,
    reason: 'merchant/MCC text matched books/learning rule'
  },
  {
    categoryName: 'Entertainment',
    subcategory: 'Media and events',
    pattern: /\b(entertainment|netflix|spotify|event|ticket|cinema|movie)\b/i,
    reason: 'merchant/MCC text matched entertainment rule'
  },
  {
    categoryName: 'Subscriptions & memberships',
    subcategory: 'Memberships and recurring subscriptions',
    pattern: /\b(subscription|membership|recurring|member dues)\b/i,
    reason: 'merchant/description matched subscription or membership rule'
  },
  {
    categoryName: 'Card fees',
    subcategory: 'Authorization and card fees',
    pattern: /\b(authorization fee|card fee|foreign transaction fee|fx fee|fee)\b/i,
    reason: 'row matched nonzero card-fee rule'
  }
];

const EXCLUDED_STATUS = /\b(cancelled|canceled|declined|failed|reversed|void|expired|pending|authorization|authorized)\b/i;
const INCLUDED_STATUS = /\b(cleared|settled|closed|posted|complete|completed|paid)\b/i;
const EXCLUDED_TYPE = /\b(deposit|top\s?up|withdrawal|withdraw|swap|cashback|referral|hold release|release|payment|transfer|zero.?dollar hold)\b/i;
const REFUND_TYPE = /\b(card_refund|refund|reversal|credit)\b/i;
const SPEND_TYPE = /\b(card_spend|consumption|purchase|sale|debit|charge|authorization fee)\b/i;

export function categorizeSpend({ description, vendor = '', originalCategory = '', transactionType = '' }: CategorizationInput): CategorizationResult {
  const text = `${description} ${vendor} ${originalCategory} ${transactionType}`.trim();
  const feeRule = /authorization fee/i.test(transactionType) || /authorization fee/i.test(description);
  const rule = feeRule ? CATEGORY_RULES.find((item) => item.categoryName === 'Card fees') : CATEGORY_RULES.find((item) => item.pattern.test(text));

  if (rule) {
    return {
      categoryName: rule.categoryName,
      subcategory: rule.subcategory,
      categoryRule: rule.reason
    };
  }

  const normalizedOriginalCategory = normalizeOriginalCategory(originalCategory);
  if (normalizedOriginalCategory) {
    return {
      categoryName: normalizedOriginalCategory,
      subcategory: 'Imported category',
      categoryRule: 'no merchant rule matched; retained imported category'
    };
  }

  return {
    categoryName: 'Other',
    subcategory: 'Needs review',
    categoryRule: 'no merchant, MCC, status, or type rule matched'
  };
}

export function decideInclusion({ status = '', transactionType = '', direction, amount, description = '' }: InclusionInput): InclusionDecision {
  const combined = `${status} ${transactionType} ${description}`.trim();
  if (amount === 0) return { included: false, reason: 'excluded zero-dollar activity' };
  if (EXCLUDED_STATUS.test(status) && !INCLUDED_STATUS.test(status)) return { included: false, reason: `excluded non-settled status: ${status}` };
  if (EXCLUDED_TYPE.test(transactionType) || EXCLUDED_TYPE.test(description)) return { included: false, reason: `excluded non-spend activity: ${transactionType || description}` };
  if (REFUND_TYPE.test(combined)) return { included: direction === 'inflow', reason: direction === 'inflow' ? 'included cleared refund as adjustment' : 'excluded refund-like row without credit direction' };
  if (SPEND_TYPE.test(combined)) return { included: direction === 'outflow', reason: direction === 'outflow' ? 'included settled spending row' : 'excluded spend-like row without debit direction' };
  if (status && !INCLUDED_STATUS.test(status)) return { included: false, reason: `excluded status outside settled/closed/cleared set: ${status}` };
  return { included: true, reason: direction === 'inflow' ? 'included refund/adjustment row without exclusion signals' : 'included spending row without exclusion signals' };
}

export function inferVendor(description: string) {
  const cleaned = description
    .replace(/\d{4,}/g, '')
    .replace(/[*#]/g, ' ')
    .replace(/\b(authorization fee|card_spend|card_refund|consumption|purchase)\b/gi, '')
    .trim();
  return cleaned.split(/\s{2,}| - | \| |,/)[0]?.slice(0, 64).trim() || 'Unknown Vendor';
}

function normalizeOriginalCategory(category: string) {
  const trimmed = category.trim();
  if (!trimmed) return '';
  if (/software|cloud|hosting|dev tools/i.test(trimmed)) return 'Business software & cloud';
  if (/travel|transport|rideshare|airline/i.test(trimmed)) return 'Travel & transportation';
  if (/restaurant|dining|cafe|food/i.test(trimmed)) return 'Dining & cafes';
  return trimmed;
}
