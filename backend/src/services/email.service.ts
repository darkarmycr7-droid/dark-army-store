import { env } from '../lib/env';

/**
 * Pluggable email sender. `console` (default) prints the message to the server
 * log so the OTP flow is fully testable in dev without any provider. Set
 * EMAIL_DRIVER=smtp + SMTP_* to send real mail via nodemailer.
 */
export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface EmailSender {
  send(msg: EmailMessage): Promise<void>;
}

class ConsoleEmailSender implements EmailSender {
  async send({ to, subject, text, html }: EmailMessage): Promise<void> {
    console.log(
      `\n📧 [DEV EMAIL] (set EMAIL_DRIVER=smtp to send for real)\n   to: ${to}\n   subject: ${subject}\n   ${text || html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}\n`
    );
  }
}

class SmtpEmailSender implements EmailSender {
  async send(msg: EmailMessage): Promise<void> {
    // Lazy require so the app runs even if nodemailer isn't installed in dev.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nodemailer = require('nodemailer');
    const { host, port, secure, user, pass } = env.email.smtp;
    if (!host) throw new Error('SMTP_HOST is not configured');
    const transport = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user ? { user, pass } : undefined,
    });
    await transport.sendMail({ from: env.email.from, ...msg });
  }
}

export const emailSender: EmailSender =
  env.email.driver === 'smtp' ? new SmtpEmailSender() : new ConsoleEmailSender();

function codeEmail(code: string, heading: string, intro: string, ignore: string) {
  return {
    subject: `${heading} — ${env.store.name}: ${code}`,
    text: `${intro} Your code is ${code}. It expires in ${env.email.otpTtlMinutes} minutes. ${ignore}`,
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto">
        <h2 style="color:#1f55e0">${env.store.name}</h2>
        <p>${intro}</p>
        <div style="font-size:32px;font-weight:800;letter-spacing:8px;background:#eef5ff;color:#1b3678;padding:16px;text-align:center;border-radius:12px">${code}</div>
        <p style="color:#64748b;font-size:14px">This code expires in ${env.email.otpTtlMinutes} minutes. ${ignore}</p>
      </div>`,
  };
}

export function verificationEmail(code: string) {
  return codeEmail(code, 'Verification code', 'Use this code to verify your email address:', "If you didn't sign up, you can safely ignore this email.");
}

export function resetEmail(code: string) {
  return codeEmail(code, 'Password reset code', 'Use this code to reset your password:', "If you didn't request a password reset, you can safely ignore this email.");
}

// ---- Order notification emails ----

const STATUS_COPY: Record<string, { subject: string; line: string }> = {
  PLACED: { subject: 'Order confirmed', line: 'Thank you! We have received your order and it is now being prepared.' },
  CONFIRMED: { subject: 'Order confirmed', line: 'Good news — your order has been confirmed.' },
  PROCESSING: { subject: 'Order is being prepared', line: 'Your order is now being processed and packed.' },
  SHIPPED: { subject: 'Order shipped', line: 'Your order is on its way! It has been shipped and will arrive soon.' },
  DELIVERED: { subject: 'Order delivered', line: 'Your order has been delivered. We hope you love it!' },
  CANCELLED: { subject: 'Order cancelled', line: 'Your order has been cancelled. If this is unexpected, please contact us.' },
  RETURNED: { subject: 'Order returned', line: 'Your order return has been processed.' },
};

export interface OrderEmailData {
  to: string;
  customerName: string;
  orderNumber: string;
  trackingNumber: string;
  total: number;
  currency: string;
  items: { name: string; quantity: number; lineTotal: number }[];
}

export function orderStatusEmail(status: string, o: OrderEmailData) {
  const copy = STATUS_COPY[status] || { subject: `Order update: ${status}`, line: `Your order status is now ${status}.` };
  const fmt = (n: number) => `${o.currency} ${n.toFixed(3)}`;
  const rows = o.items
    .map((it) => `<tr><td style="padding:4px 0">${it.name} × ${it.quantity}</td><td style="padding:4px 0;text-align:right">${fmt(it.lineTotal)}</td></tr>`)
    .join('');
  return {
    subject: `${copy.subject} — ${o.orderNumber}`,
    text: `${copy.line}\nOrder ${o.orderNumber} • Tracking ${o.trackingNumber} • Total ${fmt(o.total)}`,
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto">
        <h2 style="color:#1f55e0">${env.store.name}</h2>
        <p>Hi ${o.customerName},</p>
        <p>${copy.line}</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin:12px 0">${rows}
          <tr><td style="border-top:1px solid #e2e8f0;padding-top:8px;font-weight:700">Total</td><td style="border-top:1px solid #e2e8f0;padding-top:8px;text-align:right;font-weight:700">${fmt(o.total)}</td></tr>
        </table>
        <p style="font-size:14px">Order <strong>${o.orderNumber}</strong><br/>Tracking <strong>${o.trackingNumber}</strong></p>
        <p style="color:#64748b;font-size:13px">Track your order anytime with the tracking number above.</p>
      </div>`,
  };
}
