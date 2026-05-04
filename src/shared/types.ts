export type ColumnKey = 'date' | 'description' | 'amount' | 'account' | 'category' | 'vendor' | 'memo' | 'status' | 'transactionType' | 'currency';

export type ColumnMapping = Partial<Record<ColumnKey, string>>;

export type SpendDirectionMode = 'spend-negative' | 'spend-positive';

export type ImportStatus = 'uploaded' | 'validated' | 'imported' | 'failed';

export type MoneyDirection = 'outflow' | 'inflow' | 'unknown';

export type LabeledSource = 'imported' | 'auto_suggested' | 'user_edited';

export type ImportError = {
  rowNumber?: number;
  field?: ColumnKey;
  message: string;
  rawValue?: string;
};

export type PreviewResult = {
  importId: string;
  headers: string[];
  sampleRows: Record<string, string>[];
  suggestedMapping: ColumnMapping;
  rowCount: number;
};

export type ValidationResult = {
  ok: boolean;
  rowCount: number;
  validRowCount: number;
  invalidRowCount: number;
  errors: ImportError[];
};

export type CsvImport = {
  id: string;
  workspaceId: string;
  fileName: string;
  status: ImportStatus;
  csvText: string;
  columnMapping?: ColumnMapping;
  spendDirectionMode?: SpendDirectionMode;
  rowCount: number;
  validRowCount: number;
  invalidRowCount: number;
  errorSummary: ImportError[];
  createdAt: string;
  completedAt?: string;
};

export type User = {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type Workspace = {
  id: string;
  ownerUserId: string;
  name: string;
  currency: string;
  createdAt: string;
  updatedAt: string;
};

export type Category = {
  id: string;
  workspaceId: string;
  name: string;
  source: LabeledSource;
  createdAt: string;
  updatedAt: string;
};

export type Vendor = {
  id: string;
  workspaceId: string;
  name: string;
  normalizedName: string;
  source: LabeledSource;
  createdAt: string;
  updatedAt: string;
};

export type Transaction = {
  id: string;
  workspaceId: string;
  csvImportId: string;
  date: string;
  description: string;
  amount: number;
  direction: MoneyDirection;
  account?: string;
  categoryId?: string;
  categoryName: string;
  categorySource: LabeledSource;
  vendorId?: string;
  vendorName: string;
  vendorSource: LabeledSource;
  memo?: string;
  status?: string;
  transactionType?: string;
  currency?: string;
  originalCategory?: string;
  subcategory: string;
  categoryRule: string;
  sourceRowNumber: number;
  rawRow: Record<string, string>;
  createdAt: string;
  updatedAt: string;
};

export type TrendPoint = {
  period: string;
  spend: number;
};

export type RankedSpend = {
  name: string;
  spend: number;
  transactionCount: number;
  shareOfTotal: number;
};

export type UnusualIncrease = {
  type: 'category' | 'vendor';
  name: string;
  currentSpend: number;
  previousSpend: number;
  absoluteIncrease: number;
  percentIncrease: number | null;
  reason: string;
};

export type Recommendation = {
  id: string;
  title: string;
  rationale: string;
  reviewAction: string;
  relatedType: 'category' | 'vendor' | 'data_quality';
  relatedName: string;
  estimatedSpend: number;
};

export type DashboardMetrics = {
  workspaceId: string;
  dateRange: { start?: string; end?: string };
  totalSpend: number;
  grossSpend: number;
  refundsAndAdjustments: number;
  netSpend: number;
  categorizedSpendRows: number;
  summaryHighlights: string[];
  trend: TrendPoint[];
  topCategories: RankedSpend[];
  topVendors: RankedSpend[];
  unusualIncreases: UnusualIncrease[];
  burnDrivers: Recommendation[];
  generatedAt: string;
};

export type AiConversation = {
  id: string;
  workspaceId: string;
  question: string;
  answer: string;
  referencedData: AiReferencedData;
  createdAt: string;
};

export type AiReferencedData = {
  dateRange: DashboardMetrics['dateRange'];
  totalSpend: number;
  topCategories: RankedSpend[];
  topVendors: RankedSpend[];
  unusualIncreases: UnusualIncrease[];
  recommendationCandidates: Recommendation[];
  relevantTransactions: Pick<Transaction, 'date' | 'description' | 'amount' | 'categoryName' | 'vendorName'>[];
};

export type BurnReport = {
  id: string;
  workspaceId: string;
  dateRangeStart?: string;
  dateRangeEnd?: string;
  contentMarkdown: string;
  sourceMetrics: DashboardMetrics;
  createdAt: string;
};

export type AppDatabase = {
  users: User[];
  workspaces: Workspace[];
  imports: CsvImport[];
  categories: Category[];
  vendors: Vendor[];
  transactions: Transaction[];
  aiConversations: AiConversation[];
  reports: BurnReport[];
};

export type TransactionFilters = {
  search?: string;
  start?: string;
  end?: string;
  category?: string;
  vendor?: string;
  account?: string;
  minAmount?: number;
  maxAmount?: number;
  importId?: string;
};
