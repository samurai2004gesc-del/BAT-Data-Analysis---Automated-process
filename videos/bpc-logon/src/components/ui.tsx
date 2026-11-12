import React from 'react';
import { AbsoluteFill, Img, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, FONT, MONO } from '../theme';
import { Sfx } from './Shot';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/**
 * Muestra a sus hijos entre los cuadros from y to (relativos a la escena) con entrada y salida animadas.
 * Los hijos ven el cuadro 0 en `from`.
 */
export const Panel: React.FC<{ from: number; to: number; children: React.ReactNode; kind?: 'rise' | 'slide' | 'zoom'; x?: number; y?: number; w?: number; sfx?: boolean }> = ({ from, to, children, kind = 'slide', x = 0, y = 0, w = 1920, sfx = true }) => {
  const dur = Math.max(1, Math.round(to - from));
  return (
    <Sequence from={Math.round(from)} durationInFrames={dur} layout="none">
      <PanelInner dur={dur} kind={kind} x={x} y={y} w={w}>{children}</PanelInner>
      {sfx && <Sfx at={0} src="whoosh" volume={0.22} />}
    </Sequence>
  );
};
const PanelInner: React.FC<{ dur: number; kind: string; x: number; y: number; w: number; children: React.ReactNode }> = ({ dur, kind, x, y, w, children }) => {
  const f = useCurrentFrame();
  const out = interpolate(f, [dur - 12, dur], [0, 1], clamp);
  const style: React.CSSProperties = { position: 'absolute', left: x, top: y, width: w, opacity: 1 - out };
  if (kind === 'slide') style.transform = `translateX(${-out * 160}px) scale(${1 - out * 0.06})`;
  if (kind === 'rise') style.transform = `translateY(${-out * 80}px)`;
  if (kind === 'zoom') style.transform = `scale(${1 + out * 0.15})`;
  style.filter = out > 0 ? `blur(${out * 10}px)` : undefined;
  return <div style={style}>{children}</div>;
};

/** Aparece con resorte a partir de `at` (cuadro local). */
export const Pop: React.FC<{ at: number; children: React.ReactNode; from?: 'up' | 'down' | 'left' | 'right' | 'scale'; style?: React.CSSProperties; sound?: boolean }> = ({ at, children, from = 'up', style, sound = false }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: f - at, fps, config: { damping: 14, mass: 0.7 } });
  const d = (1 - p) * 60;
  const t = from === 'up' ? `translateY(${d}px)` : from === 'down' ? `translateY(${-d}px)` : from === 'left' ? `translateX(${-d}px)` : from === 'right' ? `translateX(${d}px)` : `scale(${0.4 + 0.6 * p})`;
  return (
    <div style={{ ...style, opacity: Math.min(1, p * 1.4), transform: t }}>
      {children}
      {sound && <Sfx at={at} src="pop" volume={0.35} />}
    </div>
  );
};

export const StepHeader: React.FC<{ n: number; title: string; sub?: string }> = ({ n, title, sub }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: f, fps, config: { damping: 16 } });
  const p2 = spring({ frame: f - 6, fps, config: { damping: 16 } });
  return (
    <div style={{ position: 'absolute', left: 90, top: 56, display: 'flex', alignItems: 'center', gap: 26 }}>
      <div style={{ width: 92, height: 92, borderRadius: 24, background: `linear-gradient(135deg, ${C.cyan}, ${C.blue})`, display: 'grid', placeItems: 'center', transform: `scale(${p}) rotate(${(1 - p) * -40}deg)`, boxShadow: '0 12px 40px rgba(0,177,235,0.45)' }}>
        <span style={{ fontFamily: FONT, fontWeight: 900, fontSize: 46, color: '#fff' }}>{String(n).padStart(2, '0')}</span>
      </div>
      <div style={{ opacity: p2, transform: `translateX(${(1 - p2) * -40}px)` }}>
        <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 20, letterSpacing: 4, color: C.cyan, textTransform: 'uppercase' }}>Step {n} of 5{sub ? ' · ' + sub : ''}</div>
        <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: 52, color: '#fff', lineHeight: 1.1 }}>{title}</div>
      </div>
    </div>
  );
};

export const STEPS = ['BPC course', 'SAP access', 'Analysis app', 'Connections', 'Log On'];

