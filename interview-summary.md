# Interview Summary — AI Accountant Assistant

Generated: 20260502T025102Z UTC  
Workspace: `/Users/sungjin/Projects/{oh-my-accountant}`  
Context: Greenfield product requirements interview; current workspace has no visible app source files beyond `.omx/` state.

## 1. Final Requirements Summary

### Core Purpose
Build an AI accountant assistant for startup founders that turns manually uploaded financial CSV data into clear cash visibility and burn-reduction recommendations. The product should help a founder quickly understand where money is going and decide where to reduce burn.

### Primary User
- **Startup founder**: an early-stage founder/operator who needs practical financial visibility without building a full accounting system or hiring finance support immediately.

### Primary Pain
- The founder does not clearly know where company money is going.
- Spending categories, vendors, and trends are hard to review quickly.
- The founder needs to identify cost leakage and make burn-reduction decisions faster.

### Primary Outcome
A founder can upload transaction CSVs, see cash/burn insights, ask AI questions, and identify categories or vendors where burn can be reduced.

### MVP Scope
The MVP should include:

1. **CSV Upload**
   - Upload manual CSV files for bank/card/accounting exports.
   - Support a simple mapping step for common columns: date, description, amount, account, category, vendor, memo.
   - Validate files and show import errors clearly.

2. **Transaction Review**
   - Display imported transactions in a searchable/filterable table.
   - Auto-suggest categories and vendors where possible.
   - Allow users to edit category/vendor labels.

3. **Cash Visibility Dashboard**
   - Show total cash outflow for the selected period.
   - Show spending by category and vendor.
   - Highlight burn trend and unusual increases.
   - Surface “top burn drivers” and “possible cost leaks.”

4. **AI Burn Reduction Assistant**
   - Answer plain-English questions about uploaded financial data.
   - Explain where spending increased and why it may matter.
   - Suggest categories/vendors to review for cost reduction.
   - Phrase recommendations as decision support, not professional accounting/tax advice.

5. **Burn Reduction Report**
   - Generate a simple summary founders can export or copy.
   - Include top spending categories, top vendors, unusual changes, and recommended review actions.

### MVP Screens
Recommended first-pass screens:

1. **Landing / Start Screen**
   - Brief value proposition: “Understand where your startup money goes and where to reduce burn.”
   - Primary action: upload CSV.

2. **CSV Upload & Mapping Screen**
   - Upload area.
   - Column mapping UI.
   - Validation results.
   - Import confirmation.

3. **Dashboard Screen**
   - Key cards: total spend, monthly burn, largest category, largest vendor, unusual increase.
   - Charts: spend by category, spend by vendor, monthly trend.
   - AI-generated insight panel.

4. **Transactions Screen**
   - Transaction table.
   - Filters by date, category, vendor, amount range.
   - Edit category/vendor.

5. **AI Assistant Screen / Panel**
   - Chat-style question input.
   - Suggested prompts such as:
     - “Where can we reduce burn?”
     - “Which vendors increased the most?”
     - “What changed compared to last month?”

6. **Report Screen**
   - Burn reduction summary.
   - Export/copy actions.

### Core Data Objects

- **User**
  - id, email, name, company name
- **Company / Workspace**
  - id, owner user id, company name, currency, fiscal settings if needed later
- **CSV Import**
  - id, file name, uploaded date, status, row count, errors
- **Transaction**
  - id, import id, date, description, amount, account, category, vendor, memo, source row
- **Category**
  - id, name, type, user-edited flag
- **Vendor**
  - id, name, normalized name, total spend
- **Insight**
  - id, type, title, explanation, supporting transactions/categories/vendors
- **AI Conversation**
  - id, user id, question, answer, referenced data, created date
- **Report**
  - id, date range, summary, recommendations, generated date

### Operation Flow

1. Founder opens product.
2. Founder uploads CSV.
3. System validates the file and asks user to map columns if needed.
4. System imports transactions.
5. System categorizes/normalizes transactions and vendors where possible.
6. Founder reviews dashboard.
7. Founder inspects top burn drivers and unusual spending.
8. Founder asks AI questions about the data.
9. AI gives explainable recommendations using uploaded transaction data.
10. Founder edits categories/vendors if needed.
11. Founder generates a burn reduction report.

### Out of Scope / Non-goals for MVP
Confirmed non-goals:

- No live bank integrations.
- No multi-company/client management.
- No full bookkeeping ledger, double-entry accounting, reconciliation, chart of accounts, or audit-grade books.

Recommended safety boundary for MVP:

- The assistant should not present itself as a licensed accountant or tax advisor.
- Recommendations should be decision-support and educational, not binding financial/legal/tax advice.

