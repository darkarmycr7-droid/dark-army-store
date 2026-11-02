import Link from 'next/link';
import { Facebook, Instagram, Twitter, Mail, Phone, MapPin, Shield } from 'lucide-react';
import Newsletter from './Newsletter';

export default function Footer() {
  return (
    <footer className="mt-16 bg-ink text-slate-300">
      <div className="container-x py-12 grid gap-10 md:grid-cols-4">
        <div>
          <div className="flex items-center gap-2 text-white">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-600">
              <Shield size={18} />
            </span>
            <span className="text-lg font-extrabold">Dark-Army Store</span>
          </div>
          <p className="mt-3 text-sm text-slate-400">
            Your all-in-one store in Kuwait — groceries, home, electronics, beauty and more,
            delivered to your door.
          </p>
          <div className="mt-4 flex gap-3">
            {[Facebook, Instagram, Twitter].map((Icon, i) => (
              <a key={i} href="#" className="grid h-9 w-9 place-items-center rounded-lg bg-white/10 hover:bg-white/20">
                <Icon size={16} />
              </a>
            ))}
          </div>
        </div>

        <div>
          <h4 className="mb-3 font-semibold text-white">Shop</h4>
          <ul className="space-y-2 text-sm">
            <li><Link href="/products" className="hover:text-white">All Products</Link></li>
            <li><Link href="/products?bestSeller=true" className="hover:text-white">Best Sellers</Link></li>
            <li><Link href="/products?featured=true" className="hover:text-white">Featured</Link></li>
            <li><Link href="/track" className="hover:text-white">Track Your Order</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="mb-3 font-semibold text-white">Contact</h4>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2"><Phone size={15} /> +965 0000 0000</li>
            <li className="flex items-center gap-2"><Mail size={15} /> support@darkarmy.store</li>
            <li className="flex items-center gap-2"><MapPin size={15} /> Kuwait City, Kuwait</li>
          </ul>
        </div>

        <div>
          <h4 className="mb-3 font-semibold text-white">Newsletter</h4>
          <p className="mb-3 text-sm text-slate-400">Get offers & new arrivals in your inbox.</p>
          <Newsletter />
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="container-x flex flex-col items-center justify-between gap-2 py-5 text-xs text-slate-400 sm:flex-row">
          <p>© {new Date().getFullYear()} Dark-Army Store. All rights reserved.</p>
          <p>We accept: KNET • Visa • Mastercard • Apple Pay • Cash on Delivery</p>
        </div>
      </div>
    </footer>
  );
}
