import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { verifyPassword, signToken, hashPassword } from '../../lib/auth';
import { requireAuth } from '../../middleware/auth';
import { issueCode, consumeCode } from '../../services/verification.service';
import { authLimiter } from '../../middleware/rateLimit';
import { HttpError } from '../../middleware/error';

export const adminAuth = Router();

const RESET = 'ADMIN_PASSWORD_RESET';

// Forgot password — emails a reset code (doesn't reveal whether the email exists).
adminAuth.post('/forgot', authLimiter, async (req, res) => {
  const { email } = z.object({ email: z.string().email() }).parse(req.body);
  const user = await prisma.adminUser.findUnique({ where: { email: email.toLowerCase() } });
  let devCode: string | undefined;
  if (user && user.isActive) {
    try {
      ({ devCode } = await issueCode(user.email, RESET));
    } catch {
      /* cooldown */
    }
  }
  res.json({ ok: true, devCode });
});

// Reset using the emailed code → returns a fresh admin token.
adminAuth.post('/reset', authLimiter, async (req, res) => {
  const { email, code, newPassword } = z
    .object({ email: z.string().email(), code: z.string().min(4).max(8), newPassword: z.string().min(8) })
    .parse(req.body);

  await consumeCode(email, code, RESET);
  const user = await prisma.adminUser.update({
    where: { email: email.toLowerCase() },
    data: { passwordHash: await hashPassword(newPassword) },
  });
  const token = signToken({ sub: user.id, kind: 'admin', email: user.email });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

adminAuth.post('/login', authLimiter, async (req, res) => {
  const { email, password } = z
    .object({ email: z.string().email(), password: z.string().min(1) })
    .parse(req.body);

  const user = await prisma.adminUser.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || !user.isActive || !(await verifyPassword(password, user.passwordHash))) {
    throw new HttpError(401, 'Invalid email or password');
  }

  const token = signToken({ sub: user.id, kind: 'admin', email: user.email });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

adminAuth.get('/me', requireAuth('admin'), async (req, res) => {
  const user = await prisma.adminUser.findUnique({ where: { id: req.auth!.sub } });
  if (!user) throw new HttpError(404, 'User not found');
  res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
});

adminAuth.post('/change-password', requireAuth('admin'), async (req, res) => {
  const { currentPassword, newPassword } = z
    .object({ currentPassword: z.string().min(1), newPassword: z.string().min(8) })
    .parse(req.body);

  const user = await prisma.adminUser.findUnique({ where: { id: req.auth!.sub } });
  if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new HttpError(400, 'Current password is incorrect');
  }
  if (currentPassword === newPassword) {
    throw new HttpError(400, 'New password must be different from the current one');
  }
  await prisma.adminUser.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(newPassword) },
  });
  res.json({ ok: true });
});
