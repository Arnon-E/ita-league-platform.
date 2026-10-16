/** The ITA mark: an optic-yellow ball with its seams. Plain geometry, no raster. */
export function BallMark({ size = 30 }: { size?: number }) {
  return (
    <svg aria-hidden viewBox="0 0 32 32" width={size} height={size}>
      <circle cx="16" cy="16" r="14.5" fill="#D7F43B" stroke="#0A1F44" strokeWidth="1.6" />
      <path d="M5.5 7.5c6.5 4.5 6.5 12.5 0 17M26.5 7.5c-6.5 4.5-6.5 12.5 0 17" fill="none" stroke="#0A1F44" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/**
 * A doubles court seen from above, drawn to scale (36 x 78 ft, laid on its side): baselines, singles sidelines,
 * service lines, centre service line and the net. Lines draw themselves in once.
 */
export function Court() {
  const d = (path: string, i: number) => <path key={i} d={path} pathLength={1} className="ln" style={{ animationDelay: `${0.1 + i * 0.12}s` }} />;
  return (
    <svg aria-hidden className="court" viewBox="-6 -6 792 372" preserveAspectRatio="xMaxYMid meet">
      {[
        'M0 0H780V360H0Z',
        'M0 45H780M0 315H780',
        'M180 45V315M600 45V315',
        'M180 180H600',
        'M0 180h14M780 180h-14',
      ].map(d)}
      <path d="M390 -6V366" className="net" />
    </svg>
  );
}
