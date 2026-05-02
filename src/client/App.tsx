import { useEffect, useMemo, useState } from 'react';
import type { ColumnKey, ColumnMapping, DashboardMetrics, PreviewResult, SpendDirectionMode, Transaction, ValidationResult } from '../shared/types';
import { formatCurrency, formatPercent } from '../shared/money';
import { api } from './lib/api';
import { DisclaimerNote } from './components/DisclaimerNote';
import './styles.css';

const columnKeys: ColumnKey[] = ['date', 'description', 'amount', 'account', 'category', 'vendor', 'memo'];
const requiredColumns = new Set<ColumnKey>(['date', 'description', 'amount']);

type Tab = 'start' | 'upload' | 'dashboard' | 'transactions' | 'assistant' | 'report';

export default function App() {
  const [tab, setTab] = useState<Tab>('start');
  const [dashboardRefreshKey, setDashboardRefreshKey] = useState(0);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <strong>AI Accountant Assistant</strong>
          <span>Founder cash visibility MVP</span>
        </div>
        <nav aria-label="Main navigation">
          {(['start', 'upload', 'dashboard', 'transactions', 'assistant', 'report'] as Tab[]).map((item) => (
            <button key={item} onClick={() => setTab(item)} className={tab === item ? 'active' : ''}>{labelTab(item)}</button>
          ))}
        </nav>
      </header>
      <main>
        {tab === 'start' && <Landing onUpload={() => setTab('upload')} />}
        {tab === 'upload' && <UploadScreen onImported={() => { setDashboardRefreshKey((value) => value + 1); setTab('dashboard'); }} />}
        {tab === 'dashboard' && <Dashboard key={dashboardRefreshKey} />}
        {tab === 'transactions' && <Transactions onUpdated={() => setDashboardRefreshKey((value) => value + 1)} />}
        {tab === 'assistant' && <Assistant />}
        {tab === 'report' && <Report />}
      </main>
    </div>
  );
}

function Landing({ onUpload }: { onUpload: () => void }) {
  return (
    <section className="hero card">
      <p className="eyebrow">CSV-based burn review</p>
      <h1>Understand where your startup money goes.</h1>
      <p>Upload a transaction CSV, see spend by category/vendor, ask plain-English questions, and generate a burn reduction report.</p>
      <button className="primary" onClick={onUpload}>Upload CSV</button>
      <DisclaimerNote />
    </section>
  );
}

