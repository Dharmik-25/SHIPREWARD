# SHIPREWARD: Autonomous Multi-Tier Contribution Reward Engine via Bitrefill

Autonomous contribution evaluation and reward platform that validates code contributions, grades them against deterministic multi-factor rubrics across academic, open-source, and enterprise programmes, and fulfills real digital rewards (gift cards, mobile top-ups) directly to contributors via the Bitrefill eCommerce MCP.

## Lane: Lane 3 (No prompt required) + Lane 1 (Rails and guardrails)
**The loop:** Merged Pull Request (`pull_request.closed` webhook) → Deterministic Multi-Factor Rubric Engine & Spend Firewall → Bitrefill eCommerce MCP (`buy-products` & order delivery tracking) → AES-256-GCM Encrypted Contributor Delivery & Instant Voucher Claim

## Demo: [SHIPREWARD Demo Video Link] · Real purchase invoice ID: `c98f3afa-607a-4606-823a-dec61aa42477`

---

## Real Purchase Verification (Live on Bitrefill)

- **Invoice ID**: `c98f3afa-607a-4606-823a-dec61aa42477`
- **Order ID**: `6aeb6cc6f0106a061b7e8e7d`
- **Order Status**: `delivered`
- **Product**: Swiggy Money India (`swiggy-money-india`)
- **Denomination**: ₹50 INR
- **Payment Method**: Bitrefill Account Balance (`balance`)
- **Total Amount Debited**: $0.55 USD
- **Account Balance After Debit**: $24.45 USD (verified live via MCP `get-balances`, strictly protected)
- **Rewarded Contribution**: PR #2 on `Dharmik-25/SHIPREWARD` by `@Dharmik-25`
- **Reward Record ID**: `rew_7368c1826d61`
- **Masked Voucher Preview**: `QWIKFUEYUF2W7B7A-••••-••••-7B7A`

---

## Autonomous Multi-Tier Architecture

SHIPREWARD supports three distinct operational tiers sharing the same deterministic verification engine, anti-fraud checks, and Bitrefill fulfillment rails:

### 1. CAMPUS — Academic Submissions
- **Target Users**: University professors, TAs, academic coordinators, and student developers.
- **Workflow**: Faculty defines an assignment with milestone rubrics, target repositories, deadlines, and budget pools. Students submit PRs implementing coursework algorithms (e.g. distributed systems, consensus protocols).
- **Rubric Focus**: Test harness verification (`hasTestFiles`), commit hygiene and multi-commit progression (`commitCount >= 2`), modular architecture, and academic integrity.
- **Governance**: Borderline grades or high-tier rewards route directly to professor approval queue before fulfillment.

### 2. BUILDER — Open-Source Contributors (Live Integration Target)
- **Target Users**: Open-source maintainers, independent developers, and DAO contributors.
- **Workflow**: Connected to the live repository (`Dharmik-25/SHIPREWARD`). Webhooks trigger deterministic scoring upon PR merge.
- **Rubric Focus**: Conventional commit titles (`feat:`, `fix:`), issue linkage, focused reviewable diffs, clean CI runs, and independent maintainer reviews.
- **Governance**: Fully autonomous fulfillment within daily spending caps; anti-fraud shields prevent self-approval and duplicate claim replays.

### 3. ENTERPRISE — Internal Engineering Quality
- **Target Users**: Engineering managers, VP Engineering, Staff Engineers, and departmental leads.
- **Workflow**: Incentivizes internal code quality, performance optimizations, backward-compatible API designs, and comprehensive test coverage across corporate repos.
- **Rubric Focus**: Rigorous peer sign-offs (multiple reviewers), production reliability, security hygiene, and clean static analysis suites.
- **Governance**: Manager sign-off required for high-tier compensation rewards; atomic departmental budget isolation prevents cross-team overspend.

---

## 100-Point Evidence-Backed Rubric & Reward Tiers

Every pull request is scored across four deterministic, evidence-backed pillars (0–100 points):

| Rubric Pillar | Max Points | Evaluation Criteria |
| :--- | :---: | :--- |
| **1. Code Scope & Complexity** | 30 pts | Optimal reviewable diff (10–400 lines) awards 30 pts. Trivial changes (<5 lines) receive 5 pts. Bloated diffs (>1200 lines) are penalized. |
| **2. Test Coverage & CI Validation** | 25 pts | Automated CI passing (`ciStatus: passed`) awards 15 pts; dedicated test harness files award +10 pts bonus. |
| **3. Peer Review Quality & Governance**| 25 pts | Authorized maintainer sign-off awards 15 pts; multi-reviewer consensus (+5 pts); anti-fraud segregation (+5 pts). |
| **4. Programme Tier Alignment** | 20 pts | Tier-specific rubric: academic tests & commits (Campus), conventional PR titles & merge status (Builder), or strict manager reviews (Enterprise). |

### Score-to-Reward Classification
- **0–39 (INSUFFICIENT)**: $0.00 — Contribution rejected or returned for evidence.
- **40–59 (BASIC)**: $0.11 — ₹10 Talktime (e.g., `airtel-india`).
- **60–79 (GOOD)**: $0.55 — ₹50 Voucher (e.g., `swiggy-money-india`).
- **80–94 (EXCELLENT)**: $1.10 — ₹100 Voucher (e.g., `swiggy-money-india`).
- **95–100 (EXCEPTIONAL)**: $2.75 — ₹250 Voucher (e.g., `swiggy-money-india`, queued for manual review).

---

## Human Approval & Review Queue

