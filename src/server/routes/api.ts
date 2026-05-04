import { Router } from 'express';
import type { ColumnMapping, SpendDirectionMode, TransactionFilters } from '../../shared/types.js';
import { answerQuestion } from '../lib/ai.js';
import { getDashboardMetrics } from '../lib/analytics.js';
import { commitImport, previewImport, validateImport } from '../lib/importService.js';
import { generateReport } from '../lib/report.js';
import { buildCategorizedSpendWorkbook } from '../lib/workbook.js';
import { getReport, getTransactions, listCategories, listVendors, loadDb, updateTransactionLabels } from '../lib/store.js';

export const apiRouter = Router();

apiRouter.get('/health', (_req, res) => res.json({ ok: true, service: 'ai-accountant-assistant' }));

apiRouter.get('/workspace', (_req, res) => {
  const db = loadDb();
  res.json({ user: db.users[0], workspace: db.workspaces[0] });
});

apiRouter.post('/imports/preview', (req, res, next) => {
  try {
    const { csvText, fileName } = req.body as { csvText?: string; fileName?: string };
    if (!csvText) return res.status(400).json({ error: 'Please choose a CSV file before importing.' });
    return res.json(previewImport(csvText, fileName ?? 'transactions.csv'));
  } catch (error) {
    return next(error);
  }
});

apiRouter.post('/imports/validate', (req, res, next) => {
  try {
    const { importId, mapping } = req.body as { importId?: string; mapping?: ColumnMapping };
    if (!importId || !mapping) return res.status(400).json({ error: 'Import id and column mapping are required.' });
    return res.json(validateImport(importId, mapping));
  } catch (error) {
    return next(error);
  }
});

apiRouter.post('/imports/commit', (req, res, next) => {
  try {
    const { importId, mapping, spendDirectionMode } = req.body as { importId?: string; mapping?: ColumnMapping; spendDirectionMode?: SpendDirectionMode };
    if (!importId || !mapping) return res.status(400).json({ error: 'Import id and column mapping are required.' });
    return res.json(commitImport(importId, mapping, spendDirectionMode ?? 'spend-positive'));
  } catch (error) {
    return next(error);
  }
});

apiRouter.get('/imports', (_req, res) => res.json(loadDb().imports.map(stripCsvText)));


apiRouter.get('/transactions', (req, res) => {
  const filters: TransactionFilters = {
    search: asString(req.query.search),
    start: asString(req.query.start),
    end: asString(req.query.end),
    category: asString(req.query.category),
    vendor: asString(req.query.vendor),
    account: asString(req.query.account),
    importId: asString(req.query.importId),
    minAmount: asNumber(req.query.minAmount),
    maxAmount: asNumber(req.query.maxAmount)
  };
  res.json(getTransactions(filters));
});

apiRouter.patch('/transactions/:id', (req, res) => {
  const updated = updateTransactionLabels({ transactionId: req.params.id, categoryName: req.body.categoryName, vendorName: req.body.vendorName });
  if (!updated) return res.status(404).json({ error: 'Transaction not found.' });
  return res.json(updated);
});

apiRouter.get('/categories', (_req, res) => res.json(listCategories()));
apiRouter.get('/vendors', (_req, res) => res.json(listVendors()));

apiRouter.get('/dashboard', (req, res) => res.json(getDashboardMetrics({ start: asString(req.query.start), end: asString(req.query.end) })));

apiRouter.post('/ai/chat', async (req, res, next) => {
  try {
    const { question, start, end } = req.body as { question?: string; start?: string; end?: string };
    if (!question?.trim()) return res.status(400).json({ error: 'Please ask a question about your uploaded transactions.' });
    return res.json(await answerQuestion({ question, start, end }));
  } catch (error) {
    return next(error);
  }
});

apiRouter.post('/reports', (req, res) => {
  const { start, end } = req.body as { start?: string; end?: string };
  res.json(generateReport({ start, end }));
});

apiRouter.get('/reports/spend-workbook.xlsx', async (_req, res, next) => {
  try {
    const workbook = await buildCategorizedSpendWorkbook();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=categorized-spend-workbook.xlsx');
    return res.send(workbook);
  } catch (error) {
    return next(error);
  }
});

apiRouter.get('/reports/:id', (req, res) => {
  const report = getReport(req.params.id);
  if (!report) return res.status(404).json({ error: 'Report not found.' });
  return res.json(report);
});

function asString(value: unknown) {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

function asNumber(value: unknown) {
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function stripCsvText<T extends { csvText: string }>(csvImport: T) {
  const { csvText: _csvText, ...safeImport } = csvImport;
  void _csvText;
  return safeImport;
}
