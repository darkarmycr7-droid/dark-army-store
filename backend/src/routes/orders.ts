import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { placeOrder, getOrderByTracking, getOrderByNumber } from '../services/order.service';
import { enabledMethods } from '../services/payment.service';
import { env } from '../lib/env';
import { HttpError } from '../middleware/error';

export const orders = Router();

const checkoutSchema = z.object({
  items: z
    .array(z.object({ productId: z.number().int().positive(), quantity: z.number().int().positive() }))
    .min(1),
  contact: z.object({
    name: z.string().min(2),
    email: z.string().email(),
    phone: z.string().min(6),
  }),
  shipping: z.object({
    area: z.string().min(2),
    block: z.string().optional(),
    street: z.string().optional(),
    building: z.string().optional(),
    notes: z.string().optional(),
  }),
  deliveryMethod: z.string().optional(),
  payMethod: z.string().min(2),
  couponCode: z.string().optional(),
  redeemPoints: z.number().int().min(0).optional(),
  card: z.object({ number: z.string().optional(), name: z.string().optional() }).optional(),
});

// Storefront config the checkout UI needs (methods, shipping rules, currency)
orders.get('/checkout/config', (_req, res) => {
  res.json({
    currency: env.store.currency,
    taxPct: env.store.taxPct,
    freeShippingOver: env.store.freeShippingOver,
    defaultShipping: env.store.defaultShipping,
    paymentMethods: enabledMethods(),
    loyalty: { enabled: env.loyalty.enabled, earnRate: env.loyalty.earnRate, redeemRate: env.loyalty.redeemRate },
  });
});

// Place an order — sign-in required; the order is linked to the customer.
orders.post('/checkout', requireAuth('customer'), async (req, res) => {
  const body = checkoutSchema.parse(req.body);
  const order = await placeOrder({ ...body, customerId: req.auth!.sub });
  res.status(201).json(order);
});

// Public order tracking by tracking number
orders.get('/track/:trackingNumber', async (req, res) => {
  const order = await getOrderByTracking(req.params.trackingNumber.toUpperCase());
  if (!order) throw new HttpError(404, 'Order not found');
  res.json(order);
});

// Fetch by order number (used on the confirmation screen)
orders.get('/by-number/:orderNumber', async (req, res) => {
  const order = await getOrderByNumber(req.params.orderNumber);
  if (!order) throw new HttpError(404, 'Order not found');
  res.json(order);
});
