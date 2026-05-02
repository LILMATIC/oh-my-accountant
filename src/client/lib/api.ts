import type { BurnReport, ColumnMapping, CsvImport, DashboardMetrics, PreviewResult, SpendDirectionMode, Transaction, ValidationResult } from '../../shared/types';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) }
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  previewImport: (csvText: string, fileName: string) => request<PreviewResult>('/api/imports/preview', { method: 'POST', body: JSON.stringify({ csvText, fileName }) }),
  validateImport: (importId: string, mapping: ColumnMapping) => request<ValidationResult>('/api/imports/validate', { method: 'POST', body: JSON.stringify({ importId, mapping }) }),
  commitImport: (importId: string, mapping: ColumnMapping, spendDirectionMode: SpendDirectionMode) => request<{ import: CsvImport; transactions: Transaction[]; validation: ValidationResult }>('/api/imports/commit', { method: 'POST', body: JSON.stringify({ importId, mapping, spendDirectionMode }) }),
  listTransactions: (query = '') => request<Transaction[]>(`/api/transactions${query}`),
  updateTransaction: (id: string, body: { categoryName?: string; vendorName?: string }) => request<Transaction>(`/api/transactions/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  dashboard: (query = '') => request<DashboardMetrics>(`/api/dashboard${query}`),
  askAi: (question: string, start?: string, end?: string) => request<{ answer: string }>('/api/ai/chat', { method: 'POST', body: JSON.stringify({ question, start, end }) }),
  createReport: (start?: string, end?: string) => request<BurnReport>('/api/reports', { method: 'POST', body: JSON.stringify({ start, end }) })
};