### Future Features
Possible post-MVP features:

- Live bank/accounting integrations such as Plaid, QuickBooks, Xero, or bank feeds.
- Multi-company or accountant-client management.
- Full bookkeeping ledger, reconciliation, chart of accounts, and audit-grade records.
- Receipt and invoice upload with OCR/extraction.
- Budget planning and spend approval workflows.
- Tax/compliance reminders and accountant handoff packages.
- Investor-ready financial reporting.
- Forecasting, runway scenarios, and hiring/spend simulations.

### Decision Boundaries
The user authorized OMX to choose reasonable product details for:

- MVP screens.
- Data objects and fields.
- User flow.
- Acceptance criteria.
- Reasonable assumptions needed to make the requirements developer-ready.

### Acceptance Criteria
A developer can consider the MVP requirements satisfied when:

1. A user can upload a CSV file and map required columns.
2. The system imports transaction rows and reports validation errors clearly.
3. The user can view transactions in a table and filter/search them.
4. The system displays spending summaries by category, vendor, and time period.
5. The dashboard highlights top burn drivers and unusual spending changes.
6. The user can ask AI questions about uploaded data.
7. AI answers reference the uploaded financial data and explain reasoning in plain English.
8. The system suggests burn-reduction review areas without claiming to provide professional accounting/tax advice.
9. The user can generate a burn reduction summary report.
10. The MVP does not require live bank integrations, multi-company support, or a full bookkeeping ledger.

### Interview Evidence
- Product domain selected: AI accountant assistant.
- Primary user selected: startup founder.
- Primary pain selected: cash visibility.
- Primary decision selected: where to reduce burn.
- MVP data source selected: manual CSV upload.
- MVP non-goals selected: no live bank integrations, no multi-company/client management, no full bookkeeping ledger.
- Decision boundary selected: OMX may decide reasonable product details.

## 2. Paste-ready Prompt for `$ralplan`

```text
$ralplan

Use the requirements below as the source of truth and create a consensus implementation plan, PRD, and test specification for a greenfield MVP.

Product: AI Accountant Assistant for Startup Founders

Core purpose:
Build an AI accountant assistant that helps startup founders upload manual financial CSVs, understand where money is going, and decide where to reduce burn.

Primary user:
Startup founder/operator who needs practical cash visibility and burn-reduction guidance without a full accounting system.

Primary outcome:
After uploading CSV transaction data, the founder can see spending by category/vendor/time period, identify top burn drivers and unusual increases, ask AI questions about the data, and generate a burn reduction report.

MVP must include:
1. CSV upload and column mapping for date, description, amount, account, category, vendor, and memo when available.
2. CSV validation and clear import error handling.
3. Transaction table with search, filters, and editable category/vendor labels.
4. Cash visibility dashboard showing total spend, burn trend, top categories, top vendors, and unusual spending increases.
5. AI assistant that answers plain-English questions using uploaded transaction data.
6. Burn reduction recommendations focused on categories/vendors to review.
7. Burn reduction report that can be copied or exported.

Recommended MVP screens:
- Landing/start screen
- CSV upload and mapping screen
- Dashboard screen
- Transactions screen
- AI assistant panel/screen
- Report screen

Core data objects:
- User
- Company/workspace
- CSV import
- Transaction
- Category
- Vendor
- Insight
- AI conversation
- Report

MVP non-goals:
- No live bank integrations.
- No multi-company/client management.
- No full bookkeeping ledger, double-entry accounting, reconciliation, chart of accounts, or audit-grade books.
- Do not present AI output as licensed accounting, legal, or tax advice.

Future features to defer:
- Bank/accounting integrations
- Receipt/invoice OCR
- Multi-company/accountant workflows
- Full ledger/reconciliation
- Tax/compliance workflows
- Investor reporting
- Forecasting and runway scenarios

Acceptance criteria:
1. User can upload a CSV and map required columns.
2. Imported transactions are visible, searchable, filterable, and editable for category/vendor cleanup.
3. Dashboard summarizes spend by category, vendor, and period.
4. Dashboard highlights top burn drivers and unusual spending changes.
5. AI assistant answers questions based on uploaded transaction data and references relevant financial signals.
6. AI recommendations help the founder decide where to reduce burn.
7. User can generate a burn reduction report.
8. MVP avoids live integrations, multi-company support, and full bookkeeping ledger complexity.

Planning request:
Produce a developer-ready plan with architecture, implementation phases, data model, screen/component breakdown, API/backend responsibilities, AI/data-processing approach, test strategy, risks, and sequencing. Keep the MVP small and avoid adding live integrations or full accounting-ledger complexity.
```
