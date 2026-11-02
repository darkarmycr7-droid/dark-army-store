'use client';

import { useState } from 'react';
import { X, ChevronLeft, ChevronRight, ZoomIn } from 'lucide-react';
import Thumb from './Thumb';

interface Img { url: string; alt?: string }

export default function ProductGallery({
  images,
  name,
  slug,
  categorySlug,
}: {
  images: Img[];
  name: string;
  slug: string;
  categorySlug?: string | null;
}) {
  const real = images.filter((im) => !im.url.includes('picsum.photos'));
  const has = real.length > 0;

  const [active, setActive] = useState(0);
  const [origin, setOrigin] = useState('50% 50%');
  const [lightbox, setLightbox] = useState(false);

  const onMove = (e: React.MouseEvent<HTMLImageElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setOrigin(`${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`);
  };

  const go = (n: number) => setActive((n + real.length) % real.length);

  return (
    <div>
      <div className="card group relative aspect-square overflow-hidden">
        {has ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={real[active].url}
              alt={real[active].alt || name}
              onMouseMove={onMove}
              onClick={() => setLightbox(true)}
              style={{ transformOrigin: origin }}
              className="h-full w-full cursor-zoom-in object-cover transition-transform duration-150 group-hover:scale-[1.8]"
            />
            <span className="pointer-events-none absolute bottom-2 end-2 flex items-center gap-1 rounded-md bg-black/55 px-2 py-1 text-[11px] font-semibold text-white opacity-0 transition group-hover:opacity-100">
              <ZoomIn size={12} /> Hover to zoom · click to expand
            </span>
          </>
        ) : (
          <Thumb src={null} name={name} slug={slug} categorySlug={categorySlug} iconSize={120} />
        )}
      </div>

      {has && real.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-3">
          {real.map((g, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              className={`h-20 w-20 overflow-hidden rounded-xl border-2 ${i === active ? 'border-brand-600' : 'border-transparent hover:border-slate-300'}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={g.url} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {/* Fullscreen lightbox */}
      {lightbox && has && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/90" onClick={() => setLightbox(false)}>
          <div className="flex items-center justify-between p-4 text-white">
            <span className="text-sm opacity-80">{name}</span>
            <button onClick={() => setLightbox(false)} className="grid h-10 w-10 place-items-center rounded-lg hover:bg-white/10"><X size={22} /></button>
          </div>

          <div className="relative flex flex-1 items-center justify-center overflow-hidden p-4" onClick={(e) => e.stopPropagation()}>
            {real.length > 1 && (
              <button onClick={() => go(active - 1)} className="absolute start-3 grid h-11 w-11 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25"><ChevronLeft size={24} className="rtl-flip-x" /></button>
            )}
            <LightboxImage src={real[active].url} alt={name} />
            {real.length > 1 && (
              <button onClick={() => go(active + 1)} className="absolute end-3 grid h-11 w-11 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25"><ChevronRight size={24} className="rtl-flip-x" /></button>
            )}
          </div>

          {real.length > 1 && (
            <div className="flex justify-center gap-2 p-4" onClick={(e) => e.stopPropagation()}>
              {real.map((g, i) => (
                <button key={i} onClick={() => setActive(i)} className={`h-14 w-14 overflow-hidden rounded-lg border-2 ${i === active ? 'border-white' : 'border-transparent opacity-60 hover:opacity-100'}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={g.url} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Click-to-zoom image inside the lightbox (toggles 2× with pan). */
function LightboxImage({ src, alt }: { src: string; alt: string }) {
  const [zoom, setZoom] = useState(false);
  const [origin, setOrigin] = useState('50% 50%');
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      onClick={() => setZoom((z) => !z)}
      onMouseMove={(e) => {
        if (!zoom) return;
        const r = e.currentTarget.getBoundingClientRect();
        setOrigin(`${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`);
      }}
      style={{ transformOrigin: origin }}
      className={`max-h-full max-w-full select-none object-contain transition-transform duration-200 ${zoom ? 'scale-[2] cursor-zoom-out' : 'cursor-zoom-in'}`}
    />
  );
}