For sensitive, high-value, or borderline contributions, SHIPREWARD includes an audit-logged approval workflow:
- Contributions with scores below policy thresholds or rewards exceeding `approvalThresholdUsd` (or `EXCEPTIONAL` tier) transition to `approvalStatus: 'PENDING_APPROVAL'`.
- Reviewers inspect the evidence breakdown, rubric scores, and PR diff on GitHub.
- Endpoints:
  - `GET /api/contributions/pending-approval`: Lists all pending submissions.
  - `POST /api/contributions/:id/approve`: Authorizes reward with reviewer identity and audit justification.
  - `POST /api/contributions/:id/reject`: Rejects submission and logs formal reason.

---

## Isolated Programme Budgets & Concurrency Safety

To prevent concurrent race conditions during reward execution, `BudgetService` provides atomic reservations:
- `reserveBudget(programId, amountUsd)`: Uses atomic SQL conditional updates (`WHERE spent_today_usd + ? <= daily_budget_usd AND total_spent_usd + ? <= total_budget_usd`).
- If concurrent requests attempt to exceed a programme's daily or total pool, the second transaction is rejected before calling upstream APIs.
- `releaseReservation(programId, amountUsd)`: Safely restores pool funds if downstream order delivery fails.

---

## Run It (Under 15 Minutes)

### Prerequisites
- Node.js 20+
- npm 10+
- SQLite (included with Node 22+)

### 1. Clone & Install
```bash
git clone https://github.com/Dharmik-25/SHIPREWARD.git
cd SHIPREWARD
npm install
```

### 2. Configure Environment (`server/.env`)
```ini
PORT=4000
NODE_ENV=development
CLIENT_ORIGIN=http://localhost:5173
DATABASE_PATH=./data/shipreward.db

# Bitrefill Commerce Configuration
BITREFILL_API_KEY=your_bitrefill_api_key
BITREFILL_MCP_URL=https://api.bitrefill.com/mcp
BITREFILL_API_URL=https://api.bitrefill.com/v2
VOUCHER_ENCRYPTION_KEY=your_64_hex_char_master_voucher_key

# Spend Guardrails & Emergency Controls
SPEND_CAP_DAILY_USD=1.00
SPEND_CAP_SINGLE_REWARD_USD=0.60
EMERGENCY_PURCHASE_FREEZE=false
AUTO_PURCHASE_ENABLED=false

# GitHub Integration
GITHUB_TOKEN=your_github_token
GITHUB_WEBHOOK_SECRET=your_webhook_secret
```

### 3. Build & Run Tests
```bash
npm run build
npm test
```
All 34 automated unit and integration tests across 3 suites pass cleanly:
- `tests/multi-tier.test.ts` (9 tests: Campus/Builder/Enterprise rubrics, reward tiers, approvals, atomic budgets)
- `tests/bitrefill.test.ts` (13 tests: MCP connectivity, packages, spend caps, voucher encryption)
- `tests/server.test.ts` (12 tests: Webhook HMAC-SHA256, deduplication, GitHub API evidence)

### 4. Start Server & Client
```bash
# Terminal 1: Backend API
npm run dev -w server

# Terminal 2: Frontend Dashboard
npm run dev -w client
```
Visit `http://localhost:5173` to explore the live dashboard.

---

## Bitrefill Touchpoints (Built vs Reused)

- **Official `@modelcontextprotocol/sdk` Streamable HTTP Client (Built)**: We implemented `BitrefillMcpService` connecting directly to `https://api.bitrefill.com/mcp` using `StreamableHTTPClientTransport`. It dynamically queries live account balances via tool `get-balances`, performs catalog discovery with tool `search-products`, retrieves live denomination packages via tool `get-product-details`, and executes purchases using tool `buy-products`.
- **Cryptographic Spend Firewall & Budget Pools (Built)**: Deterministic pre-purchase validation layer intercepting purchases before upstream calls: rejects amounts over the single-reward cap ($0.60), blocks purchases exceeding the daily spend cap ($1.00), prevents overdraw across isolated programme pools, stops unverified/self-approved pull requests, and enforces emergency kill-switches.
- **AES-256-GCM Voucher Vault & Contributor Claim Flow (Built)**: Voucher codes are never logged, printed, or exposed in plain text. Redemption secrets are encrypted server-side using a dedicated `VOUCHER_ENCRYPTION_KEY` and delivered only when the verified contributor proves identity via `/api/rewards/:id/claim`.
- **Order Delivery Lifecycle Monitor (Built)**: In accordance with Bitrefill core concepts, invoices are not treated as finished when marked `complete` (which only denotes payment confirmation). The engine polls until the underlying order is `delivered` before recording reward fulfillment.
- **Bitrefill Commerce Surfaces (Reused)**: eCommerce MCP server at `https://api.bitrefill.com/mcp`, REST API v2 endpoints (`/v2/ping`, `/v2/orders/:id`), and Bitrefill Account Balance auto-debit payments.

---

## Guardrails

- **Maximum Single Reward**: **$0.60 USD** (₹50 Swiggy Money is $0.55; any package > $0.60 is blocked server-side).
- **Daily Hard Spend Cap**: **$1.00 USD** (After one $0.55 purchase, remaining daily budget is $0.45; subsequent rewards are queued for review).
- **Autonomous Spend Prevention**: `AUTO_PURCHASE_ENABLED=false` requires explicit administrator confirmation (`confirmedByAdmin: true`) for every purchase execution.
- **Emergency Kill Switch**: Server-side and dashboard toggle (`EMERGENCY_PURCHASE_FREEZE=true`) immediately halts all reward processing across all programmes.
- **Duplicate Protection**: Deduplication enforced per GitHub PR delivery ID and SQLite contribution ID; replaying a delivery or re-executing a purchase is strictly rejected.

---

## Feedback

See [FEEDBACK.md](FEEDBACK.md) for builder experience notes and suggestions for the Bitrefill MCP & developer tooling.
