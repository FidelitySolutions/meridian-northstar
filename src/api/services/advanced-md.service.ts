/**
 * AdvancedMD EHR API client.
 * Handles all communication with the AdvancedMD REST API.
 * AMD OAuth2 token is managed by token-refresh.service.ts (cron every 23h) and
 * stored in AWS Secrets Manager under advancedmd/oauth. Token read at call time.
 *
 * Known sandbox reliability issues (documented in /docs/advancedmd-api-research.md):
 *   - Sandbox returns empty slot arrays on provider unavailability (not 404)
 *   - Lab result release flag is a datetime field, not a boolean
 *   - Sandbox 503s are common — treat as transient, retry on next cron cycle
 *   - AMD does not support webhooks — polling only (MNS-2025-061)
 */

import { retrieveCurrentToken } from './token-refresh.service';
import { AMDError } from '../utils/errors.util';
import { logger } from '../utils/logger.util';

const AMD_BASE_URL = process.env.AMD_BASE_URL ?? '';

async function amdFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await retrieveCurrentToken();

  const res = await fetch(`${AMD_BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });

  if (res.status === 401) {
    // Token has expired — cron job should have prevented this but can happen if cron failed
    logger.error('amd_token_expired_on_request', { path });
    throw new AMDError('AMD token expired. Token refresh cron may have failed.', 401);
  }

  if (res.status === 503) {
    // Sandbox instability — caller should handle with retry-after
    throw new AMDError('AMD service unavailable', 503);
  }

  if (!res.ok) {
    const body = await res.text();
    logger.error('amd_request_failed', { path, status: res.status, body });
    throw new AMDError(`AMD request failed: ${res.status}`, res.status);
  }

  return res.json() as Promise<T>;
}

export interface AMDSlot {
  slotId: string;
  providerId: string;
  clinicId: string;
  startTime: string;
  endTime: string;
  available: boolean;
}

export interface AMDAppointment {
  appointmentId: string;
  patientId: string;
  providerId: string;
  clinicId: string;
  startTime: string;
  status: string;
}

export interface AMDLabResult {
  resultId: string;
  patientId: string;
  resultType: string;
  releasedAt: string;
  values: Record<string, unknown>;
}

export async function getAvailableSlots(clinicId: string, date: string): Promise<AMDSlot[]> {
  // AMD returns [] (not 404) when provider is unavailable — documented in MNS-2025-034
  const data = await amdFetch<{ slots: AMDSlot[] }>(`/scheduling/slots?clinicId=${clinicId}&date=${date}`);
  return data.slots ?? [];
}

export async function bookAppointment(params: {
  clinicId: string;
  providerId: string;
  patientId: string;
  slotId: string;
}): Promise<AMDAppointment> {
  return amdFetch<AMDAppointment>('/scheduling/appointments', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function cancelAppointment(amdAppointmentId: string): Promise<void> {
  await amdFetch(`/scheduling/appointments/${amdAppointmentId}`, { method: 'DELETE' });
}

export async function getReleasedLabResults(patientId: string, since?: string): Promise<AMDLabResult[]> {
  // AMD release flag is a datetime field, not boolean (discovered in MNS-2025-067)
  const qs = since ? `?patientId=${patientId}&releasedSince=${since}` : `?patientId=${patientId}`;
  const data = await amdFetch<{ results: AMDLabResult[] }>(`/lab-results${qs}`);
  return data.results ?? [];
}
