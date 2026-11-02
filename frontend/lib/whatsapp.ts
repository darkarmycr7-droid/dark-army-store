// WhatsApp deep-link helpers. Set your business number in .env.local:
//   NEXT_PUBLIC_WHATSAPP_NUMBER=965XXXXXXXX   (Kuwait: 965 + 8 digits, no +)
export function waNumber(): string {
  return (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || '96500000000').replace(/\D/g, '');
}

export function waLink(message?: string): string {
  const base = `https://wa.me/${waNumber()}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}
