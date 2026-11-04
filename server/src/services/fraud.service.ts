import { db } from '../db/database';

export interface FraudEvaluationInput {
  repository: string;
  allowedRepository: string;
  prNumber: number;
  contributor: string;
  maintainerHandle?: string;
  selfApproved: boolean;
  additions: number;
  deletions: number;
  changedFilesCount: number;
}

export class FraudService {
  /**
   * Runs fraud and duplicate prevention checks.
   */
  static evaluate(input: FraudEvaluationInput): {
    isFraud: boolean;
    flags: string[];
    riskScore: number; // 0 (clean) to 100 (high risk)
  } {
    const flags: string[] = [];
    let riskScore = 0;

    // 1. Repository Allowlist Check
    if (input.repository.toLowerCase() !== input.allowedRepository.toLowerCase()) {
      flags.push('REPOSITORY_NOT_ALLOWLISTED');
      riskScore += 90;
    }

    // 2. Duplicate Reward Check: Has this PR number in this repo already been rewarded?
    const existingReward = db.prepare(`
      SELECT r.id, r.order_status
      FROM rewards r
      JOIN contributions c ON r.contribution_id = c.id
      WHERE c.pr_number = ? AND r.order_status != 'failed'
    `).get(input.prNumber);

    if (existingReward) {
      flags.push('DUPLICATE_REWARD_CLAIM_PREVENTED');
      riskScore += 100;
    }

    // 3. Self-Approval Check
    if (input.selfApproved || (input.maintainerHandle && input.maintainerHandle === input.contributor)) {
      flags.push('SELF_APPROVAL_DETECTED');
      riskScore += 80;
    }

    // 4. Suspiciously Trivial Diff Check
    const totalLines = input.additions + input.deletions;
    if (totalLines < 3 && input.changedFilesCount <= 1) {
      flags.push('TRIVIAL_DIFF_BELOW_THRESHOLD');
      riskScore += 50;
    }

    return {
      isFraud: riskScore >= 70,
      flags,
      riskScore: Math.min(100, riskScore)
    };
  }
}
