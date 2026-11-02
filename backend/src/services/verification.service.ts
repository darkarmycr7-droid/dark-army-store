import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { env } from '../lib/env';
import { HttpError } from '../middleware/error';
import { emailSender, verificationEmail, resetEmail } from './email.service';

const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_SEC = 30;

function genCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
}

/**
 * Create a fresh code for an email, store its hash, and "send" it.
 * Returns the plain code only when EMAIL_DRIVER=console (dev) so the flow is
 * testable without a real inbox — never in SMTP/production mode.
 */
export async function issueCode(email: string, purpose = 'EMAIL_VERIFY'): Promise<{ devCode?: string }> {
  const normalized = email.toLowerCase();

  // Simple resend cooldown to avoid spamming
  const last = await prisma.verificationToken.findFirst({
    where: { email: normalized, purpose, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (last && Date.now() - last.createdAt.getTime() < RESEND_COOLDOWN_SEC * 1000) {
    throw new HttpError(429, `Please wait a moment before requesting another code`);
  }

  // Invalidate older codes for this email/purpose
  await prisma.verificationToken.updateMany({
    where: { email: normalized, purpose, consumedAt: null },
    data: { consumedAt: new Date() },
  });

  const code = genCode();
  await prisma.verificationToken.create({
    data: {
      email: normalized,
      purpose,
      codeHash: await bcrypt.hash(code, 8),
      expiresAt: new Date(Date.now() + env.email.otpTtlMinutes * 60_000),
    },
  });

  const tpl = purpose.includes('RESET') ? resetEmail(code) : verificationEmail(code);
  await emailSender.send({ to: normalized, ...tpl });

  return env.email.driver === 'console' ? { devCode: code } : {};
}

/** Validate a submitted code. Throws HttpError on failure; consumes on success. */
export async function consumeCode(email: string, code: string, purpose = 'EMAIL_VERIFY'): Promise<void> {
  const normalized = email.toLowerCase();
  const token = await prisma.verificationToken.findFirst({
    where: { email: normalized, purpose, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (!token) throw new HttpError(400, 'No pending verification. Please request a new code.');
  if (token.expiresAt < new Date()) throw new HttpError(400, 'This code has expired. Please request a new one.');
  if (token.attempts >= MAX_ATTEMPTS) throw new HttpError(429, 'Too many attempts. Please request a new code.');

  const ok = await bcrypt.compare(code.trim(), token.codeHash);
  if (!ok) {
    await prisma.verificationToken.update({ where: { id: token.id }, data: { attempts: { increment: 1 } } });
    throw new HttpError(400, 'Incorrect code. Please try again.');
  }

  await prisma.verificationToken.update({ where: { id: token.id }, data: { consumedAt: new Date() } });
}
