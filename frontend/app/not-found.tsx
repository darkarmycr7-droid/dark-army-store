import Link from 'next/link';
import { Compass } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="container-x py-24">
      <div className="card mx-auto max-w-md grid place-items-center gap-3 p-12 text-center">
        <Compass size={48} className="text-brand-400" />
        <h1 className="text-2xl font-extrabold">Page not found</h1>
        <p className="text-slate-500">The page or product you&apos;re looking for doesn&apos;t exist.</p>
        <Link href="/" className="btn-primary mt-2">Back to Home</Link>
      </div>
    </div>
  );
}
