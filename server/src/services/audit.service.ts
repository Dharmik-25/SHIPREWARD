import { db } from '../db/database';
import { AuditEvent } from '@shipreward/shared';
import crypto from 'node:crypto';

export class AuditService {
  static log(event: Omit<AuditEvent, 'id' | 'timestamp'>): AuditEvent {
    const id = 'aud_' + crypto.randomBytes(8).toString('hex');
    const timestamp = new Date().toISOString();

    const insert = db.prepare(`
      INSERT INTO audit_events (
        id, timestamp, event_type, actor, decision,
        program_id, contribution_id, reward_id, cost_usd, details, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insert.run(
      id,
      timestamp,
      event.eventType,
      event.actor,
      event.decision,
      event.programId || null,
      event.contributionId || null,
      event.rewardId || null,
      event.costUsd || 0.0,
      event.details,
      event.metadata ? JSON.stringify(event.metadata) : null
    );

    return {
      id,
      timestamp,
      ...event
    };
  }

  static getRecent(limit = 50): AuditEvent[] {
    const rows = db.prepare('SELECT * FROM audit_events ORDER BY timestamp DESC LIMIT ?').all(limit) as any[];
    return rows.map(r => ({
      id: r.id,
      timestamp: r.timestamp,
      eventType: r.event_type,
      actor: r.actor,
      decision: r.decision,
      programId: r.program_id,
      contributionId: r.contribution_id,
      rewardId: r.reward_id,
      costUsd: r.cost_usd,
      details: r.details,
      metadata: r.metadata ? JSON.parse(r.metadata) : undefined
    }));
  }
}

