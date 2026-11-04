import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { db } from '../src/db/database';
import { EvaluationService } from '../src/services/evaluation.service';
import { BudgetService } from '../src/services/budget.service';
import { ProgramPolicy, ContributionInput } from '@shipreward/shared';

describe('Phase 6 — Autonomous Multi-Tier Contribution Reward Engine', () => {
  const basePolicy: ProgramPolicy = {
    id: 'prog_builder_core',
    name: 'Builder Open-Source Programme',
    tier: 'BUILDER',
    owner: 'Lead Maintainer',
    fundingSource: 'Open Source Community Pool',
    description: 'Autonomous rewards for open-source contributors',
    repository: 'Dharmik-25/SHIPREWARD',
    targetBranch: 'main',
    minScore: 65,
    requireCiPass: true,
    requireMaintainerApproval: true,
    allowSelfApproval: false,
    perContributionRewardUsd: 0.55,
    approvalThresholdUsd: 1.00,
    dailyBudgetUsd: 5.00,
    totalBudgetUsd: 50.00,
    spentTodayUsd: 0.00,
    totalSpentUsd: 0.00,
    allowedProductIds: ['swiggy-money-india', 'airtel-india'],
    autoFulfill: false,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  describe('1. Multi-Tier Rubric Evaluation & Scoring', () => {
    it('Campus Tier: awards points for test files and milestone commit volume', () => {
      const campusPolicy: ProgramPolicy = {
        ...basePolicy,
        id: 'prog_campus_test',
        name: 'Distributed Systems Lab',
        tier: 'CAMPUS',
        owner: 'Prof. Sharma',
        fundingSource: 'Academic Innovation Grant'
      };

      const submission: ContributionInput = {
        repository: 'Dharmik-25/SHIPREWARD',
        prNumber: 8801,
        prTitle: 'Lab 3: Raft Consensus Implementation',
        prUrl: 'https://github.com/Dharmik-25/SHIPREWARD/pull/8801',
        contributor: 'student_alice',
        headBranch: 'raft-impl',
        baseBranch: 'main',
        additions: 120,
        deletions: 10,
        changedFilesCount: 4,
        merged: true,
        ciStatus: 'passed',
        maintainerApproved: true,
        selfApproved: false,
        hasTestFiles: true,
        commitCount: 3
      };

      const result = EvaluationService.evaluateContribution(submission, campusPolicy);
      expect(result.score).toBeGreaterThanOrEqual(80);
      expect(result.rubricEvaluation.tierObjectiveAlignment).toBe(20); // 10 for test files + 10 for commitCount >= 2
      expect(result.status).toBe('VERIFIED');
    });

    it('Builder Tier: awards points for conventional commits and merged status', () => {
      const submission: ContributionInput = {
        repository: 'Dharmik-25/SHIPREWARD',
        prNumber: 8802,
        prTitle: 'feat(core): implement idempotent webhook verification',
        prUrl: 'https://github.com/Dharmik-25/SHIPREWARD/pull/8802',
        contributor: 'builder_bob',
        headBranch: 'feat/webhook',
        baseBranch: 'main',
        additions: 85,
        deletions: 15,
        changedFilesCount: 3,
        merged: true,
        ciStatus: 'passed',
        maintainerApproved: true,
        selfApproved: false,
        hasTestFiles: true,
        commitCount: 2
      };

      const result = EvaluationService.evaluateContribution(submission, basePolicy);
      expect(result.score).toBeGreaterThanOrEqual(80);
      expect(result.rubricEvaluation.tierObjectiveAlignment).toBe(20); // 10 for feat title + 10 for merged
      expect(result.status).toBe('VERIFIED');
    });

    it('Enterprise Tier: rewards rigorous peer review and clean CI validation', () => {
      const enterprisePolicy: ProgramPolicy = {
        ...basePolicy,
        id: 'prog_enterprise_test',
        name: 'Platform Core Engine',
        tier: 'ENTERPRISE',
        owner: 'VP Engineering',
        fundingSource: 'Core Infrastructure Budget'
      };

      const submission: ContributionInput = {
        repository: 'Dharmik-25/SHIPREWARD',
        prNumber: 8803,
        prTitle: 'perf: optimize sqlite connection pooling',
        prUrl: 'https://github.com/Dharmik-25/SHIPREWARD/pull/8803',
        contributor: 'eng_charlie',
        headBranch: 'perf/pool',
        baseBranch: 'main',
        additions: 45,
        deletions: 20,
        changedFilesCount: 2,
        merged: true,
        ciStatus: 'passed',
        maintainerApproved: true,
        selfApproved: false,
        hasTestFiles: true,
        commitCount: 2
      };

      const result = EvaluationService.evaluateContribution(submission, enterprisePolicy);
      expect(result.rubricEvaluation.tierObjectiveAlignment).toBe(20);
      expect(result.status).toBe('VERIFIED');
    });
  });

  describe('2. Reward Tier Classification & Product Recommendation', () => {
    it('Maps scores to correct reward tiers and package recommendations', () => {
      // Basic Tier (score 40-59)
      const basicInput: ContributionInput = {
        repository: 'Dharmik-25/SHIPREWARD',
        prNumber: 8804,
        prTitle: 'docs: update readme with setup details',
        prUrl: 'https://github.com/Dharmik-25/SHIPREWARD/pull/8804',
        contributor: 'contributor_dave',
        headBranch: 'patch-1',
        baseBranch: 'main',
        additions: 500,
        deletions: 10,
        changedFilesCount: 1,
        merged: true,
        ciStatus: 'passed',
        maintainerApproved: false,
        selfApproved: false,
        hasTestFiles: false
      };

      const policyLowThreshold: ProgramPolicy = { ...basePolicy, minScore: 40, requireMaintainerApproval: false };
      const basicResult = EvaluationService.evaluateContribution(basicInput, policyLowThreshold);
      expect(basicResult.rewardTier).toBe('BASIC');
      expect(basicResult.suggestedRewardUsd).toBe(0.11);
      expect(basicResult.suggestedProductId).toBe('airtel-india');

      // Good Tier (score 60 - 79)
      const goodInput: ContributionInput = {
        repository: 'Dharmik-25/SHIPREWARD',
        prNumber: 8805,
        prTitle: 'refactor: clean up logging handlers',
        prUrl: 'https://github.com/Dharmik-25/SHIPREWARD/pull/8805',
        contributor: 'contributor_eve',
        headBranch: 'refactor/logs',
        baseBranch: 'main',
        additions: 50,
        deletions: 20,
        changedFilesCount: 2,
        merged: true,
        ciStatus: 'passed',
        maintainerApproved: true,
        selfApproved: false,
        hasTestFiles: false
      };
      const goodResult = EvaluationService.evaluateContribution(goodInput, basePolicy);
      expect(goodResult.rewardTier).toBe('GOOD');
      expect(goodResult.suggestedRewardUsd).toBe(0.55);
      expect(goodResult.suggestedProductId).toBe('swiggy-money-india');

      // Exceptional Tier (score >= 95)
      const exceptionalInput: ContributionInput = {
        repository: 'Dharmik-25/SHIPREWARD',
        prNumber: 8806,
        prTitle: 'feat(engine): comprehensive multi-tier rubric evaluation system',
        prUrl: 'https://github.com/Dharmik-25/SHIPREWARD/pull/8806',
        contributor: 'lead_dev',
        headBranch: 'feat/engine',
        baseBranch: 'main',
        additions: 350,
        deletions: 40,
        changedFilesCount: 8,
        merged: true,
        ciStatus: 'passed',
        maintainerApproved: true,
        approvingMaintainers: ['maintainer_one', 'maintainer_two'],
        selfApproved: false,
        hasTestFiles: true,
        commitCount: 4
      };
      const exceptionalResult = EvaluationService.evaluateContribution(exceptionalInput, basePolicy);
      expect(exceptionalResult.score).toBeGreaterThanOrEqual(95);
      expect(exceptionalResult.rewardTier).toBe('EXCEPTIONAL');
      expect(exceptionalResult.suggestedRewardUsd).toBe(2.75);
      // High reward requires manual approval
      expect(exceptionalResult.approvalStatus).toBe('PENDING_APPROVAL');
    });
  });

  describe('3. Human Approvals & Review Queue', () => {
    const testContribId = `contrib_test_approval_${Date.now()}`;

    beforeEach(() => {
      db.prepare(`
        INSERT INTO contributions (
          id, program_id, pr_number, pr_title, pr_url, contributor,
          head_branch, base_branch, additions, deletions, changed_files_count,
          merged_at, ci_status, maintainer_approved, self_approved,
          evaluation_score, verification_status, fraud_flags, ai_explanation,
          evidence_details, is_demo, reward_tier, suggested_reward_usd,
          approval_status, created_at, updated_at
        ) VALUES (
          ?, 'prog_builder_core', 9999, 'Test PR for Approval Queue', 'https://github.com/Dharmik-25/SHIPREWARD/pull/9999',
          'test_author', 'feat/test', 'main', 50, 5, 2,
          datetime('now'), 'passed', 1, 0,
          96, 'VERIFIED', '[]', 'Exceptional milestone PR queued for approval',
          '{}', 1, 'EXCEPTIONAL', 2.75,
          'PENDING_APPROVAL', datetime('now'), datetime('now')
        )
      `).run(testContribId);
    });

    afterEach(() => {
      db.prepare('DELETE FROM contributions WHERE id = ?').run(testContribId);
    });

    it('GET /api/contributions/pending-approval returns queued contributions', async () => {
      const res = await request(app).get('/api/contributions/pending-approval');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      const found = res.body.find((c: any) => c.id === testContribId);
      expect(found).toBeDefined();
      expect(found.approvalStatus).toBe('PENDING_APPROVAL');
    });

    it('POST /api/contributions/:id/approve approves the contribution with reviewer audit trail', async () => {
      const res = await request(app)
        .post(`/api/contributions/${testContribId}/approve`)
        .send({
          reviewer: 'Prof. Sharma',
          reason: 'Verified project milestone against rubric',
          fulfillReward: false
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.approvalStatus).toBe('APPROVED');

      // Verify in DB
      const row = db.prepare('SELECT * FROM contributions WHERE id = ?').get(testContribId) as any;
      expect(row.approval_status).toBe('APPROVED');
      expect(row.approved_by).toBe('Prof. Sharma');
      expect(row.approval_reason).toBe('Verified project milestone against rubric');
    });

    it('POST /api/contributions/:id/reject rejects the contribution', async () => {
      const res = await request(app)
        .post(`/api/contributions/${testContribId}/reject`)
        .send({
          reviewer: 'Department Head',
          reason: 'Did not meet milestone deadline'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.approvalStatus).toBe('REJECTED');

      // Verify in DB
      const row = db.prepare('SELECT * FROM contributions WHERE id = ?').get(testContribId) as any;
      expect(row.approval_status).toBe('REJECTED');
      expect(row.verification_status).toBe('REJECTED');
    });
  });

  describe('4. Isolated Programme Budgets & Atomic Spend Reservation', () => {
    it('Atomic reserveBudget prevents concurrent over-allocation', () => {
      const testProgId = 'prog_isolated_budget_test';
      db.prepare(`
        INSERT OR REPLACE INTO programs (
          id, name, tier, owner, funding_source, description, repository,
          target_branch, min_score, require_ci_pass, require_maintainer_approval,
          allow_self_approval, per_contribution_reward_usd, approval_threshold_usd,
          daily_budget_usd, total_budget_usd, spent_today_usd, total_spent_usd,
          allowed_product_ids, auto_fulfill, active, created_at, updated_at
        ) VALUES (
          ?, 'Test Pool', 'CAMPUS', 'Lab Admin', 'Grant Pool', 'Pool test', 'test/repo',
          'main', 70, 1, 1, 0, 0.55, 1.00,
          1.00, 10.00, 0.00, 0.00,
          '["swiggy-money-india"]', 1, 1, datetime('now'), datetime('now')
        )
      `).run(testProgId);

      // First reservation: $0.55 (allowed)
      const res1 = BudgetService.reserveBudget(testProgId, 0.55);
      expect(res1).toBe(true);

      // Second reservation: $0.55 ($0.55 + $0.55 = $1.10 > $1.00 daily budget, should reject)
      const res2 = BudgetService.reserveBudget(testProgId, 0.55);
      expect(res2).toBe(false);

      // Releasing first reservation allows new allocation
      BudgetService.releaseReservation(testProgId, 0.55);
      const res3 = BudgetService.reserveBudget(testProgId, 0.55);
      expect(res3).toBe(true);

      // Clean up
      BudgetService.releaseReservation(testProgId, 0.55);
      db.prepare('DELETE FROM programs WHERE id = ?').run(testProgId);
    });
  });

  describe('5. Anti-Fraud & Self-Approval Prevention across Tiers', () => {
    it('Detects self-approval and flags contribution across any tier', () => {
      const selfApprovedPR: ContributionInput = {
        repository: 'Dharmik-25/SHIPREWARD',
        prNumber: 8899,
        prTitle: 'Self-approved PR',
        prUrl: 'https://github.com/Dharmik-25/SHIPREWARD/pull/8899',
        contributor: 'sneaky_dev',
        headBranch: 'patch',
        baseBranch: 'main',
        additions: 10,
        deletions: 0,
        changedFilesCount: 1,
        merged: true,
        ciStatus: 'passed',
        maintainerApproved: true,
        selfApproved: true // Self-approval!
      };

      const result = EvaluationService.evaluateContribution(selfApprovedPR, basePolicy);
      expect(result.fraudFlags).toContain('SELF_APPROVAL_DETECTED');
      expect(result.status).toBe('FRAUD_FLAGGED');
      expect(result.approvalStatus).toBe('REJECTED');
    });
  });
});