function UploadScreen({ onImported }: { onImported: () => void }) {
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [spendDirectionMode, setSpendDirectionMode] = useState<SpendDirectionMode>('spend-positive');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleFile(file?: File) {
    if (!file) return;
    setBusy(true);
    setMessage('Reading CSV…');
    try {
      const csvText = await file.text();
      const result = await api.previewImport(csvText, file.name);
      setPreview(result);
      setMapping(result.suggestedMapping);
      setValidation(null);
      setMessage(`Found ${result.rowCount} rows. Please confirm the column mapping.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not read the file.');
    } finally {
      setBusy(false);
    }
  }

  async function validate() {
    if (!preview) return;
    setBusy(true);
    try {
      const result = await api.validateImport(preview.importId, mapping);
      setValidation(result);
      setMessage(result.ok ? `${result.validRowCount} valid rows. ${result.invalidRowCount} rows will be skipped.` : 'Please fix the mapping or CSV errors.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Validation failed.');
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!preview) return;
    setBusy(true);
    try {
      const result = await api.commitImport(preview.importId, mapping, spendDirectionMode);
      if (!result.validation.ok) {
        setValidation(result.validation);
        setMessage('Import failed because no valid rows were available.');
        return;
      }
      setMessage(`Imported ${result.transactions.length} transactions.`);
      onImported();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Import failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="stack">
      <div className="card">
        <h1>Upload and map your CSV</h1>
        <p>Required columns are date, description, and amount. Account, category, vendor, and memo are optional.</p>
        <input aria-label="CSV file" type="file" accept=".csv,text/csv" onChange={(event) => void handleFile(event.target.files?.[0])} />
        {message && <p className="status">{message}</p>}
      </div>

      {preview && (
        <div className="grid two">
          <div className="card">
            <h2>Column mapping</h2>
            {columnKeys.map((key) => (
              <label key={key} className="field-row">
                <span>{key}{requiredColumns.has(key) ? ' *' : ''}</span>
                <select value={mapping[key] ?? ''} onChange={(event) => setMapping({ ...mapping, [key]: event.target.value || undefined })}>
                  <option value="">Not available</option>
                  {preview.headers.map((header) => <option key={header} value={header}>{header}</option>)}
                </select>
              </label>
            ))}
            <fieldset>
              <legend>How does this CSV show spending?</legend>
              <label><input type="radio" checked={spendDirectionMode === 'spend-positive'} onChange={() => setSpendDirectionMode('spend-positive')} /> Spending is positive numbers</label>
              <label><input type="radio" checked={spendDirectionMode === 'spend-negative'} onChange={() => setSpendDirectionMode('spend-negative')} /> Spending is negative numbers</label>
            </fieldset>
            <div className="actions">
              <button onClick={() => void validate()} disabled={busy}>Validate</button>
              <button className="primary" onClick={() => void commit()} disabled={busy}>Import valid rows</button>
            </div>
          </div>
          <div className="card">
            <h2>Preview</h2>
            <DataTable rows={preview.sampleRows} />
            {validation && <ValidationSummary validation={validation} />}
          </div>
        </div>
      )}
    </section>
  );
}

function ValidationSummary({ validation }: { validation: ValidationResult }) {
  return (
    <div className={validation.ok ? 'success' : 'error'}>
      <strong>{validation.validRowCount} valid / {validation.invalidRowCount} invalid rows</strong>
      {validation.errors.length > 0 && <ul>{validation.errors.slice(0, 8).map((error, index) => <li key={index}>{error.message}</li>)}</ul>}
    </div>
  );
}

function Dashboard() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { api.dashboard().then(setMetrics).catch((err) => setError(String(err))); }, []);
  if (error) return <div className="card error">{error}</div>;
  if (!metrics) return <div className="card">Loading dashboard…</div>;
  return <DashboardView metrics={metrics} />;
}

function DashboardView({ metrics }: { metrics: DashboardMetrics }) {
  return (
    <section className="stack">
      <div className="dashboard-cards">
        <MetricCard title="Total spend" value={formatCurrency(metrics.totalSpend)} />
        <MetricCard title="Top category" value={metrics.topCategories[0]?.name ?? 'No data'} detail={metrics.topCategories[0] ? formatCurrency(metrics.topCategories[0].spend) : ''} />
        <MetricCard title="Top vendor" value={metrics.topVendors[0]?.name ?? 'No data'} detail={metrics.topVendors[0] ? formatCurrency(metrics.topVendors[0].spend) : ''} />
        <MetricCard title="Unusual increases" value={String(metrics.unusualIncreases.length)} />
      </div>
      <div className="grid two">
        <RankedList title="Top categories" items={metrics.topCategories} />
        <RankedList title="Top vendors" items={metrics.topVendors} />
        <div className="card"><h2>Burn trend</h2>{metrics.trend.map((point) => <Bar key={point.period} label={point.period} value={point.spend} max={Math.max(...metrics.trend.map((item) => item.spend), 1)} />)}</div>
        <div className="card"><h2>Unusual increases</h2>{metrics.unusualIncreases.length === 0 ? <p>No unusual increases above MVP thresholds.</p> : metrics.unusualIncreases.map((item) => <p key={`${item.type}-${item.name}`}><strong>{item.name}</strong>: {formatCurrency(item.absoluteIncrease)} increase ({formatPercent(item.percentIncrease)}).</p>)}</div>
      </div>
      <div className="card"><h2>Burn drivers to review</h2>{metrics.burnDrivers.map((item) => <div className="recommendation" key={item.id}><strong>{item.title}</strong><p>{item.rationale}</p><p>{item.reviewAction}</p></div>)}</div>
    </section>
  );
}

function Transactions({ onUpdated }: { onUpdated: () => void }) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const query = useMemo(() => search ? `?search=${encodeURIComponent(search)}` : '', [search]);
  const load = () => api.listTransactions(query).then(setTransactions).catch((err) => setError(String(err)));
  useEffect(() => { void load(); }, [query]);

  async function save(transaction: Transaction, categoryName: string, vendorName: string) {
    await api.updateTransaction(transaction.id, { categoryName, vendorName });
    await load();
    onUpdated();
  }

  return (
    <section className="card">
      <h1>Transactions</h1>
      <input aria-label="Search transactions" placeholder="Search description, vendor, memo…" value={search} onChange={(event) => setSearch(event.target.value)} />
      {error && <p className="error">{error}</p>}
      <table className="transactions"><thead><tr><th>Date</th><th>Description</th><th>Amount</th><th>Category</th><th>Vendor</th><th>Account</th><th>Save</th></tr></thead><tbody>{transactions.map((transaction) => <TransactionRow key={transaction.id} transaction={transaction} onSave={save} />)}</tbody></table>
    </section>
  );
}

function TransactionRow({ transaction, onSave }: { transaction: Transaction; onSave: (transaction: Transaction, category: string, vendor: string) => Promise<void> }) {
  const [category, setCategory] = useState(transaction.categoryName);
  const [vendor, setVendor] = useState(transaction.vendorName);
  return <tr><td>{transaction.date}</td><td>{transaction.description}</td><td>{formatCurrency(transaction.amount)}</td><td><input value={category} onChange={(event) => setCategory(event.target.value)} /></td><td><input value={vendor} onChange={(event) => setVendor(event.target.value)} /></td><td>{transaction.account ?? '-'}</td><td><button onClick={() => void onSave(transaction, category, vendor)}>Save</button></td></tr>;
}

function Assistant() {
  const [question, setQuestion] = useState('Where can we reduce burn?');
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  async function ask(prompt = question) {
    setBusy(true);
    try {
      const result = await api.askAi(prompt);
      setAnswer(result.answer);
      setQuestion(prompt);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card assistant">
      <h1>AI Assistant</h1>
      <p>Ask questions about uploaded transaction data. Answers use calculated dashboard signals, not raw unrestricted database access.</p>
      <div className="prompt-list">{['Where can we reduce burn?', 'Which vendors increased the most?', 'What changed compared to last month?', 'Show our top software costs.'].map((prompt) => <button key={prompt} onClick={() => void ask(prompt)}>{prompt}</button>)}</div>
      <textarea value={question} onChange={(event) => setQuestion(event.target.value)} rows={3} />
      <button className="primary" onClick={() => void ask()} disabled={busy}>Ask</button>
      {answer && <pre className="answer">{answer}</pre>}
      <DisclaimerNote />
    </section>
  );
}

function Report() {
  const [content, setContent] = useState('');
  async function generate() {
    const report = await api.createReport();
    setContent(report.contentMarkdown);
  }
  async function copy() {
    await navigator.clipboard.writeText(content);
  }
  function download() {
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'burn-reduction-report.md';
    anchor.click();
    URL.revokeObjectURL(url);
  }
  return <section className="card"><h1>Burn reduction report</h1><p>Generate a founder-friendly report with top spend, unusual increases, and review actions.</p><button className="primary" onClick={() => void generate()}>Generate report</button>{content && <><div className="actions"><button onClick={() => void copy()}>Copy</button><button onClick={download}>Export Markdown</button></div><pre className="report-preview">{content}</pre></>}</section>;
}

function MetricCard({ title, value, detail = '' }: { title: string; value: string; detail?: string }) { return <div className="metric card"><span>{title}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</div>; }
function RankedList({ title, items }: { title: string; items: { name: string; spend: number; transactionCount: number }[] }) { return <div className="card"><h2>{title}</h2>{items.length === 0 ? <p>No data yet.</p> : items.map((item) => <p key={item.name}><strong>{item.name}</strong>: {formatCurrency(item.spend)} <small>({item.transactionCount} transactions)</small></p>)}</div>; }
function Bar({ label, value, max }: { label: string; value: number; max: number }) { return <div className="bar-row"><span>{label}</span><div><i style={{ width: `${Math.max(4, (value / max) * 100)}%` }} /></div><strong>{formatCurrency(value)}</strong></div>; }
function DataTable({ rows }: { rows: Record<string, string>[] }) { if (rows.length === 0) return <p>No rows to preview.</p>; const headers = Object.keys(rows[0]); return <div className="table-wrap"><table><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{headers.map((header) => <td key={header}>{row[header]}</td>)}</tr>)}</tbody></table></div>; }
function labelTab(tab: Tab) { return tab.charAt(0).toUpperCase() + tab.slice(1); }
