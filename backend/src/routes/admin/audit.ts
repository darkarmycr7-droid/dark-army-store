import { Router } from 'express';
import { prisma } from '../../lib/prisma';

export const adminAudit = Router();

adminAudit.get('/', async (req, res) => {
  const take = Math.min(Number(req.query.limit) || 100, 300);
  const rows = await prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take });
  res.json(
    rows.map((r) => ({
      id: r.id,
      actorEmail: r.actorEmail,
      action: r.action,
      entity: r.entity,
      entityId: r.entityId,
      status: r.status,
      ip: r.ip,
      metadata: r.metadata,
      createdAt: r.createdAt,
    }))
  );
});
