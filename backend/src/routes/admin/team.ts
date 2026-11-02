import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { hashPassword } from '../../lib/auth';
import { HttpError } from '../../middleware/error';

export const adminTeam = Router();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function publicAdmin(u: any) {
  return { id: u.id, name: u.name, email: u.email, role: u.role, isActive: u.isActive, createdAt: u.createdAt };
}

// List all admin users
adminTeam.get('/', async (_req, res) => {
  const rows = await prisma.adminUser.findMany({ orderBy: { createdAt: 'asc' } });
  res.json(rows.map(publicAdmin));
});

// Create a new admin user
adminTeam.post('/', async (req, res) => {
  const { name, email, password, role } = z
    .object({
      name: z.string().min(2),
      email: z.string().email(),
      password: z.string().min(8),
      role: z.enum(['ADMIN', 'MANAGER', 'STAFF']).default('ADMIN'),
    })
    .parse(req.body);

  const exists = await prisma.adminUser.findUnique({ where: { email: email.toLowerCase() } });
  if (exists) throw new HttpError(409, 'An admin with this email already exists');

  const created = await prisma.adminUser.create({
    data: { name, email: email.toLowerCase(), role, passwordHash: await hashPassword(password) },
  });
  res.status(201).json(publicAdmin(created));
});

// Enable / disable an admin (can't disable yourself or the last active admin)
adminTeam.patch('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { isActive, role } = z
    .object({ isActive: z.boolean().optional(), role: z.enum(['ADMIN', 'MANAGER', 'STAFF']).optional() })
    .parse(req.body);

  const target = await prisma.adminUser.findUnique({ where: { id } });
  if (!target) throw new HttpError(404, 'Admin not found');

  if (isActive === false) {
    if (id === req.auth!.sub) throw new HttpError(400, 'You cannot disable your own account');
    const activeCount = await prisma.adminUser.count({ where: { isActive: true } });
    if (activeCount <= 1) throw new HttpError(400, 'At least one admin must stay active');
  }

  const updated = await prisma.adminUser.update({
    where: { id },
    data: { ...(isActive !== undefined ? { isActive } : {}), ...(role ? { role } : {}) },
  });
  res.json(publicAdmin(updated));
});
