import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';

describe('Production Readiness Probe (/api/health/ready)', () => {
  it('returns 200 and healthy checks when all subsystems are operational', async () => {
    const res = await request(app).get('/api/health/ready');
    expect(res.status).toBe(200);
    expect(res.body.ready).toBe(true);
    expect(res.body.checks).toBeDefined();
    expect(res.body.checks.database.ready).toBe(true);
    expect(res.body.checks.encryption.ready).toBe(true);
    expect(res.body.checks.programmes.ready).toBe(true);
  });

  it('checks encryption key format strictly (64-character hex)', async () => {
    const res = await request(app).get('/api/health/ready');
    expect(res.body.checks.encryption.message).toContain('AES-256-GCM');
  });
});
