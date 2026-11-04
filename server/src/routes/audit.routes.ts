import { Router, Request, Response } from 'express';
import { AuditService } from '../services/audit.service';

export const auditRouter = Router();

auditRouter.get('/audit', (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 50;
  res.json(AuditService.getRecent(limit));
});

