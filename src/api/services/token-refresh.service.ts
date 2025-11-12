/**
 * AdvancedMD OAuth2 token refresh service.
 * Runs a node-cron job every 23 hours to proactively refresh the AMD access token
 * before the 24-hour expiry. Token stored in AWS Secrets Manager.
 *
 * Known risk: cron failure causes all AMD-dependent features (scheduling, lab results)
 * to go unavailable until next successful refresh. See ADR-005.
 *
 * Incident: Nov 12 2025 — cron threw network timeout, was swallowed with no alert,
 * 47-minute outage. Remediation in PR #108: explicit error logging, retry logic (PR #104),
 * and health check endpoint + CloudWatch 20-hour alarm.
 */

import cron from 'node-cron';
import { SecretsManagerClient, GetSecretValueCommand, PutSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { logger } from '../utils/logger.util';

const secretsClient = new SecretsManagerClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
const AMD_SECRET_ID = 'advancedmd/oauth';
const AMD_TOKEN_URL = process.env.AMD_TOKEN_URL ?? '';
const AMD_CLIENT_ID = process.env.AMD_CLIENT_ID ?? '';
const AMD_CLIENT_SECRET = process.env.AMD_CLIENT_SECRET ?? '';

// Health state used by /internal/health/amd-token endpoint (added PR #108)
let lastRefreshAt: Date | null = null;
let lastRefreshSucceeded = false;

export function getTokenHealth(): { lastRefreshAt: Date | null; ageHours: number | null; healthy: boolean } {
  if (!lastRefreshAt) return { lastRefreshAt: null, ageHours: null, healthy: false };
  const ageHours = (Date.now() - lastRefreshAt.getTime()) / (1000 * 60 * 60);
  return { lastRefreshAt, ageHours, healthy: lastRefreshSucceeded && ageHours < 20 };
}

async function fetchNewToken(): Promise<string> {
  const res = await fetch(AMD_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: AMD_CLIENT_ID,
      client_secret: AMD_CLIENT_SECRET,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`AMD token endpoint returned ${res.status}: ${body}`);
  }

  const data = await res.json();
  return data.access_token as string;
}

async function storeToken(token: string): Promise<void> {
  await secretsClient.send(
    new PutSecretValueCommand({
      SecretId: AMD_SECRET_ID,
      SecretString: JSON.stringify({ access_token: token, refreshed_at: new Date().toISOString() }),
    })
  );
}

export async function retrieveCurrentToken(): Promise<string> {
  const result = await secretsClient.send(new GetSecretValueCommand({ SecretId: AMD_SECRET_ID }));
  const secret = JSON.parse(result.SecretString ?? '{}');
  return secret.access_token;
}

// Exponential backoff retry — 3 attempts: 5s, 15s, 30s (added PR #104)
async function refreshWithRetry(attempt = 1): Promise<void> {
  const delays = [5000, 15000, 30000];
  try {
    const token = await fetchNewToken();
    await storeToken(token);
    lastRefreshAt = new Date();
    lastRefreshSucceeded = true;
    logger.info('amd_token_refresh_success', { refreshedAt: lastRefreshAt.toISOString() });
    if (attempt > 1) {
      logger.warn(`amd_token_refresh_succeeded_on_retry`, { attempt });
    }
  } catch (err) {
    lastRefreshSucceeded = false;
    // Explicit error logging — no silent failures (PR #108 fix)
    logger.error('amd_token_refresh_failed', {
      attempt,
      error: String(err),
    });
    if (attempt <= 3) {
      const delay = delays[attempt - 1];
      logger.warn(`amd_token_refresh_retry`, { attempt, delayMs: delay });
      await new Promise((r) => setTimeout(r, delay));
      return refreshWithRetry(attempt + 1);
    }
    logger.error('amd_token_refresh_all_retries_exhausted', { error: String(err) });
  }
}

// Cron runs every 23 hours — 1-hour buffer before 24-hour AMD token expiry (ADR-005)
export function startTokenRefreshJob(): void {
  cron.schedule('0 */23 * * *', async () => {
    await refreshWithRetry();
  });
  logger.info('amd_token_refresh_job_started');
}

// feat: begin lab results amd polling cron job every 15 minute

// fix: improve amd token refresh error logging to emit structu

// docs: document amd token refresh cron silent failure modes n

// incident: amd token refresh cron threw network timeout error