/** Riel de progreso de los 5 pasos (arriba a la derecha). */
export const ProgressRail: React.FC<{ step: number; opacity: number }> = ({ step, opacity }) => {
  const f = useCurrentFrame();
  return (
    <div style={{ position: 'absolute', right: 80, top: 78, display: 'flex', alignItems: 'center', gap: 0, opacity }}>
      {STEPS.map((s, i) => {
        const done = i + 1 < step, active = i + 1 === step;
        return (
          <React.Fragment key={s}>
            {i > 0 && <div style={{ width: 46, height: 3, background: done || active ? C.cyan : 'rgba(255,255,255,0.18)' }} />}
            <div style={{ position: 'relative', width: active ? 44 : 30, height: active ? 44 : 30, borderRadius: '50%', display: 'grid', placeItems: 'center', background: done ? C.cyan : active ? '#fff' : 'rgba(255,255,255,0.12)', border: active ? `3px solid ${C.cyan}` : 'none', boxShadow: active ? `0 0 ${18 + Math.sin(f / 6) * 6}px ${C.cyan}` : 'none' }}>
              <span style={{ fontFamily: FONT, fontWeight: 800, fontSize: active ? 19 : 14, color: done ? C.navy : active ? C.navy : C.muted }}>{done ? '✓' : i + 1}</span>
              {active && <div style={{ position: 'absolute', top: 54, whiteSpace: 'nowrap', fontFamily: FONT, fontWeight: 700, fontSize: 15, color: '#fff', letterSpacing: 1 }}>{s.toUpperCase()}</div>}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
};

/** Subtítulos: palabra activa resaltada. */
export const Captions: React.FC<{ segs: { t: string; start: number; end: number }[] }> = ({ segs }) => {
  const f = useCurrentFrame();
  const cur = segs.find((s) => f >= s.start - 4 && f <= s.end + 10);
  if (!cur) return null;
  const words = cur.t.split(' ');
  const total = cur.t.length;
  let acc = 0;
  const o = interpolate(f, [cur.start - 4, cur.start + 2, cur.end + 4, cur.end + 10], [0, 1, 1, 0], clamp);
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 46, display: 'flex', justifyContent: 'center', opacity: o }}>
      <div style={{ maxWidth: 1500, padding: '14px 30px', borderRadius: 18, background: 'rgba(4,14,40,0.72)', border: '1px solid rgba(255,255,255,0.12)', backdropFilter: 'blur(10px)', fontFamily: FONT, fontWeight: 600, fontSize: 34, color: 'rgba(255,255,255,0.55)', textAlign: 'center', lineHeight: 1.35 }}>
        {words.map((w, i) => {
          const a = cur.start + ((cur.end - cur.start) * acc) / total;
          acc += w.length + 1;
          const on = f >= a;
          return <span key={i} style={{ color: on ? '#fff' : undefined, textShadow: on ? '0 0 18px rgba(0,177,235,0.6)' : undefined }}>{w}{i < words.length - 1 ? ' ' : ''}</span>;
        })}
      </div>
    </div>
  );
};

export const Chip: React.FC<{ icon?: string; text: string; color?: string; size?: number }> = ({ icon, text, color = C.cyan, size = 30 }) => (
  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 14, padding: '14px 26px', borderRadius: 999, background: 'rgba(255,255,255,0.08)', border: `2px solid ${color}`, boxShadow: `0 0 30px ${color}44`, fontFamily: FONT, fontWeight: 700, fontSize: size, color: '#fff', whiteSpace: 'nowrap' }}>
    {icon && <span style={{ fontSize: size * 1.1 }}>{icon}</span>}
    {text}
  </div>
);

export const Keycap: React.FC<{ k: string; down?: number }> = ({ k, down = 0 }) => (
  <div style={{ minWidth: 120, height: 120, padding: '0 28px', borderRadius: 22, display: 'grid', placeItems: 'center', background: 'linear-gradient(180deg,#ffffff,#d9e2f2)', boxShadow: `0 ${14 - down * 10}px 0 #8ea3c8, 0 ${20 - down * 10}px 40px rgba(0,0,0,0.45)`, transform: `translateY(${down * 10}px)`, fontFamily: FONT, fontWeight: 800, fontSize: 44, color: C.navy }}>{k}</div>
);

export const Logo: React.FC<{ width: number; white?: boolean; style?: React.CSSProperties }> = ({ width, white = true, style }) => (
  <Img src={staticFile(white ? 'bat-logo-white.png' : 'bat-logo-navy.png')} style={{ width, ...style }} />
);

export const Mono: React.FC<{ children: React.ReactNode; size?: number; color?: string }> = ({ children, size = 30, color = '#fff' }) => (
  <span style={{ fontFamily: MONO, fontSize: size, color }}>{children}</span>
);

export const Big: React.FC<{ children: React.ReactNode; size?: number; color?: string; weight?: number; style?: React.CSSProperties }> = ({ children, size = 64, color = '#fff', weight = 800, style }) => (
  <div style={{ fontFamily: FONT, fontWeight: weight, fontSize: size, color, lineHeight: 1.12, ...style }}>{children}</div>
);

/** Círculo con palomita que se dibuja. */
export const CheckBurst: React.FC<{ at: number; size?: number; color?: string }> = ({ at, size = 160, color = C.green }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: f - at, fps, config: { damping: 12 } });
  const draw = interpolate(f - at, [6, 22], [0, 1], clamp);
  const ring = interpolate(f - at, [0, 30], [0, 1], clamp);
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <div style={{ position: 'absolute', inset: -ring * size * 0.5, borderRadius: '50%', border: `3px solid ${color}`, opacity: (1 - ring) * 0.8 }} />
      <svg width={size} height={size} viewBox="0 0 100 100" style={{ transform: `scale(${p})` }}>
        <circle cx="50" cy="50" r="46" fill={color} />
        <path d="M28 52 L44 67 L73 36" stroke="#fff" strokeWidth="9" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="70" strokeDashoffset={70 * (1 - draw)} />
      </svg>
    </div>
  );
};

/** Partículas que salen disparadas (confeti). */
export const Confetti: React.FC<{ at: number; x: number; y: number; n?: number }> = ({ at, x, y, n = 70 }) => {
  const f = useCurrentFrame() - at;
  if (f < 0 || f > 90) return null;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {Array.from({ length: n }).map((_, i) => {
        const ang = (i / n) * Math.PI * 2 + (i % 7) * 0.3;
        const sp = 9 + (i % 9) * 2.2;
        const px = x + Math.cos(ang) * sp * f * 1.1;
        const py = y + Math.sin(ang) * sp * f + 0.35 * f * f;
        const col = C.bar[i % C.bar.length];
        return <div key={i} style={{ position: 'absolute', left: px, top: py, width: 12, height: i % 2 ? 12 : 22, background: col, borderRadius: i % 3 ? 3 : 8, transform: `rotate(${f * (8 + i)}deg)`, opacity: interpolate(f, [60, 90], [1, 0], clamp) }} />;
      })}
    </AbsoluteFill>
  );
};
