import { Router, Request, Response } from 'express';
import { db } from '../db/database';
import { ProgramPolicy } from '@shipreward/shared';
import { ProgramPolicySchema } from '@shipreward/shared';

export const programmeRouter = Router();

function mapRowToProgram(r: any): ProgramPolicy {
  return {
    id: r.id,
    name: r.name,
    tier: r.tier,
    description: r.description,
    repository: r.repository,
    targetBranch: r.target_branch,
    minScore: r.min_score,
    requireCiPass: Boolean(r.require_ci_pass),
    requireMaintainerApproval: Boolean(r.require_maintainer_approval),
    allowSelfApproval: Boolean(r.allow_self_approval),
    perContributionRewardUsd: r.per_contribution_reward_usd,
    dailyBudgetUsd: r.daily_budget_usd,
    totalBudgetUsd: r.total_budget_usd,
    spentTodayUsd: r.spent_today_usd,
    totalSpentUsd: r.total_spent_usd,
    allowedProductIds: JSON.parse(r.allowed_product_ids || '[]'),
    autoFulfill: Boolean(r.auto_fulfill),
    active: Boolean(r.active),
    createdAt: r.created_at,
    updatedAt: r.updated_at
  };
}

programmeRouter.get('/programmes', (req: Request, res: Response) => {
  const rows = db.prepare('SELECT * FROM programs ORDER BY created_at ASC').all() as any[];
  res.json(rows.map(mapRowToProgram));
});

programmeRouter.get('/programmes/:id', (req: Request, res: Response) => {
  const id = req.params.id as string;
  const row = db.prepare('SELECT * FROM programs WHERE id = ?').get(id) as any;
  if (!row) {
    res.status(404).json({ error: 'Programme not found' });
    return;
  }
  res.json(mapRowToProgram(row));
});

programmeRouter.put('/programmes/:id', (req: Request, res: Response) => {
  const id = req.params.id as string;
  const parsed = ProgramPolicySchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  const existing = db.prepare('SELECT * FROM programs WHERE id = ?').get(id) as any;
  if (!existing) {
    res.status(404).json({ error: 'Programme not found' });
    return;
  }

  const data = parsed.data;
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE programs
    SET name = COALESCE(?, name),
        description = COALESCE(?, description),
        repository = COALESCE(?, repository),
        target_branch = COALESCE(?, target_branch),
        min_score = COALESCE(?, min_score),
        require_ci_pass = COALESCE(?, require_ci_pass),
        require_maintainer_approval = COALESCE(?, require_maintainer_approval),
        allow_self_approval = COALESCE(?, allow_self_approval),
        per_contribution_reward_usd = COALESCE(?, per_contribution_reward_usd),
        daily_budget_usd = COALESCE(?, daily_budget_usd),
        total_budget_usd = COALESCE(?, total_budget_usd),
        allowed_product_ids = COALESCE(?, allowed_product_ids),
        auto_fulfill = COALESCE(?, auto_fulfill),
        active = COALESCE(?, active),
        updated_at = ?
    WHERE id = ?
  `).run(
    data.name ?? null,
    data.description ?? null,
    data.repository ?? null,
    data.targetBranch ?? null,
    data.minScore ?? null,
    data.requireCiPass !== undefined ? (data.requireCiPass ? 1 : 0) : null,
    data.requireMaintainerApproval !== undefined ? (data.requireMaintainerApproval ? 1 : 0) : null,
    data.allowSelfApproval !== undefined ? (data.allowSelfApproval ? 1 : 0) : null,
    data.perContributionRewardUsd ?? null,
    data.dailyBudgetUsd ?? null,
    data.totalBudgetUsd ?? null,
    data.allowedProductIds ? JSON.stringify(data.allowedProductIds) : null,
    data.autoFulfill !== undefined ? (data.autoFulfill ? 1 : 0) : null,
    data.active !== undefined ? (data.active ? 1 : 0) : null,
    now,
    id
  );

  const updated = db.prepare('SELECT * FROM programs WHERE id = ?').get(id) as any;
  res.json(mapRowToProgram(updated));
});
