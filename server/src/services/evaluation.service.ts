import { ProgramPolicy, VerificationStatus, RewardClassification, ApprovalStatus } from '@shipreward/shared';
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

export interface EvaluationResult {
  score: number;
  status: VerificationStatus;
  rewardTier: RewardClassification;
  suggestedRewardUsd: number;
  suggestedProductId: string;
  suggestedPackageValue: string;
  approvalStatus: ApprovalStatus;
  fraudFlags: string[];
  ruleChecks: Record<string, boolean>;
  rubricEvaluation: Record<string, number>;
  explanation: string;
}

export class EvaluationService {
  /**
   * Deterministically evaluates contributions against programme-specific policies,
   * rubrics, and fraud prevention guardrails.
   */
  static evaluateContribution(
    input: ContributionInput,
    policy: ProgramPolicy
  ): EvaluationResult {
    // 1. Run Fraud & Anti-Abuse Checks
    const fraudInput: FraudEvaluationInput = {
      repository: input.repository,
      allowedRepository: policy.repository,
      prNumber: input.prNumber,
      contributor: input.contributor,
      maintainerHandle: input.maintainerHandle,
      approvingMaintainers: input.approvingMaintainers,
      selfApproved: input.selfApproved,
      additions: input.additions,
      deletions: input.deletions,
      changedFilesCount: input.changedFilesCount,
    };

    const fraudResult = FraudService.evaluate(fraudInput);

    // Filter external maintainer approvals (excluding the PR author)
    const contributorLower = input.contributor.toLowerCase();
    const externalApprovers = (input.approvingMaintainers || [])
      .filter(m => m.toLowerCase() !== contributorLower);

    const isSelfApproved = input.selfApproved || fraudResult.flags.includes('SELF_APPROVAL_DETECTED');
    const hasExplicitApprovers = Array.isArray(input.approvingMaintainers) && input.approvingMaintainers.length > 0;
    const hasValidMaintainerApproval = input.maintainerApproved && 
      (hasExplicitApprovers ? externalApprovers.length > 0 : !isSelfApproved);

    // 2. Deterministic Rule Checks
    const ruleChecks: Record<string, boolean> = {
      repoAllowlisted: input.repository.toLowerCase() === policy.repository.toLowerCase(),
      mergedIntoTarget: input.merged && input.baseBranch === policy.targetBranch,
      ciChecksPassed: !policy.requireCiPass || input.ciStatus === 'passed',
      maintainerApproved: !policy.requireMaintainerApproval || hasValidMaintainerApproval,
      notSelfApproved: policy.allowSelfApproval || !isSelfApproved,
      noDuplicate: !fraudResult.flags.includes('DUPLICATE_REWARD_CLAIM_PREVENTED'),
    };

    // 3. Evidence-Backed Multi-Factor Scoring (0–100)
    let score = 0;
    const rubricEvaluation: Record<string, number> = {};

    // Factor A: Code Scope & Meaningful Complexity (max 30 pts)
    const totalLines = input.additions + input.deletions;
    let codeScore = 15;
    if (totalLines >= 10 && totalLines <= 400 && input.changedFilesCount >= 1) {
      codeScore = 30; // optimal reviewable, focused change
    } else if (totalLines > 400 && totalLines <= 1200) {
      codeScore = 20; // substantial change
    } else if (totalLines > 1200) {
      codeScore = 10; // massive diff, higher risk
    } else if (totalLines < 5) {
      codeScore = 5; // trivial line change
    }
    rubricEvaluation['codeScopeAndComplexity'] = codeScore;
    score += codeScore;

    // Factor B: Test Coverage & CI Quality (max 25 pts)
    let testScore = 0;
    if (input.ciStatus === 'passed') testScore += 15;
    if (input.hasTestFiles) testScore += 10;
    rubricEvaluation['testCoverageAndCi'] = testScore;
    score += testScore;

    // Factor C: Review Quality & Peer Sign-off (max 25 pts)
    let reviewScore = 0;
    if (hasValidMaintainerApproval) reviewScore += 15;
    if (externalApprovers.length >= 2) reviewScore += 5; // multiple reviewers bonus
    if (!isSelfApproved) reviewScore += 5;
    rubricEvaluation['peerReviewQuality'] = reviewScore;
    score += reviewScore;

    // Factor D: Tier-Specific Objective Alignment (max 20 pts)
    let tierScore = 0;
    if (policy.tier === 'CAMPUS') {
      // Academic rubric: rewards test harnesses and clean commits
      if (input.hasTestFiles) tierScore += 10;
      if (input.commitCount && input.commitCount >= 2) tierScore += 10;
    } else if (policy.tier === 'BUILDER') {
      // Community rubric: fix/feat conventional PR title, issue solving
      const lowerTitle = input.prTitle.toLowerCase();
      if (lowerTitle.startsWith('feat') || lowerTitle.startsWith('fix') || lowerTitle.includes('issue')) {
        tierScore += 10;
      }
      if (input.merged) tierScore += 10;
    } else if (policy.tier === 'ENTERPRISE') {
      // Enterprise rubric: high review scrutiny, strict CI pass
      if (input.ciStatus === 'passed' && hasValidMaintainerApproval) tierScore += 20;
    }
    rubricEvaluation['tierObjectiveAlignment'] = tierScore;
    score += tierScore;

    // Apply Fraud / Risk Penalties
    score -= fraudResult.riskScore;
    score = Math.max(0, Math.min(100, Math.round(score)));

    // 4. Map Score to Reward Classification & Product Recommendation
    let rewardTier: RewardClassification = 'GOOD';
    let suggestedRewardUsd = 0.55;
    let suggestedProductId = 'swiggy-money-india';
    let suggestedPackageValue = '50';

    if (score < 40) {
      rewardTier = 'INSUFFICIENT';
      suggestedRewardUsd = 0;
      suggestedProductId = '';
      suggestedPackageValue = '';
    } else if (score < 60) {
      rewardTier = 'BASIC';
      suggestedRewardUsd = 0.11;
      suggestedProductId = 'airtel-india';
      suggestedPackageValue = '10';
    } else if (score < 80) {
      rewardTier = 'GOOD';
      suggestedRewardUsd = 0.55;
      suggestedProductId = 'swiggy-money-india';
      suggestedPackageValue = '50';
    } else if (score < 95) {
      rewardTier = 'EXCELLENT';
      suggestedRewardUsd = 1.10;
      suggestedProductId = 'swiggy-money-india';
      suggestedPackageValue = '100';
    } else {
      rewardTier = 'EXCEPTIONAL';
      suggestedRewardUsd = 2.75;
      suggestedProductId = 'swiggy-money-india';
      suggestedPackageValue = '250';
    }

    // 5. Determine Verification Status & Human Approval Requirement
    let status: VerificationStatus = 'VERIFIED';
    let approvalStatus: ApprovalStatus = 'NOT_REQUIRED';
    let explanation = '';

    if (fraudResult.isFraud) {
      status = 'FRAUD_FLAGGED';
      approvalStatus = 'REJECTED';
      explanation = `Contribution rejected: Detected fraud or duplicate claim flags [${fraudResult.flags.join(', ')}].`;
    } else if (!ruleChecks.mergedIntoTarget) {
      status = 'REJECTED';
      approvalStatus = 'REJECTED';
      explanation = `Contribution rejected: Pull request must be merged into '${policy.targetBranch}' to qualify.`;
    } else if (!ruleChecks.ciChecksPassed) {
      status = 'REJECTED';
      approvalStatus = 'REJECTED';
      explanation = 'Contribution rejected: Required automated CI test suites failed.';
    } else if (!ruleChecks.maintainerApproved) {
      status = 'NEEDS_REVIEW';
      approvalStatus = 'PENDING_APPROVAL';
      explanation = 'Pending review: Waiting for independent maintainer peer approval.';
    } else if (score < policy.minScore) {
      status = 'NEEDS_REVIEW';
      approvalStatus = 'PENDING_APPROVAL';
      explanation = `Borderline score (${score}/100) is below automatic policy threshold (${policy.minScore}). Requires coordinator approval.`;
    } else {
      // High-value reward or exceptional tier requires explicit maintainer approval
      const approvalThreshold = policy.approvalThresholdUsd || 1.00;
      if (suggestedRewardUsd >= approvalThreshold || rewardTier === 'EXCEPTIONAL') {
        approvalStatus = 'PENDING_APPROVAL';
        explanation = `Verified with score ${score}/100 (${rewardTier} tier). Reward amount ($${suggestedRewardUsd.toFixed(2)}) meets or exceeds approval threshold ($${approvalThreshold.toFixed(2)}). Queued for maintainer sign-off.`;
      } else {
        approvalStatus = 'NOT_REQUIRED';
        explanation = `Verified with score ${score}/100 (${rewardTier} tier). Full rubric criteria satisfied against ${policy.name}.`;
      }
    }

    return {
      score,
      status,
      rewardTier,
      suggestedRewardUsd,
      suggestedProductId,
      suggestedPackageValue,
      approvalStatus,
      fraudFlags: fraudResult.flags,
      ruleChecks,
      rubricEvaluation,
      explanation
    };
  }
}
