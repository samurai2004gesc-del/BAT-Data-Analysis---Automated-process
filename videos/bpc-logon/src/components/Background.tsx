import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { C } from '../theme';

/** Fondo continuo: degradado profundo, orbes de luz, rejilla de puntos y arcos tipo "swoosh". */
export const Background: React.FC = () => {
  const f = useCurrentFrame();
  const orb = (x: number, y: number, r: number, color: string, sp: number, ph: number) => {
    const dx = Math.sin(f / sp + ph) * 120, dy = Math.cos(f / (sp * 1.3) + ph) * 80;
    return <div style={{ position: 'absolute', left: x + dx - r, top: y + dy - r, width: r * 2, height: r * 2, borderRadius: '50%', background: `radial-gradient(circle, ${color} 0%, transparent 65%)`, opacity: 0.55 }} />;
  };
  return (
    <AbsoluteFill style={{ background: `radial-gradient(120% 90% at 20% 10%, #12357A 0%, ${C.navy} 45%, ${C.deep} 100%)`, overflow: 'hidden' }}>
      {orb(300, 250, 520, 'rgba(0,177,235,0.35)', 90, 0)}
      {orb(1600, 820, 620, 'rgba(0,87,184,0.45)', 110, 2)}
      {orb(1500, 120, 380, 'rgba(230,0,126,0.16)', 130, 4)}
      {orb(500, 950, 420, 'rgba(61,220,151,0.10)', 100, 1)}
      {/* rejilla de puntos con parallax */}
      <AbsoluteFill style={{
        backgroundImage: 'radial-gradient(rgba(255,255,255,0.10) 1.2px, transparent 1.2px)',
        backgroundSize: '36px 36px',
        backgroundPosition: `${(f * 0.25) % 36}px ${(f * 0.12) % 36}px`,
        maskImage: 'radial-gradient(ellipse 70% 60% at 50% 45%, black 20%, transparent 85%)',
        WebkitMaskImage: 'radial-gradient(ellipse 70% 60% at 50% 45%, black 20%, transparent 85%)',
      }} />
      <Swooshes />
      <ColorBar />
      {/* viñeta */}
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.45) 100%)' }} />
    </AbsoluteFill>
  );
};

const Swooshes: React.FC = () => {
  const f = useCurrentFrame();
  const paths = [
    { d: 'M -200 820 C 400 640, 1100 980, 2120 560', w: 2, o: 0.35, sp: 0.9 },
    { d: 'M -200 900 C 500 700, 1200 1050, 2120 640', w: 1.2, o: 0.25, sp: 0.6 },
    { d: 'M -200 180 C 600 60, 1300 420, 2120 120', w: 1.5, o: 0.18, sp: 0.7 },
  ];
  return (
    <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
      <defs>
        <linearGradient id="sw" x1="0" x2="1">
          <stop offset="0" stopColor={C.cyan} stopOpacity="0" />
          <stop offset="0.5" stopColor={C.cyan} stopOpacity="1" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      {paths.map((p, i) => (
        <g key={i}>
          <path d={p.d} stroke="url(#sw)" strokeWidth={p.w} fill="none" opacity={p.o} />
          <path d={p.d} stroke="#fff" strokeWidth={p.w + 1.5} fill="none" opacity={p.o + 0.3}
            strokeDasharray="120 2600" strokeDashoffset={-((f * 9 * p.sp + i * 700) % 2720)} strokeLinecap="round"
            style={{ filter: 'drop-shadow(0 0 6px #7FD8F7)' }} />
        </g>
      ))}
    </svg>
  );
};

/** La barra multicolor de la marca, abajo a la derecha. */
export const ColorBar: React.FC<{ y?: number; height?: number; x0?: number }> = ({ y = 1072, height = 8, x0 = 590 }) => {
  const f = useCurrentFrame();
  const grow = interpolate(f, [0, 30], [0, 1], { extrapolateRight: 'clamp' });
  const widths = [420, 250, 170, 125, 140, 105, 100, 60];
  let x = x0;
  return (
    <>
      {widths.map((w, i) => {
        const el = <div key={i} style={{ position: 'absolute', left: x, top: y, width: w * grow, height, background: C.bar[i] }} />;
        x += w * grow;
        return el;
      })}
    </>
  );
};
