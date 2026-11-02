import { NextFunction, Request, Response } from 'express';
import { prisma } from '../lib/prisma';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const SENSITIVE = /password|token|code|secret|hash/i;

function clientIp(req: Request): string | null {
  const xff = req.headers['x-forwarded-for'];
  const first = Array.isArray(xff) ? xff[0] : xff;
  return first?.split(',')[0]?.trim() || req.ip || null;
}

function sanitize(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const clone: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    clone[k] = SENSITIVE.test(k) ? '***' : v;
  }
  return JSON.stringify(clone).slice(0, 2000);
}

/**
 * Records mutating admin requests to the AuditLog. Mounted after requireAuth so
 * req.auth is available. Writes happen on response 'finish' and never block or
 * fail the request.
 */
export function auditAdmin(req: Request, res: Response, next: NextFunction) {
  if (!MUTATING.has(req.method)) return next();

  const bodySnapshot = sanitize(req.body);
  res.on('finish', () => {
    const fullPath = (req.baseUrl || '') + (req.path || '');
    const entity = fullPath.split('/admin/')[1]?.split('/')[0] || undefined;
    prisma.auditLog
      .create({
        data: {
          actorId: req.auth?.sub ?? null,
          actorEmail: req.auth?.email ?? null,
          action: `${req.method} ${fullPath}`,
          entity,
          entityId: req.params?.id != null ? String(req.params.id) : null,
          metadata: bodySnapshot ?? null,
          ip: clientIp(req),
          status: res.statusCode,
        },
      })
      .catch((e) => console.error('[audit] write failed:', e?.message));
  });
  next();
}
