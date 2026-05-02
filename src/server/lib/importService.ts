import type { ColumnMapping, CsvImport, SpendDirectionMode } from '../../shared/types.js';
import { buildTransactions, createPreview, validateRows } from './csv.js';
import { createId, nowIso } from './ids.js';
import { addTransactions, findImport, getWorkspaceId, saveImport } from './store.js';

export function previewImport(csvText: string, fileName: string) {
  const preview = createPreview(csvText);
  const workspaceId = getWorkspaceId();
  const csvImport: CsvImport = {
    id: preview.importId,
    workspaceId,
    fileName,
    status: 'uploaded',
    csvText,
    rowCount: preview.rowCount,
    validRowCount: 0,
    invalidRowCount: 0,
    errorSummary: [],
    createdAt: nowIso()
  };
  saveImport(csvImport);
  return preview;
}

export function validateImport(importId: string, mapping: ColumnMapping) {
  const workspaceId = getWorkspaceId();
  const csvImport = findImport(importId, workspaceId);
  if (!csvImport) throw new Error('Import not found. Please upload the CSV again.');
  const validation = validateRows(csvImport.csvText, mapping);
  saveImport({
    ...csvImport,
    status: validation.ok ? 'validated' : 'failed',
    columnMapping: mapping,
    rowCount: validation.rowCount,
    validRowCount: validation.validRowCount,
    invalidRowCount: validation.invalidRowCount,
    errorSummary: validation.errors
  });
  return validation;
}

export function commitImport(importId: string, mapping: ColumnMapping, spendDirectionMode: SpendDirectionMode) {
  const workspaceId = getWorkspaceId();
  const csvImport = findImport(importId, workspaceId);
  if (!csvImport) throw new Error('Import not found. Please upload the CSV again.');

  const { transactions, validation } = buildTransactions({ csvText: csvImport.csvText, mapping, spendDirectionMode, workspaceId, csvImportId: importId });
  if (!validation.ok || transactions.length === 0) {
    saveImport({ ...csvImport, status: 'failed', columnMapping: mapping, spendDirectionMode, errorSummary: validation.errors });
    return { import: findImport(importId, workspaceId), transactions: [], validation };
  }

  addTransactions(transactions);
  const updatedImport: CsvImport = {
    ...csvImport,
    status: 'imported',
    columnMapping: mapping,
    spendDirectionMode,
    rowCount: validation.rowCount,
    validRowCount: validation.validRowCount,
    invalidRowCount: validation.invalidRowCount,
    errorSummary: validation.errors,
    completedAt: nowIso()
  };
  saveImport(updatedImport);
  return { import: updatedImport, transactions, validation };
}

export function createFixtureImport(csvText: string, mapping: ColumnMapping, spendDirectionMode: SpendDirectionMode = 'spend-positive') {
  const preview = previewImport(csvText, `fixture-${createId('csv')}.csv`);
  return commitImport(preview.importId, mapping, spendDirectionMode);
}
