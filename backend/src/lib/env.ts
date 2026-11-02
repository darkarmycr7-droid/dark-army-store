import 'dotenv/config';

function num(v: string | undefined, d: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

export const env = {
  port: num(process.env.PORT, 4000),
  corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:3200')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  jwtSecret: process.env.JWT_SECRET || 'dev-only-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  storageDriver: (process.env.STORAGE_DRIVER || 'local') as 'local' | 's3',
  publicBaseUrl: process.env.PUBLIC_BASE_URL || 'http://localhost:4000',
  paymentMethods: (process.env.PAYMENT_METHODS || 'COD,STUB')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean),
  email: {
    driver: (process.env.EMAIL_DRIVER || 'console') as 'console' | 'smtp',
    from: process.env.MAIL_FROM || 'Dark-Army Store <no-reply@darkarmy.store>',
    requireVerification: (process.env.REQUIRE_EMAIL_VERIFICATION || 'true') !== 'false',
    otpTtlMinutes: num(process.env.OTP_TTL_MINUTES, 10),
    smtp: {
      host: process.env.SMTP_HOST || '',
      port: num(process.env.SMTP_PORT, 587),
      secure: (process.env.SMTP_SECURE || 'false') === 'true',
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
    },
  },
  loyalty: {
    // points earned per 1 KD spent
    earnRate: num(process.env.LOYALTY_EARN_RATE, 5),
    // points needed for 1 KD of discount
    redeemRate: num(process.env.LOYALTY_REDEEM_RATE, 100),
    enabled: (process.env.LOYALTY_ENABLED || 'true') !== 'false',
  },
  store: {
    name: process.env.STORE_NAME || 'Dark-Army Store',
    currency: process.env.CURRENCY || 'KD',
    taxPct: num(process.env.TAX_PCT, 0),
    freeShippingOver: num(process.env.FREE_SHIPPING_OVER, 20),
    defaultShipping: num(process.env.DEFAULT_SHIPPING, 1.5),
  },
};
