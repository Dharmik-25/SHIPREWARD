import { z } from 'zod';

export const ProgramPolicySchema = z.object({
  id: z.string().optional(),
  name: z.string().min(3),
  tier: z.enum(['CAMPUS', 'BUILDER', 'ENTERPRISE']),
  description: z.string(),
  repository: z.string().min(3),
  targetBranch: z.string().default('main'),
  minScore: z.number().min(0).max(100).default(70),
  requireCiPass: z.boolean().default(true),
  requireMaintainerApproval: z.boolean().default(true),
  allowSelfApproval: z.boolean().default(false),
  perContributionRewardUsd: z.number().positive().max(50),
  dailyBudgetUsd: z.number().positive().max(100),
  totalBudgetUsd: z.number().positive(),
  allowedProductIds: z.array(z.string()).min(1),
  autoFulfill: z.boolean().default(true),
  active: z.boolean().default(true),
});

export const WebhookEventSchema = z.object({
  action: z.string(),
  number: z.number().optional(),
  pull_request: z.object({
    id: z.number(),
    number: z.number(),
    title: z.string(),
    html_url: z.string(),
    state: z.string(),
    merged: z.boolean().optional(),
    merged_at: z.string().nullable().optional(),
    user: z.object({
      login: z.string(),
      avatar_url: z.string().optional(),
    }),
    base: z.object({
      ref: z.string(),
      repo: z.object({
        full_name: z.string(),
      }),
    }),
    head: z.object({
      ref: z.string(),
    }),
    changed_files: z.number().optional(),
    additions: z.number().optional(),
    deletions: z.number().optional(),
  }).optional(),
});

export const TriggerSimulationSchema = z.object({
  programId: z.string(),
  prNumber: z.number().default(104),
  prTitle: z.string(),
  contributor: z.string(),
  changedFilesCount: z.number().default(3),
  additions: z.number().default(45),
  deletions: z.number().default(8),
  ciStatus: z.enum(['passed', 'failed', 'pending']).default('passed'),
  maintainerApproved: z.boolean().default(true),
  selfApproved: z.boolean().default(false),
  productId: z.string().default('swiggy-india'),
  packageValue: z.string().default('500'),
  recipientEmail: z.string().email().optional(),
  recipientPhone: z.string().optional(),
});

