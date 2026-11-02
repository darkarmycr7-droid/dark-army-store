import { Star, Quote } from 'lucide-react';

const ITEMS = [
  { name: 'Fatima A.', city: 'Salmiya', text: 'Super fast delivery and the prices beat the big supermarkets. My go-to store now.' },
  { name: 'Mohammed K.', city: 'Hawalli', text: 'Ordered electronics with cash on delivery — smooth, genuine products, well packed.' },
  { name: 'Sara N.', city: 'Jahra', text: 'Love that I can buy groceries and baby items in one order. Free delivery is a bonus!' },
];

export default function Testimonials() {
  return (
    <section className="container-x mt-16">
      <h2 className="text-2xl font-extrabold">What our customers say</h2>
      <p className="text-slate-500">Trusted by thousands of shoppers across Kuwait.</p>
      <div className="mt-6 grid gap-5 md:grid-cols-3">
        {ITEMS.map((t) => (
          <div key={t.name} className="card p-6">
            <Quote className="text-brand-200" size={28} />
            <p className="mt-2 text-slate-700">{t.text}</p>
            <div className="mt-4 flex items-center gap-1 text-amber-400">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} size={15} className="fill-amber-400" />
              ))}
            </div>
            <div className="mt-2 text-sm font-semibold">
              {t.name} <span className="font-normal text-slate-400">• {t.city}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
