import { 
  SystemHealth, 
  ProgramPolicy, 
  Contribution, 
  RewardRecord, 
  BitrefillProductSummary, 
  AuditEvent 
} from '@shipreward/shared';

const API_BASE = '/api';

export async function fetchHealth(): Promise<SystemHealth> {
  const res = await fetch(`${API_BASE}/health`);
  if (!res.ok) throw new Error('Health check failed');
  return res.json();
}

export async function fetchProgrammes(): Promise<ProgramPolicy[]> {
  const res = await fetch(`${API_BASE}/programmes`);
  if (!res.ok) throw new Error('Failed to fetch programmes');
  return res.json();
}

export async function updateProgramme(id: string, updates: Partial<ProgramPolicy>): Promise<ProgramPolicy> {
  const res = await fetch(`${API_BASE}/programmes/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates)
  });
  if (!res.ok) throw new Error('Failed to update programme');
  return res.json();
}

export async function fetchContributions(params?: { programId?: string; status?: string; isDemo?: boolean }): Promise<Contribution[]> {
  const url = new URL(`${API_BASE}/contributions`, window.location.origin);
  if (params?.programId) url.searchParams.set('programId', params.programId);
  if (params?.status) url.searchParams.set('status', params.status);
  if (params?.isDemo !== undefined) url.searchParams.set('isDemo', String(params.isDemo));

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error('Failed to fetch contributions');
  return res.json();
}

export async function approveContribution(id: string, reviewer = 'Manual Reviewer', reason = 'Manual review approval', fulfillReward = false): Promise<any> {
  const res = await fetch(`${API_BASE}/contributions/${id}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reviewer, reason, fulfillReward })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to approve contribution');
  }
  return res.json();
}

export async function rejectContribution(id: string, reviewer = 'Manual Reviewer', reason = 'Rejected during manual review'): Promise<any> {
  const res = await fetch(`${API_BASE}/contributions/${id}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reviewer, reason })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to reject contribution');
  }
  return res.json();
}

export async function claimReward(id: string, claimer: string): Promise<any> {
  const res = await fetch(`${API_BASE}/rewards/${id}/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ claimer })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to claim reward');
  }
  return res.json();
}

export async function fetchRewards(params?: { programId?: string; isDemo?: boolean }): Promise<RewardRecord[]> {
  const url = new URL(`${API_BASE}/rewards`, window.location.origin);
  if (params?.programId) url.searchParams.set('programId', params.programId);
  if (params?.isDemo !== undefined) url.searchParams.set('isDemo', String(params.isDemo));

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error('Failed to fetch rewards');
  return res.json();
}

export async function fetchBitrefillProducts(query?: string): Promise<BitrefillProductSummary[]> {
  const url = new URL(`${API_BASE}/bitrefill/products`, window.location.origin);
  if (query) url.searchParams.set('q', query);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error('Failed to fetch Bitrefill products');
  return res.json();
}

export async function fetchAuditLogs(limit = 50): Promise<AuditEvent[]> {
  const res = await fetch(`${API_BASE}/audit?limit=${limit}`);
  if (!res.ok) throw new Error('Failed to fetch audit logs');
  return res.json();
}

export async function triggerSimulation(payload: any): Promise<any> {
  const res = await fetch(`${API_BASE}/triggers/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Simulation trigger failed');
  }
  return res.json();
}

export async function fetchBitrefillStatus(): Promise<any> {
  const res = await fetch(`${API_BASE}/bitrefill/status`);
  if (!res.ok) throw new Error('Failed to fetch Bitrefill status');
  return res.json();
}

export async function fetchGuardrails(): Promise<any> {
  const res = await fetch(`${API_BASE}/bitrefill/guardrails`);
  if (!res.ok) throw new Error('Failed to fetch guardrails');
  return res.json();
}

export async function toggleEmergencyFreeze(freeze: boolean): Promise<any> {
  const res = await fetch(`${API_BASE}/bitrefill/guardrails/freeze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ freeze })
  });
  if (!res.ok) throw new Error('Failed to toggle emergency freeze');
  return res.json();
}

export async function executeReward(payload: {
  contributionId: string;
  productId: string;
  packageValue: string;
  recipientEmail?: string;
  recipientPhone?: string;
  manualApproval?: boolean;
  approvedBy?: string;
}): Promise<any> {
  const res = await fetch(`${API_BASE}/bitrefill/execute-reward`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to execute reward');
  }
  return res.json();
}

