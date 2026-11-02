// Ambient animated backdrop for the storefront. Sits behind all content
// (z-index -1); white cards keep everything readable. Motion is disabled
// automatically for users who prefer reduced motion (see globals.css).
export default function LiveBackground() {
  // Warm "sunray & blonde" palette — golds, ambers, peach.
  const blobs = [
    { color: 'rgba(255,193,7,0.8)', size: '46vw', top: '-10vh', left: '-6vw', anim: 'floatA 22s ease-in-out infinite' },
    { color: 'rgba(255,138,76,0.7)', size: '42vw', top: '-8vh', right: '-8vw', anim: 'floatB 26s ease-in-out infinite' },
    { color: 'rgba(255,170,51,0.7)', size: '44vw', bottom: '-12vh', right: '-6vw', anim: 'floatC 24s ease-in-out infinite' },
    { color: 'rgba(255,221,128,0.75)', size: '40vw', bottom: '-14vh', left: '-8vw', anim: 'floatA 28s ease-in-out infinite' },
    { color: 'rgba(255,159,64,0.55)', size: '32vw', top: '38%', left: '42%', anim: 'floatB 30s ease-in-out infinite' },
  ];

  return (
    <div className="live-bg" aria-hidden="true">
      <div className="sunrays" />
      <div className="sunglow" />
      {blobs.map((b, i) => (
        <span
          key={i}
          className="blob"
          style={{
            background: b.color,
            width: b.size,
            height: b.size,
            top: b.top,
            bottom: b.bottom,
            left: b.left,
            right: b.right,
            animation: b.anim,
          }}
        />
      ))}
    </div>
  );
}
