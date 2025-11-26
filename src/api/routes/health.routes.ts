/**
 * Health check endpoints.
 * GET /health — public, used by ECS health checks and CloudWatch
 * GET /internal/health/amd-token — internal only, not exposed through public API gateway
 *
 * The AMD token health endpoint was added in PR #108 (Nov 2025) as remediation
 * for INC from ADR-005: the Nov 12 cron silent failure caused a 47-minute outage
 * before anyone noticed. CloudWatch alarm fires if token age exceeds 20 hours.
 */

import { Router, Request, Response } from 'express';
import { getTokenHealth } from '../services/token-refresh.service';

export const healthRouter = Router();

healthRouter.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * Internal AMD token health endpoint.
 * Returns token age in hours and whether the last refresh succeeded.
 * Used by CloudWatch metric alarm — alarm fires if ageHours > 20.
 * Not exposed through the public API gateway (internal routing only).
 */
healthRouter.get('/internal/health/amd-token', (_req: Request, res: Response) => {
  const health = getTokenHealth();

  const status = health.healthy ? 'healthy' : 'degraded';
  const httpStatus = health.healthy ? 200 : 503;

  res.status(httpStatus).json({
    status,
    lastRefreshAt: health.lastRefreshAt?.toISOString() ?? null,
    ageHours: health.ageHours !== null ? Math.round(health.ageHours * 10) / 10 : null,
    threshold: 20,
    healthy: health.healthy,
  });
});
