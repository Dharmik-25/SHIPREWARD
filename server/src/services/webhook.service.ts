import crypto from 'node:crypto';
import { db } from '../db/database';

export class WebhookService {
  /**
   * Verifies GitHub HMAC-SHA256 signature against the raw request body.
   */
  static verifySignature(rawBody: Buffer | string, signatureHeader?: string, secret?: string): boolean {
    const configuredSecret = secret || process.env.GITHUB_WEBHOOK_SECRET;
    if (!configuredSecret) {
      console.warn('[WebhookService] GITHUB_WEBHOOK_SECRET is not configured; skipping HMAC check (DEV ONLY)');
      return true;
    }

    if (!signatureHeader) {
      return false;
    }

    const [algorithm, signature] = signatureHeader.split('=');
    if (algorithm !== 'sha256' || !signature) {
      return false;
    }

    const hmac = crypto.createHmac('sha256', configuredSecret);
    const digest = hmac.update(rawBody).digest('hex');

    const expectedBuffer = Buffer.from(digest, 'utf8');
    const actualBuffer = Buffer.from(signature, 'utf8');

    if (expectedBuffer.length !== actualBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
  }

  /**
   * Enforces event-delivery idempotency. Returns true if already processed.
   */
  static isDuplicateDelivery(deliveryId: string, eventType: string): boolean {
    const existing = db.prepare('SELECT delivery_id FROM processed_webhooks WHERE delivery_id = ?').get(deliveryId);
    if (existing) {
      return true;
    }

    db.prepare('INSERT INTO processed_webhooks (delivery_id, event_type, received_at) VALUES (?, ?, ?)')
      .run(deliveryId, eventType, new Date().toISOString());
    return false;
  }
}
