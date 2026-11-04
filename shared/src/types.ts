export type ProgramTier = 'CAMPUS' | 'BUILDER' | 'ENTERPRISE';

export interface ProgramPolicy {
  id: string;
  name: string;
  tier: ProgramTier;
  description: string;
  repository: string; // e.g. "shipreward/core-engine"
  targetBranch: string; // e.g. "main"
  minScore: number; // 0-100 threshold
  requireCiPass: boolean;
  requireMaintainerApproval: boolean;
  allowSelfApproval: boolean; // default false (fraud prevention)
  perContributionRewardUsd: number; // e.g. 5.00
  dailyBudgetUsd: number; // e.g. 25.00
  totalBudgetUsd: number; // e.g. 100.00
  spentTodayUsd: number;
  totalSpentUsd: number;
  allowedProductIds: string[]; // e.g. ["swiggy-india", "zomato-india", "airtel-india", "jio-india"]
  autoFulfill: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export type VerificationStatus = 
  | 'PENDING'
  | 'VERIFIED'
  | 'NEEDS_REVIEW'
  | 'REJECTED'
  | 'FRAUD_FLAGGED';

export interface Contribution {
  id: string;
  programId: string;
  githubDeliveryId: string;
  prNumber: number;
  prTitle: string;
  prUrl: string;
  contributor: string;
  contributorAvatar?: string;
  baseBranch: string;
  headBranch: string;
  changedFilesCount: number;
  additions: number;
  deletions: number;
  mergedAt?: string;
  ciStatus: 'passed' | 'failed' | 'pending' | 'none';
  maintainerApproved: boolean;
  selfApproved: boolean;
  evaluationScore: number; // 0-100
  verificationStatus: VerificationStatus;
  fraudFlags: string[];
  evidenceDetails: {
    diffSummary?: string;
    commitCount?: number;
    checkSuiteResults?: string;
    maintainerHandle?: string;
    ruleChecks?: Record<string, boolean>;
    recipient?: {
      email?: string;
      phone?: string;
    };
    hasTestFiles?: boolean;
    approvingMaintainers?: string[];
  };
  aiExplanation?: string;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
}

export type InvoiceStatus = 
  | 'unpaid'
  | 'payment_detected'
  | 'payment_confirmed'
  | 'pending'
  | 'complete'
  | 'denied'
  | 'blocked'
  | 'payment_error';

export type OrderStatus = 
  | 'created'
  | 'payment_detected'
  | 'processing'
  | 'delivered'
  | 'failed'
  | 'refunded';

export interface RewardRecord {
  id: string;
  contributionId: string;
  programId: string;
  contributor: string;
  recipientEmail?: string;
  recipientPhone?: string;
  productId: string;
  productName: string;
  packageValue: string; // e.g. "500", "10"
  packageCurrency: string; // e.g. "INR"
  priceUsd: number;
  invoiceId: string;
  invoiceStatus: InvoiceStatus;
  orderId?: string;
  orderStatus: OrderStatus;
  maskedVoucherCode?: string; // Always masked, e.g. "SWIGGY-••••-••••-9821"
  redemptionInstructions?: string;
  isDemo: boolean;
  createdAt: string;
  deliveredAt?: string;
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  eventType: 
    | 'WEBHOOK_RECEIVED'
    | 'SIGNATURE_VERIFIED'
    | 'CONTRIBUTION_EVALUATED'
    | 'FRAUD_PREVENTED'
    | 'POLICY_AUTHORIZED'
    | 'MANUAL_REVIEW_TRIGGERED'
    | 'BITREFILL_INVOICE_CREATED'
    | 'BITREFILL_ORDER_DELIVERED'
    | 'PURCHASE_FAILED'
    | 'EMERGENCY_STOP_ACTIVATED';
  actor: string;
  decision: 'AUTHORIZED' | 'REJECTED' | 'REVIEW_REQUIRED' | 'PROCESSED' | 'ERROR';
  programId?: string;
  contributionId?: string;
  rewardId?: string;
  costUsd?: number;
  details: string;
  metadata?: Record<string, any>;
}

export interface BitrefillProductSummary {
  id: string;
  name: string;
  country: string;
  category: string;
  description: string;
  currency: string;
  packages: Array<{
    package_value: string;
    package_currency: string;
    payment_price: string;
    payment_currency: string;
  }>;
  recipient_type: 'phone_number' | 'account' | 'email' | 'username' | 'none';
  in_stock: boolean;
}

export interface SystemHealth {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  uptimeSeconds: number;
  environment: string;
  database: 'connected' | 'disconnected';
  bitrefill: {
    status: 'connected' | 'unconfigured' | 'offline';
    endpoint: string;
    dailySpendCapUsd: number;
    spentTodayUsd: number;
    remainingTodayUsd: number;
    emergencyFreeze: boolean;
  };
  metrics: {
    totalPrograms: number;
    liveContributions: number;
    demoContributions: number;
    liveRewardsDelivered: number;
    demoRewardsDelivered: number;
    fraudPreventedCount: number;
  };
}

