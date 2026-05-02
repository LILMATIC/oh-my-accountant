# AI Accountant Assistant MVP

A greenfield MVP for startup founders to upload manual CSV transactions, understand where money is going, ask grounded AI-style questions, and generate a burn reduction report.

## What this MVP does

- Upload a CSV and map date, description, amount, account, category, vendor, and memo columns.
- Validate CSV rows with clear row-level errors.
- Partially import valid rows while skipping invalid rows.
- Review transactions with search and editable category/vendor labels.
- View dashboard metrics for total spend, burn trend, top categories, top vendors, unusual increases, and burn drivers.
- Ask a server-side assistant questions based on allowlisted transaction metrics.
- Generate a Markdown burn reduction report.

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

## Local data

The app uses a simple local JSON data store at `data/app-db.json` by default. This keeps the MVP easy to run while preserving the planned one-user / one-workspace data model. Generated data files are ignored by Git.

## Safety note

Assistant answers and reports include this boundary: “This is decision support, not accounting, legal, or tax advice.”
