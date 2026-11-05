import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';

const DB_DIR = path.resolve(__dirname, '../../data');

function resolveDbPath(): string {
  const envPath = process.env.DATABASE_PATH;
  if (envPath && path.isAbsolute(envPath)) return envPath;

  // Find workspace root containing root package.json
  let dir = process.cwd();
  while (dir && dir !== path.dirname(dir)) {
    const pkgPath = path.join(dir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (pkg.workspaces) {
          return path.join(dir, envPath || 'data/shipreward.db');
        }
      } catch {}
    }
    dir = path.dirname(dir);
  }
  return path.resolve(process.cwd(), envPath || './data/shipreward.db');
}

const DB_PATH = resolveDbPath();

const targetDir = path.dirname(DB_PATH);
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

export const db = new DatabaseSync(DB_PATH);

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS programs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      tier TEXT NOT NULL,
      owner TEXT NOT NULL DEFAULT 'Programme Lead',
      funding_source TEXT NOT NULL DEFAULT 'Treasury Pool',
      description TEXT NOT NULL,
      repository TEXT NOT NULL,
      target_branch TEXT NOT NULL DEFAULT 'main',
      min_score REAL NOT NULL DEFAULT 70,
      require_ci_pass INTEGER NOT NULL DEFAULT 1,
      require_maintainer_approval INTEGER NOT NULL DEFAULT 1,
      allow_self_approval INTEGER NOT NULL DEFAULT 0,
      per_contribution_reward_usd REAL NOT NULL DEFAULT 5.0,
      approval_threshold_usd REAL NOT NULL DEFAULT 1.0,
      daily_budget_usd REAL NOT NULL DEFAULT 25.0,
      total_budget_usd REAL NOT NULL DEFAULT 100.0,
      spent_today_usd REAL NOT NULL DEFAULT 0.0,
      total_spent_usd REAL NOT NULL DEFAULT 0.0,
      allowed_product_ids TEXT NOT NULL,
      auto_fulfill INTEGER NOT NULL DEFAULT 1,
      active INTEGER NOT NULL DEFAULT 1,
      rubric_criteria TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS contributions (
      id TEXT PRIMARY KEY,
      program_id TEXT NOT NULL,
      github_delivery_id TEXT UNIQUE,
      pr_number INTEGER NOT NULL,
      pr_title TEXT NOT NULL,
      pr_url TEXT NOT NULL,
      contributor TEXT NOT NULL,
      contributor_avatar TEXT,
      base_branch TEXT NOT NULL,
      head_branch TEXT NOT NULL,
      changed_files_count INTEGER NOT NULL,
      additions INTEGER NOT NULL,
      deletions INTEGER NOT NULL,
      merged_at TEXT,
      ci_status TEXT NOT NULL,
      maintainer_approved INTEGER NOT NULL,
      self_approved INTEGER NOT NULL,
      evaluation_score REAL NOT NULL,
      verification_status TEXT NOT NULL,
      fraud_flags TEXT NOT NULL,
      evidence_details TEXT NOT NULL,
      ai_explanation TEXT,
      reward_tier TEXT DEFAULT 'GOOD',
      suggested_reward_usd REAL DEFAULT 0.55,
      suggested_product_id TEXT DEFAULT 'swiggy-money-india',
      suggested_package_value TEXT DEFAULT '50',
      approval_status TEXT DEFAULT 'NOT_REQUIRED',
      approved_by TEXT,
      approval_reason TEXT,
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (program_id) REFERENCES programs(id)
    );

    CREATE TABLE IF NOT EXISTS rewards (
      id TEXT PRIMARY KEY,
      contribution_id TEXT NOT NULL,
      program_id TEXT NOT NULL,
      contributor TEXT NOT NULL,
      recipient_email TEXT,
      recipient_phone TEXT,
      product_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      package_value TEXT NOT NULL,
      package_currency TEXT NOT NULL,
      price_usd REAL NOT NULL,
      invoice_id TEXT NOT NULL,
      invoice_status TEXT NOT NULL,
      order_id TEXT,
      order_status TEXT NOT NULL,
      masked_voucher_code TEXT,
      encrypted_voucher_payload TEXT,
      voucher_iv TEXT,
      voucher_auth_tag TEXT,
      claimed_at TEXT,
      claimed_by TEXT,
      redemption_instructions TEXT,
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      delivered_at TEXT,
      FOREIGN KEY (contribution_id) REFERENCES contributions(id),
      FOREIGN KEY (program_id) REFERENCES programs(id)
    );

    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      event_type TEXT NOT NULL,
      actor TEXT NOT NULL,
      decision TEXT NOT NULL,
      program_id TEXT,
      contribution_id TEXT,
      reward_id TEXT,
      cost_usd REAL,
      details TEXT NOT NULL,
      metadata TEXT
    );

    CREATE TABLE IF NOT EXISTS processed_webhooks (
      delivery_id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      received_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS contributor_recipients (
      contributor_username TEXT PRIMARY KEY,
      recipient_email TEXT,
      recipient_phone TEXT,
      updated_at TEXT NOT NULL
    );
  `);

  // Migrate rewards table columns for encrypted voucher security if upgrading existing db
  try {
    const rewardColumns = db.prepare("PRAGMA table_info(rewards)").all() as { name: string }[];
    const existingColNames = rewardColumns.map(c => c.name);

    if (!existingColNames.includes('encrypted_voucher_payload')) {
      db.prepare("ALTER TABLE rewards ADD COLUMN encrypted_voucher_payload TEXT").run();
    }
    if (!existingColNames.includes('voucher_iv')) {
      db.prepare("ALTER TABLE rewards ADD COLUMN voucher_iv TEXT").run();
    }
    if (!existingColNames.includes('voucher_auth_tag')) {
      db.prepare("ALTER TABLE rewards ADD COLUMN voucher_auth_tag TEXT").run();
    }
    if (!existingColNames.includes('claimed_at')) {
      db.prepare("ALTER TABLE rewards ADD COLUMN claimed_at TEXT").run();
    }
    if (!existingColNames.includes('claimed_by')) {
      db.prepare("ALTER TABLE rewards ADD COLUMN claimed_by TEXT").run();
    }

    // Migrate programs table
    const programColumns = db.prepare("PRAGMA table_info(programs)").all() as { name: string }[];
    const progCols = programColumns.map(c => c.name);
    if (!progCols.includes('owner')) {
      db.prepare("ALTER TABLE programs ADD COLUMN owner TEXT DEFAULT 'Programme Lead'").run();
    }
    if (!progCols.includes('funding_source')) {
      db.prepare("ALTER TABLE programs ADD COLUMN funding_source TEXT DEFAULT 'Treasury Pool'").run();
    }
    if (!progCols.includes('approval_threshold_usd')) {
      db.prepare("ALTER TABLE programs ADD COLUMN approval_threshold_usd REAL DEFAULT 1.0").run();
    }
    if (!progCols.includes('rubric_criteria')) {
      db.prepare("ALTER TABLE programs ADD COLUMN rubric_criteria TEXT").run();
    }

    // Migrate contributions table
    const contribColumns = db.prepare("PRAGMA table_info(contributions)").all() as { name: string }[];
    const contribCols = contribColumns.map(c => c.name);
    if (!contribCols.includes('reward_tier')) {
      db.prepare("ALTER TABLE contributions ADD COLUMN reward_tier TEXT DEFAULT 'GOOD'").run();
    }
    if (!contribCols.includes('suggested_reward_usd')) {
      db.prepare("ALTER TABLE contributions ADD COLUMN suggested_reward_usd REAL DEFAULT 0.55").run();
    }
    if (!contribCols.includes('suggested_product_id')) {
      db.prepare("ALTER TABLE contributions ADD COLUMN suggested_product_id TEXT DEFAULT 'swiggy-money-india'").run();
    }
    if (!contribCols.includes('suggested_package_value')) {
      db.prepare("ALTER TABLE contributions ADD COLUMN suggested_package_value TEXT DEFAULT '50'").run();
    }
    if (!contribCols.includes('approval_status')) {
      db.prepare("ALTER TABLE contributions ADD COLUMN approval_status TEXT DEFAULT 'NOT_REQUIRED'").run();
    }
    if (!contribCols.includes('approved_by')) {
      db.prepare("ALTER TABLE contributions ADD COLUMN approved_by TEXT").run();
    }
    if (!contribCols.includes('approval_reason')) {
      db.prepare("ALTER TABLE contributions ADD COLUMN approval_reason TEXT").run();
    }
  } catch (e) {
    // Ignore migration error if table already fresh
  }

  updateProgramsMetadata();
  seedInitialPrograms();
}

function updateProgramsMetadata() {
  const builderRubric = JSON.stringify([
    { name: "Code Scope & Meaningful Complexity", weight: 30, description: "Focused, reviewable pull request diffs without bloated lines" },
    { name: "Test Coverage & CI Quality", weight: 25, description: "Automated test suites pass with comprehensive regression coverage" },
    { name: "Maintainer Peer Review", weight: 25, description: "Independent approval by repo maintainers without self-approval" },
    { name: "Issue Alignment & Convention", weight: 20, description: "Conventional commit prefixes (feat/fix) and issue linkage" }
  ]);

  const campusRubric = JSON.stringify([
    { name: "Milestone Deliverable", weight: 35, description: "Coursework lab milestone and distributed systems assignment goals" },
    { name: "Automated Test Harness", weight: 30, description: "Course benchmark tests pass cleanly in student repo" },
    { name: "Code Architecture & Modularity", weight: 20, description: "Clean code structure adhering to academic guidelines" },
    { name: "Submission Hygiene & Commits", weight: 15, description: "Multi-commit progression demonstrating authentic student work" }
  ]);

  const enterpriseRubric = JSON.stringify([
    { name: "Production Reliability & SLA", weight: 35, description: "High-throughput fault tolerance, API backward compatibility" },
    { name: "Security & Secret Sanitization", weight: 30, description: "Static security analysis clean, zero credential leakage" },
    { name: "Engineering Manager Review", weight: 25, description: "Staff Engineer / EM architectural sign-off" },
    { name: "Observability & Telemetry", weight: 10, description: "Metrics, audit logs, and operational alarms included" }
  ]);

  try {
    db.prepare(`
      UPDATE programs
      SET owner = 'Dharmik (Lead Maintainer)',
          funding_source = 'Open-Source Community Treasury',
          approval_threshold_usd = 0.60,
          rubric_criteria = ?
      WHERE id = 'prog_builder_core'
    `).run(builderRubric);

    db.prepare(`
      UPDATE programs
      SET owner = 'Prof. Sharma (CS Faculty Coordinator)',
          funding_source = 'Academic Lab Incentive Fund 2026',
          approval_threshold_usd = 1.00,
          rubric_criteria = ?
      WHERE id = 'prog_campus_cs401'
    `).run(campusRubric);

    db.prepare(`
      UPDATE programs
      SET owner = 'Engineering VP / Platform Manager',
          funding_source = 'Corporate Cloud & Platform R&D Pool',
          approval_threshold_usd = 5.00,
          rubric_criteria = ?
      WHERE id = 'prog_enterprise_infra'
    `).run(enterpriseRubric);
  } catch (err) {
    // Non-fatal if tables being initialized
  }
}

function seedInitialPrograms() {
  const existing = db.prepare('SELECT COUNT(*) as count FROM programs').get() as { count: number };
  if (existing.count > 0) return;

  const now = new Date().toISOString();

  // 1. Builder Programme (Primary fully functional target)
  const insert = db.prepare(`
    INSERT INTO programs (
      id, name, tier, description, repository, target_branch, min_score,
      require_ci_pass, require_maintainer_approval, allow_self_approval,
      per_contribution_reward_usd, daily_budget_usd, total_budget_usd,
      spent_today_usd, total_spent_usd, allowed_product_ids, auto_fulfill, active,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insert.run(
    'prog_builder_core',
    'Open-Source Engine Core',
    'BUILDER',
    'Community contributor bug bounty & milestone micro-rewards for GitHub contributors.',
    'Dharmik-25/SHIPREWARD',
    'main',
    80,
    1, // require CI
    1, // require maintainer approval
    0, // block self approval
    5.98,
    25.00,
    150.00,
    11.96, // demo spent today
    83.72,
    JSON.stringify(['swiggy-money-india', 'swiggy-india', 'zomato-india', 'airtel-india', 'jio-india']),
    1,
    1,
    now,
    now
  );

  // 2. Campus Programme
  insert.run(
    'prog_campus_cs401',
    'CS401 Distributed Systems Fall 2026',
    'CAMPUS',
    'Academic milestone verification and student incentives funded by department budget.',
    'campus-labs/raft-proj',
    'main',
    75,
    1,
    1,
    0,
    2.50,
    50.00,
    250.00,
    5.00,
    45.00,
    JSON.stringify(['swiggy-india', 'airtel-india']),
    1,
    1,
    now,
    now
  );

  // 3. Enterprise Programme
  insert.run(
    'prog_enterprise_infra',
    'Fintech Platform Engineering',
    'ENTERPRISE',
    'Internal developer innovation programme with manager-level approval thresholds.',
    'fintech-corp-internal/platform-core',
    'main',
    85,
    1,
    1,
    0,
    10.00,
    500.00,
    2000.00,
    0.00,
    95.00,
    JSON.stringify(['swiggy-india', 'zomato-india', 'phonepe-india']),
    0, // manual fulfillment above $10
    1,
    now,
    now
  );

  // Seed labelled demo contributions and rewards
  seedDemoRecords();
}

function seedDemoRecords() {
  const insertContribution = db.prepare(`
    INSERT INTO contributions (
      id, program_id, github_delivery_id, pr_number, pr_title, pr_url,
      contributor, contributor_avatar, base_branch, head_branch,
      changed_files_count, additions, deletions, merged_at,
      ci_status, maintainer_approved, self_approved, evaluation_score,
      verification_status, fraud_flags, evidence_details, ai_explanation,
      is_demo, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertReward = db.prepare(`
    INSERT INTO rewards (
      id, contribution_id, program_id, contributor, recipient_email, recipient_phone,
      product_id, product_name, package_value, package_currency, price_usd,
      invoice_id, invoice_status, order_id, order_status, masked_voucher_code,
      redemption_instructions, is_demo, created_at, delivered_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertAudit = db.prepare(`
    INSERT INTO audit_events (
      id, timestamp, event_type, actor, decision, program_id, contribution_id, reward_id, cost_usd, details, metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const now = new Date();
  const time1 = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const time2 = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
  const time3 = new Date(now.getTime() - 30 * 60 * 1000).toISOString();

  // Demo Record 1: Successfully Delivered Reward
  insertContribution.run(
    'contrib_demo_101',
    'prog_builder_core',
    'demo-deliv-101',
    104,
    'fix(cache): resolve race condition in distributed key invalidation',
    'https://github.com/shipreward/core-engine/pull/104',
    'alex-dev',
    'https://avatars.githubusercontent.com/u/101?v=4',
    'main',
    'alex/cache-mutex',
    3,
    68,
    12,
    time1,
    'passed',
    1,
    0,
    94.0,
    'VERIFIED',
    JSON.stringify([]),
    JSON.stringify({
      diffSummary: 'Added mutex synchronization wrapper around redis cache invalidator',
      commitCount: 2,
      checkSuiteResults: '18 unit tests, 4 integration tests passed',
      maintainerHandle: 'lead-maintainer',
      ruleChecks: {
        hmacValid: true,
        repoAllowlisted: true,
        merged: true,
        ciPassed: true,
        maintainerApproved: true,
        notSelfApproved: true,
        notDuplicate: true,
        budgetAvailable: true
      }
    }),
    'PR #104 resolves a critical concurrency race condition with regression tests. Genuine algorithmic fix without boilerplate.',
    1, // is_demo = 1
    time1,
    time1
  );

  insertReward.run(
    'rew_demo_101',
    'contrib_demo_101',
    'prog_builder_core',
    'alex-dev',
    'alex@dev.community',
    null,
    'swiggy-india',
    'Swiggy Money Voucher',
    '500',
    'INR',
    5.98,
    'inv_01jxk92m1a_demo',
    'complete',
    'ord_442981a_demo',
    'delivered',
    'SWIGGY-••••-••••-9481',
    'Redeem code in Swiggy Wallet under Account > Swiggy Money',
    1,
    time1,
    time1
  );

  insertAudit.run(
    'audit_demo_101',
    time1,
    'BITREFILL_ORDER_DELIVERED',
    'autonomous_agent',
    'AUTHORIZED',
    'prog_builder_core',
    'contrib_demo_101',
    'rew_demo_101',
    5.98,
    'Demo reward delivered: Swiggy ₹500 via Bitrefill invoice inv_01jxk92m1a_demo for PR #104',
    JSON.stringify({ isDemo: true, package: '500 INR' })
  );

  // Demo Record 2: Campus Mobile Top-Up
  insertContribution.run(
    'contrib_demo_102',
    'prog_campus_cs401',
    'demo-deliv-102',
    42,
    'feat(raft): implement leader election timeout and randomized jitter',
    'https://github.com/campus-labs/raft-proj/pull/42',
    'priya-student',
    'https://avatars.githubusercontent.com/u/102?v=4',
    'main',
    'priya/election-jitter',
    2,
    44,
    6,
    time2,
    'passed',
    1,
    0,
    88.0,
    'VERIFIED',
    JSON.stringify([]),
    JSON.stringify({
      diffSummary: 'Implemented randomized heartbeats in Raft election state machine',
      commitCount: 1,
      checkSuiteResults: 'All campus lab tests passing',
      maintainerHandle: 'prof-kumar'
    }),
    'High quality lab milestone implementation verified by professor automated grading harness.',
    1,
    time2,
    time2
  );

  insertReward.run(
    'rew_demo_102',
    'contrib_demo_102',
    'prog_campus_cs401',
    'priya-student',
    'priya@campus.edu',
    '919876543210',
    'airtel-india',
    'Airtel Talktime ₹120',
    '120',
    'INR',
    1.31,
    'inv_01jxk81j3c_demo',
    'complete',
    'ord_339182b_demo',
    'delivered',
    'AIRTEL-TOPUP-919876543210',
    'Instant mobile talktime balance added to 919876543210',
    1,
    time2,
    time2
  );

  // Demo Record 3: Fraud Flagged (Self Approval)
  insertContribution.run(
    'contrib_demo_103',
    'prog_builder_core',
    'demo-deliv-103',
    111,
    'style: fix formatting whitespace in README.md',
    'https://github.com/shipreward/core-engine/pull/111',
    'suspicious_bot',
    'https://avatars.githubusercontent.com/u/103?v=4',
    'main',
    'bot/whitespace',
    1,
    2,
    2,
    time3,
    'passed',
    1,
    1, // Self-approved!
    25.0,
    'FRAUD_FLAGGED',
    JSON.stringify(['SELF_APPROVAL_DETECTED', 'TRIVIAL_DIFF_BELOW_THRESHOLD']),
    JSON.stringify({
      diffSummary: 'Trivial whitespace adjustment in documentation',
      maintainerHandle: 'suspicious_bot'
    }),
    'Contribution rejected by fraud engine: Contributor approved their own pull request. Diff size is suspiciously trivial for reward eligibility.',
    1,
    time3,
    time3
  );

  insertAudit.run(
    'audit_demo_103',
    time3,
    'FRAUD_PREVENTED',
    'fraud_engine',
    'REJECTED',
    'prog_builder_core',
    'contrib_demo_103',
    null,
    0.0,
    'Fraud blocked: PR #111 rejected due to self-approval and trivial diff threshold violation.',
    JSON.stringify({ flags: ['SELF_APPROVAL_DETECTED', 'TRIVIAL_DIFF_BELOW_THRESHOLD'] })
  );
}

