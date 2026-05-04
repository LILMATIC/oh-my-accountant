# AI Accountant Assistant MVP

A greenfield MVP for startup founders to upload manual CSV transactions, understand where money is going, ask grounded AI-style questions, and generate a burn reduction report.

## What this MVP does

- Upload a CSV and have date, description, amount, account/card, category, vendor, status, type, currency, and memo columns detected automatically.
- Validate CSV rows with clear row-level errors.
- Partially import valid rows while skipping invalid rows.
- Review transactions with search and editable category/vendor labels.
- View dashboard metrics for total spend, burn trend, top categories, top vendors, unusual increases, and burn drivers.
- Ask a server-side assistant questions based on allowlisted transaction metrics.
- Generate a Markdown burn reduction report.
- Export a categorized Excel workbook with Summary, Category Summary, Monthly Category, Merchant Summary, Categorized Spend, and audit tabs.

## What this MVP intentionally does not do

- No live bank integrations.
- No multi-company/client management.
- No full bookkeeping ledger, double-entry accounting, reconciliation, chart of accounts, or audit-grade books.
- No licensed accounting, legal, or tax advice claims.

## Run locally

```bash
npm install
npm run dev
```

Open the Vite web app URL shown in the terminal. The API runs on port `3000` by default.

## Build and verify

```bash
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
```


## Deployments

- GitHub Pages: https://lilmatic.github.io/oh-my-accountant/
- Vercel: https://oh-my-accountant.vercel.app/

Vercel serves the Vite client from `dist/client` and routes `/api/*` to the Express app through `api/index.ts`. On Vercel, the MVP JSON database uses `/tmp/oh-my-accountant/app-db.json`, so uploaded data is ephemeral and should be replaced with a durable database before real production use.

## Categorization workflow

CSV imports auto-detect column mappings and spend direction, then normalize into settled/closed/cleared spending where status/type evidence is available. The app excludes cancelled/pending authorizations, deposits/topups, USDC/crypto wallet funding, withdrawals, swaps, cashback/referral rows, hold releases, and zero-dollar rows; refunds are preserved as adjustments. Merchant/type rules assign simplified categories and keep a `categoryRule` explanation for auditability.

## Local data

The app uses a simple local JSON data store at `data/app-db.json` by default. This keeps the MVP easy to run while preserving the planned one-user / one-workspace data model. Generated data files are ignored by Git.

## Safety note

Assistant answers and reports include this boundary: “This is decision support, not accounting, legal, or tax advice.”
