import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { AppDatabase, BurnReport, Category, CsvImport, LabeledSource, Transaction, TransactionFilters, Vendor } from '../../shared/types.js';
import { createId, nowIso } from './ids.js';

const DEFAULT_DB_PATH = process.env.VERCEL ? '/tmp/oh-my-accountant/app-db.json' : 'data/app-db.json';
const DB_PATH = resolve(process.env.ACCOUNTANT_DB_PATH ?? DEFAULT_DB_PATH);
export const DEFAULT_USER_ID = 'user_demo';
export const DEFAULT_WORKSPACE_ID = 'workspace_demo';

const seedDatabase = (): AppDatabase => {
  const createdAt = nowIso();
  return {
    users: [{ id: DEFAULT_USER_ID, email: 'founder@example.com', name: 'Startup Founder', createdAt, updatedAt: createdAt }],
    workspaces: [{ id: DEFAULT_WORKSPACE_ID, ownerUserId: DEFAULT_USER_ID, name: 'Demo Startup', currency: 'USD', createdAt, updatedAt: createdAt }],
    imports: [],
    categories: [],
    vendors: [],
    transactions: [],
    aiConversations: [],
    reports: []
  };
};

let memoryDb: AppDatabase | null = null;

export function loadDb(): AppDatabase {
  if (memoryDb) return memoryDb;
  if (!existsSync(DB_PATH)) {
    memoryDb = seedDatabase();
    persistDb();
    return memoryDb;
  }
  const dbText = readFileSync(DB_PATH, 'utf8').trim();
  if (!dbText) {
    memoryDb = seedDatabase();
    persistDb();
    return memoryDb;
  }
  memoryDb = JSON.parse(dbText) as AppDatabase;
  return memoryDb;
}

export function persistDb() {
  if (!memoryDb) return;
  mkdirSync(dirname(DB_PATH), { recursive: true });
  writeFileSync(DB_PATH, `${JSON.stringify(memoryDb, null, 2)}\n`);
}

export function resetDbForTests() {
  memoryDb = seedDatabase();
  persistDb();
}

export function getWorkspaceId() {
  return DEFAULT_WORKSPACE_ID;
}

export function saveImport(csvImport: CsvImport) {
  const db = loadDb();
  const existingIndex = db.imports.findIndex((item) => item.id === csvImport.id && item.workspaceId === csvImport.workspaceId);
  if (existingIndex >= 0) db.imports[existingIndex] = csvImport;
  else db.imports.push(csvImport);
  persistDb();
  return csvImport;
}

export function findImport(importId: string, workspaceId = DEFAULT_WORKSPACE_ID) {
  return loadDb().imports.find((item) => item.id === importId && item.workspaceId === workspaceId);
}

export function addTransactions(transactions: Transaction[]) {
  const db = loadDb();
  db.transactions.push(...transactions);
  persistDb();
}

export function getTransactions(filters: TransactionFilters = {}, workspaceId = DEFAULT_WORKSPACE_ID) {
  const search = filters.search?.trim().toLowerCase();
  return loadDb().transactions
    .filter((transaction) => transaction.workspaceId === workspaceId)
    .filter((transaction) => !filters.importId || transaction.csvImportId === filters.importId)
    .filter((transaction) => !filters.start || transaction.date >= filters.start)
    .filter((transaction) => !filters.end || transaction.date <= filters.end)
    .filter((transaction) => !filters.category || transaction.categoryName === filters.category)
    .filter((transaction) => !filters.vendor || transaction.vendorName === filters.vendor)
    .filter((transaction) => !filters.account || transaction.account === filters.account)
    .filter((transaction) => filters.minAmount === undefined || transaction.amount >= filters.minAmount)
    .filter((transaction) => filters.maxAmount === undefined || transaction.amount <= filters.maxAmount)
    .filter((transaction) => {
      if (!search) return true;
      return [transaction.description, transaction.vendorName, transaction.categoryName, transaction.memo, transaction.account]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(search));
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function updateTransactionLabels(params: { transactionId: string; workspaceId?: string; categoryName?: string; vendorName?: string }) {
  const db = loadDb();
  const workspaceId = params.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const transaction = db.transactions.find((item) => item.id === params.transactionId && item.workspaceId === workspaceId);
  if (!transaction) return null;

  if (params.categoryName !== undefined) {
    const category = getOrCreateCategory(workspaceId, params.categoryName, 'user_edited');
    transaction.categoryId = category.id;
    transaction.categoryName = category.name;
    transaction.categorySource = 'user_edited';
  }

  if (params.vendorName !== undefined) {
    const vendor = getOrCreateVendor(workspaceId, params.vendorName, 'user_edited');
    transaction.vendorId = vendor.id;
    transaction.vendorName = vendor.name;
    transaction.vendorSource = 'user_edited';
  }

  transaction.updatedAt = nowIso();
  persistDb();
  return transaction;
}

export function getOrCreateCategory(workspaceId: string, rawName: string, source: LabeledSource): Category {
  const db = loadDb();
  const name = rawName.trim() || 'Uncategorized';
  const existing = db.categories.find((category) => category.workspaceId === workspaceId && category.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    if (source === 'user_edited' && existing.source !== 'user_edited') existing.source = 'user_edited';
    return existing;
  }

  const createdAt = nowIso();
  const category: Category = { id: createId('cat'), workspaceId, name, source, createdAt, updatedAt: createdAt };
  db.categories.push(category);
  persistDb();
  return category;
}

export function getOrCreateVendor(workspaceId: string, rawName: string, source: LabeledSource): Vendor {
  const db = loadDb();
  const name = rawName.trim() || 'Unknown Vendor';
  const normalizedName = normalizeVendorName(name);
  const existing = db.vendors.find((vendor) => vendor.workspaceId === workspaceId && vendor.normalizedName === normalizedName);
  if (existing) {
    if (source === 'user_edited' && existing.source !== 'user_edited') existing.source = 'user_edited';
    return existing;
  }

  const createdAt = nowIso();
  const vendor: Vendor = { id: createId('vendor'), workspaceId, name, normalizedName, source, createdAt, updatedAt: createdAt };
  db.vendors.push(vendor);
  persistDb();
  return vendor;
}

export function listCategories(workspaceId = DEFAULT_WORKSPACE_ID) {
  return loadDb().categories.filter((category) => category.workspaceId === workspaceId).sort((a, b) => a.name.localeCompare(b.name));
}

export function listVendors(workspaceId = DEFAULT_WORKSPACE_ID) {
  return loadDb().vendors.filter((vendor) => vendor.workspaceId === workspaceId).sort((a, b) => a.name.localeCompare(b.name));
}

export function saveAiConversation(conversation: AppDatabase['aiConversations'][number]) {
  loadDb().aiConversations.push(conversation);
  persistDb();
  return conversation;
}

export function saveReport(report: BurnReport) {
  loadDb().reports.push(report);
  persistDb();
  return report;
}

export function getReport(reportId: string, workspaceId = DEFAULT_WORKSPACE_ID) {
  return loadDb().reports.find((report) => report.id === reportId && report.workspaceId === workspaceId);
}

function normalizeVendorName(name: string) {
  return name
    .toLowerCase()
    .replace(/[*#][a-z0-9 -]+/gi, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}
