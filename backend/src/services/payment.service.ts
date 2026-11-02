import { env } from '../lib/env';

/**
 * Pluggable payment layer. Every gateway implements PaymentGateway so the
 * checkout flow never hard-codes a provider. COD and STUB work today; KNET /
 * Visa / Apple Pay slot in here once you have live merchant credentials.
 */
export interface ChargeInput {
  orderNumber: string;
  amount: number; // KD
  // For card-like flows the storefront would pass a token / redirect result.
  card?: { number?: string; name?: string };
}

export interface ChargeResult {
  status: 'PAID' | 'PENDING' | 'FAILED';
  transactionId: string;
  raw: Record<string, unknown>;
}

export interface PaymentGateway {
  method: string;
  charge(input: ChargeInput): Promise<ChargeResult>;
}

/** Cash on Delivery — nothing to charge now; collected by the driver. */
const CashOnDelivery: PaymentGateway = {
  method: 'COD',
  async charge({ orderNumber }) {
    return {
      status: 'PENDING',
      transactionId: `COD-${orderNumber}`,
      raw: { note: 'Cash collected on delivery' },
    };
  },
};

/**
 * Sandbox simulator standing in for KNET / Visa / Mastercard / Apple Pay.
 * Test rule: card number ending in an even digit succeeds, odd fails — so you
 * can exercise both branches end-to-end before wiring a real gateway.
 */
const StubGateway: PaymentGateway = {
  method: 'STUB',
  async charge({ orderNumber, amount, card }) {
    const last = (card?.number || '4242').replace(/\D/g, '').slice(-1);
    const ok = Number(last) % 2 === 0;
    return {
      status: ok ? 'PAID' : 'FAILED',
      transactionId: `STUB-${orderNumber}-${Date.now()}`,
      raw: { simulated: true, amount, approved: ok },
    };
  },
};

const ALL: Record<string, PaymentGateway> = {
  COD: CashOnDelivery,
  STUB: StubGateway,
};

export function enabledMethods(): string[] {
  return env.paymentMethods.filter((m) => ALL[m]);
}

export function getGateway(method: string): PaymentGateway {
  const g = ALL[method?.toUpperCase()];
  if (!g || !env.paymentMethods.includes(method?.toUpperCase())) {
    throw new Error(`Payment method "${method}" is not enabled`);
  }
  return g;
}
