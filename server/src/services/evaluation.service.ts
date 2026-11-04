import { ProgramPolicy, VerificationStatus } from '@shipreward/shared';
import { FraudService, FraudEvaluationInput } from './fraud.service';

export interface ContributionInput {
  repository: string;
  prNumber: number;
  prTitle: string;
  contributor: string;
  baseBranch: string;
  merged: boolean;
  ciStatus: 'passed' | 'failed' | 'pending' | 'none';
  maintainerApproved: boolean;
  selfApproved: boolean;
  maintainerHandle?: string;
  approvingMaintainers?: string[];
  hasTestFiles?: boolean;
  commitCount?: number;
  additions: number;
  deletions: number;
  changedFilesCount: number;
}

export class EvaluationService {
  static evaluateContribution(
    input: ContributionInput,
    policy: ProgramPolicy
  ): {
    score: number;
    status: VerificationStatus;
    fraudFlags: string[];
    ruleChecks: Record<string, boolean>;
    explanation: string;
  } {
    const fraudInput: FraudEvaluationInput = {
      repository: input.repository,
      allowedRepository: policy.repository,
      prNumber: input.prNumber,
      contributor: input.contributor,
      maintainerHandle: input.maintainerHandle,
      selfApproved: input.selfApproved,
      additions: input.additions,
      deletions: input.deletions,
      changedFilesCount: input.changedFilesCount,
    };

    const fraudResult = FraudService.evaluate(fraudInput);

    const ruleChecks: Record<string, boolean> = {
      repoAllowlisted: input.repository.toLowerCase() === policy.repository.toLowerCase(),
      mergedIntoTarget: input.merged && input.baseBranch === policy.targetBranch,
      ciChecksPassed: !policy.requireCiPass || input.ciStatus === 'passed',
      maintainerApproved: !policy.requireMaintainerApproval || input.maintainerApproved,
      notSelfApproved: policy.allowSelfApproval || !input.selfApproved,
      noDuplicate: !fraudResult.flags.includes('DUPLICATE_REWARD_CLAIM_PREVENTED'),
    };

    // Calculate deterministic score (0 - 100)
    let score = 50; // base score for a valid PR

    // Quality additions & deletions curve
    const totalLines = input.additions + input.deletions;
    if (totalLines >= 10 && totalLines <= 500) {
      score += 25; // sweet spot for reviewable, substantial contribution
    } else if (totalLines > 500) {
      score += 15; // large diff
    } else if (totalLines < 5) {
      score -= 20; // very small / trivial
    }

    if (input.ciStatus === 'passed') score += 15;
    if (input.maintainerApproved) score += 10;
    if (input.hasTestFiles) score += 10; // Bonus for writing tests!
    if (input.prTitle.startsWith('fix') || input.prTitle.startsWith('feat')) score += 5;

    // Apply fraud penalty
    score -= fraudResult.riskScore;
    score = Math.max(0, Math.min(100, score));

    // Determine status
    let status: VerificationStatus = 'VERIFIED';
    let explanation = '';

    if (fraudResult.isFraud) {
      status = 'FRAUD_FLAGGED';
      explanation = `Contribution rejected: Detected fraud or duplicate claim flags [${fraudResult.flags.join(', ')}].`;
    } else if (!ruleChecks.mergedIntoTarget) {
      status = 'REJECTED';
      explanation = `Contribution rejected: Pull request must be merged into '${policy.targetBranch}' to qualify.`;
    } else if (!ruleChecks.ciChecksPassed) {
      status = 'REJECTED';
      explanation = 'Contribution rejected: Required automated CI test suites failed.';
    } else if (!ruleChecks.maintainerApproved) {
      status = 'NEEDS_REVIEW';
      explanation = 'Pending manual review: Waiting for maintainer sign-off.';
    } else if (score < policy.minScore) {
      status = 'NEEDS_REVIEW';
      explanation = `Borderline score (${score.toFixed(0)} / 100) is below automatic policy threshold (${policy.minScore}). Requires manual review.`;
    } else {
      explanation = `Verified with score ${score.toFixed(0)}/100. Diff changes (${input.additions}+/${input.deletions}- lines across ${input.changedFilesCount} files) verified against policy rules.`;
    }

    return {
      score,
      status,
      fraudFlags: fraudResult.flags,
      ruleChecks,
      explanation
    };
  }
}

