import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { env } from '../lib/env';

export const misc = Router();

misc.get('/store', (_req, res) => {
  res.json({
    name: env.store.name,
    currency: env.store.currency,
    freeShippingOver: env.store.freeShippingOver,
  });
});

misc.post('/newsletter', async (req, res) => {
  const { email } = z.object({ email: z.string().email() }).parse(req.body);
  await prisma.newsletterSignup.upsert({
    where: { email: email.toLowerCase() },
    update: {},
    create: { email: email.toLowerCase() },
  });
  res.status(201).json({ ok: true });
});
